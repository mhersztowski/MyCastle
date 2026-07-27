import { describe, expect, it } from 'vitest';
import { evalExpr, exprDeps, isValidExpr } from '../expr';

describe('język wyrażeń', () => {
  it('liczy arytmetykę z priorytetami i nawiasami', () => {
    expect(evalExpr('1 + 2 * 3')).toBe(7);
    expect(evalExpr('(1 + 2) * 3')).toBe(9);
    expect(evalExpr('2 ^ 3 ^ 2')).toBe(512);  // prawostronnie łączne
    expect(evalExpr('-3 + 1')).toBe(-2);
  });

  it('czyta zmienne z zasięgu i stałe', () => {
    expect(evalExpr('a * 2', { a: 21 })).toBe(42);
    expect(evalExpr('round(pi, 3)')).toBe(3.142);
  });

  it('obsługuje funkcje z zamkniętej listy', () => {
    expect(evalExpr('clamp(15, 0, 10)')).toBe(10);
    expect(evalExpr('max(1, 7, 3)')).toBe(7);
    expect(evalExpr('deg(rad(90))')).toBeCloseTo(90, 9);
  });

  it('obsługuje porównania i operator warunkowy', () => {
    expect(evalExpr('a > 3 ? 10 : 20', { a: 5 })).toBe(10);
    expect(evalExpr('a > 3 ? 10 : 20', { a: 1 })).toBe(20);
  });

  it('wylicza zależności do grafu reaktywnego', () => {
    expect(exprDeps('azimuth + offset * 2')).toEqual(['azimuth', 'offset']);
    expect(exprDeps('sin(rad(azimuth)) + pi')).toEqual(['azimuth']);
  });

  it('nie wykonuje JavaScriptu', () => {
    // Brak dostępu do globali, konstruktorów i właściwości obiektów.
    expect(isValidExpr('process.exit(1)')).toBe(true);           // parsuje się jako zmienna
    expect(() => evalExpr('process.exit(1)')).toThrow();          // ale nie ma czego wywołać
    expect(isValidExpr('(() => 1)()')).toBe(false);
    expect(() => evalExpr('globalThis')).toThrow();
  });

  it('odrzuca wyrażenia niepoprawne składniowo', () => {
    expect(isValidExpr('1 +')).toBe(false);
    expect(isValidExpr('a $ b')).toBe(false);
    expect(isValidExpr('sin(1')).toBe(false);
    expect(exprDeps('1 +')).toEqual([]);
  });
});
