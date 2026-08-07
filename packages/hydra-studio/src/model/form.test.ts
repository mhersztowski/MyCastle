import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Formularz wyprowadzany ze schematu. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument, validate } from '../model';

import { entriesOf, formFor } from './form';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '__fixtures__/rover-01.hydra'), 'utf8');
const doc = HydraDocument.parse(roverSource);
const model = doc.toJS();

test('pola projektu mają opisy i oznaczenie wymagalności', () => {
    const form = formFor(model, ['project'])!;
    expectOk(form);

    const name = form.fields.find((f) => f.key === 'name')!;
    expectEqual(name.kind, 'text');
    expectEqual(name.required, true);
    expectEqual(name.value, 'rover-01');
    expectEqual(name.present, true);
    expectOk(name.doc.length > 0, 'opis ze schematu trafia do dymka');

    const license = form.fields.find((f) => f.key === 'license')!;
    expectEqual(license.required, false);
});

test('pole wyliczeniowe niesie listę dozwolonych wartości', () => {
    const form = formFor(model, ['modules', 'ui'])!;
    const backend = form.fields.find((f) => f.key === 'backend')!;
    expectEqual(backend.kind, 'choice');
    expectDeepEqual([...backend.choices!], ['hydra', 'lvgl9']);
    expectEqual(backend.value, 'lvgl9');
});

test('pole liczbowe niesie zakres i jednostkę', () => {
    const form = formFor(model, ['modules', 'motion', 'control'])!;
    const period = form.fields.find((f) => f.key === 'period_us')!;
    expectEqual(period.kind, 'number');
    expectEqual(period.unit, 'µs');
    expectEqual(period.min, 100);
    expectEqual(period.integer, true);
    expectEqual(period.value, 2000);
});

test('zagnieżdżony zbiór pól staje się podsekcją, nie polem', () => {
    // Inaczej inspektor pokazałby „obiekt" bez możliwości zajrzenia do środka.
    const form = formFor(model, ['modules', 'motion'])!;
    expectOk(!form.fields.some((f) => f.key === 'safety'));
    const safety = form.sections.find((s) => s.title === 'safety')!;
    expectOk(safety);
    expectOk(safety.fields.some((f) => f.key === 'cmd_watchdog_ms'));
});

test('pola nieobecne w pliku są widoczne jako puste', () => {
    // Inspektor ma pokazywać, co jeszcze da się ustawić, a nie tylko to,
    // co ktoś już wpisał.
    const form = formFor(model, ['project'])!;
    const homepage = form.fields.find((f) => f.key === 'description')!;
    expectEqual(homepage.present, true);

    const minimal = HydraDocument.parse('hydra: "0.4"\nproject:\n  name: p\n  version: 1.0.0\n').toJS();
    const empty = formFor(minimal, ['project'])!;
    const license = empty.fields.find((f) => f.key === 'license')!;
    expectEqual(license.present, false);
    expectEqual(license.value, undefined);
});

test('wpisy odwzorowania trafiają do pola po nazwie klucza', () => {
    // Ścieżka do konkretnego celu wymaga nazwy, której schemat nie zna —
    // istnieje tylko w danych.
    const form = formFor(model, ['targets', 'esp32s3-main'])!;
    expectOk(form);
    expectEqual(form.fields.find((f) => f.key === 'mcu')!.value, 'esp32s3');
    expectOk(form.sections.some((s) => s.title === 'memory'));
});

test('zgłoszenia walidatora trafiają do właściwych pól', () => {
    const source = `hydra: "0.4"
project:
  name: p
  version: 1.0.0
targets:
  default: main
  main:
    mcu: esp32s3
modules:
  ui:
    backend: lvgl
`;
    const d = HydraDocument.parse(source);
    const form = formFor(d.toJS(), ['modules', 'ui'], validate(d))!;
    const backend = form.fields.find((f) => f.key === 'backend')!;

    expectEqual(backend.diagnostics.length, 1);
    expectMatch(backend.diagnostics[0]!.hint ?? '', /lvgl9/);
    // Pole obok nie dostaje cudzego zgłoszenia.
    expectEqual(form.fields.find((f) => f.key === 'home')!.diagnostics.length, 0);
});

test('wymienia nazwy celów, magistral i komponentów', () => {
    expectDeepEqual(entriesOf(model, ['targets']),
                     ['esp32s3-main', 'pico2-dev', 'stm32-minimal']);
    expectDeepEqual(entriesOf(model, ['hardware', 'buses']), ['i2c0', 'spi1', 'uart1']);
    expectOk(entriesOf(model, ['hardware', 'components']).includes('baro'));
});

test('nowe pole w schemacie pojawia się w formularzu samo', () => {
    // Sedno tej warstwy: inspektor nie ma własnej listy pól, więc nie może
    // rozminąć się ze schematem.
    const form = formFor(model, ['modules', 'net', 'mqtt'])!;
    const keys = form.fields.map((f) => f.key).sort();
    expectDeepEqual(keys, ['base_topic', 'broker']);
    expectOk(form.sections.some((s) => s.title === 'tls'));
    expectOk(form.sections.some((s) => s.title === 'lwt'));
});

test('ścieżka spoza schematu nie daje formularza', () => {
    expectEqual(formFor(model, ['nie', 'ma']), undefined);
    expectEqual(formFor(model, ['project', 'name']), undefined);
});
