/**
 * Przeniesienie zmian z modelu Hydry do modelu Monaco.
 *
 * `HydraDocument` produkuje przedziały liczone w znakach od początku pliku,
 * a Monaco operuje na wierszach i kolumnach liczonych od jedynki. To
 * przeliczenie jest jedynym miejscem styku obu światów — i jedynym, w którym
 * łatwo o pomyłkę o jeden, więc siedzi osobno i ma własne testy.
 *
 * Zmiany wchodzą przez `pushEditOperations`, a nie przez podmianę całej
 * treści: dzięki temu cofanie działa krok po kroku, kursor zostaje na swoim
 * miejscu, a plik nie zmienia się nigdzie poza edytowanym polem.
 */

import type { TextEdit } from '../model';

/** Zakres w postaci, jakiej oczekuje Monaco — wiersze i kolumny od 1. */
export interface MonacoRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
}

export interface MonacoEdit {
    range: MonacoRange;
    text: string;
}

/**
 * Model tekstowy Monaco — tyle, ile naprawdę potrzebujemy.
 *
 * Lista zmian jest zwykłą tablicą, nie `readonly`: prawdziwe `ITextModel`
 * przyjmuje tablicę modyfikowalną, a parametr `readonly` sprawiał, że metoda
 * Monaco nie pasowała do tego kontraktu. Wyszło to dopiero przy podłączeniu
 * do edytora — atrapa w testach spełniała jedno i drugie.
 */
export interface EditableModel {
    getValue(): string;
    pushEditOperations(
        selections: null,
        operations: { range: MonacoRange; text: string }[],
        cursorComputer: () => null,
    ): unknown;
}

export function toMonacoEdits(source: string, edits: readonly TextEdit[]): MonacoEdit[] {
    const index = new LineIndex(source);
    return edits.map((edit) => ({
        range: {
            ...prefixed(index.positionAt(edit.start), 'start'),
            ...prefixed(index.positionAt(edit.end), 'end'),
        } as MonacoRange,
        text: edit.text,
    }));
}

/**
 * Nanosi zmiany na model. Zwraca `false`, gdy treść modelu rozminęła się
 * z tą, na której zmiany policzono — wtedy przedziały wskazywałyby nie to
 * miejsce i zapis zniszczyłby plik. Lepiej odmówić i przeliczyć od nowa.
 */
export function applyToModel(model: EditableModel, source: string,
                             edits: readonly TextEdit[]): boolean {
    if (edits.length === 0) return true;
    if (model.getValue() !== source) return false;

    model.pushEditOperations(null, toMonacoEdits(source, edits), () => null);
    return true;
}

function prefixed(position: { line: number; column: number }, prefix: 'start' | 'end') {
    return prefix === 'start'
        ? { startLineNumber: position.line, startColumn: position.column }
        : { endLineNumber: position.line, endColumn: position.column };
}

/**
 * Położenia początków wierszy, policzone raz.
 *
 * Przeliczanie przesunięcia na wiersz przez przejście całego tekstu byłoby
 * kwadratowe przy wielu zmianach naraz — przy pliku projektu to bez znaczenia,
 * ale ten sam kod obsłuży kiedyś podświetlanie wszystkich zgłoszeń walidatora.
 */
class LineIndex {
    private readonly starts: number[] = [0];

    constructor(private readonly source: string) {
        for (let i = 0; i < source.length; i++) {
            if (source[i] === '\n') this.starts.push(i + 1);
        }
    }

    positionAt(offset: number): { line: number; column: number } {
        const clamped = Math.max(0, Math.min(offset, this.source.length));

        let low = 0;
        let high = this.starts.length - 1;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (this.starts[mid]! <= clamped) low = mid;
            else high = mid - 1;
        }
        return { line: low + 1, column: clamped - this.starts[low]! + 1 };
    }
}
