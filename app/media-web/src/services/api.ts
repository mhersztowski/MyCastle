/**
 * Klient REST backendu Media.
 *
 * Wszystko idzie przez własny backend, nawet to, co teoretycznie dałoby się
 * pobrać wprost: katalogi wymagają sekretu, kanały RSS nie mają nagłówków CORS,
 * a notatki mają przeżyć przeglądarkę.
 */

export interface PodcastResult {
  id: string;
  title: string;
  author: string;
  description: string;
  image: string;
  feedUrl: string;
  source: 'podcastindex' | 'itunes';
  episodeCount?: number;
}

export interface Episode {
  id: string;
  title: string;
  mediaUrl: string;
  mediaType: string;
  durationSec: number;
  published: string;
  description: string;
  image: string;
}

export interface Feed {
  title: string;
  author: string;
  description: string;
  image: string;
  feedUrl: string;
  episodes: Episode[];
}

export interface QueueItem {
  id: string;
  title: string;
  podcastTitle: string;
  image: string;
  mediaUrl: string;
  mediaType: string;
  durationSec: number;
  feedUrl: string;
  addedAt: string;
  positionSec: number;
}

export interface Note {
  id: string;
  episodeId: string;
  timeSec: number;
  text: string;
  createdAt: string;
}

export interface SearchResponse {
  results: PodcastResult[];
  /** Katalogi, które zawiodły — pokazujemy to zamiast udawać pustkę. */
  failed: string[];
  podcastIndexEnabled: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── Kasia ────────────────────────────────────────────────────────────────────

export type RodzajSpotkania = 'HersztuMorning' | 'HersztuEvening' | 'HersztuWeekly';
export type TrybDostepnosci = 'dostepny' | 'nie-przeszkadzac' | 'spie';

export interface Dostepnosc {
  tryb: TrybDostepnosci;
  od: number;
  do?: number;
}

export interface Spotkanie {
  rodzaj: RodzajSpotkania;
  godzina: string;
  dzienTygodnia?: number;
  wlaczone: boolean;
  uzgodnione: boolean;
}

export interface FragmentPromptu {
  id: string;
  kind: 'init' | 'update';
  zrodlo: string;
  tekst: string;
  dodanoO: number;
  wygasaO?: number;
}

/** Coś, co Kasia wykonała — a nie tylko powiedziała, że wykona. */
export interface Dzialanie {
  /** Nazwa narzędzia; front dobiera po niej ikonę. */
  rodzaj: string;
  opis: string;
  o: number;
}

export interface WiadomoscKasi {
  id: string;
  rola: 'user' | 'assistant' | 'system';
  tresc: string;
  o: number;
  zInicjatywy?: boolean;
  dzialania?: Dzialanie[];
}

export type DostawcaModelu = 'anthropic' | 'openai' | 'ollama';

export interface UstawieniaKasi {
  promptInit: string;
  promptUpdate: string;
  inicjatywaCoMin: number;
  /** Nazwa modelu, np. `claude-sonnet-5`. */
  model: string;
  dostawca: DostawcaModelu;
  adresModelu: string;
  strefaCzasowa: string;
  /*
   * Klucza API tu nie ma i nie będzie — zostaje po stronie serwera.
   * Panel dowiaduje się o jego obecności z odpowiedzi `kasiaModel`.
   */
}

export interface StanKasi {
  ustawienia: UstawieniaKasi;
  dostepnosc: Dostepnosc;
  spotkania: Spotkanie[];
  przypomnienia: Array<{
    id: string; rodzaj: RodzajSpotkania; ustalonaNa: number;
    nastepnaProba: number; prob: number; stan: string;
  }>;
  fragmenty: FragmentPromptu[];
  rozmowa: WiadomoscKasi[];
}

export const api = {
  searchPodcasts: (term: string) =>
    request<SearchResponse>(`/api/podcasts/search?q=${encodeURIComponent(term)}`),

  loadFeed: (feedUrl: string) =>
    request<Feed>(`/api/podcasts/feed?url=${encodeURIComponent(feedUrl)}`),

  getQueue: () => request<QueueItem[]>('/api/queue'),

  enqueue: (item: Omit<QueueItem, 'addedAt' | 'positionSec'>) =>
    request<QueueItem[]>('/api/queue', { method: 'POST', body: JSON.stringify(item) }),

  dequeue: (id: string) =>
    request<QueueItem[]>(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  savePosition: (id: string, positionSec: number) =>
    request<{ ok: true }>(`/api/queue/${encodeURIComponent(id)}/position`, {
      method: 'POST',
      body: JSON.stringify({ positionSec }),
    }),

  getNotes: (episodeId: string) =>
    request<Note[]>(`/api/notes?episodeId=${encodeURIComponent(episodeId)}`),

  /** Notatki ze wszystkich odcinków — bez parametru backend zwraca komplet. */
  getAllNotes: () => request<Note[]>('/api/notes'),

  addNote: (episodeId: string, timeSec: number, text: string) =>
    request<Note>('/api/notes', { method: 'POST', body: JSON.stringify({ episodeId, timeSec, text }) }),

  removeNote: (id: string) =>
    request<{ ok: true }>(`/api/notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  updateNote: (id: string, text: string) =>
    request<Note>(`/api/notes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ text }) }),

  // — Kasia —

  kasiaStan: () => request<StanKasi>('/api/kasia/stan'),

  kasiaPowiedz: (tekst: string) =>
    request<{ odpowiedz: string }>('/api/kasia/powiedz', {
      method: 'POST', body: JSON.stringify({ tekst }),
    }),

  /** `minut` ogranicza tryb w czasie; bez niego obowiązuje do odwołania. */
  kasiaDostepnosc: (tryb: TrybDostepnosci, minut?: number) =>
    request<StanKasi>('/api/kasia/dostepnosc', {
      method: 'POST', body: JSON.stringify({ tryb, minut }),
    }),

  kasiaSpotkanie: (rodzaj: RodzajSpotkania, zmiany: Partial<Pick<Spotkanie, 'godzina' | 'dzienTygodnia' | 'wlaczone'>>) =>
    request<StanKasi>('/api/kasia/spotkanie', {
      method: 'POST', body: JSON.stringify({ rodzaj, ...zmiany }),
    }),

  kasiaUstawienia: (zmiany: Partial<UstawieniaKasi>) =>
    request<StanKasi>('/api/kasia/ustawienia', {
      method: 'POST', body: JSON.stringify(zmiany),
    }),

  kasiaDodajFragment: (f: { id?: string; kind: 'init' | 'update'; zrodlo: string; tekst: string; wygasaZa?: number }) =>
    request<StanKasi>('/api/kasia/fragment', { method: 'POST', body: JSON.stringify(f) }),

  /**
   * Rozmowa strumieniem: fragmenty do pokazania, zdania do wypowiedzenia.
   *
   * `fetch` + czytnik zamiast `EventSource`, bo ten drugi umie wyłącznie GET,
   * a pytanie jedzie w ciele żądania.
   */
  kasiaPowiedzStrumieniem: async (
    tekst: string,
    na: {
      fragment(t: string): void;
      zdanie(z: string): void;
      /** Kasia coś wykonała — pokazujemy to od razu, nie po zakończeniu. */
      dzialanie?(d: Dzialanie): void;
    },
  ): Promise<string> => {
    const res = await fetch('/api/kasia/powiedz/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tekst }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    const czytnik = res.body?.getReader();
    if (!czytnik) throw new Error('Odpowiedź bez treści.');

    const dekoder = new TextDecoder();
    let bufor = '';
    let pelna = '';

    for (;;) {
      const { done, value } = await czytnik.read();
      if (done) break;
      bufor += dekoder.decode(value, { stream: true });

      // Zdarzenia rozdziela pusta linia; ostatni, niedokończony kawałek zostaje.
      const czesci = bufor.split('\n\n');
      bufor = czesci.pop() ?? '';

      for (const czesc of czesci) {
        const linia = czesc.split('\n').find((l) => l.startsWith('data:'));
        if (!linia) continue;
        try {
          const z = JSON.parse(linia.slice(5).trim()) as {
            t?: string; z?: string; a?: Dzialanie;
            koniec?: boolean; tekst?: string; blad?: string;
          };
          if (z.blad) throw new Error(z.blad);
          if (z.t) na.fragment(z.t);
          if (z.z) na.zdanie(z.z);
          if (z.a) na.dzialanie?.(z.a);
          if (z.koniec) pelna = z.tekst ?? pelna;
        } catch (err) {
          if (err instanceof Error && err.message && !err.message.startsWith('Unexpected')) throw err;
          // Uszkodzone zdarzenie pomijamy — lepiej zgubić fragment niż całość.
        }
      }
    }

    return pelna;
  },

  /** Zapisuje pomiar wagi w VFS MyCastle. Bez daty — dzisiejsza, liczona na serwerze. */
  kasiaWaga: (kg: number, uwaga?: string) =>
    request<{ ok: true; pomiarow: number }>('/api/kasia/waga', {
      method: 'POST', body: JSON.stringify({ kg, uwaga }),
    }),

  /** Podgląd danych z MyCastle — dokładnie ten tekst, który dostaje model. */
  kasiaDane: () => request<{ opis: string }>('/api/kasia/dane'),

  /** Zmiana dostawcy modelu. Pusty `klucz` znaczy „nie zmieniaj". */
  kasiaModel: (zmiany: { dostawca?: DostawcaModelu; model?: string; adres?: string; klucz?: string }) =>
    request<{ ok: true; gotowy: boolean; brakuje: string | null }>('/api/kasia/model', {
      method: 'POST', body: JSON.stringify(zmiany),
    }),

  kasiaUsunFragment: (id: string, zrodlo: string) =>
    request<StanKasi>(`/api/kasia/fragment/${encodeURIComponent(id)}?zrodlo=${encodeURIComponent(zrodlo)}`,
      { method: 'DELETE' }),
};

/**
 * Adres pliku odcinka przepuszczony przez backend.
 *
 * Bez tego strona po HTTPS nie odtworzy odcinka, którego kanał podaje po HTTP —
 * a takich jest sporo w starszych archiwach.
 */
export function mediaSrc(url: string): string {
  return `/api/media?url=${encodeURIComponent(url)}`;
}

/** Sekundy na `H:MM:SS` albo `M:SS` — tak, jak pokazuje je odtwarzacz. */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, '0');
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`;
}
