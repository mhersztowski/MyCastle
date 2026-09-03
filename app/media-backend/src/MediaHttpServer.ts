/**
 * Serwer HTTP aplikacji Media.
 *
 * Rozszerza {@link HttpUploadServer} z `core-backend` o trasy, których
 * potrzebuje odtwarzacz podkastów. Upload, serwowanie plików spod `/files/`,
 * statyczny frontend z `public/` i fallback SPA są już w klasie bazowej — tak
 * samo jak w monaco-backend.
 *
 * Trzy powody, dla których wyszukiwanie idzie przez backend, a nie wprost
 * z przeglądarki:
 *
 *  1. **Sekret Podcast Index nie może trafić do przeglądarki.** Podpis powstaje
 *     z klucza i sekretu; wysłanie ich do frontu oddaje je każdemu, kto otworzy
 *     narzędzia deweloperskie.
 *  2. **Kanały RSS nie mają nagłówków CORS.** Przeglądarka nie pobierze ich
 *     sama, choć serwer pobiera je bez przeszkód.
 *  3. **Notatki mają przeżyć przeglądarkę.** Trzymanie ich w `localStorage`
 *     wiązałoby je z jednym urządzeniem i jednym profilem.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpUploadServer, FileSystem } from '@mhersztowski/core-backend';
import { searchPodcasts, type PodcastIndexCredentials } from './podcastIndex';
import { fetchFeed } from './rss';
import { MediaStore } from './store';
import { KasiaStore } from './kasia/KasiaStore';
import { KasiaService } from './kasia/KasiaService';
import { ADRESY_DOMYSLNE, MODELE_DOMYSLNE, utworzModel } from './kasia/llm';
import { obsluzKasie } from './kasia/trasy';
import { MycastleClient } from './kasia/MycastleClient';
import type { RodzajSpotkania } from './kasia/model';
import {
  czytajSrodowisko, scalGlosZeSrodowiskiem, type KonfiguracjaSrodowiska,
} from './kasia/srodowisko';
import { naglowekWyzwania, sprawdzHaslo } from './kasia/dostep';
import { tnijNaZdania } from './kasia/strumien';
import { obsluzPolecenie } from './kasia/polecenia';

/** Ile czasu trzymamy odpowiedzi katalogu i kanałów, zanim spytamy ponownie. */
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class MediaHttpServer extends HttpUploadServer {
  private readonly store: MediaStore;
  private readonly credentials?: PodcastIndexCredentials;
  private readonly cache = new Map<string, CacheEntry>();

  private readonly kasiaStore: KasiaStore;
  private readonly srodowisko: KonfiguracjaSrodowiska;
  /** Puste = panel otwarty. Patrz `dostep.ts` — to świadomy tryb, nie luka. */
  private readonly hasloKasi: string;
  private readonly mycastleClient?: MycastleClient;
  private readonly mycastleUser: string;
  readonly kasia: KasiaService;
  private pulsKasi?: ReturnType<typeof setInterval>;

  constructor(
    port: number,
    dataDir: string,
    staticDir?: string,
    credentials?: PodcastIndexCredentials,
    /** Zmienne środowiskowe — jedno wejście dla wszystkich kluczy Kasi. */
    env: Record<string, string | undefined> = {},
    mycastle?: { broker: string; uzytkownik: string; haslo: string },
  ) {
    super(port, new FileSystem(dataDir), undefined, undefined, undefined, staticDir);
    this.store = new MediaStore(dataDir);
    this.credentials = credentials?.key && credentials?.secret ? credentials : undefined;

    this.kasiaStore = new KasiaStore(dataDir);
    this.srodowisko = czytajSrodowisko(env);
    this.hasloKasi = (env.KASIA_HASLO ?? '').trim();
    this.mycastleUser = mycastle?.uzytkownik ?? '';
    this.mycastleClient = mycastle?.broker
      ? new MycastleClient({ broker: mycastle.broker, uzytkownik: mycastle.uzytkownik, haslo: mycastle.haslo })
      : undefined;
    // Model dostaje właściwą konfigurację w `init()`, po wczytaniu stanu z dysku.
    /*
     * Wykonawca narzędzi powstaje tylko wtedy, gdy jest dostęp do MyCastle.
     *
     * Bez niego Kasia nie miałaby gdzie zapisać zadania ani wydarzenia —
     * a narzędzie, które zawsze odmawia, jest gorsze niż jego brak: model
     * próbowałby go użyć i tłumaczył użytkownikowi niepowodzenia.
     */
    const klientMyCastle = this.mycastleClient;
    const wykonawca = klientMyCastle
      ? {
        ustawSpotkanie: (rodzaj: RodzajSpotkania, zmiany: { godzina?: string; wlaczone?: boolean }) =>
          this.kasia.ustawSpotkanie(rodzaj, zmiany),
        dopiszZadanie: (z: Parameters<MycastleClient['dopiszZadanie']>[0]) =>
          klientMyCastle.dopiszZadanie(z),
        dopiszWydarzenie: (w: Parameters<MycastleClient['dopiszWydarzenie']>[0]) =>
          klientMyCastle.dopiszWydarzenie(w),
        zapiszWage: (kg: number, uwaga?: string) =>
          this.kasia.zapiszWage({ data: new Date().toISOString().slice(0, 10), kg, uwaga }),
        projekty: async () => {
          const p = await klientMyCastle.czytajJson<{ projects?: Array<{ id: string; name: string }> }>(
            'data/projects.json',
          );
          return p?.projects ?? [];
        },
      }
      : undefined;

    this.kasia = new KasiaService(this.kasiaStore, utworzModel({
      dostawca: 'anthropic', klucz: '', adres: ADRESY_DOMYSLNE.anthropic, model: MODELE_DOMYSLNE.anthropic,
    }), this.mycastleClient, wykonawca);
  }

  /** Wczytuje listę odtwarzania, notatki i stan Kasi; wołane przed `start()`. */
  async init(): Promise<void> {
    await this.store.load();
    await this.kasiaStore.wczytaj();

    /*
     * Klucz ze środowiska jest **wartością zapasową**, nie nadrzędną: gdy
     * użytkownik wpisał klucz w panelu, ten wygrywa. Odwrotna kolejność
     * sprawiłaby, że zmiana w panelu nie działa, dopóki ktoś nie znajdzie
     * i nie usunie wpisu w `.env` — a nic w interfejsie by o tym nie mówiło.
     */
    const zapisany = this.kasiaStore.pobierzSekrety().kluczModelu;
    const klucz = zapisany || this.srodowisko.kluczModelu;

    /*
     * Dostawca, model, interwał i strefa ze środowiska wchodzą **tylko przy
     * pierwszym uruchomieniu**, gdy panel jeszcze niczego nie zapisał.
     * Później są wartościami domyślnymi, nie nadrzędnymi: zmiana w panelu ma
     * przetrwać restart, a wpis w `.env` nie może jej cofać po każdym starcie.
     */
    const stan = this.kasiaStore.pobierz();
    const swiezyStan = stan.rozmowa.length === 0 && !zapisany;
    if (swiezyStan) {
      const zmiany: Record<string, unknown> = {};
      if (this.srodowisko.dostawca) {
        zmiany.dostawca = this.srodowisko.dostawca;
        zmiany.adresModelu = ADRESY_DOMYSLNE[this.srodowisko.dostawca];
        zmiany.model = this.srodowisko.model ?? MODELE_DOMYSLNE[this.srodowisko.dostawca];
      } else if (this.srodowisko.model) {
        zmiany.model = this.srodowisko.model;
      }
      if (this.srodowisko.inicjatywaCoMin !== undefined) {
        zmiany.inicjatywaCoMin = this.srodowisko.inicjatywaCoMin;
      }
      if (this.srodowisko.strefaCzasowa) zmiany.strefaCzasowa = this.srodowisko.strefaCzasowa;
      if (Object.keys(zmiany).length > 0) await this.kasia.zapiszUstawienia(zmiany);
    }

    const u = this.kasiaStore.pobierz().ustawienia;

    this.kasia.podmienModel(utworzModel({
      dostawca: u.dostawca,
      klucz,
      adres: u.adresModelu,
      model: u.model,
    }));
  }

  /**
   * Uruchamia pętlę Kasi.
   *
   * Puls co minutę, niezależnie od ustawionego odstępu inicjatywy: przebieg
   * musi być częstszy niż najkrótsze zdarzenie, które ma wychwycić, a spotkania
   * zaczynają się o pełnej minucie. To `KasiaService` decyduje, czy z danego
   * przebiegu coś wyniknie — tutaj tylko odmierzamy czas.
   *
   * Błędy są łapane na miejscu: nieobsłużone odrzucenie obietnicy w `setInterval`
   * kładzie proces Node'a, a awaria API modelu nie jest powodem, żeby przestał
   * działać odtwarzacz podkastów.
   */
  startKasia(): void {
    if (this.pulsKasi) return;
    this.pulsKasi = setInterval(() => {
      void this.kasia.tick().then((w) => {
        for (const blad of w.bledy) console.error('[kasia]', blad);
        for (const tekst of w.wypowiedzi) console.log('[kasia]', tekst.slice(0, 120));
      }).catch((err: Error) => console.error('[kasia] pętla:', err.message));
    }, 60_000);
  }

  stopKasia(): void {
    if (this.pulsKasi) clearInterval(this.pulsKasi);
    this.pulsKasi = undefined;
    this.mycastleClient?.rozlacz();
  }

  /**
   * Nasłuch poleceń ze skryptów Drive i automatyzacji Markdown.
   *
   * Ten sam broker i to samo połączenie, którym Kasia czyta pliki — skrypt
   * publikuje na `kasia/{user}/inbox`, odpowiedź wraca na `outbox`.
   *
   * Bez skonfigurowanego MyCastle nasłuchu nie ma: broker jest tam, a nie tutaj.
   * Wtedy API dla skryptów po prostu nie działa i mówi to wprost po stronie
   * skryptu („Kasia nie odpowiedziała"), zamiast wywracać backend.
   */
  async startNasluchPolecen(): Promise<void> {
    const klient = this.mycastleClient;
    if (!klient?.skonfigurowany) return;

    const user = this.mycastleUser;
    const inbox = `minis/${user}/kasia/inbox`;
    const outbox = `minis/${user}/kasia/outbox`;

    try {
      await klient.nasluchuj(inbox, (payload) => {
        void (async () => {
          const p = payload as { id?: string; type?: string; payload?: unknown };
          if (!p?.id || !p?.type) return;

          const wynik = await obsluzPolecenie(this.kasia, p.type, p.payload);
          // Odpowiedź niesie `requestId`, po którym skrypt ją rozpozna —
          // na jednym temacie odpowiadamy wszystkim naraz.
          await klient.publikuj(outbox, { requestId: p.id, ...wynik });
        })();
      });
      console.log(`Kasia API       →  nasłuch na ${inbox}`);
    } catch (err) {
      // Brak nasłuchu nie może zatrzymać serwera — reszta Kasi działa dalej.
      console.error('[kasia] nie udało się założyć nasłuchu poleceń:', (err as Error).message);
    }
  }

  /** Czy Kasia ma skąd brać dane o dniu. Panel pokazuje to wprost. */
  hasMycastleAccess(): boolean {
    return this.mycastleClient?.skonfigurowany ?? false;
  }

  /**
   * Odpowiedź Kasi wysyłana fragmentami (SSE).
   *
   * Format zdarzeń jest własny i możliwie prosty:
   *   `{"t":"…"}`      — kolejny fragment tekstu, do pokazania na bieżąco
   *   `{"z":"…"}`      — **kompletne zdanie**, do wypowiedzenia
   *   `{"a":{…}}`      — Kasia coś **wykonała** (zmiana kalendarza, zadanie, waga)
   *   `{"koniec":true, "tekst":"…"}` — całość, do zapisania w widoku
   *   `{"blad":"…"}`   — coś poszło nie tak
   *
   * Zdania wycinamy tutaj, a nie na froncie: `tnijNaZdania` ma testy na skróty
   * („o godz. 18") i liczby dziesiętne („84.2"), a powtórzona w przeglądarce
   * kopia tej logiki rozjechałaby się z nimi przy pierwszej poprawce.
   *
   * `X-Accel-Buffering: no` jest konieczne: pośrednik (nginx w Coolify)
   * domyślnie buforuje odpowiedź i wypuszcza ją jednym kawałkiem na końcu —
   * czyli dokładnie niweczy to, po co jest strumień.
   */
  private async strumienRozmowy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const kawalki: Buffer[] = [];
    for await (const k of req) kawalki.push(Buffer.from(k));

    let tekst = '';
    try {
      const body = JSON.parse(Buffer.concat(kawalki).toString('utf8') || '{}') as { tekst?: string };
      tekst = (body.tekst ?? '').trim();
    } catch {
      this.sendJsonResponse(res, 400, { error: 'Ciało żądania nie jest poprawnym JSON-em.' });
      return;
    }

    if (!tekst) { this.sendJsonResponse(res, 400, { error: 'Pusta wiadomość.' }); return; }
    if (!this.kasia.modelGotowy()) {
      this.sendJsonResponse(res, 503, {
        error: `Kasia nie ma skonfigurowanego modelu: ${this.kasia.czegoBrakujeModelowi()}`,
      });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const wyslij = (dane: unknown): void => { res.write(`data: ${JSON.stringify(dane)}\n\n`); };

    // Bufor zdania — fragmenty przychodzą po kilka znaków, zdania po kilkanaście.
    let bufor = '';

    try {
      const pelna = await this.kasia.powiedzStrumieniem(tekst, {
        tekst: (fragment) => {
          wyslij({ t: fragment });
          bufor += fragment;
          const { zdania, reszta } = tnijNaZdania(bufor, false);
          bufor = reszta;
          for (const z of zdania) wyslij({ z });
        },
      }, Date.now(), (d) => wyslij({ a: d }));

      // Ostatnie zdanie zwykle nie ma po sobie nowej linii — domykamy je tutaj.
      const { zdania } = tnijNaZdania(bufor, true);
      for (const z of zdania) wyslij({ z });

      wyslij({ koniec: true, tekst: pelna });
    } catch (err) {
      // Błąd po nagłówkach nie może być kodem HTTP — idzie zdarzeniem.
      wyslij({ blad: (err as Error).message });
    } finally {
      res.end();
    }
  }

  /** Konfiguracja mowy: zapisana w panelu, uzupełniona kluczami ze środowiska. */
  glosDlaPrzegladarki(): unknown {
    return scalGlosZeSrodowiskiem(this.kasia.stan().glos, this.srodowisko);
  }

  /** Czy panel Kasi jest chroniony hasłem. */
  hasKasiaPassword(): boolean {
    return this.hasloKasi.length > 0;
  }

  /** Co Kasia wzięła ze środowiska — do wypisu przy starcie. */
  opisSrodowiska(): { model: string; elevenlabs: boolean } {
    return {
      model: this.srodowisko.dostawca
        ? `${this.srodowisko.dostawca} (${this.srodowisko.model ?? 'model domyślny'})`
        : '(brak klucza — panel działa, Kasia milczy)',
      elevenlabs: Boolean(this.srodowisko.kluczElevenLabs),
    };
  }

  /** Czy backend ma czym podpisać zapytania do Podcast Index. */
  hasPodcastIndexCredentials(): boolean {
    return Boolean(this.credentials);
  }

  protected override async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/podcasts') && !pathname.startsWith('/api/queue')
      && !pathname.startsWith('/api/notes') && !pathname.startsWith('/api/media')
      && !pathname.startsWith('/api/kasia')) {
      await super.handleRequest(req, res);
      return;
    }

    this.setCorsHeaders(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (pathname.startsWith('/api/kasia')) {
        /*
         * Hasło chroni **wyłącznie** trasy Kasi.
         *
         * Reszta Media (podkasty, kolejka, notatki) zostaje otwarta: nie ma tam
         * niczego prywatnego, a dokładanie logowania do odtwarzacza byłoby
         * uciążliwością bez zysku. Pod `/api/kasia/*` jest odwrotnie — zadania,
         * kalendarz, waga i klucze API do mowy.
         */
        const dostep = sprawdzHaslo(this.hasloKasi, req.headers.authorization);
        if (!dostep.ok) {
          res.writeHead(401, {
            'Content-Type': 'application/json; charset=utf-8',
            // Bez tego nagłówka przeglądarka pokaże surowe 401 zamiast okna hasła.
            'WWW-Authenticate': naglowekWyzwania(),
          });
          res.end(JSON.stringify({ error: 'Panel Kasi wymaga hasła (KASIA_HASLO).' }));
          return;
        }

        /*
         * Odczyt konfiguracji mowy obsługujemy tutaj, a nie w `trasy.ts`:
         * scalanie z kluczami ze środowiska jest sprawą serwera, bo to on je
         * czyta. `KasiaService` nie zna `.env` i nie powinien zacząć znać.
         */
        /*
         * Rozmowa strumieniem.
         *
         * Obsługiwana tutaj, a nie w `trasy.ts`, bo wymaga uchwytu na odpowiedź
         * HTTP — a `trasy.ts` operuje na gotowej funkcji `odpowiedz(res, …)`,
         * która zamyka połączenie jednym zapisem.
         *
         * Stara trasa `/powiedz` zostaje bez zmian: używa jej MyCastleMobile,
         * API dla skryptów i każdy klient, który nie umie czytać SSE.
         */
        if (req.method === 'POST' && pathname === '/api/kasia/powiedz/stream') {
          await this.strumienRozmowy(req, res);
          return;
        }

        if (req.method === 'GET' && pathname === '/api/kasia/glos') {
          this.sendJsonResponse(res, 200, this.glosDlaPrzegladarki() as Record<string, unknown>);
          return;
        }
        await obsluzKasie(req, res, pathname, this.kasia,
          (r, status, dane) => this.sendJsonResponse(r, status, dane as Record<string, unknown>));
        return;
      }
      if (pathname === '/api/podcasts/search') return await this.handleSearch(url, res);
      if (pathname === '/api/podcasts/feed') return await this.handleFeed(url, res);
      if (pathname === '/api/media') return await this.handleMedia(req, url, res);
      if (pathname.startsWith('/api/queue')) return await this.handleQueue(req, res, pathname);
      if (pathname.startsWith('/api/notes')) return await this.handleNotes(req, url, res, pathname);

      this.sendJsonResponse(res, 404, { error: 'Nieznana trasa' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendJsonResponse(res, 500, { error: message });
    }
  }

  // --- katalogi ---------------------------------------------------------

  private cached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private putCache(key: string, value: unknown): void {
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private async handleSearch(url: URL, res: ServerResponse): Promise<void> {
    const term = (url.searchParams.get('q') ?? '').trim();
    if (!term) {
      this.sendJsonResponse(res, 400, { error: 'Brak frazy do wyszukania (parametr q)' });
      return;
    }

    const key = `search:${term.toLowerCase()}`;
    const hit = this.cached(key);
    if (hit) {
      this.sendJsonResponse(res, 200, hit);
      return;
    }

    const found = await searchPodcasts(term, { credentials: this.credentials });
    const payload = {
      ...found,
      // Front pokazuje wprost, że drugi katalog jest wyłączony, zamiast
      // zostawiać użytkownika z domysłami, czemu wyników jest mniej.
      podcastIndexEnabled: this.hasPodcastIndexCredentials(),
    };
    this.putCache(key, payload);
    this.sendJsonResponse(res, 200, payload);
  }

  private async handleFeed(url: URL, res: ServerResponse): Promise<void> {
    const feedUrl = url.searchParams.get('url') ?? '';
    if (!isSafeHttpUrl(feedUrl)) {
      this.sendJsonResponse(res, 400, { error: 'Adres kanału musi być publicznym http(s)' });
      return;
    }

    const key = `feed:${feedUrl}`;
    const hit = this.cached(key);
    if (hit) {
      this.sendJsonResponse(res, 200, hit);
      return;
    }

    const feed = await fetchFeed(feedUrl);
    const payload = { ...feed, feedUrl };
    this.putCache(key, payload);
    this.sendJsonResponse(res, 200, payload);
  }

  /**
   * Przekazuje plik dźwiękowy.
   *
   * Bez tego przeglądarka na stronie po HTTPS nie odtworzy odcinka, którego
   * kanał podaje po HTTP — a takich jest sporo w starszych archiwach.
   * Nagłówek `Range` idzie dalej bez zmian, bo bez niego przewijanie suwakiem
   * musiałoby pobrać cały plik od początku.
   */
  private async handleMedia(req: IncomingMessage, url: URL, res: ServerResponse): Promise<void> {
    const target = url.searchParams.get('url') ?? '';
    if (!isSafeHttpUrl(target)) {
      this.sendJsonResponse(res, 400, { error: 'Adres pliku musi być publicznym http(s)' });
      return;
    }

    const headers: Record<string, string> = { 'User-Agent': 'MyCastle-Media/1.0' };
    if (req.headers.range) headers.Range = String(req.headers.range);

    const upstream = await fetch(target, { headers });
    const passthrough = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
    for (const name of passthrough) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.writeHead(upstream.status);

    if (!upstream.body) {
      res.end();
      return;
    }
    // Strumieniowo, a nie przez bufor: odcinek podkastu to często 100 MB,
    // a serwer obsługuje kilka takich naraz.
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }
    res.end();
  }

  // --- lista odtwarzania -------------------------------------------------

  private async handleQueue(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    if (req.method === 'GET' && pathname === '/api/queue') {
      this.sendJsonResponse(res, 200, this.store.getQueue());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/queue') {
      const body = await readJsonBody(req);
      if (!body?.id || !body?.mediaUrl) {
        this.sendJsonResponse(res, 400, { error: 'Pozycja wymaga pól id i mediaUrl' });
        return;
      }
      const queue = await this.store.enqueue({
        id: String(body.id),
        title: String(body.title ?? ''),
        podcastTitle: String(body.podcastTitle ?? ''),
        image: String(body.image ?? ''),
        mediaUrl: String(body.mediaUrl),
        mediaType: String(body.mediaType ?? 'audio/mpeg'),
        durationSec: Number(body.durationSec ?? 0),
        feedUrl: String(body.feedUrl ?? ''),
      });
      this.sendJsonResponse(res, 200, queue);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/queue/order') {
      const body = await readJsonBody(req);
      const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
      this.sendJsonResponse(res, 200, await this.store.reorder(ids));
      return;
    }

    const positionMatch = /^\/api\/queue\/([^/]+)\/position$/.exec(pathname);
    if (req.method === 'POST' && positionMatch) {
      const body = await readJsonBody(req);
      await this.store.savePosition(decodeURIComponent(positionMatch[1]), Number(body?.positionSec ?? 0));
      this.sendJsonResponse(res, 200, { ok: true });
      return;
    }

    const itemMatch = /^\/api\/queue\/([^/]+)$/.exec(pathname);
    if (req.method === 'DELETE' && itemMatch) {
      this.sendJsonResponse(res, 200, await this.store.dequeue(decodeURIComponent(itemMatch[1])));
      return;
    }

    this.sendJsonResponse(res, 405, { error: 'Metoda nieobsługiwana dla tej trasy' });
  }

  // --- notatki ----------------------------------------------------------

  private async handleNotes(req: IncomingMessage, url: URL, res: ServerResponse, pathname: string): Promise<void> {
    if (req.method === 'GET' && pathname === '/api/notes') {
      const episodeId = url.searchParams.get('episodeId');
      this.sendJsonResponse(res, 200, episodeId ? this.store.getNotes(episodeId) : this.store.getAllNotes());
      return;
    }

    if (req.method === 'POST' && pathname === '/api/notes') {
      const body = await readJsonBody(req);
      if (!body?.episodeId || !String(body?.text ?? '').trim()) {
        this.sendJsonResponse(res, 400, { error: 'Notatka wymaga episodeId i niepustej treści' });
        return;
      }
      const note = await this.store.addNote(String(body.episodeId), Number(body.timeSec ?? 0), String(body.text));
      this.sendJsonResponse(res, 201, note);
      return;
    }

    const idMatch = /^\/api\/notes\/([^/]+)$/.exec(pathname);
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      if (req.method === 'DELETE') {
        await this.store.removeNote(id);
        this.sendJsonResponse(res, 200, { ok: true });
        return;
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody(req);
        const updated = await this.store.updateNote(id, String(body?.text ?? ''));
        if (!updated) {
          this.sendJsonResponse(res, 404, { error: 'Nie ma takiej notatki' });
          return;
        }
        this.sendJsonResponse(res, 200, updated);
        return;
      }
    }

    this.sendJsonResponse(res, 405, { error: 'Metoda nieobsługiwana dla tej trasy' });
  }
}

/**
 * Czy adres nadaje się do pobrania przez serwer.
 *
 * Serwer pobiera adresy podane przez przeglądarkę, więc bez tego sprawdzenia
 * aplikacja byłaby narzędziem do odpytywania cudzej sieci wewnętrznej z jej
 * własnego wnętrza. Blokujemy inne protokoły oraz nazwy i adresy wskazujące
 * na maszynę i sieć lokalną.
 */
export function isSafeHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return false;

  // Adresy prywatne IPv4 wg RFC 1918 oraz pętla zwrotna i link-local.
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 169 && b === 254) return false;
  }
  return true;
}

/** Odczytuje ciało żądania jako JSON; puste ciało daje `undefined`. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
