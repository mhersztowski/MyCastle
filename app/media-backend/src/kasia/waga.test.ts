import { describe, it, expect } from 'vitest';
import { analizujWage, opisWagi, dodajPomiar, PLIK_WAGI } from './waga';
import type { Pomiar } from './waga';

const DZIEN = 24 * 3600_000;
/** Niedziela, 30 sierpnia 2026, 18:00 czasu warszawskiego. */
const T = Date.UTC(2026, 7, 30, 16, 0, 0);

const dzien = (ileTemu: number) => new Date(T - ileTemu * DZIEN).toISOString().slice(0, 10);
const pomiar = (ileTemu: number, kg: number): Pomiar => ({ data: dzien(ileTemu), kg });

describe('analizujWage', () => {
  it('bez pomiarów mówi, że nic nie wiadomo', () => {
    const a = analizujWage([], T);
    expect(a.ostatni).toBeNull();
    expect(a.trendTygodniowy).toBeNull();
  });

  it('podaje ostatni pomiar i ile dni temu', () => {
    const a = analizujWage([pomiar(3, 84.2)], T);
    expect(a.ostatni?.kg).toBe(84.2);
    expect(a.dniOdPomiaru).toBe(3);
  });

  it('pomiar z dzisiaj to zero dni temu, nigdy liczba ujemna', () => {
    // Pomiar zapisujemy datą dnia, a porównywaliśmy z dokładną godziną — rano
    // wychodziło „-1 dni temu", co w opisie wygląda na pomiar z przyszłości.
    const dzisiaj = new Date(T).toISOString().slice(0, 10);
    const rano = Date.UTC(2026, 7, 30, 5, 0, 0);
    const a = analizujWage([{ data: dzisiaj, kg: 84 }], rano);
    expect(a.dniOdPomiaru).toBe(0);
  });

  it('bierze najnowszy pomiar niezależnie od kolejności w pliku', () => {
    const a = analizujWage([pomiar(1, 83), pomiar(10, 90), pomiar(5, 85)], T);
    expect(a.ostatni?.kg).toBe(83);
  });

  /*
   * Trend liczony ze średnich tygodniowych, nie z różnicy dwóch pomiarów.
   * Waga waha się dziennie o kilogram z powodu wody i posiłków — różnica
   * „wczoraj minus dziś" mierzy głównie to, a nie tkankę.
   */
  it('liczy trend jako różnicę średnich z dwóch tygodni', () => {
    const pomiary = [
      // Poprzedni tydzień: średnia 86
      pomiar(13, 86), pomiar(11, 86), pomiar(9, 86),
      // Ostatni tydzień: średnia 85
      pomiar(6, 85), pomiar(4, 85), pomiar(2, 85),
    ];
    const a = analizujWage(pomiary, T);
    expect(a.trendTygodniowy).toBeCloseTo(-1, 5);
  });

  it('nie liczy trendu, gdy brakuje pomiarów w którymś tygodniu', () => {
    expect(analizujWage([pomiar(2, 85), pomiar(4, 85)], T).trendTygodniowy).toBeNull();
  });

  it('pojedynczy skok nie przewraca trendu opartego na średnich', () => {
    const stabilne = [
      pomiar(13, 86), pomiar(12, 86), pomiar(11, 86),
      pomiar(6, 86), pomiar(5, 86), pomiar(4, 89),   // jeden dzień po świętach
    ];
    const a = analizujWage(stabilne, T);
    expect(a.trendTygodniowy).toBeLessThan(1.5);
  });

  it('rozpoznaje, że dawno nie było pomiaru', () => {
    expect(analizujWage([pomiar(12, 85)], T).dawnoSieNieWazyl).toBe(true);
    expect(analizujWage([pomiar(2, 85)], T).dawnoSieNieWazyl).toBe(false);
  });

  it('liczy odległość od celu, gdy cel jest ustawiony', () => {
    const a = analizujWage([pomiar(1, 85)], T, 80);
    expect(a.doCelu).toBeCloseTo(5, 5);
  });

  it('bez celu nie zmyśla odległości', () => {
    expect(analizujWage([pomiar(1, 85)], T).doCelu).toBeNull();
  });
});

describe('dodajPomiar', () => {
  it('dopisuje pomiar', () => {
    const p = dodajPomiar([], { data: '2026-08-30', kg: 85 });
    expect(p).toHaveLength(1);
  });

  it('pomiar z tego samego dnia nadpisuje, zamiast się dublować', () => {
    // Ważenie dwa razy rano to poprawka, nie dwa niezależne pomiary.
    const p = dodajPomiar([{ data: '2026-08-30', kg: 85 }], { data: '2026-08-30', kg: 84.6 });
    expect(p).toHaveLength(1);
    expect(p[0].kg).toBe(84.6);
  });

  it('trzyma listę uporządkowaną po dacie', () => {
    const p = dodajPomiar([{ data: '2026-08-30', kg: 85 }], { data: '2026-08-28', kg: 86 });
    expect(p.map((x) => x.data)).toEqual(['2026-08-28', '2026-08-30']);
  });

  it('odrzuca wartości niemożliwe', () => {
    expect(() => dodajPomiar([], { data: '2026-08-30', kg: 0 })).toThrow(/waga/i);
    expect(() => dodajPomiar([], { data: '2026-08-30', kg: 600 })).toThrow(/waga/i);
  });

  it('odrzuca datę w złym zapisie', () => {
    expect(() => dodajPomiar([], { data: '30.08.2026', kg: 85 })).toThrow(/dat/i);
  });
});

describe('opisWagi', () => {
  it('mówi wprost, gdy nie ma żadnego pomiaru', () => {
    expect(opisWagi(analizujWage([], T))).toMatch(/nie ma|brak|żadn/i);
  });

  it('podaje ostatnią wagę', () => {
    expect(opisWagi(analizujWage([pomiar(1, 84.5)], T))).toContain('84,5');
  });

  it('nazywa kierunek zmiany słowem, nie samą liczbą', () => {
    const spadek = [
      pomiar(13, 86), pomiar(11, 86), pomiar(9, 86),
      pomiar(6, 85), pomiar(4, 85), pomiar(2, 85),
    ];
    expect(opisWagi(analizujWage(spadek, T))).toMatch(/spad|mniej|w dół/i);
  });

  it('sygnalizuje brak świeżego pomiaru — to powód niedzielnego przypomnienia', () => {
    expect(opisWagi(analizujWage([pomiar(20, 85)], T))).toMatch(/dawno|20 dni/i);
  });

  it('nie interpretuje trendu, którego nie da się policzyć', () => {
    const opis = opisWagi(analizujWage([pomiar(1, 85)], T));
    expect(opis).not.toMatch(/spad|wzrost|przybył/i);
  });
});

describe('PLIK_WAGI', () => {
  it('leży w katalogu danych użytkownika MyCastle', () => {
    expect(PLIK_WAGI).toBe('data/waga.json');
  });
});
