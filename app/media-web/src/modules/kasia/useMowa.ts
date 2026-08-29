/**
 * useMowa — mikrofon i głos Kasi w jednym haku.
 *
 * Spina `speechService` (kopia modułu z Aury) ze stroną Kasi. Powstał, bo
 * dyktowanie i czytanie odpowiedzi to dwie strony tej samej rzeczy — rozmowy
 * głosowej — i muszą wiedzieć o sobie nawzajem: mikrofon nie może nagrywać
 * wtedy, gdy Kasia mówi, bo nagrałby jej własny głos i odesłał go jako
 * wypowiedź użytkownika.
 *
 * ## Czego tu świadomie nie ma
 *
 * Słowa aktywującego („Kasiu…") i ciągłego nasłuchu. W Aurze mają sens, bo to
 * asystent stojący na biurku i czekający na zawołanie. Kasia jest stroną, którą
 * się otwiera; ciągły nasłuch w karcie przeglądarki oznacza mikrofon włączony
 * tak długo, jak długo karta jest otwarta — także wtedy, gdy leży w tle.
 * `wakeWordService` jest w module i można go dołożyć, gdy okaże się potrzebny.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { speechService, AudioRecorder, DEFAULT_SPEECH_CONFIG } from '../speech';
import type { SpeechConfigModel } from '../speech';

export interface StanMowy {
  /** Czy konfiguracja została wczytana — do tego czasu przyciski są nieaktywne. */
  gotowa: boolean;
  nagrywa: boolean;
  mowi: boolean;
  /** Czy odpowiedzi mają być czytane na głos. */
  czytaj: boolean;
  blad: string | null;
}

export interface Mowa extends StanMowy {
  /** Zaczyna nagrywanie; zwraca rozpoznany tekst albo pusty ciąg. */
  nagrywaj(): Promise<string>;
  zakonczNagrywanie(): Promise<string>;
  przelaczCzytanie(): void;
  powiedz(tekst: string): Promise<void>;
  przerwij(): void;
  konfiguracja: SpeechConfigModel;
}

export function useMowa(): Mowa {
  const [konfiguracja, setKonfiguracja] = useState<SpeechConfigModel>({ ...DEFAULT_SPEECH_CONFIG });
  const [stan, setStan] = useState<StanMowy>({
    gotowa: false, nagrywa: false, mowi: false, czytaj: false, blad: null,
  });

  const recorder = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let anulowane = false;
    void speechService.loadConfig().then((cfg) => {
      if (anulowane) return;
      setKonfiguracja(cfg);
      setStan((s) => ({ ...s, gotowa: true }));
    });
    return () => { anulowane = true; };
  }, []);

  const przerwij = useCallback(() => {
    speechService.stopSpeaking();
    setStan((s) => ({ ...s, mowi: false }));
  }, []);

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
    setStan((s) => ({ ...s, mowi: true, blad: null }));
    try {
      await speechService.speak({ text: tekst });
    } catch (err) {
      setStan((s) => ({ ...s, blad: (err as Error).message }));
    } finally {
      setStan((s) => ({ ...s, mowi: false }));
    }
  }, []);

  const nagrywaj = useCallback(async (): Promise<string> => {
    // Mikrofon nie może słuchać, gdy Kasia mówi — nagrałby jej własny głos.
    speechService.stopSpeaking();

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
    }
  }, []);

  const przelaczCzytanie = useCallback(() => {
    setStan((s) => {
      if (s.czytaj) speechService.stopSpeaking();
      return { ...s, czytaj: !s.czytaj };
    });
  }, []);

  return {
    ...stan, konfiguracja,
    nagrywaj, zakonczNagrywanie, przelaczCzytanie, powiedz, przerwij,
  };
}
