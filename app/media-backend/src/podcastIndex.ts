/**
 * Wyszukiwanie podkastów w dwóch katalogach naraz.
 *
 * **Podcast Index** (podcastindex.org) jest źródłem pierwszym: otwarty katalog
 * z pełnym opisem kanału i adresem RSS. Wymaga pary kluczy, o którą trzeba
 * poprosić na stronie projektu.
 *
 * **iTunes Search** jest źródłem drugim i nie wymaga niczego — dzięki temu
 * aplikacja działa od pierwszego uruchomienia, zanim ktokolwiek zarejestruje
 * klucze. Zwraca mniej pól, ale to, co najważniejsze — `feedUrl` — ma.
 *
 * Obie drogi kończą się tym samym: adresem kanału RSS. Odcinki i adresy plików
 * dźwiękowych bierzemy zawsze z kanału (`rss.ts`), nigdy z katalogu — katalog
 * wie, że podkast istnieje, ale to kanał mówi, co i skąd odtworzyć.
 */

import { createHash } from 'node:crypto';

/** Wynik wyszukiwania — wspólny kształt dla obu katalogów. */
export interface PodcastResult {
  /** Identyfikator w katalogu źródłowym; sam w sobie nie jest przenośny. */
  id: string;
  title: string;
  author: string;
  description: string;
  /** Okładka; pusty łańcuch, gdy katalog jej nie podaje. */
  image: string;
  /** Adres kanału RSS — jedyne pole, bez którego wynik jest bezużyteczny. */
  feedUrl: string;
  /** Z którego katalogu przyszedł wynik. */
  source: 'podcastindex' | 'itunes';
  /** Liczba odcinków, gdy katalog ją zna. */
  episodeCount?: number;
}

export interface PodcastIndexCredentials {
  key: string;
  secret: string;
}

/**
 * Nagłówki uwierzytelniające Podcast Index.
 *
 * Podpisem jest SHA-1 z **sklejenia** klucza, sekretu i czasu uniksowego —
 * sekret nigdy nie idzie przez sieć. Czas wchodzi do skrótu i osobno do
 * nagłówka, żeby serwer mógł odrzucić podpis starszy niż kilka minut.
 *
 * Wydzielone z zapytania, bo to jedyny fragment, który da się sprawdzić bez
 * sieci — i jedyny, w którym literówka daje 401 bez wskazówki, co poszło źle.
 */
export function podcastIndexHeaders(
  creds: PodcastIndexCredentials,
  unixSeconds: number,
  userAgent: string,
): Record<string, string> {
  const signature = createHash('sha1')
    .update(creds.key + creds.secret + String(unixSeconds))
    .digest('hex');

  return {
    'X-Auth-Key': creds.key,
    'X-Auth-Date': String(unixSeconds),
    Authorization: signature,
    'User-Agent': userAgent,
  };
}

/** Odpowiedź Podcast Index sprowadzona do wspólnego kształtu. */
function fromPodcastIndex(feed: Record<string, unknown>): PodcastResult {
  return {
    id: String(feed.id ?? ''),
    title: String(feed.title ?? ''),
    author: String(feed.author ?? feed.ownerName ?? ''),
    description: String(feed.description ?? ''),
    image: String(feed.artwork ?? feed.image ?? ''),
    feedUrl: String(feed.url ?? ''),
    source: 'podcastindex',
    episodeCount: typeof feed.episodeCount === 'number' ? feed.episodeCount : undefined,
  };
}

/** Odpowiedź iTunes sprowadzona do wspólnego kształtu. */
function fromItunes(item: Record<string, unknown>): PodcastResult {
  return {
    id: String(item.collectionId ?? ''),
    title: String(item.collectionName ?? item.trackName ?? ''),
    author: String(item.artistName ?? ''),
    description: String(item.collectionCensoredName ?? ''),
    image: String(item.artworkUrl600 ?? item.artworkUrl100 ?? ''),
    feedUrl: String(item.feedUrl ?? ''),
    source: 'itunes',
    episodeCount: typeof item.trackCount === 'number' ? item.trackCount : undefined,
  };
}

/**
 * Scala wyniki z obu katalogów, usuwając powtórzenia po adresie kanału.
 *
 * Ten sam podkast bywa w obu katalogach — a że kanał RSS jest jeden, to on jest
 * tożsamością. Pierwszeństwo ma Podcast Index, bo niesie więcej pól; iTunes
 * dokłada tylko to, czego tam nie było.
 */
export function mergeResults(primary: PodcastResult[], secondary: PodcastResult[]): PodcastResult[] {
  const seen = new Set<string>();
  const out: PodcastResult[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = item.feedUrl.trim().toLowerCase();
    // Wynik bez adresu kanału jest bezużyteczny — nie ma czego odtworzyć.
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Minimalny interfejs pobierania — pozwala wstrzyknąć atrapę w testach. */
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface SearchOptions {
  credentials?: PodcastIndexCredentials;
  fetchImpl?: FetchLike;
  now?: () => number;
  userAgent?: string;
  limit?: number;
}

/**
 * Szuka w obu katalogach równolegle.
 *
 * Awaria jednego źródła nie przerywa wyszukiwania — katalog bez kluczy albo
 * z chwilową usterką po prostu nie dokłada wyników. Zwracamy też listę źródeł,
 * które zawiodły, żeby interfejs mógł to pokazać zamiast udawać pustkę.
 */
export async function searchPodcasts(
  term: string,
  options: SearchOptions = {},
): Promise<{ results: PodcastResult[]; failed: string[] }> {
  const doFetch = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const limit = options.limit ?? 40;
  const userAgent = options.userAgent ?? 'MyCastle-Media/1.0';
  const failed: string[] = [];

  const query = encodeURIComponent(term);

  const fromIndex = async (): Promise<PodcastResult[]> => {
    if (!options.credentials?.key || !options.credentials?.secret) return [];
    const seconds = Math.floor((options.now?.() ?? Date.now()) / 1000);
    const headers = podcastIndexHeaders(options.credentials, seconds, userAgent);
    const res = await doFetch(
      `https://api.podcastindex.org/api/1.0/search/byterm?q=${query}&max=${limit}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Podcast Index: HTTP ${res.status}`);
    const body = (await res.json()) as { feeds?: Record<string, unknown>[] };
    return (body.feeds ?? []).map(fromPodcastIndex);
  };

  const fromItunesSearch = async (): Promise<PodcastResult[]> => {
    const res = await doFetch(
      `https://itunes.apple.com/search?media=podcast&limit=${limit}&term=${query}`,
    );
    if (!res.ok) throw new Error(`iTunes: HTTP ${res.status}`);
    const body = (await res.json()) as { results?: Record<string, unknown>[] };
    return (body.results ?? []).map(fromItunes);
  };

  const [indexOutcome, itunesOutcome] = await Promise.allSettled([fromIndex(), fromItunesSearch()]);

  const primary = indexOutcome.status === 'fulfilled' ? indexOutcome.value : [];
  if (indexOutcome.status === 'rejected') failed.push(`podcastindex: ${indexOutcome.reason?.message ?? 'błąd'}`);

  const secondary = itunesOutcome.status === 'fulfilled' ? itunesOutcome.value : [];
  if (itunesOutcome.status === 'rejected') failed.push(`itunes: ${itunesOutcome.reason?.message ?? 'błąd'}`);

  return { results: mergeResults(primary, secondary), failed };
}
