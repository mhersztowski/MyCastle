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
