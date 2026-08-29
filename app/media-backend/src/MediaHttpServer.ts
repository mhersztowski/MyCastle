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
  private readonly kluczZeSrodowiska: string;
  private readonly mycastleClient?: MycastleClient;
  readonly kasia: KasiaService;
  private pulsKasi?: ReturnType<typeof setInterval>;

  constructor(
    port: number,
    dataDir: string,
    staticDir?: string,
    credentials?: PodcastIndexCredentials,
    kluczModelu?: string,
    mycastle?: { broker: string; uzytkownik: string; haslo: string },
  ) {
    super(port, new FileSystem(dataDir), undefined, undefined, undefined, staticDir);
    this.store = new MediaStore(dataDir);
    this.credentials = credentials?.key && credentials?.secret ? credentials : undefined;

    this.kasiaStore = new KasiaStore(dataDir);
    this.kluczZeSrodowiska = kluczModelu ?? '';
    this.mycastleClient = mycastle?.broker
      ? new MycastleClient({ broker: mycastle.broker, uzytkownik: mycastle.uzytkownik, haslo: mycastle.haslo })
      : undefined;
    // Model dostaje właściwą konfigurację w `init()`, po wczytaniu stanu z dysku.
    this.kasia = new KasiaService(this.kasiaStore, utworzModel({
      dostawca: 'anthropic', klucz: '', adres: ADRESY_DOMYSLNE.anthropic, model: MODELE_DOMYSLNE.anthropic,
    }), this.mycastleClient);
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
    const klucz = zapisany || this.kluczZeSrodowiska;
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

  /** Czy Kasia ma skąd brać dane o dniu. Panel pokazuje to wprost. */
  hasMycastleAccess(): boolean {
    return this.mycastleClient?.skonfigurowany ?? false;
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
