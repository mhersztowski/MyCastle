import { describe, it, expect } from 'vitest';

import { formatWeek } from './clickup';

/**
 * Tydzień liczony względem bieżącego — „Tydzień 0" to ten, w którym jesteśmy.
 *
 * Wszystkie przypadki podają datę odniesienia jawnie. Test zależny od
 * prawdziwego „dzisiaj" przechodziłby przez większość roku i wywracał się
 * w losowy poniedziałek, co jest gorsze niż brak testu.
 */
describe('formatWeek', () => {
    // Środa, 12 sierpnia 2026. Tydzień zaczyna się w poniedziałek 10 sierpnia.
    const now = new Date(2026, 7, 12);

    it('bieżący tydzień to zero', () => {
        expect(formatWeek('2026-08-12', now)).toBe('Tydzień 0');
    });

    it('cały bieżący tydzień, od poniedziałku do niedzieli, to wciąż zero', () => {
        // Sedno: liczy się tydzień kalendarzowy, a nie „ile dni od dziś".
        expect(formatWeek('2026-08-10', now)).toBe('Tydzień 0');   // poniedziałek
        expect(formatWeek('2026-08-16', now)).toBe('Tydzień 0');   // niedziela
    });

    it('poniedziałek zaczyna nowy tydzień', () => {
        // Dzień po niedzieli z „Tydzień 0" — różnica jednego dnia, a zmiana
        // etykiety. To jest miejsce, w którym najłatwiej o pomyłkę.
        expect(formatWeek('2026-08-17', now)).toBe('Tydzień +1');
    });

    it('kolejne tygodnie dostają plus', () => {
        expect(formatWeek('2026-08-24', now)).toBe('Tydzień +2');
        expect(formatWeek('2026-09-07', now)).toBe('Tydzień +4');
    });

    it('przeszłość dostaje minus', () => {
        expect(formatWeek('2026-08-09', now)).toBe('Tydzień -1');   // niedziela przed
        expect(formatWeek('2026-08-03', now)).toBe('Tydzień -1');   // poniedziałek przed
        expect(formatWeek('2026-07-27', now)).toBe('Tydzień -2');
    });

    it('zmiana czasu nie przesuwa numeracji', () => {
        // W nocy 25 października 2026 cofamy zegary; doba ma wtedy 25 godzin,
        // więc dzielenie różnicy w milisekundach przez długość tygodnia daje
        // ułamek. Bez zaokrąglenia tydzień po zmianie czasu wychodziłby o jeden
        // za mały.
        const late = new Date(2026, 9, 21);                          // środa przed zmianą
        expect(formatWeek('2026-10-28', late)).toBe('Tydzień +1');   // środa po zmianie
        expect(formatWeek('2026-11-04', late)).toBe('Tydzień +2');
    });

    it('brak daty i śmieci dają pusty napis', () => {
        // Karta bez terminu nie ma czego pokazać — pusty napis znika w układzie,
        // a `undefined` wyświetliłby się dosłownie.
        expect(formatWeek(undefined, now)).toBe('');
        expect(formatWeek('', now)).toBe('');
        expect(formatWeek('nie-data', now)).toBe('');
    });

    it('przyjmuje pełny znacznik ISO, nie tylko samą datę', () => {
        // W modelu bywa jedno i drugie.
        expect(formatWeek('2026-08-17T14:30:00.000Z', now)).toBe('Tydzień +1');
    });
});
