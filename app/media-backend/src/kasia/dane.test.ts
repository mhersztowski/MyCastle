import { describe, it, expect } from 'vitest';
import {
  wybierzZadania, opisDanych, zakresDni, sciezkiKalendarza, scalWydarzenia,
} from './dane';
import type { Projekt, Zadanie, Wydarzenie } from './dane';

/** Czwartek, 27 sierpnia 2026, 08:00 czasu warszawskiego. */
const T = Date.UTC(2026, 7, 27, 6, 0, 0);
const DZIEN = 24 * 3600_000;
const STREFA = 'Europe/Warsaw';

const projekt = (id: string, name: string): Projekt => ({ id, name, description: '' });

const zadanie = (nad: Partial<Zadanie> = {}): Zadanie => ({
  id: 'z1', projectId: 'p1', name: 'Zadanie', description: '',
  duration: 1, dueDate: undefined, ...nad,
});

const iso = (znacznik: number) => new Date(znacznik).toISOString();

describe('wybierzZadania', () => {
  it('bierze zadania z terminem dzisiaj', () => {
    const z = [zadanie({ id: 'a', dueDate: iso(T) })];
    expect(wybierzZadania(z, T, STREFA).naDzis.map((x) => x.id)).toEqual(['a']);
  });

  it('bierze zadania zaległe — termin minął, a zadanie żyje', () => {
    const z = [zadanie({ id: 'stare', dueDate: iso(T - 3 * DZIEN) })];
    expect(wybierzZadania(z, T, STREFA).zalegle.map((x) => x.id)).toEqual(['stare']);
  });

  it('nie liczy jako zaległe zadania ukończonego', () => {
    const z = [zadanie({ id: 'zrobione', dueDate: iso(T - DZIEN), done: true })];
    const w = wybierzZadania(z, T, STREFA);
    expect(w.zalegle).toHaveLength(0);
  });

  it('bierze zadania na najbliższe dni, ale nie dalsze', () => {
    const z = [
      zadanie({ id: 'jutro', dueDate: iso(T + DZIEN) }),
      zadanie({ id: 'zaMiesiac', dueDate: iso(T + 30 * DZIEN) }),
    ];
    const w = wybierzZadania(z, T, STREFA);
    expect(w.wkrotce.map((x) => x.id)).toEqual(['jutro']);
  });

  it('zadania bez terminu trafiają osobno — nie giną, ale nie udają pilnych', () => {
    const z = [zadanie({ id: 'kiedys', dueDate: undefined })];
    const w = wybierzZadania(z, T, STREFA);
    expect(w.bezTerminu.map((x) => x.id)).toEqual(['kiedys']);
    expect(w.naDzis).toHaveLength(0);
    expect(w.zalegle).toHaveLength(0);
  });

  it('to samo zadanie nie trafia do dwóch grup', () => {
    const z = [
      zadanie({ id: 'a', dueDate: iso(T) }),
      zadanie({ id: 'b', dueDate: iso(T - DZIEN) }),
      zadanie({ id: 'c', dueDate: iso(T + DZIEN) }),
      zadanie({ id: 'd' }),
    ];
    const w = wybierzZadania(z, T, STREFA);
    const wszystkie = [...w.naDzis, ...w.zalegle, ...w.wkrotce, ...w.bezTerminu].map((x) => x.id);
    expect(new Set(wszystkie).size).toBe(wszystkie.length);
    expect(wszystkie.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('„dzisiaj" liczy się według strefy użytkownika, nie UTC', () => {
    // 23:30 czasu warszawskiego 27 sierpnia = 21:30 UTC tego samego dnia.
    const wieczorem = Date.UTC(2026, 7, 27, 21, 30, 0);
    const z = [zadanie({ id: 'dzis', dueDate: iso(wieczorem) })];
    expect(wybierzZadania(z, wieczorem, STREFA).naDzis.map((x) => x.id)).toEqual(['dzis']);
  });
});

describe('zakresDni', () => {
  it('zwraca dzisiejszy dzień dla zakresu zerowego', () => {
    expect(zakresDni(T, 0, 0, STREFA)).toEqual(['2026-08-27']);
  });

  it('obejmuje dni wstecz i naprzód', () => {
    expect(zakresDni(T, 1, 1, STREFA)).toEqual(['2026-08-26', '2026-08-27', '2026-08-28']);
  });

  it('przechodzi przez granicę miesiąca', () => {
    const koniecMiesiaca = Date.UTC(2026, 7, 31, 10, 0, 0);
    expect(zakresDni(koniecMiesiaca, 0, 1, STREFA)).toEqual(['2026-08-31', '2026-09-01']);
  });
});

describe('sciezkiKalendarza', () => {
  it('składa ścieżkę w układzie rok/miesiąc/dzień', () => {
    expect(sciezkiKalendarza(['2026-08-27'])).toEqual(['data/calendar/2026/08/27.json']);
  });

  it('dopełnia zerami — inaczej plik nie zostanie znaleziony', () => {
    expect(sciezkiKalendarza(['2026-01-05'])).toEqual(['data/calendar/2026/01/05.json']);
  });
});

describe('scalWydarzenia', () => {
  it('łączy dni w jedną listę', () => {
    const a: Wydarzenie[] = [{ taskId: '1', name: 'A', startTime: iso(T), endTime: iso(T) }];
    const b: Wydarzenie[] = [{ taskId: '2', name: 'B', startTime: iso(T + DZIEN), endTime: iso(T + DZIEN) }];
    expect(scalWydarzenia([a, b])).toHaveLength(2);
  });

  it('porządkuje chronologicznie, niezależnie od kolejności plików', () => {
    const pozniej: Wydarzenie[] = [{ taskId: '2', name: 'B', startTime: iso(T + DZIEN), endTime: iso(T + DZIEN) }];
    const wczesniej: Wydarzenie[] = [{ taskId: '1', name: 'A', startTime: iso(T), endTime: iso(T) }];
    expect(scalWydarzenia([pozniej, wczesniej]).map((w) => w.name)).toEqual(['A', 'B']);
  });

  it('pomija dni puste', () => {
    expect(scalWydarzenia([[], []])).toEqual([]);
  });
});

describe('opisDanych', () => {
  const projekty = [projekt('p1', 'Dom'), projekt('p2', 'Praca')];
  const zadania = [
    zadanie({ id: 'a', projectId: 'p1', name: 'Umyć okna', dueDate: iso(T) }),
    zadanie({ id: 'b', projectId: 'p2', name: 'Raport', dueDate: iso(T - 2 * DZIEN) }),
    zadanie({ id: 'c', projectId: 'p1', name: 'Kiedyś' }),
  ];
  const wydarzenia: Wydarzenie[] = [
    { taskId: 'e1', name: 'Dentysta', startTime: iso(T + 3600_000), endTime: iso(T + 2 * 3600_000) },
  ];

  it('wymienia zadania na dziś', () => {
    const opis = opisDanych({ projekty, zadania, wydarzenia, teraz: T, strefa: STREFA });
    expect(opis).toContain('Umyć okna');
  });

  it('oznacza zaległe jako zaległe, a nie jako dzisiejsze', () => {
    const opis = opisDanych({ projekty, zadania, wydarzenia, teraz: T, strefa: STREFA });
    const iZalegle = opis.toLowerCase().indexOf('zaleg');
    expect(iZalegle).toBeGreaterThan(-1);
    expect(opis.slice(iZalegle)).toContain('Raport');
  });

  it('podaje nazwę projektu, nie jego identyfikator', () => {
    const opis = opisDanych({ projekty, zadania, wydarzenia, teraz: T, strefa: STREFA });
    expect(opis).toContain('Dom');
    expect(opis).not.toContain('p1');
  });

  it('wymienia wydarzenia z godziną', () => {
    const opis = opisDanych({ projekty, zadania, wydarzenia, teraz: T, strefa: STREFA });
    expect(opis).toContain('Dentysta');
    expect(opis).toMatch(/\d{2}:\d{2}/);
  });

  it('mówi wprost, gdy dzień jest pusty — Kasia ma to zauważyć wieczorem', () => {
    const opis = opisDanych({ projekty, zadania: [], wydarzenia: [], teraz: T, strefa: STREFA });
    expect(opis).toMatch(/nie ma|brak|pust/i);
  });

  it('nie wypisuje wszystkich zadań bez terminu, tylko ich liczbę', () => {
    // Inaczej lista „kiedyś" zdominowałaby prompt i wyparła to, co pilne.
    const duzo = Array.from({ length: 40 }, (_, i) => zadanie({ id: `x${i}`, name: `Zadanie ${i}` }));
    const opis = opisDanych({ projekty, zadania: duzo, wydarzenia: [], teraz: T, strefa: STREFA });
    expect(opis).not.toContain('Zadanie 39');
    expect(opis).toMatch(/40/);
  });

  it('przy błędzie pobierania NIE twierdzi, że dzień jest pusty', () => {
    // Brak danych i niedostępność danych to dwie różne rzeczy. Model, który
    // usłyszy „nie ma nic na dziś", zacznie doradzać dopisanie wydarzeń —
    // podczas gdy kalendarz może być pełny, tylko nieosiągalny.
    const opis = opisDanych({
      projekty: [], zadania: [], wydarzenia: [], teraz: T, strefa: STREFA,
      bledy: ['zadania: brak połączenia'],
    });
    expect(opis).not.toMatch(/nie ma ani jednego/i);
    expect(opis).toMatch(/niedostępn|nie wiadomo|nie udało/i);
  });

  it('bez błędów wypowiada pustkę wprost — od tego zależy wieczorne spotkanie', () => {
    const opis = opisDanych({
      projekty: [], zadania: [], wydarzenia: [], teraz: T, strefa: STREFA, bledy: [],
    });
    expect(opis).toMatch(/nie ma ani jednego/i);
  });

  it('mieści się w rozsądnej długości nawet przy dużej liczbie danych', () => {
    const duzo = Array.from({ length: 200 }, (_, i) =>
      zadanie({ id: `x${i}`, name: `Zadanie ${i}`, dueDate: iso(T) }));
    const opis = opisDanych({ projekty, zadania: duzo, wydarzenia: [], teraz: T, strefa: STREFA });
    expect(opis.length).toBeLessThan(4000);
  });
});
