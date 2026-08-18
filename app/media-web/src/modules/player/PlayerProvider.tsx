/**
 * Odtwarzacz jako jeden element `<audio>` żyjący poza drzewem stron.
 *
 * Element jest tworzony imperatywnie i nigdy nie przemontowywany. Gdyby był
 * zwykłym `<audio>` w JSX-ie, każde przejście między stronami odmontowywałoby go
 * razem z odtwarzanym dźwiękiem — a panel sterujący ma być widoczny i grający
 * niezależnie od tego, gdzie użytkownik akurat jest.
 *
 * Czas odtwarzania trzymamy w stanie Reacta, bo to on jest **treścią notatki**:
 * notatka bez miejsca w nagraniu byłaby zwykłym zapiskiem, a nie zakładką.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { api, mediaSrc, type QueueItem } from '../../services/api';

interface PlayerState {
  current?: QueueItem;
  playing: boolean;
  /** Bieżące miejsce w nagraniu, w sekundach. */
  position: number;
  /** Długość nagrania znana odtwarzaczowi; bywa dokładniejsza niż ta z kanału. */
  duration: number;
  /** Ostatni błąd odtwarzania — pokazywany zamiast milczącego zatrzymania. */
  error?: string;
}

interface PlayerApi extends PlayerState {
  play: (item: QueueItem) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  /** Przesuwa o zadaną liczbę sekund; ujemna cofa. */
  nudge: (deltaSeconds: number) => void;
  setRate: (rate: number) => void;
  rate: number;
}

const PlayerContext = createContext<PlayerApi | undefined>(undefined);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer poza PlayerProvider');
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>();
  const [state, setState] = useState<PlayerState>({ playing: false, position: 0, duration: 0 });
  const [rate, setRateState] = useState(1);

  // Identyfikator bieżącej pozycji w ref, żeby zapis miejsca w `timeupdate`
  // nie wymagał przepinania nasłuchu przy każdej zmianie odcinka.
  const currentIdRef = useRef<string>();
  const lastSavedRef = useRef(0);

  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio();
    audioRef.current.preload = 'metadata';
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      setState((s) => ({ ...s, position: audio.currentTime }));

      /*
       * Miejsce odsyłamy na serwer co dziesięć sekund, a nie przy każdym
       * zdarzeniu: `timeupdate` odpala się cztery razy na sekundę, co dałoby
       * kilkanaście tysięcy zapisów na godzinę słuchania.
       */
      const id = currentIdRef.current;
      if (id && audio.currentTime - lastSavedRef.current >= 10) {
        lastSavedRef.current = audio.currentTime;
        void api.savePosition(id, audio.currentTime).catch(() => {});
      }
    };
    const onMeta = () => setState((s) => ({ ...s, duration: audio.duration || 0 }));
    const onPlay = () => setState((s) => ({ ...s, playing: true, error: undefined }));
    const onPause = () => setState((s) => ({ ...s, playing: false }));
    const onError = () => setState((s) => ({
      ...s,
      playing: false,
      error: 'Nie udało się odtworzyć pliku — kanał może być niedostępny.',
    }));
    const onEnded = () => {
      const id = currentIdRef.current;
      // Odsłuchany odcinek wraca na początek, żeby ponowne odtworzenie nie
      // zaczynało się od ostatniej sekundy.
      if (id) void api.savePosition(id, 0).catch(() => {});
      setState((s) => ({ ...s, playing: false }));
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const play = useCallback((item: QueueItem) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentIdRef.current === item.id) {
      void audio.play().catch(() => {});
      return;
    }

    // Zapisujemy miejsce w poprzednim odcinku, zanim je stracimy.
    if (currentIdRef.current) {
      void api.savePosition(currentIdRef.current, audio.currentTime).catch(() => {});
    }

    currentIdRef.current = item.id;
    lastSavedRef.current = item.positionSec;
    audio.src = mediaSrc(item.mediaUrl);
    audio.playbackRate = rate;
    audio.currentTime = 0;

    // Wznowienie w zapamiętanym miejscu jest możliwe dopiero, gdy przeglądarka
    // zna długość — wcześniej przypisanie `currentTime` jest ignorowane.
    const resume = () => {
      if (item.positionSec > 0 && item.positionSec < audio.duration) {
        audio.currentTime = item.positionSec;
      }
      audio.removeEventListener('loadedmetadata', resume);
    };
    audio.addEventListener('loadedmetadata', resume);

    setState({ current: item, playing: false, position: item.positionSec, duration: item.durationSec, error: undefined });
    void audio.play().catch(() => {});
  }, [rate]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentIdRef.current) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, seconds);
    setState((s) => ({ ...s, position: audio.currentTime }));
  }, []);

  const nudge = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seek(audio.currentTime + delta);
  }, [seek]);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
  }, []);

  const value = useMemo<PlayerApi>(
    () => ({ ...state, rate, play, toggle, seek, nudge, setRate }),
    [state, rate, play, toggle, seek, nudge, setRate],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
