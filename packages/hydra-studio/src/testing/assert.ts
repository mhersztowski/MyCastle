/**
 * Asercje w stylu, w jakim powstały testy Studia.
 *
 * Testy pisane były pod wbudowany moduł testowy Node, a repozytorium używa
 * vitest. Zamiast przepisywać kilkaset asercji — co zmieniłoby ich treść
 * i utrudniło porównanie z poprzednią wersją — tłumaczymy je w jednym miejscu.
 * Komunikaty niepowodzeń pozostają czytelne, bo `expect` i tak pokazuje
 * różnicę wartości.
 */

import { expect } from 'vitest';

export function expectEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).toBe(expected);
}

export function expectNotEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).not.toBe(expected);
}

export function expectDeepEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).toEqual(expected);
}

export function expectNotDeepEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).not.toEqual(expected);
}

export function expectOk(value: unknown, message?: string): void {
    expect(value, message).toBeTruthy();
}

export function expectMatch(value: string, pattern: RegExp, message?: string): void {
    expect(value, message).toMatch(pattern);
}

export function expectNoMatch(value: string, pattern: RegExp, message?: string): void {
    expect(value, message).not.toMatch(pattern);
}

export function expectThrows(fn: () => unknown, pattern?: RegExp): void {
    expect(fn).toThrow(pattern);
}
