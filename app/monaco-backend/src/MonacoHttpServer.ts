import type { IncomingMessage, ServerResponse } from 'node:http';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { NodeFS, VfsError } from '@mhersztowski/core';
import { HttpUploadServer, FileSystem } from '@mhersztowski/core-backend';
import { planHydraBuild, HydraPlanError } from './hydra/plan';
import { resolvePreview, PreviewPathError } from './hydra/preview';
import { runHydra } from './hydra/run';
import { archiveFirmware, readIndex, type ArchiveEntry } from './hydra/elfArchive';
import { planSymbolize, parseAddr2Line, anyResolved, normalizeAddress, Addr2LineError } from './hydra/addr2line';
import { TcpBridge } from './TcpBridge';

/** Kod błędu VFS → status HTTP. Ten sam zestaw, którym posługuje się `RemoteFS`. */
const VFS_STATUS: Record<string, number> = {
  FileNotFound: 404,
  FileExists: 409,
  NoPermissions: 403,
  NotADirectory: 400,
  IsADirectory: 400,
  Unavailable: 503,
};

/** Typy podawane przy `GET /api/vfs/stream` — podgląd obrazu, dźwięku i PDF-a w edytorze. */
const STREAM_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm',
  pdf: 'application/pdf',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json',
};

/**
 * Serwer HTTP aplikacji Monaco.
 *
 * Rozszerza {@link HttpUploadServer} z `core-backend` o jedyną rzecz, której
 * potrzebuje edytor: kontrakt VFS pod `/api/vfs/*`, dokładnie taki, jakiego
 * oczekuje `RemoteFS` z `@mhersztowski/core`. Reszta — upload, serwowanie
 * plików spod `/files/`, statyczny frontend z `public/` wraz z fallbackiem SPA
 * — jest już w klasie bazowej.
 *
 * Nie ma tu uwierzytelniania: aplikacja jest lokalnym narzędziem na jeden
 * katalog danych. Gdyby kiedyś było potrzebne, wchodzi jednym `checkAuth()`
 * z `core-backend` przed rozgałęzieniem tras (tak robi cad-backend).
 *
 * Poza VFS wystawia jeszcze `/api/hydra/*` — budowanie projektów `.hydra`
 * przez kontener Hydry. To jedyne miejsce, w którym serwer uruchamia proces,
 * więc granice są wąskie i sprawdzane w `hydra/plan.ts`: buduje się wyłącznie
 * katalog pliku `.hydra` leżącego wewnątrz katalogu danych.
 */
export class MonacoHttpServer extends HttpUploadServer {
  private readonly vfs: NodeFS;
  private readonly dataDir: string;
  private readonly hydraDir?: string;
  /**
   * Archiwum plików `.elf` — poza katalogiem danych, bo wsad z ESP32 waży
   * ~9 MB i nie ma czego szukać w drzewie plików edytora.
   */
  private readonly symbolsDir: string;
  private readonly tcpBridge = new TcpBridge();

  constructor(port: number, dataDir: string, staticDir?: string, hydraDir?: string, symbolsDir?: string) {
    // FileSystem z core-backend obsługuje upload i `/files/` klasy bazowej;
    // NodeFS jest źródłem prawdy dla VFS edytora. Oba wskazują ten sam katalog.
    super(port, new FileSystem(dataDir), undefined, undefined, undefined, staticDir);
    this.vfs = new NodeFS({ rootDir: dataDir });
    this.dataDir = dataDir;
    this.hydraDir = hydraDir;
    this.symbolsDir = symbolsDir ?? `${dataDir}-symbols`;

    /*
     * Most TCP dla aplikacji uruchomionych w karcie.
     *
     * Podpięcie jest tutaj, a nie w `handleRequest`, bo `upgrade` to osobne
     * zdarzenie serwera HTTP — żądanie zmiany protokołu nigdy nie trafia do
     * obsługi zwykłych żądań.
     */
    this.server.on('upgrade', (req, socket, head) => {
      if (TcpBridge.handles(req.url)) {
        this.tcpBridge.handleUpgrade(req, socket, head);
        return;
      }
      socket.destroy();
    });
  }

  protected override async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/vfs') || pathname.startsWith('/api/hydra')) {
      this.setCorsHeaders(res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (pathname.startsWith('/api/hydra')) {
        await this.handleHydra(req, res, pathname);
        return;
      }
      await this.handleVfs(req, res);
      return;
    }
    await super.handleRequest(req, res);
  }

  /**
   * `GET /api/hydra/status` — czy zaplecze w ogóle jest.
   * `POST /api/hydra/build` — budowanie, wynik wierszami jako `text/event-stream`.
   *
   * Strumień, a nie zwykła odpowiedź JSON, bo budowanie wsadu trwa minuty:
   * bez wierszy na bieżąco panel stoi pusty i nie widać różnicy między
   * „kompiluje" a „zawisło".
   */
  private async handleHydraPreview(res: ServerResponse, relative: string): Promise<void> {
    let file;
    try {
      file = resolvePreview(relative, this.dataDir);
    } catch (err) {
      const status = err instanceof PreviewPathError ? 403 : 500;
      this.sendJsonResponse(res, status, { error: String(err instanceof Error ? err.message : err) });
      return;
    }

    try {
      const body = await fsp.readFile(file.absolute);
      res.writeHead(200, {
        'Content-Type': file.contentType,
        // Wynik budowy zmienia się przy każdym uruchomieniu, a przeglądarka
        // trzymająca poprzedni `.wasm` pokazywałaby starą wersję gry bez
        // żadnego śladu, że coś się przebudowało.
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      this.sendJsonResponse(res, 404, {
        error: `Nie ma takiego wyniku budowy: ${relative}. Zbuduj cel przeglądarkowy.`,
      });
    }
  }

  private async handleHydra(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const route = pathname.replace(/^\/api\/hydra/, '');

    if (req.method === 'GET' && route === '/status') {
      const script = this.hydraDir ? `${this.hydraDir}/docker/hydra.sh` : undefined;
      this.sendJsonResponse(res, 200, {
        available: Boolean(script && fs.existsSync(script)),
        hydraDir: this.hydraDir ?? null,
        // Architektura kontenera budującego, a nie przeglądarki: preset CMake
        // dla celu natywnego opisuje maszynę, na której stoi kompilator.
        // Edytor bywa otwarty na Windows, gdy backend siedzi w WSL na ARM.
        arch: process.arch === 'arm64' ? 'arm64' : 'x64',
      });
      return;
    }

    // Podgląd wyniku budowy dla przeglądarki.
    //
    // Osobna trasa zamiast `/files/`, bo tamta serwuje wyłącznie `data/public`
    // — i słusznie, jest publiczna. Granice tej są węższe i sprawdza je czysta
    // funkcja `resolvePreview`: tylko katalog `build/wasm`, tylko rozszerzenia
    // składające się na stronę z modułem.
    if (req.method === 'GET' && route.startsWith('/preview/')) {
      await this.handleHydraPreview(res, route.slice('/preview/'.length));
      return;
    }

    // Co leży w archiwum symboli — panel potrzebuje tego, żeby dać wybór wsadu
    // wtedy, gdy układ nie potrafi podać identyfikatora sam.
    if (req.method === 'GET' && route === '/firmware') {
      this.sendJsonResponse(res, 200, { entries: await readIndex(this.symbolsDir) });
      return;
    }

    if (req.method === 'POST' && route === '/symbolize') {
      await this.handleSymbolize(req, res);
      return;
    }

    if (req.method !== 'POST' || route !== '/build') {
      this.sendJsonResponse(res, 404, { error: `Unknown route: ${route}` });
      return;
    }

    const body = await readJsonBody(req);

    if (!this.hydraDir) {
      this.sendJsonResponse(res, 503, {
        error: 'Nie wskazano katalogu biblioteki Hydra — ustaw HYDRA_DIR w app/monaco-backend/.env',
      });
      return;
    }

    const kind = body.kind === 'native' ? 'native' : body.kind === 'wasm' ? 'wasm' : 'pio';
    const target = body.target as string | undefined;

    let plan;
    try {
      plan = planHydraBuild(
        {
          file: String(body.file ?? ''),
          target,
          upload: Boolean(body.upload),
          kind,
          preset: body.preset as string | undefined,
          os: body.os === 'windows' ? 'windows' : 'linux',
          executable: body.executable as string | undefined,
        },
        {
          dataDir: this.dataDir,
          hydraDir: this.hydraDir,
          /*
           * Emscripten leży w innym obrazie niż toolchainy PlatformIO, a sam
           * emsdk nie wystarcza: wygenerowany `CMakeLists.txt` konfiguruje się
           * przez `emcmake cmake`, więc obraz musi mieć też cmake i make.
           * Buduje go `docker/Dockerfile.wasm` z repozytorium Hydry:
           *
           *     docker build -f docker/Dockerfile.wasm -t hydra-wasm:local docker
           */
          wasmImage: process.env.HYDRA_WASM_IMAGE ?? 'hydra-wasm:local',
        },
      );
    } catch (err) {
      const status = err instanceof HydraPlanError ? 400 : 500;
      this.sendJsonResponse(res, status, { error: String(err instanceof Error ? err.message : err) });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Bez tego nagłówka pośrednik (nginx w produkcji, proxy Vite w dev)
      // potrafi buforować odpowiedź i zamienić strumień w jedną paczkę na końcu.
      'X-Accel-Buffering': 'no',
    });

    const send = (event: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    /*
     * Puls co 20 sekund.
     *
     * Kompilacja potrafi milczeć minutami (pobieranie obrazu, `pio` układający
     * zależności), a bezczynne połączenie bywa zamykane po drodze — przez
     * proxy w dev, przez nginx w produkcji. Komentarz SSE (wiersz zaczynający
     * się od dwukropka) utrzymuje je przy życiu, nie zaśmiecając panelu.
     */
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
    res.on('close', () => clearInterval(heartbeat));

    const line = (text: string): void => send({ type: 'line', text });

    line(`Buduję ${plan.projectDir}…`);

    /*
     * Kroki po kolei, z przerwaniem na pierwszym niepowodzeniu.
     *
     * Cel natywny to konfiguracja i budowa CMake — puszczenie budowy po
     * nieudanej konfiguracji kompilowałoby przeciw nieaktualnej pamięci
     * podręcznej i dawało błąd niezwiązany z prawdziwą przyczyną.
     */
    let running: ReturnType<typeof runHydra> | undefined;
    let cancelled = false;
    /*
     * Zamknięcie karty nie ma zostawiać kontenera ani okna podglądu przy życiu.
     *
     * Nasłuch na `res`, a nie na `req`: ciało żądania jest odczytane w całości
     * zanim ruszy budowanie, więc strumień żądania nic już nie powie o tym,
     * że klient zniknął. Widzi to dopiero odpowiedź — na niej wisi też puls.
     */
    res.on('close', () => { cancelled = true; running?.cancel(); });

    let code = 0;
    for (const [index, step] of plan.steps.entries()) {
      if (cancelled) break;
      if (plan.steps.length > 1) line(`\n── krok ${index + 1} z ${plan.steps.length} ──`);

      running = runHydra(step.script, step.args, line, step.cwd, step.env);
      code = await running.done;
      if (code !== 0) break;
    }

    if (code === 0 && !cancelled && kind === 'pio' && target) {
      await this.archiveBuild(plan.projectDir, target, line);
    }

    clearInterval(heartbeat);
    send({ type: 'done', code });
    res.end();
  }

  /**
   * `POST /api/hydra/symbolize` — adresy ze śladu stosu na nazwy funkcji.
   *
   * Wsad wskazuje się identyfikatorem albo parą projekt+środowisko. Trzeciej
   * drogi — „weź najnowszy" — świadomie nie ma: rozwinięcie adresów przeciw
   * niewłaściwej budowie nie kończy się błędem, tylko listą prawdziwie
   * wyglądających, a nieprawdziwych nazw funkcji. Godziny szukania błędu
   * w kodzie, który nigdy nie był wykonywany, kosztują więcej niż odmowa.
   */
  private async handleSymbolize(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.hydraDir) {
      this.sendJsonResponse(res, 503, {
        error: 'Nie wskazano katalogu biblioteki Hydra — bez niego nie ma jak uruchomić addr2line.',
      });
      return;
    }

    const body = await readJsonBody(req);
    const entries = await readIndex(this.symbolsDir);

    let entry: ArchiveEntry | undefined;
    if (typeof body.id === 'string' && body.id !== '') {
      entry = entries.find((e) => e.id === body.id);
      if (!entry) {
        this.sendJsonResponse(res, 404, {
          error: `Tego wsadu nie ma w archiwum: ${body.id}. Zbuduj projekt ponownie albo wskaż inny.`,
        });
        return;
      }
    } else if (typeof body.project === 'string' && typeof body.env === 'string') {
      entry = entries
        .filter((e) => e.project === body.project && e.env === body.env)
        .sort((a, b) => b.storedAt.localeCompare(a.storedAt))[0];
      if (!entry) {
        this.sendJsonResponse(res, 404, {
          error: `Archiwum nie ma wsadu dla ${body.project}/${body.env}.`,
        });
        return;
      }
    } else {
      this.sendJsonResponse(res, 400, {
        error: 'Podaj identyfikator wsadu (`id`) albo parę `project` i `env`.',
      });
      return;
    }

    const requested = Array.isArray(body.addresses) ? (body.addresses as unknown[]) : [];

    let step;
    let addresses: string[];
    try {
      step = planSymbolize(
        { id: entry.id, machine: entry.machine, addresses: requested },
        { hydraDir: this.hydraDir, symbolsDir: this.symbolsDir },
      );
      addresses = requested.map(normalizeAddress);
    } catch (err) {
      const status = err instanceof Addr2LineError ? 400 : 500;
      this.sendJsonResponse(res, status, { error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const output: string[] = [];
    const code = await runHydra(step.script, step.args, (l) => output.push(l)).done;

    if (code !== 0) {
      this.sendJsonResponse(res, 500, {
        error: 'Nie udało się uruchomić addr2line.',
        output: output.join('\n'),
      });
      return;
    }

    const frames = parseAddr2Line(output.join('\n'), addresses);
    this.sendJsonResponse(res, 200, {
      firmware: entry,
      frames,
      /*
       * Żaden adres nierozwinięty znaczy zwykle, że ślad pochodzi z innego
       * wsadu niż wskazany — pojedyncze `??` to normalna rzecz, bo ślad
       * przechodzi przez ROM. Rozróżnienie należy do tego, kto patrzy, więc
       * podajemy je wprost zamiast zgadywać za niego.
       */
      resolved: anyResolved(frames),
    });
  }

  /**
   * Odkłada `.elf` zaraz po udanej budowie.
   *
   * Teraz, a nie na żądanie, bo `pio` nadpisuje `firmware.elf` przy każdym
   * uruchomieniu — w chwili, gdy przychodzi raport o awarii sprzed tygodnia,
   * plik potrzebny do jego odczytania dawno nie istnieje.
   *
   * Niepowodzenie melduje się w panelu i na tym się kończy. Budowa się udała
   * i wsad jest gotowy do wgrania; brak kopii do rozwijania adresów to strata,
   * ale nie powód, żeby ogłaszać nieudaną kompilację.
   */
  private async archiveBuild(projectDir: string, env: string, line: (text: string) => void): Promise<void> {
    try {
      const result = await archiveFirmware({ projectDir, env, symbolsDir: this.symbolsDir });
      if (result === null) return;

      const { entry, stored, removed } = result;
      line(stored
        ? `\nWsad odłożony do archiwum symboli: ${entry.id.slice(0, 16)}… (${Math.round(entry.bytes / 1024)} KB)`
        : `\nWsad już był w archiwum symboli: ${entry.id.slice(0, 16)}…`);

      if (!entry.confirmedByImage) {
        // Bez deskryptora układ nie poda tego identyfikatora sam, więc przy
        // raporcie trzeba będzie wskazać wsad ręcznie. Lepiej powiedzieć to
        // teraz niż zostawić do odkrycia przy awarii.
        line('  (obraz nie niesie identyfikatora — wsad trzeba będzie wskazać ręcznie)');
      }
      // Ciche kasowanie pliku, którego ktoś zaraz poszuka, jest gorsze od
      // braku miejsca na dysku.
      for (const gone of removed) {
        line(`  usunięto z archiwum starszy wsad: ${gone.project}/${gone.env} ${gone.id.slice(0, 16)}…`);
      }
    } catch (err) {
      line(`\nNie udało się odłożyć wsadu do archiwum symboli: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** `RemoteFS` woła trasy bez prefiksu — `/stat`, `/readdir`, `/writeFile`, … */
  private async handleVfs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.replace(/^\/api\/vfs/, '');
    const path = url.searchParams.get('path') ?? '/';

    try {
      if (req.method === 'GET') {
        switch (route) {
          case '/capabilities':
            this.sendJsonResponse(res, 200, { readonly: false, watch: false });
            return;

          case '/stat':
            this.sendJsonResponse(res, 200, await this.vfs.stat(path));
            return;

          case '/readdir':
            this.sendJsonResponse(res, 200, { entries: await this.vfs.readDirectory(path) });
            return;

          case '/readFile': {
            const bytes = await this.vfs.readFile(path);
            this.sendJsonResponse(res, 200, { data: Buffer.from(bytes).toString('base64') });
            return;
          }

          case '/stream': {
            const bytes = await this.vfs.readFile(path);
            const ext = path.split('.').pop()?.toLowerCase() ?? '';
            res.writeHead(200, {
              'Content-Type': STREAM_MIME[ext] ?? 'application/octet-stream',
              'Content-Length': bytes.length,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'no-cache',
            });
            res.end(Buffer.from(bytes));
            return;
          }

          default:
            this.sendJsonResponse(res, 404, { error: `Unknown route: ${route}` });
            return;
        }
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        switch (route) {
          case '/writeFile': {
            const bytes = new Uint8Array(Buffer.from(body.data as string, 'base64'));
            await this.vfs.writeFile(path, bytes, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;
          }

          case '/delete':
            await this.vfs.delete(path, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/rename':
            await this.vfs.rename(body.oldPath as string, body.newPath as string, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/mkdir':
            await this.vfs.mkdir(path);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          case '/copy':
            await this.vfs.copy(body.source as string, body.destination as string, body.options as never);
            this.sendJsonResponse(res, 200, { ok: true });
            return;

          default:
            this.sendJsonResponse(res, 404, { error: `Unknown route: ${route}` });
            return;
        }
      }

      this.sendJsonResponse(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err instanceof VfsError) {
        this.sendJsonResponse(res, VFS_STATUS[err.code] ?? 500, {
          error: err.message, code: err.code, path: err.path,
        });
      } else {
        console.error('[monaco-backend]', err);
        this.sendJsonResponse(res, 500, { error: String(err), code: 'Unknown' });
      }
    }
  }
}

/** Puste ciało i niepoprawny JSON dają `{}` — trasa i tak sprawdzi, czego jej brakuje. */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}
