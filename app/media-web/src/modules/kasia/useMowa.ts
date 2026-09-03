/**
 * useMowa — mikrofon i głos Kasi w jednym haku.
 *
 * Spina `speechService` (kopia modułu z Aury) ze stroną Kasi. Powstał, bo
 * dyktowanie i czytanie odpowiedzi to dwie strony tej samej rzeczy — rozmowy
 * głosowej — i muszą wiedzieć o sobie nawzajem: mikrofon nie może nagrywać
 * wtedy, gdy Kasia mówi, bo nagrałby jej własny głos i odesłał go jako
 * wypowiedź użytkownika.
 *
 * ## Słowo aktywujące
 *
 * Włączane w panelu Głos; nasłuch rusza sam, bez drugiego przycisku. Po
 * usłyszeniu frazy Kasia zaczyna nagrywać właściwe pytanie — a jeśli komenda
 * padła w tym samym zdaniu („Kasiu, co mam dziś"), bierze ją od razu.
 *
 * Sam nasłuch siedzi w `wakeWord.ts` i ma **trzy drogi** (ElevenLabs realtime,
 * chmura, Web Speech), przeniesione z Aury. Powód jest praktyczny: Web Speech
 * na Androidzie beepie przy każdym restarcie rozpoznawania.
 *
 * Trzeba wiedzieć, co to znaczy: **mikrofon jest włączony tak długo, jak długo
 * karta jest otwarta**, także gdy tablet leży ekranem w dół. Na urządzeniu
 * stojącym w kuchni to w porządku, na telefonie w kieszeni — niekoniecznie.
 * Dlatego domyślnie jest wyłączone i wymaga świadomego włączenia.
 *
 * Nasłuch jest wstrzymywany, gdy Kasia mówi albo gdy trwa nagrywanie pytania:
 * bez tego usłyszałby jej własny głos i uznał go za zawołanie.
 *
 * ## Bezpieczny kontekst
 *
 * Mikrofon i rozpoznawanie mowy wymagają **HTTPS albo `localhost`**. Pod
 * adresem `http://192.168.0.x` przeglądarka odmawia, zanim cokolwiek się
 * zacznie — i nie mówi o tym użytkownikowi. Sprawdzamy to sami, żeby panel
 * mógł wyjaśnić ciszę zamiast ją tylko pokazywać.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { speechService, AudioRecorder, DEFAULT_SPEECH_CONFIG } from '../speech';
import type { SpeechConfigModel } from '../speech';
import {
  czyAndroid, opisSciezki, wybierzSciezke, zacznijNasluch,
  type SciezkaNasluchu, type UchwytNasluchu,
} from './wakeWord';

/**
 * Czy przeglądarka w ogóle wpuści nas do mikrofonu.
 *
 * `isSecureContext` jest tu dokładniejsze niż sprawdzanie protokołu: obejmuje
 * `localhost` (który działa po HTTP) i przypadki brzegowe w WebView.
 */
function mikrofonDozwolony(): { ok: boolean; powod?: string } {
  if (typeof window === 'undefined') return { ok: false, powod: 'brak przeglądarki' };
  if (!window.isSecureContext) {
    return {
      ok: false,
      powod: 'Mikrofon wymaga HTTPS. Pod adresem http://… z numerem IP przeglądarka '
        + 'go nie udostępni — otwórz stronę po HTTPS albo przez localhost.',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, powod: 'Ta przeglądarka nie udostępnia mikrofonu.' };
  }
  return { ok: true };
}

export interface StanMowy {
  /** Czy konfiguracja została wczytana — do tego czasu przyciski są nieaktywne. */
  gotowa: boolean;
  nagrywa: boolean;
  mowi: boolean;
  /** Czy odpowiedzi mają być czytane na głos. */
  czytaj: boolean;
  blad: string | null;
  /** Czy przeglądarka w ogóle wpuści do mikrofonu (HTTPS). */
  mikrofonMozliwy: boolean;
  /** Dlaczego nie — zdanie dla użytkownika, nie kod błędu. */
  powodBrakuMikrofonu?: string;
  /** Czy słowo aktywujące jest włączone i nasłuchuje. */
  nasluchuje: boolean;
  /** Którą drogą idzie nasłuch — panel to pokazuje. */
  sciezkaNasluchu: SciezkaNasluchu;
  opisSciezkiNasluchu: string;
}

export interface Mowa extends StanMowy {
  /** Zaczyna nagrywanie; zwraca rozpoznany tekst albo pusty ciąg. */
  nagrywaj(): Promise<string>;
  /** Włącza/wyłącza nasłuch słowa aktywującego. */
  przelaczNasluch(): void;
  zakonczNagrywanie(): Promise<string>;
  przelaczCzytanie(): void;
  powiedz(tekst: string): Promise<void>;
  przerwij(): void;
  konfiguracja: SpeechConfigModel;
}

export function useMowa(onZawolanie?: (tekst: string) => void): Mowa {
  const [konfiguracja, setKonfiguracja] = useState<SpeechConfigModel>({ ...DEFAULT_SPEECH_CONFIG });
  const dostep = mikrofonDozwolony();
  const [stan, setStan] = useState<StanMowy>({
    gotowa: false, nagrywa: false, mowi: false, czytaj: false, blad: null,
    mikrofonMozliwy: dostep.ok, powodBrakuMikrofonu: dostep.powod, nasluchuje: false,
    sciezkaNasluchu: 'przegladarka', opisSciezkiNasluchu: '',
  });

  const recorder = useRef<AudioRecorder | null>(null);
  /*
   * Wywołanie zwrotne w ref, nie w zależnościach efektu.
   *
   * Gdyby szło zależnością, każdy render strony (a jest ich sporo — rozmowa
   * odświeża się co pięć sekund) przestawiałby nasłuch od nowa, przerywając
   * rozpoznawanie w połowie słowa.
   */
  const zawolanie = useRef(onZawolanie);
  zawolanie.current = onZawolanie;
  /*
   * Uchwyt na własną funkcję nagrywania.
   *
   * `onWake` powstaje wcześniej niż `nagrywaj`, więc nie może jej zawołać
   * wprost. Ref rozwiązuje kolejność bez zmuszania strony, żeby odwoływała się
   * do haka, którego jeszcze nie ma — a tak wyglądało pierwsze podejście.
   */
  const nagrywajRef = useRef<() => Promise<string>>();
  /** Ta sama sztuczka z kolejnością co przy nagrywaniu — patrz wyżej. */
  const wlaczNasluchRef = useRef<(cfg: SpeechConfigModel) => void>();
  /** Uchwyt bieżącego nasłuchu — trzeba go zamknąć przed każdym innym użyciem mikrofonu. */
  const uchwyt = useRef<UchwytNasluchu | null>(null);
  /** Ostatnia wypowiedź Kasi — do odsiewania własnego echa z mikrofonu. */
  const ostatniaWypowiedz = useRef('');
  /** Czy nasłuch ma wrócić po tym, jak Kasia skończy mówić. */
  const wznowNasluch = useRef(false);

  useEffect(() => {
    let anulowane = false;
    void speechService.loadConfig().then((cfg) => {
      if (anulowane) return;
      setKonfiguracja(cfg);
      setStan((s) => ({ ...s, gotowa: true }));
    });
    return () => { anulowane = true; };
  }, []);

  // Zatrzymanie nasłuchu przy opuszczeniu strony — inaczej mikrofon zostaje
  // włączony po przejściu do Podcastów, bez niczego, co by to pokazywało.
  useEffect(() => () => { uchwyt.current?.stop(); uchwyt.current = null; }, []);

  /*
   * Nasłuch rusza sam, gdy jest włączony w ustawieniach.
   *
   * Pierwsze podejście wymagało jeszcze dotknięcia ikony w czacie — i to była
   * pomyłka: kto włączył słowo aktywujące w panelu, powiedział już, czego chce.
   * Drugi włącznik w innym miejscu wyglądał jak awaria pierwszego.
   *
   * Nadal zostawiamy ikonę, żeby dało się wyciszyć mikrofon bez wchodzenia
   * w ustawienia — ale ona teraz **wyłącza**, a nie włącza.
   */
  useEffect(() => {
    if (!stan.gotowa || !dostep.ok) return;
    if (!konfiguracja.wakeWord?.enabled) { uchwyt.current?.stop(); uchwyt.current = null; return; }
    if (uchwyt.current) return;
    wlaczNasluchRef.current?.(konfiguracja);
  }, [stan.gotowa, dostep.ok, konfiguracja]);

  const przerwij = useCallback(() => {
    speechService.stopSpeaking();
    setStan((s) => ({ ...s, mowi: false }));
  }, []);

  /**
   * Włącza nasłuch słowa aktywującego.
   *
   * Frazę i język bierzemy z konfiguracji zapisanej w panelu. Po usłyszeniu
   * zawołania **wstrzymujemy nasłuch** i oddajemy sterowanie stronie — to ona
   * zaczyna nagrywać właściwe pytanie. Bez wstrzymania rozpoznawanie łapałoby
   * dalszy ciąg zdania jako kolejne zawołania.
   */
  const wlaczNasluch = useCallback((cfg: SpeechConfigModel) => {
    uchwyt.current?.stop();
    uchwyt.current = zacznijNasluch({
      fraza: cfg.wakeWord.phrase,
      cfg,
      ostatniaWypowiedz: () => ostatniaWypowiedz.current,
      onZawolanie: (komenda) => {
        // Komenda w tym samym zdaniu idzie od razu; bez niej nagrywamy pytanie.
        if (komenda.length >= 2) zawolanie.current?.(komenda);
        else { zawolanie.current?.(''); void nagrywajRef.current?.(); }
      },
      onStan: (sluchа) => setStan((s) => ({ ...s, nasluchuje: sluchа })),
      onBlad: (powod) => setStan((s) => ({ ...s, nasluchuje: false, blad: powod })),
    });

    const sciezka = wybierzSciezke(cfg, czyAndroid());
    setStan((s) => ({ ...s, sciezkaNasluchu: sciezka, opisSciezkiNasluchu: opisSciezki(sciezka) }));
  }, []);

  wlaczNasluchRef.current = wlaczNasluch;

  const przelaczNasluch = useCallback(() => {
    if (!dostep.ok) {
      setStan((s) => ({ ...s, blad: dostep.powod ?? 'Mikrofon niedostępny.' }));
      return;
    }
    setStan((s) => {
      if (s.nasluchuje) { uchwyt.current?.stop(); uchwyt.current = null; return { ...s, nasluchuje: false, blad: null }; }
      return { ...s, blad: null };
    });
    if (!uchwyt.current) wlaczNasluch(konfiguracja);
  }, [dostep.ok, dostep.powod, konfiguracja, wlaczNasluch]);

  const powiedz = useCallback(async (tekst: string) => {
    if (!tekst.trim()) return;
    /*
     * Przerywamy poprzednią wypowiedź, zamiast kolejkować.
     *
     * Kasia potrafi odezwać się dwa razy pod rząd (przypomnienie i odpowiedź).
     * Kolejka znaczyłaby, że użytkownik słucha nieaktualnej wiadomości, podczas
     * gdy nowa już jest na ekranie.
     */
    speechService.stopSpeaking();

    /*
     * Nasłuch milknie na czas wypowiedzi Kasi.
     *
     * Inaczej usłyszałby jej głos z głośnika i — gdyby padło w nim słowo
     * aktywujące — sam siebie zawołał. Wracamy do nasłuchu dopiero po końcu.
     */
    wznowNasluch.current = Boolean(uchwyt.current);
    if (wznowNasluch.current) { uchwyt.current?.stop(); uchwyt.current = null; }
    // Zapamiętujemy, co Kasia mówi — mikrofon usłyszy to z głośnika i musi
    // umieć odsiać własne echo, zamiast uznać je za zawołanie.
    ostatniaWypowiedz.current = tekst;

    setStan((s) => ({ ...s, mowi: true, blad: null }));
    try {
      await speechService.speak({ text: tekst });
    } catch (err) {
      setStan((s) => ({ ...s, blad: (err as Error).message }));
    } finally {
      setStan((s) => ({ ...s, mowi: false }));
      if (wznowNasluch.current) { wznowNasluch.current = false; wlaczNasluch(konfiguracja); }
    }
  }, [konfiguracja, wlaczNasluch]);

  const nagrywaj = useCallback(async (): Promise<string> => {
    // Mikrofon nie może słuchać, gdy Kasia mówi — nagrałby jej własny głos.
    speechService.stopSpeaking();
    // Nasłuch i nagrywanie to ten sam mikrofon — nie mogą działać naraz.
    if (uchwyt.current) {
      wznowNasluch.current = true;
      uchwyt.current.stop();
      uchwyt.current = null;
      setStan((s) => ({ ...s, nasluchuje: false }));
    }

    if (!dostep.ok) {
      setStan((s) => ({ ...s, blad: dostep.powod ?? 'Mikrofon niedostępny.' }));
      return '';
    }

    try {
      recorder.current = new AudioRecorder();
      await recorder.current.start();
      setStan((s) => ({ ...s, nagrywa: true, mowi: false, blad: null }));
      return '';
    } catch (err) {
      setStan((s) => ({
        ...s,
        nagrywa: false,
        // Odmowa dostępu do mikrofonu to najczęstszy przypadek i warto go nazwać.
        blad: (err as Error).name === 'NotAllowedError'
          ? 'Brak zgody na mikrofon — udziel jej w ustawieniach przeglądarki.'
          : (err as Error).message,
      }));
      return '';
    }
  }, []);

  const zakonczNagrywanie = useCallback(async (): Promise<string> => {
    if (!recorder.current) return '';
    setStan((s) => ({ ...s, nagrywa: false }));
    try {
      const audio = await recorder.current.stop();
      recorder.current = null;
      if (!audio) return '';
      const wynik = await speechService.transcribe({ audio });
      return wynik.text ?? '';
    } catch (err) {
      setStan((s) => ({ ...s, blad: (err as Error).message }));
      return '';
    } finally {
      // Wracamy do nasłuchu, jeśli to on nas wcześniej ustąpił.
      if (wznowNasluch.current) { wznowNasluch.current = false; wlaczNasluch(konfiguracja); }
    }
  }, [konfiguracja, wlaczNasluch]);

  // Ref uzupełniamy po utworzeniu funkcji — patrz komentarz przy deklaracji.
  nagrywajRef.current = nagrywaj;

  const przelaczCzytanie = useCallback(() => {
    setStan((s) => {
      if (s.czytaj) speechService.stopSpeaking();
      return { ...s, czytaj: !s.czytaj };
    });
  }, []);

  return {
    ...stan, konfiguracja,
    nagrywaj, zakonczNagrywanie, przelaczCzytanie, przelaczNasluch, powiedz, przerwij,
  };
}
