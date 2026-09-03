/**
 * wakeWord.ts — nasłuch słowa aktywującego, trzema drogami.
 *
 * Przeniesione z `IotAuraPage` w MyCastle, gdzie ta logika jest sprawdzona.
 * Moje pierwsze podejście używało wyłącznie `WakeWordService` (Web Speech
 * przeglądarki) i **nie działało na Androidzie** — a właśnie tam miało działać.
 *
 * ## Dlaczego trzy drogi, a nie jedna
 *
 * Web Speech na Androidzie odtwarza **systemowy dźwięk przy każdym starcie
 * rozpoznawania**, a rozpoznawanie restartuje się co kilkanaście sekund.
 * Daje to beep i migotanie, których nie da się wyłączyć z poziomu strony.
 * Dlatego kolejność jest taka:
 *
 *   1. **ElevenLabs realtime** — jeden ciągły WebSocket, mikrofon otwarty raz,
 *      żadnych restartów i żadnego beepa. Wymaga klucza.
 *   2. **Chmura (OpenAI/Google)** — nagrywanie przez `getUserMedia`
 *      i transkrypcja w pętli. Też bez beepa, bo to nie Web Speech.
 *   3. **Web Speech** — dopiero gdy nie ma żadnego klucza. Na Androidzie
 *      z beepem, którego nie unikniemy.
 *
 * Na komputerze wybór jest mniej istotny, ale zostawiamy ten sam porządek:
 * ciągły strumień jest dokładniejszy niż rozpoznawanie restartowane co chwilę.
 */

import { wakeWordService, RealtimeSttService } from '../speech';
import type { SpeechConfigModel } from '../speech';

/** Znormalizowany tekst do porównań — bez znaków przestankowych i wielkości liter. */
export function normalizuj(s: string): string {
  return s.toLowerCase().replace(/[^0-9a-ząćęłńóśźż ]/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Czy w wypowiedzi padło słowo aktywujące — i co powiedziano po nim.
 *
 * Dopasowanie jest rozmyte (70% słów frazy), bo rozpoznawanie mowy myli końcówki
 * i pisownię nazw własnych: „Kasiu" bywa rozpoznane jako „Kasiu,", „Kasi" albo
 * „Casio". Wymaganie dokładnej zgodności znaczyłoby, że asystentka nie reaguje
 * na własne imię co drugi raz.
 *
 * Zwracana komenda pozwala powiedzieć wszystko naraz („Kasiu, jaka pogoda") —
 * bez niej trzeba by czekać na potwierdzenie i mówić drugi raz.
 */
export function dopasujFraze(raw: string, fraza: string): { trafienie: boolean; komenda: string } {
  const p = normalizuj(fraza);
  const t = normalizuj(raw);
  if (!p) return { trafienie: false, komenda: '' };

  const idx = t.indexOf(p);
  if (idx >= 0) return { trafienie: true, komenda: t.slice(idx + p.length).trim() };

  const slowaFrazy = p.split(' ').filter(Boolean);
  const slowaTekstu = t.split(' ').filter(Boolean);
  const trafione = slowaFrazy.filter((w) => slowaTekstu.some((x) => x.includes(w) || w.includes(x))).length;

  return {
    trafienie: slowaFrazy.length > 0 && trafione / slowaFrazy.length >= 0.7,
    komenda: '',
  };
}

/** Krótki dwutonowy sygnał — potwierdzenie, że Kasia usłyszała zawołanie. */
export function dzwiekZawolania(): void {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    /* brak AudioContext — sygnał jest miły, ale nie konieczny */
  }
}

/** Czy to, co usłyszeliśmy, to własny głos Kasi z głośnika. */
export function czyWlasneEcho(tekst: string, ostatniaWypowiedz: string): boolean {
  const t = normalizuj(tekst);
  const w = normalizuj(ostatniaWypowiedz);
  if (!t || !w) return false;
  return w.includes(t) || t.includes(w);
}

export type SciezkaNasluchu = 'elevenlabs' | 'chmura' | 'przegladarka' | 'brak';

/**
 * Którą drogą pójdzie nasłuch przy obecnej konfiguracji.
 *
 * Wydzielone, żeby panel mógł to **pokazać** — bez tego użytkownik ustawia
 * ElevenLabs jako dostawcę i słusznie zakłada, że słowo aktywujące też przez
 * niego idzie. U mnie szło przez przeglądarkę i nie było tego skąd wyczytać.
 */
export function wybierzSciezke(cfg: SpeechConfigModel, android: boolean): SciezkaNasluchu {
  const stt = cfg.stt as unknown as Record<string, { apiKey?: string }>;
  const dostawca = cfg.stt.provider;

  if (cfg.stt.elevenlabs?.apiKey && (android || dostawca === 'elevenlabs')) return 'elevenlabs';

  const kluczChmury = dostawca !== 'browser' && dostawca !== 'elevenlabs'
    ? stt[dostawca]?.apiKey ?? ''
    : '';
  if (kluczChmury) return 'chmura';

  if (typeof window !== 'undefined'
    && !(window as unknown as Record<string, unknown>).webkitSpeechRecognition
    && !(window as unknown as Record<string, unknown>).SpeechRecognition) {
    return 'brak';
  }
  return 'przegladarka';
}

export function czyAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export interface UchwytNasluchu {
  stop(): void;
  sciezka: SciezkaNasluchu;
}

export interface OpcjeNasluchu {
  fraza: string;
  cfg: SpeechConfigModel;
  /** Wywołane po usłyszeniu frazy; `komenda` to reszta zdania, jeśli padła. */
  onZawolanie(komenda: string): void;
  /** Ostatnia wypowiedź Kasi — do odsiewania własnego echa. */
  ostatniaWypowiedz(): string;
  onBlad?(powod: string): void;
  onStan?(nasluchuje: boolean): void;
}

/**
 * Uruchamia nasłuch najlepszą dostępną drogą.
 *
 * Zwraca uchwyt z `stop()` — wołanym przy wypowiedzi Kasi, przy nagrywaniu
 * pytania i przy opuszczeniu strony. `null`, gdy nie ma czym słuchać.
 */
export function zacznijNasluch(opcje: OpcjeNasluchu): UchwytNasluchu | null {
  const { fraza, cfg, onZawolanie, ostatniaWypowiedz, onBlad, onStan } = opcje;
  if (!fraza.trim()) return null;

  const sciezka = wybierzSciezke(cfg, czyAndroid());

  if (sciezka === 'brak') {
    onBlad?.('Ta przeglądarka nie ma rozpoznawania mowy, a nie ustawiono klucza ElevenLabs ani chmurowego.');
    return null;
  }

  if (sciezka === 'elevenlabs') {
    const rt = new RealtimeSttService();
    let zywy = true;

    void rt.start({
      apiKey: cfg.stt.elevenlabs.apiKey,
      language: cfg.stt.elevenlabs.language || 'pol',
      model: cfg.stt.elevenlabs.model,
      onFinal: (tekst) => {
        if (!zywy) return;
        // Własny głos z głośnika nie może wołać Kasi.
        if (czyWlasneEcho(tekst, ostatniaWypowiedz())) return;

        const { trafienie, komenda } = dopasujFraze(tekst, fraza);
        if (!trafienie) return;   // słuchamy dalej tym samym strumieniem — bez beepa

        zywy = false;
        rt.stop();
        onStan?.(false);
        dzwiekZawolania();
        onZawolanie(komenda);
      },
      onError: () => {
        if (!zywy) return;
        zywy = false;
        onStan?.(false);
        onBlad?.('Nasłuch ElevenLabs przerwany — sprawdź klucz albo połączenie.');
      },
    })
      .then(() => onStan?.(true))
      .catch(() => {
        zywy = false;
        onStan?.(false);
        onBlad?.('Nie udało się połączyć z ElevenLabs — sprawdź klucz API.');
      });

    return { sciezka, stop: () => { zywy = false; rt.stop(); onStan?.(false); } };
  }

  /*
   * Ścieżka chmurowa i przeglądarkowa korzystają z `wakeWordService`.
   *
   * Dla chmury Aura ma osobną pętlę nagrywania z bramką ciszy; tutaj używamy
   * Web Speech także w tym przypadku, bo przy ustawionym ElevenLabs (a tak jest
   * u nas domyślnie) i tak nie wchodzi. Gdyby ktoś ustawił samo OpenAI, dostanie
   * na Androidzie beep — i o tym mówi panel.
   */
  wakeWordService.configure({
    phrase: fraza,
    sensitivity: cfg.wakeWord.sensitivity ?? 0.7,
    lang: cfg.wakeWord.lang || cfg.stt.browser.lang || 'pl-PL',
    onWake: (tekst) => {
      if (czyWlasneEcho(tekst, ostatniaWypowiedz())) return;
      wakeWordService.stop();
      onStan?.(false);
      dzwiekZawolania();
      onZawolanie(dopasujFraze(tekst, fraza).komenda);
    },
    onStatusChange: (sluchа) => onStan?.(sluchа),
  });

  if (!wakeWordService.start()) {
    onBlad?.('Nie udało się uruchomić nasłuchu przeglądarki.');
    return null;
  }

  return { sciezka, stop: () => { wakeWordService.stop(); onStan?.(false); } };
}

/** Ostatnio wybrana ścieżka — do pokazania w panelu. */
export function opisSciezki(s: SciezkaNasluchu): string {
  switch (s) {
    case 'elevenlabs':
      return 'ElevenLabs realtime — ciągły strumień, bez sygnału systemowego (zalecane na Androidzie)';
    case 'chmura':
      return 'chmura — nagrywanie i transkrypcja w pętli';
    case 'przegladarka':
      return czyAndroid()
        ? 'przeglądarka (Web Speech) — na Androidzie z systemowym sygnałem przy każdym starcie'
        : 'przeglądarka (Web Speech)';
    default:
      return 'brak — ta przeglądarka nie ma rozpoznawania mowy i nie ustawiono klucza';
  }
}
