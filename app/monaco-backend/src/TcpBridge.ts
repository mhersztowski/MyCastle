import { createConnection, isIP, type Socket } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Most WebSocket → TCP: sieć gospodarza pożyczona aplikacji w karcie.
 *
 * Aplikacja Hydry zbudowana na cel przeglądarkowy jest tym samym kodem, co ta
 * na układzie — z jednym wyjątkiem, którego nie da się obejść po stronie
 * aplikacji: **karta nie ma gniazd TCP**. To nie brak funkcji w emscriptenie,
 * tylko granica modelu bezpieczeństwa przeglądarki. Bez mostu w przeglądarce
 * działa wyłącznie to, co samo mówi po WebSockecie, czyli w praktyce broker
 * MQTT z osobnym listenerem. Broker na 1883, serwer NTRIP, zwykłe HTTP —
 * nieosiągalne.
 *
 * Most zamienia to w jedno gniazdo: strona otwiera
 * `ws://<origin>/ws/tcp?host=…&port=…`, serwer otwiera prawdziwe TCP i przepycha
 * bajty w obie strony. `MqttClient`, `HttpClient` i `NtripClient` działają wtedy
 * w karcie bez jednej zmiany, bo widzą ten sam `IClient` co na płytce.
 *
 * ## Dlaczego domyślnie tylko sieć lokalna
 *
 * Most jest z definicji otwartym proxy TCP: kto dosięgnie portu backendu, ten
 * może przez niego wyjść dowolnie daleko. Serwer nasłuchuje na wszystkich
 * interfejsach, więc w domyślnej postaci byłby to punkt przesiadkowy do
 * wnętrza sieci gospodarza.
 *
 * Domyślnie przepuszczamy więc pętlę zwrotną i adresy prywatne — to pokrywa
 * realne zastosowanie (broker w homelabie, urządzenie w LAN-ie) i nie tworzy
 * wyjścia na świat. Adresy publiczne trzeba dopuścić jawnie zmienną
 * `MONACO_TCP_BRIDGE_ALLOW`, wypisując hosty po przecinku:
 *
 *     MONACO_TCP_BRIDGE_ALLOW=system.asgeupos.pl,broker.hivemq.com
 *
 * `*` w tej zmiennej znosi ograniczenie w całości. To świadoma decyzja
 * operatora, a nie wartość domyślna.
 */

/** Ile bajtów wolno zebrać w buforze gniazda, zanim wstrzymamy odczyt. */
const HIGH_WATER_MARK = 1 << 20;

/** Limit oczekiwania na nawiązanie połączenia TCP. */
const CONNECT_TIMEOUT_MS = 10_000;

export interface TcpBridgeOptions {
  /**
   * Hosty dopuszczone poza sieciami prywatnymi. `*` znosi ograniczenie.
   * Domyślnie brane z `MONACO_TCP_BRIDGE_ALLOW`.
   */
  allow?: string[];
  /** Dokąd pisać wiersze diagnostyczne. Domyślnie `console`. */
  log?(message: string): void;
}

/** Czy adres należy do pętli zwrotnej albo sieci prywatnej (RFC 1918, RFC 4193). */
export function isPrivateAddress(host: string): boolean {
  const name = host.toLowerCase();
  if (name === 'localhost' || name.endsWith('.local') || name.endsWith('.localhost')) return true;

  if (isIP(name) === 6) {
    // ::1, fc00::/7 (unikalne lokalne), fe80::/10 (link-local)
    const v6 = name.replace(/^\[|\]$/g, '');
    return v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6);
  }
  if (isIP(name) !== 4) return false;

  const [a, b] = name.split('.').map(Number);
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;   // link-local
  return false;
}

export class TcpBridge {
  static readonly PATH = '/ws/tcp';

  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly allow: Set<string>;
  private readonly allowAll: boolean;
  private readonly log: (message: string) => void;

  constructor(options: TcpBridgeOptions = {}) {
    const raw = options.allow
      ?? (process.env.MONACO_TCP_BRIDGE_ALLOW ?? '').split(',');
    const entries = raw.map((e) => e.trim().toLowerCase()).filter(Boolean);
    this.allowAll = entries.includes('*');
    this.allow = new Set(entries);
    this.log = options.log ?? ((m) => console.log(`[tcp-bridge] ${m}`));
  }

  /** Czy żądanie idzie do mostu. */
  static handles(url: string | undefined): boolean {
    return new URL(url ?? '/', 'http://localhost').pathname === TcpBridge.PATH;
  }

  /**
   * Czy wolno łączyć się pod ten adres.
   *
   * Rozstrzygamy po nazwie z żądania, a nie po adresie po rozwiązaniu DNS-u.
   * To świadome uproszczenie i ma swoją cenę: nazwa publiczna wskazująca na
   * adres prywatny (rebinding) przejdzie, jeśli ktoś doda ją do listy. Ochrona
   * jest tu przed przypadkowym otwarciem wyjścia na świat, nie przed
   * napastnikiem mającym już dostęp do portu backendu.
   */
  allows(host: string): boolean {
    if (this.allowAll) return true;
    const name = host.toLowerCase();
    return this.allow.has(name) || isPrivateAddress(name);
  }

  /** Podpina się pod zdarzenie `upgrade` serwera HTTP. */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const host = url.searchParams.get('host') ?? '';
    const port = Number(url.searchParams.get('port'));

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      this.reject(socket, 400, 'Podaj host i port: /ws/tcp?host=…&port=…');
      return;
    }
    if (!this.allows(host)) {
      this.log(`odmowa: ${host}:${port} spoza sieci prywatnej`);
      this.reject(socket, 403,
        `Host ${host} jest poza sieciami prywatnymi. Dopuść go zmienną MONACO_TCP_BRIDGE_ALLOW.`);
      return;
    }

    this.wss.handleUpgrade(req, socket, head, (ws) => this.pipe(ws, host, port));
  }

  /** Zamyka wszystkie połączenia. */
  close(): void {
    for (const client of this.wss.clients) client.terminate();
    this.wss.close();
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  private reject(socket: Duplex, status: number, message: string): void {
    const reason = status === 400 ? 'Bad Request' : 'Forbidden';
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\n`
      + 'Content-Type: text/plain; charset=utf-8\r\n'
      + `Content-Length: ${Buffer.byteLength(message)}\r\n`
      + 'Connection: close\r\n\r\n'
      + message,
    );
    socket.destroy();
  }

  private pipe(ws: WebSocket, host: string, port: number): void {
    let tcp: Socket | null = null;
    /*
     * Bajty, które przyszły z karty, zanim TCP się otworzyło.
     *
     * Przeglądarka nie ma jak zaczekać: `WebSocket.send()` wolno wołać
     * natychmiast po `open`, a `open` przychodzi, gdy uzgodnienie WebSocketu
     * się skończy — czyli zwykle przed nawiązaniem TCP po naszej stronie.
     * Bez tej kolejki pierwszy pakiet MQTT CONNECT przepadałby i połączenie
     * kończyło się ciszą, której nic nie tłumaczy.
     */
    const pending: Buffer[] = [];
    let open = false;

    const shutdown = (why: string): void => {
      if (tcp && !tcp.destroyed) tcp.destroy();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, why.slice(0, 120));
      }
    };

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      // Most przenosi bajty, nie tekst. Ramka tekstowa oznacza, że po drugiej
      // stronie jest coś innego niż aplikacja Hydry.
      if (!isBinary) return;
      if (!open) {
        pending.push(data);
        return;
      }
      if (tcp && !tcp.write(data)) ws.pause();
    });

    tcp = createConnection({ host, port, timeout: CONNECT_TIMEOUT_MS });
    tcp.setNoDelay(true);

    tcp.on('connect', () => {
      // Limit dotyczył nawiązania; strumień może potem milczeć dowolnie długo,
      // bo to normalny stan połączenia MQTT między pakietami.
      tcp?.setTimeout(0);
      open = true;
      this.log(`otwarte ${host}:${port}`);
      for (const chunk of pending) tcp?.write(chunk);
      pending.length = 0;
    });

    tcp.on('data', (chunk: Buffer) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(chunk, { binary: true });
      // Przeciwciśnienie: karta czytająca wolniej niż serwer nadaje nie ma
      // rosnąć w pamięci backendu bez granicy.
      if (ws.bufferedAmount > HIGH_WATER_MARK) {
        tcp?.pause();
        const resume = (): void => {
          if (ws.bufferedAmount <= HIGH_WATER_MARK / 2) tcp?.resume();
          else setTimeout(resume, 20);
        };
        setTimeout(resume, 20);
      }
    });

    tcp.on('drain', () => ws.resume());
    tcp.on('timeout', () => shutdown('połączenie nie doszło do skutku'));
    tcp.on('error', (err: Error) => {
      this.log(`błąd ${host}:${port}: ${err.message}`);
      shutdown(err.message);
    });
    tcp.on('close', () => shutdown('zdalny koniec zamknął połączenie'));

    ws.on('close', () => { if (tcp && !tcp.destroyed) tcp.destroy(); });
    ws.on('error', () => { if (tcp && !tcp.destroyed) tcp.destroy(); });
  }
}
