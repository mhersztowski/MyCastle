import { describe, it, expect } from 'vitest';
import {
  czyMoznaZaczepic, ustawDostepnosc, powodMilczenia, opisDostepnosci,
} from './dostepnosc';
import type { Dostepnosc } from './model';

const T = Date.UTC(2026, 7, 27, 10, 0, 0);
const MIN = 60_000;

describe('czyMoznaZaczepic', () => {
  it('pozwala, gdy użytkownik jest dostępny', () => {
    expect(czyMoznaZaczepic({ tryb: 'dostepny', od: T }, T)).toBe(true);
  });

  it('nie pozwala w trybie „nie przeszkadzać"', () => {
    expect(czyMoznaZaczepic({ tryb: 'nie-przeszkadzac', od: T }, T)).toBe(false);
  });

  it('nie pozwala podczas snu', () => {
    expect(czyMoznaZaczepic({ tryb: 'spie', od: T }, T)).toBe(false);
  });

  it('pozwala po upływie terminu, na jaki tryb był ustawiony', () => {
    const d: Dostepnosc = { tryb: 'nie-przeszkadzac', od: T, do: T + 30 * MIN };
    expect(czyMoznaZaczepic(d, T + 29 * MIN)).toBe(false);
    expect(czyMoznaZaczepic(d, T + 31 * MIN)).toBe(true);
  });

  it('termin w przeszłości znaczy, że tryb już nie obowiązuje', () => {
    expect(czyMoznaZaczepic({ tryb: 'spie', od: T - MIN, do: T - 1 }, T)).toBe(true);
  });
});

describe('ustawDostepnosc', () => {
  it('zapisuje moment ustawienia', () => {
    const d = ustawDostepnosc('spie', T);
    expect(d).toEqual({ tryb: 'spie', od: T });
  });

  it('przyjmuje czas trwania w minutach i przelicza go na termin', () => {
    expect(ustawDostepnosc('nie-przeszkadzac', T, 45).do).toBe(T + 45 * MIN);
  });

  it('powrót do dostępności czyści termin', () => {
    expect(ustawDostepnosc('dostepny', T, 45).do).toBeUndefined();
  });

  it('zerowy albo ujemny czas trwania traktuje jak brak terminu', () => {
    expect(ustawDostepnosc('spie', T, 0).do).toBeUndefined();
    expect(ustawDostepnosc('spie', T, -5).do).toBeUndefined();
  });
});

describe('powodMilczenia', () => {
  it('nie podaje powodu, gdy nic nie blokuje', () => {
    expect(powodMilczenia({ tryb: 'dostepny', od: T }, T)).toBeNull();
  });

  it('nazywa powód po polsku i mówi, do kiedy', () => {
    const d: Dostepnosc = { tryb: 'spie', od: T, do: T + 8 * 60 * MIN };
    const powod = powodMilczenia(d, T);
    expect(powod).toContain('śpi');
    expect(powod).toMatch(/\d{2}:\d{2}/);   // godzina powrotu
  });

  it('bez terminu mówi „do odwołania", zamiast zmyślać godzinę', () => {
    expect(powodMilczenia({ tryb: 'nie-przeszkadzac', od: T }, T)).toContain('odwołania');
  });
});

describe('opisDostepnosci', () => {
  it('opisuje stan zdaniem, które da się wstawić do promptu', () => {
    expect(opisDostepnosci({ tryb: 'dostepny', od: T }, T)).toMatch(/dostępny/i);
    expect(opisDostepnosci({ tryb: 'spie', od: T }, T)).toMatch(/śpi/i);
  });
});
