import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNoMatch,
    expectOk,
} from '../testing/assert';

/** Wczytywanie pliku .hydra i nanoszenie punktowych zmian. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument } from './document.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '__fixtures__/rover-01.hydra'), 'utf8');

test('wczytuje plik wzorcowy bez błędów składni', () => {
    const doc = HydraDocument.parse(roverSource);
    expectDeepEqual(doc.syntaxErrors, []);

    const model = doc.toJS() as any;
    expectEqual(model.hydra, '0.4');
    expectEqual(model.project.name, 'rover-01');
    expectEqual(model.targets.default, 'esp32s3-main');
    expectEqual(model.hardware.components.baro.part, 'BMP280 @ i2c0:0x76');
});

test('bez zmian zwraca plik bajt w bajt', () => {
    // Otwarcie pliku w Studiu i zamknięcie go bez ruchu nie może zostawiać
    // śladu w historii zmian.
    const doc = HydraDocument.parse(roverSource);
    expectEqual(doc.modified, false);
    expectEqual(doc.toString(), roverSource);
});

test('podmiana wartości zmienia wyłącznie tę wartość', () => {
    const doc = HydraDocument.parse(roverSource);
    expectEqual(doc.setScalar(['project', 'version'], '2.0.0'), true);

    const result = doc.toString();
    expectMatch(result, /^  version: 2\.0\.0$/m);

    // Reszta pliku — komentarze, wyrównanie, odstępy — bez zmian.
    const before = roverSource.split('\n');
    const after = result.split('\n');
    expectEqual(before.length, after.length, 'liczba wierszy ma się nie zmienić');
    const changed = before.map((line, i) => (line === after[i] ? null : i)).filter((i) => i !== null);
    expectEqual(changed.length, 1, `zmienił się więcej niż jeden wiersz: ${changed.join(', ')}`);
});

test('podmiana zachowuje cudzysłowy tam, gdzie były', () => {
    const doc = HydraDocument.parse(roverSource);
    // Bez cudzysłowów „0.5" przestałoby być tekstem i stałoby się liczbą.
    doc.setScalar(['hydra'], '0.5');
    expectMatch(doc.toString(), /^hydra: "0\.5" +# wersja schematu/m);
});

test('podmiana nie rusza wyrównania komentarza w tym samym wierszu', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['targets', 'esp32s3-main', 'memory', 'psram'], 'quad');
    // Komentarz „# off | quad | opi" stoi w ustalonej kolumnie i tam ma zostać.
    expectMatch(doc.toString(), /^ {6}psram: quad {14}# off \| quad \| opi$/m);
});

test('cytuje wartości, które bez cudzysłowów zmieniłyby znaczenie', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['modules', 'net', 'hostname'], 'off');
    // „off" bez cudzysłowów YAML czyta jako wartość logiczną.
    expectMatch(doc.toString(), /hostname: "off"/);
});

test('dopisuje klucz na końcu sekcji, z jej wcięciem', () => {
    const doc = HydraDocument.parse(roverSource);
    expectEqual(doc.insertKey(['project'], 'homepage', 'https://example.com'), true);

    const result = doc.toString();
    expectMatch(result, /^ {2}homepage: https:\/\/example\.com$/m);
    // Ma trafić do sekcji project, a nie na koniec pliku.
    expectOk(result.indexOf('homepage:') < result.indexOf('# ── Cele sprzętowe'));
});

test('usuwa pole razem z jego wierszem', () => {
    const doc = HydraDocument.parse(roverSource);
    expectEqual(doc.removeKey(['modules', 'ui', 'home']), true);

    const result = doc.toString();
    expectNoMatch(result, /home: StatusScreen/);
    expectEqual(result.split('\n').length, roverSource.split('\n').length - 1);
});

test('dopisuje komentarz nad polem', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setComment(['modules', 'motion', 'control', 'period_us'], 'zmierzone na stanowisku');
    expectMatch(doc.toString(), /^ {6}# zmierzone na stanowisku$\n {6}period_us:/m);
});

test('zmiany wychodzą jako lista przedziałów — tego oczekuje edytor', () => {
    const doc = HydraDocument.parse(roverSource);
    doc.setScalar(['project', 'version'], '2.0.0');
    doc.setScalar(['modules', 'net', 'hostname'], 'rover-02');

    const edits = doc.pendingEdits();
    expectEqual(edits.length, 2);
    // Uporządkowane rosnąco i nienachodzące na siebie.
    expectOk(edits[0]!.start < edits[1]!.start);
    expectOk(edits[0]!.end <= edits[1]!.start);
});

test('odmawia podmiany tam, gdzie nie ma wartości prostej', () => {
    const doc = HydraDocument.parse(roverSource);
    // `modules` to sekcja, nie wartość — próba podmiany musi się nie udać,
    // a nie po cichu nadpisać całą gałąź.
    expectEqual(doc.setScalar(['modules'], 'x'), false);
    expectEqual(doc.setScalar(['project', 'nieistniejace'], 'x'), false);
    expectEqual(doc.modified, false);
});

test('podaje pozycję pola w pliku', () => {
    const doc = HydraDocument.parse(roverSource);
    const position = doc.positionOf(['project', 'name']);
    expectOk(position);
    expectMatch(roverSource.split('\n')[position!.line - 1]!, /name: rover-01/);
});

test('zgłasza pozycję błędu składni zamiast rzucać wyjątkiem', () => {
    const doc = HydraDocument.parse('hydra: "0.4"\nproject:\n  name: [niedomknięta\n');
    expectOk(doc.syntaxErrors.length > 0);
    expectOk(doc.syntaxErrors[0]!.at.line >= 1);
});

test('cytuje tylko to, co bez cudzysłowów zmieniłoby znaczenie', () => {
    const doc = HydraDocument.parse('a: 1\nb: 2\nc: 3\nd: 4\ne: 5\nf: 6\n');

    const cases: [string, string, string][] = [
        // wartość            oczekiwany zapis         powód
        ['2.0.0',             '2.0.0',                 'dwie kropki — to nie liczba'],
        ['1.5',               '"1.5"',                 'liczba zmiennoprzecinkowa'],
        ['off',               '"off"',                 'wartość logiczna'],
        ['rover-01',          'rover-01',              'zwykły tekst z myślnikiem'],
        ['-start',            '"-start"',              'myślnik na początku rozpoczyna listę'],
        ['a: b',              '"a: b"',                'dwukropek ze spacją rozpoczyna parę'],
    ];

    cases.forEach(([value, expected, why], index) => {
        const d = HydraDocument.parse('a: 1\nb: 2\nc: 3\nd: 4\ne: 5\nf: 6\n');
        const key = ['a', 'b', 'c', 'd', 'e', 'f'][index]!;
        d.setScalar([key], value);
        expectMatch(d.toString(), new RegExp(`^${key}: ${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
                     `${value} → ${expected} (${why})`);
    });
    expectEqual(doc.modified, false);
});
