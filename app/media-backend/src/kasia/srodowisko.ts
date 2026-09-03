/**
 * srodowisko.ts — konfiguracja Kasi ze zmiennych środowiskowych.
 *
 * Jedno miejsce, w którym czyta się `.env`. Wcześniej klucz modelu wchodził
 * przez konstruktor serwera, a klucze mowy trzeba było wpisać w panelu na
 * każdej instalacji z osobna — teraz wszystkie idą tą samą drogą.
 *
 * ## Zasada: klucze w środowisku, ustawienia w panelu
 *
 * Klucz API jest sekretem wdrożenia: zmienia się rzadko, nie powinien wędrować
 * przez przeglądarkę i musi być gotowy, **zanim** ktokolwiek otworzy panel —
 * na serwerze nie ma jak wejść w interfejs przed pierwszym uruchomieniem.
 * Wybór głosu, języka czy tempa mowy jest odwrotnie: to preferencja, którą
 * zmienia się w biegu i której nie chce się wpisywać do pliku.
 *
 * Stąd scalanie zamiast pierwszeństwa jednej strony (`scalGlosZeSrodowiskiem`):
 * panel decyduje o ustawieniach, środowisko dostarcza klucze tam, gdzie panel
 * ich nie ma. Gdyby zapisana konfiguracja wygrywała w całości, pierwszy zapis
 * czegokolwiek w panelu „zamrażałby" pusty klucz i zmiana w `.env` przestawałaby
 * działać — bez żadnego śladu, po którym dałoby się to rozpoznać.
 *
 * ## Klucz jako deklaracja zamiaru
 *
 * Obecność `ELEVENLABS_API_KEY` **wybiera ElevenLabs** na domyślnego dostawcę
 * mowy, a nie tylko wypełnia pole. Nikt nie wpisuje klucza „na wszelki wypadek";
 * wpisanie go i pozostawienie przeglądarkowego TTS byłoby zaskoczeniem, nie
 * ostrożnością. Tak samo klucz Anthropic wybiera Anthropic jako dostawcę modelu.
 */

import type { DostawcaModelu } from './llm';

/** Wszystko, co Kasia bierze ze środowiska. */
export interface KonfiguracjaSrodowiska {
  kluczModelu: string;
  kluczElevenLabs: string;
  /** Wybrany dostawca modelu; `undefined`, gdy nic nie wskazuje. */
  dostawca?: DostawcaModelu;
  model?: string;
  inicjatywaCoMin?: number;
  strefaCzasowa?: string;
}

const DOSTAWCY: readonly DostawcaModelu[] = ['anthropic', 'openai', 'ollama'];

/** Pusta i sama spacja znaczą to samo co brak — tak wygląda niewypełniony `.env`. */
function napis(v: string | undefined): string {
  return (v ?? '').trim();
}

export function czytajSrodowisko(env: Record<string, string | undefined>): KonfiguracjaSrodowiska {
  const anthropic = napis(env.ANTHROPIC_API_KEY);
  const openai = napis(env.OPENAI_API_KEY);
  const jawnyDostawca = napis(env.KASIA_DOSTAWCA).toLowerCase() as DostawcaModelu;

  const dostawca: DostawcaModelu | undefined =
    DOSTAWCY.includes(jawnyDostawca) ? jawnyDostawca
      : anthropic ? 'anthropic'
        : openai ? 'openai'
          : undefined;

  // Klucz bierzemy tego dostawcy, który wygrał — inaczej wybór Ollamy
  // przy ustawionym kluczu Anthropic wysyłałby cudzy klucz na localhost.
  const kluczModelu = dostawca === 'openai' ? openai
    : dostawca === 'anthropic' ? anthropic
      : '';

  const minut = Number(napis(env.KASIA_INICJATYWA_MIN));

  return {
    kluczModelu,
    kluczElevenLabs: napis(env.ELEVENLABS_API_KEY),
    dostawca,
    model: napis(env.KASIA_MODEL) || undefined,
    // `Number('')` to zero, więc pusty wpis wyglądałby jak wyłączona inicjatywa.
    inicjatywaCoMin: napis(env.KASIA_INICJATYWA_MIN) && Number.isFinite(minut) && minut >= 0
      ? minut
      : undefined,
    strefaCzasowa: napis(env.KASIA_STREFA) || undefined,
  };
}

// ── Konfiguracja mowy ────────────────────────────────────────────────────────

/**
 * Kształt konfiguracji mowy — kopia z `media-web/modules/speech`.
 *
 * Powtórzony tutaj, a nie zaimportowany: backend nie zależy od frontendu
 * i nie powinien zacząć przez jedno pole. Backend tej struktury **nie
 * interpretuje** — przechowuje ją i uzupełnia klucze; kształt obchodzi go
 * dokładnie w tych dwóch miejscach.
 */
export interface KonfiguracjaGlosu {
  tts: {
    provider: string;
    elevenlabs: { apiKey: string; voiceId: string; model: string };
    browser: { lang: string; rate: number; pitch: number; voiceURI: string };
    openai: Record<string, unknown>;
    google: Record<string, unknown>;
    [k: string]: unknown;
  };
  stt: {
    provider: string;
    elevenlabs: { apiKey: string; model: string; language: string };
    browser: { lang: string; continuous: boolean; interimResults: boolean };
    openai: Record<string, unknown>;
    google: Record<string, unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function domyslnyGlos(env: Pick<KonfiguracjaSrodowiska, 'kluczElevenLabs'>): KonfiguracjaGlosu {
  const el = env.kluczElevenLabs;
  // Klucz wybiera dostawcę — patrz „klucz jako deklaracja zamiaru" wyżej.
  const dostawca = el ? 'elevenlabs' : 'browser';

  return {
    tts: {
      provider: dostawca,
      elevenlabs: { apiKey: el, voiceId: 'JBFqnCBsd6RMkjVDRZzb', model: 'eleven_v3' },
      browser: { lang: 'pl-PL', rate: 1, pitch: 1, voiceURI: '' },
      openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'tts-1', voice: 'nova', speed: 1, responseFormat: 'mp3' },
      google: { apiKey: '', languageCode: 'pl-PL', voiceName: '', speakingRate: 1 },
    },
    stt: {
      provider: dostawca,
      elevenlabs: { apiKey: el, model: 'scribe_v2_realtime', language: 'pl' },
      browser: { lang: 'pl-PL', continuous: false, interimResults: true },
      openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'whisper-1', language: 'pl' },
      google: { apiKey: '', languageCode: 'pl-PL' },
    },
  };
}

/** Klucz ze środowiska wchodzi tam, gdzie zapisana konfiguracja go nie ma. */
function uzupelnijKlucz(cel: Record<string, unknown> | undefined, klucz: string): void {
  if (!cel || !klucz) return;
  if (!napis(cel.apiKey as string | undefined)) cel.apiKey = klucz;
}

/**
 * Zapisana konfiguracja + klucze ze środowiska.
 *
 * Zapisana wygrywa we wszystkim poza pustymi kluczami: wybór dostawcy, głos,
 * język i tempo to decyzje użytkownika i środowisko ich nie podważa.
 */
export function scalGlosZeSrodowiskiem(
  zapisana: unknown,
  env: Pick<KonfiguracjaSrodowiska, 'kluczElevenLabs'>,
): KonfiguracjaGlosu {
  const domyslna = domyslnyGlos(env);
  if (!zapisana || typeof zapisana !== 'object') return domyslna;

  const z = zapisana as Partial<KonfiguracjaGlosu>;
  // Uszkodzony albo niepełny zapis (starsza wersja pliku) uzupełniamy domyślnymi,
  // zamiast wywracać odczyt — panel ma się otworzyć nawet po nieudanym zapisie.
  const wynik: KonfiguracjaGlosu = {
    ...domyslna,
    ...z,
    tts: { ...domyslna.tts, ...(z.tts ?? {}) },
    stt: { ...domyslna.stt, ...(z.stt ?? {}) },
  };

  uzupelnijKlucz(wynik.tts.elevenlabs as unknown as Record<string, unknown>, env.kluczElevenLabs);
  uzupelnijKlucz(wynik.stt.elevenlabs as unknown as Record<string, unknown>, env.kluczElevenLabs);

  return wynik;
}
