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
  /** Czy działa tryb ciągły (bez wołania po imieniu). */
  trybCiagly: boolean;
  /** Którą drogą idzie nasłuch — panel to pokazuje. */
  sciezkaNasluchu: SciezkaNasluchu;
  opisSciezkiNasluchu: string;
}

export interface Mowa extends StanMowy {
  /**
   * Dokłada zdanie do kolejki wypowiedzi.
   *
   * Przy strumieniu zdania przychodzą szybciej, niż syntezator je wypowiada —
   * wołanie `powiedz` dla każdego przerywałoby poprzednie w połowie. Kolejka
   * czeka na koniec każdego, zanim zacznie następne.
   */
  dopiszDoWypowiedzi(zdanie: string): void;
  /** Czeka, aż kolejka się opróżni — do wznowienia nasłuchu po odpowiedzi. */
  poczekajNaKoniecMowy(): Promise<void>;
  /** Zaczyna nagrywanie; zwraca rozpoznany tekst albo pusty ciąg. */
  nagrywaj(): Promise<string>;
  /** Włącza/wyłącza nasłuch słowa aktywującego. */
  przelaczNasluch(): void;
  /**
   * Tryb ciągły: każda wypowiedź jest pytaniem, bez wołania po imieniu.
   * Wymaga ElevenLabs — Web Speech restartowałby się co kilkanaście sekund
   * i beepał przy każdym starcie.
   */
  przelaczTrybCiagly(): void;
  zakonczNagrywanie(): Promise<string>;
  przelaczCzytanie(): void;
  powiedz(tekst: string): Promise<void>;
  przerwij(): void;
  konfiguracja: SpeechConfigModel;
}

export function useMowa(onWypowiedz?: (tekst: string) => void): Mowa {
  const [konfiguracja, setKonfiguracja] = useState<SpeechConfigModel>({ ...DEFAULT_SPEECH_CONFIG });
  const dostep = mikrofonDozwolony();
  const [stan, setStan] = useState<StanMowy>({
    gotowa: false, nagrywa: false, mowi: false, czytaj: false, blad: null,
    mikrofonMozliwy: dostep.ok, powodBrakuMikrofonu: dostep.powod, nasluchuje: false,
    sciezkaNasluchu: 'przegladarka', opisSciezkiNasluchu: '', trybCiagly: false,
  });

  const recorder = useRef<AudioRecorder | null>(null);
  /*
   * Wywołanie zwrotne w ref, nie w zależnościach efektu.
   *
   * Gdyby szło zależnością, każdy render strony (a jest ich sporo — rozmowa
   * odświeża się co pięć sekund) przestawiałby nasłuch od nowa, przerywając
   * rozpoznawanie w połowie słowa.
   */
  /**
   * Co zrobić z gotową wypowiedzią użytkownika.
   *
   * Wołane w dwóch przypadkach: gdy komenda padła w tym samym zdaniu co
   * zawołanie („Kasiu, co mam dziś") i gdy nagranie po zawołaniu zostało
   * przepisane na tekst. W obu strona dostaje **gotowy tekst**, a nie sam
   * sygnał — wcześniej dostawała sygnał i wyrzucała treść.
   */
  const wypowiedz = useRef(onWypowiedz);
  wypowiedz.current = onWypowiedz;
  /*
   * Uchwyt na własną funkcję nagrywania.
   *
   * `onWake` powstaje wcześniej niż `nagrywaj`, więc nie może jej zawołać
   * wprost. Ref rozwiązuje kolejność bez zmuszania strony, żeby odwoływała się
   * do haka, którego jeszcze nie ma — a tak wyglądało pierwsze podejście.
   */
  const nagrywajRef = useRef<() => Promise<string>>();
  const nagrywajZAutoStopemRef = useRef<() => Promise<void>>();
  /** Ta sama sztuczka z kolejnością co przy nagrywaniu — patrz wyżej. */
  const wlaczNasluchRef = useRef<(cfg: SpeechConfigModel) => void>();
  /** Uchwyt bieżącego nasłuchu — trzeba go zamknąć przed każdym innym użyciem mikrofonu. */
  const uchwyt = useRef<UchwytNasluchu | null>(null);
  /**
   * Łańcuch wypowiedzi — każde zdanie czeka na poprzednie.
   *
   * Obietnica zamiast tablicy: nie musimy pilnować, czy pętla już chodzi, bo
   * doklejenie do łańcucha samo ustawia kolejność. Ten sam wzorzec co
   * `ttsChainRef` w Aurze.
   */
  const lancuchMowy = useRef<Promise<void>>(Promise.resolve());
  /** Tryb ciągły w ref — `wlaczNasluch` musi go widzieć, nie będąc od niego zależnym. */
  const trybCiaglyRef = useRef(false);
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
      bezFrazy: trybCiaglyRef.current,
      ostatniaWypowiedz: () => ostatniaWypowiedz.current,
      onZawolanie: (komenda) => {
        /*
         * W trybie ciągłym strumień żyje dalej, więc nie ma czego wznawiać —
         * a znacznik wznowienia kazałby otworzyć drugi nasłuch obok pierwszego.
         */
        if (trybCiaglyRef.current) { wypowiedz.current?.(komenda); return; }

        // Komenda w tym samym zdaniu idzie od razu; bez niej nagrywamy pytanie
        // i oddajemy je stronie dopiero po przepisaniu na tekst.
        wznowNasluch.current = true;
        if (komenda.length >= 2) {
          wypowiedz.current?.(komenda);
          // Nasłuch wraca po odpowiedzi Kasi — patrz `powiedz`.
        } else {
          void nagrywajZAutoStopemRef.current?.();
        }
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
    /*
     * Znacznik wznowienia **dokładamy**, nie nadpisujemy.
     *
     * Po zawołaniu jest już ustawiony (nasłuch ustąpił miejsca pytaniu), a
     * uchwyt bywa wtedy pusty. Podstawienie `Boolean(uchwyt)` kasowałoby go
     * i nasłuch nie wracałby po odpowiedzi — czyli słowo aktywujące działałoby
     * dokładnie raz na otwarcie strony.
     */
    if (uchwyt.current) { wznowNasluch.current = true; uchwyt.current.stop(); uchwyt.current = null; }
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

  /**
   * Nagrywanie zakończone **samo** po chwili ciszy.
   *
   * To brakujący element całego obiegu głosowego: po zawołaniu mikrofon
   * ruszał, ale nic go nie zatrzymywało — nagranie trwało w nieskończoność
   * i nigdy nie trafiało do rozpoznawania. Z punktu widzenia użytkownika
   * wyglądało to tak, jakby wake word nie działał.
   *
   * `AudioRecorder` ma bramkę ciszy od początku; wystarczyło jej użyć.
   * Półtorej sekundy to długość, po której człowiek uznaje, że skończył
   * mówić — krócej ucina zdania w połowie namysłu.
   */
  const nagrywajZAutoStopem = useCallback(async (): Promise<void> => {
    if (!dostep.ok) { setStan((s) => ({ ...s, blad: dostep.powod ?? 'Mikrofon niedostępny.' })); return; }

    speechService.stopSpeaking();
    try {
      const rec = new AudioRecorder();
      recorder.current = rec;

      await rec.start({
        onSilenceDetected: () => {
          // Zamykamy nagranie i przepisujemy je na tekst; wynik idzie do strony.
          void (async () => {
            try {
              const audio = await rec.stop();
              recorder.current = null;
              setStan((s) => ({ ...s, nagrywa: false }));
              if (!audio) return;

              const wynik = await speechService.transcribe({ audio });
              const tekst = (wynik.text ?? '').trim();
              if (tekst) wypowiedz.current?.(tekst);
            } catch (err) {
              setStan((s) => ({ ...s, nagrywa: false, blad: (err as Error).message }));
            }
            /*
             * Tu **nie** wznawiamy nasłuchu.
             *
             * Zaraz po przepisaniu strona wysyła pytanie i Kasia odpowiada
             * głosem — nasłuch wznowiony w tym miejscu usłyszałby jej pierwsze
             * słowa. Robi to `powiedz`, po zakończeniu wypowiedzi.
             *
             * Gdyby wysyłka się nie udała i Kasia nic nie powiedziała, nasłuch
             * wraca przy następnej zmianie konfiguracji albo po odświeżeniu
             * strony — cena za brak nakładania się mikrofonu na głośnik.
             */
          })();
        },
        /*
         * Półtorej sekundy ciszy kończy nagranie, ale najpierw musi minąć
         * sekunda mówienia. Krótszy próg ucinał zdania w chwili namysłu —
         * a przy dyktowaniu z drugiego końca pokoju pauzy są dłuższe niż przy
         * mikrofonie pod brodą.
         */
        duration: 1500,
        minRecordingTime: 1000,
      },
      // Urządzenie i wzmocnienie z ustawień panelu — dotąd nie były
      // przekazywane wcale, więc suwak „wzmocnienie mikrofonu" nic nie robił.
      undefined,
      konfiguracja.stt.inputGain ?? 1);

      setStan((s) => ({ ...s, nagrywa: true, mowi: false, blad: null }));
    } catch (err) {
      setStan((s) => ({
        ...s,
        nagrywa: false,
        blad: (err as Error).name === 'NotAllowedError'
          ? 'Brak zgody na mikrofon — udziel jej w ustawieniach przeglądarki.'
          : (err as Error).message,
      }));
    }
  }, [dostep.ok, dostep.powod, konfiguracja]);

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
      await recorder.current.start(undefined, undefined, konfiguracja.stt.inputGain ?? 1);
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
    // `konfiguracja` w zależnościach: bez niej hak trzymałby wartość sprzed
    // wczytania ustawień i suwak wzmocnienia nie działałby przy dyktowaniu.
  }, [dostep.ok, dostep.powod, konfiguracja]);

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
  nagrywajZAutoStopemRef.current = nagrywajZAutoStopem;

  /**
   * Wypowiada zdania po kolei, bez przerywania poprzedniego.
   *
   * Każde zdanie dopisujemy też do „ostatnio powiedzianego", żeby nasłuch
   * potrafił odsiać własne echo — przy strumieniu Kasia mówi długo i mikrofon
   * ma więcej okazji, żeby ją usłyszeć.
   */
  const dopiszDoWypowiedzi = useCallback((zdanie: string) => {
    const t = zdanie.trim();
    if (!t) return;

    ostatniaWypowiedz.current = `${ostatniaWypowiedz.current} ${t}`.slice(-400);
    setStan((s) => ({ ...s, mowi: true }));

    lancuchMowy.current = lancuchMowy.current
      .then(() => speechService.speak({ text: t }).catch(() => { /* jedno zdanie mniej */ }))
      .then(() => { setStan((s) => ({ ...s, mowi: false })); });
  }, []);

  const poczekajNaKoniecMowy = useCallback(async () => { await lancuchMowy.current; }, []);

  /**
   * Przełącza tryb ciągły.
   *
   * Wymaga ścieżki ElevenLabs: Web Speech restartuje rozpoznawanie co
   * kilkanaście sekund i przy każdym starcie beepie — w trybie ciągłym
   * znaczyłoby to sygnał co kilkanaście sekund przez cały czas.
   */
  const przelaczTrybCiagly = useCallback(() => {
    if (!dostep.ok) {
      setStan((s) => ({ ...s, blad: dostep.powod ?? 'Mikrofon niedostępny.' }));
      return;
    }

    const nowy = !trybCiaglyRef.current;
    if (nowy && wybierzSciezke(konfiguracja, czyAndroid()) !== 'elevenlabs') {
      setStan((s) => ({
        ...s,
        blad: 'Tryb ciągły wymaga klucza ElevenLabs — bez niego nasłuch szedłby '
          + 'przez przeglądarkę, restartując się (i sygnalizując) co kilkanaście sekund.',
      }));
      return;
    }

    trybCiaglyRef.current = nowy;
    setStan((s) => ({ ...s, trybCiagly: nowy, blad: null }));

    uchwyt.current?.stop();
    uchwyt.current = null;
    if (nowy || konfiguracja.wakeWord?.enabled) wlaczNasluch(konfiguracja);
  }, [dostep.ok, dostep.powod, konfiguracja, wlaczNasluch]);

  const przelaczCzytanie = useCallback(() => {
    setStan((s) => {
      if (s.czytaj) speechService.stopSpeaking();
      return { ...s, czytaj: !s.czytaj };
    });
  }, []);

  return {
    ...stan, konfiguracja,
    nagrywaj, zakonczNagrywanie, przelaczCzytanie, przelaczNasluch, przelaczTrybCiagly,
    powiedz, przerwij, dopiszDoWypowiedzi, poczekajNaKoniecMowy,
  };
}
