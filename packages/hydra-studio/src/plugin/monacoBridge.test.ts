import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
} from '../testing/assert';

/** Przeniesienie zmian z modelu Hydry do modelu Monaco. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument } from '../model';

import { applyToModel, toMonacoEdits, type EditableModel } from './monacoBridge.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '../model/__fixtures__/rover-01.hydra'), 'utf8');

/** Model tekstowy o zachowaniu Monaco — tyle, ile trzeba do sprawdzenia. */
function fakeModel(initial: string): EditableModel & { text: string; pushes: number } {
    return {
        text: initial,
        pushes: 0,
        getValue() { return this.text; },
        pushEditOperations(_selections, operations) {
            this.pushes++;
            // Monaco stosuje zmiany na raz; my odtwarzamy to od końca, żeby
            // wcześniejsze nie przesuwały kolejnych.
            const lines = this.text.split('\n');
            const offsets = [0];
            for (const line of lines) offsets.push(offsets[offsets.length - 1]! + line.length + 1);
            const toOffset = (l: number, c: number) => offsets[l - 1]! + c - 1;

            const ordered = [...operations].sort(
                (a, b) => toOffset(b.range.startLineNumber, b.range.startColumn) -
                          toOffset(a.range.startLineNumber, a.range.startColumn));
            for (const op of ordered) {
                const start = toOffset(op.range.startLineNumber, op.range.startColumn);
                const end = toOffset(op.range.endLineNumber, op.range.endColumn);
                this.text = this.text.slice(0, start) + op.text + this.text.slice(end);
            }
            return null;
        },
    };
}

test('przelicza przesunięcia na wiersze i kolumny liczone od jedynki', () => {
    const source = 'abc\ndefg\nhi';
    //              0123 45678 9..
    const edits = toMonacoEdits(source, [
        { start: 0, end: 3, text: 'X' },     // cały pierwszy wiersz
        { start: 5, end: 7, text: 'Y' },     // „ef" w drugim
        { start: 10, end: 11, text: 'Z' },   // „i" w trzecim
    ]);

    expectDeepEqual(edits[0]!.range,
                     { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 });
    expectDeepEqual(edits[1]!.range,
                     { startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 4 });
    expectDeepEqual(edits[2]!.range,
                     { startLineNumber: 3, startColumn: 2, endLineNumber: 3, endColumn: 3 });
});

test('zmiana z formularza trafia dokładnie w jeden wiersz pliku', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['project', 'version'], '2.0.0');

    const model = fakeModel(roverSource);
    expectEqual(applyToModel(model, roverSource, doc.pendingEdits()), true);

    const before = roverSource.split('\n');
    const after = model.text.split('\n');
    expectEqual(before.length, after.length);
    const changed = before.map((line, i) => (line === after[i] ? null : i)).filter((i) => i !== null);
    expectEqual(changed.length, 1);
    expectMatch(after[changed[0]!]!, /version: 2\.0\.0/);
});

test('kilka zmian naraz nie przesuwa się nawzajem', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['project', 'version'], '2.0.0');
    doc.setScalar(['modules', 'net', 'hostname'], 'rover-02');
    doc.setScalar(['modules', 'ui', 'home'], 'DriveScreen');

    const model = fakeModel(roverSource);
    expectEqual(applyToModel(model, roverSource, doc.pendingEdits()), true);

    expectMatch(model.text, /version: 2\.0\.0/);
    expectMatch(model.text, /hostname: rover-02/);
    expectMatch(model.text, /home: DriveScreen/);
    // Reszta pliku nietknięta — komentarze i wyrównanie na miejscu.
    expectMatch(model.text, /psram: opi {14}# off \| quad \| opi/);
});

test('odmawia zapisu, gdy treść modelu rozminęła się z policzoną', () => {
    // Ktoś mógł w tym czasie pisać w zakładce tekstowej. Przedziały
    // wskazywałyby wtedy nie to miejsce i zapis zniszczyłby plik.
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['project', 'version'], '2.0.0');

    const model = fakeModel(roverSource + '\n# ktoś dopisał\n');
    expectEqual(applyToModel(model, roverSource, doc.pendingEdits()), false);
    expectEqual(model.pushes, 0, 'nic nie mogło zostać zapisane');
});

test('brak zmian nie rusza modelu', () => {
    const model = fakeModel(roverSource);
    expectEqual(applyToModel(model, roverSource, []), true);
    expectEqual(model.pushes, 0);
    expectEqual(model.text, roverSource);
});

test('zmiany idą jednym wywołaniem — cofanie działa krok po kroku', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['project', 'version'], '2.0.0');
    doc.setScalar(['modules', 'net', 'hostname'], 'rover-02');

    const model = fakeModel(roverSource);
    applyToModel(model, roverSource, doc.pendingEdits());
    expectEqual(model.pushes, 1);
});
