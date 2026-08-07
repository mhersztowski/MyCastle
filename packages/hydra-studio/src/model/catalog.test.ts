import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Biblioteka komponentów, formularz z paczki i wstawianie do projektu. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildCatalog, filterCatalog } from './catalog.js';
import { configFormFor, unsupportedFields, type ConfigSchema } from './configForm.js';
import { HydraDocument } from './document.js';
import { buildPlan } from './emit/plan.js';
import { applyInsert, planInsert } from './insert.js';
import type { PackManifest } from './pack.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '__fixtures__/rover-01.hydra'), 'utf8');
const roverModel = HydraDocument.parse(roverSource).toJS();

const pack = (over: Partial<PackManifest> = {}): PackManifest =>
    ({ pack: 'bmp280', version: '1.2.0', provides: ['sense.driver'], requires: ['i2c'], ...over });

// --- katalog ---------------------------------------------------------------

test('grupuje komponenty według tego, czym są dla frameworka', () => {
    const groups = buildCatalog([
        pack(),
        pack({ pack: 'ssd1306', provides: ['ui.display'] }),
        pack({ pack: 'drv8833', provides: ['motion.motor'], requires: ['pwm'] }),
    ]);
    expectDeepEqual(groups.map((g) => g.title), ['Czujniki', 'Wyświetlacze', 'Napęd']);
});

test('niepasujący komponent zostaje na liście i podaje powód', () => {
    // Ukrycie byłoby gorsze: użytkownik szukałby czujnika, którego nie widzi,
    // i nie miałby jak się dowiedzieć dlaczego.
    const target = buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { t: { mcu: 'stm32g4', capabilities: ['spi', 'pwm'] } },
    }).targets[0]!;

    const [group] = buildCatalog([pack()], { target });
    const entry = group!.entries[0]!;

    expectEqual(entry.compatible, false);
    expectDeepEqual(entry.missing, ['i2c']);
    expectMatch(entry.reason!, /płytka „t" nie ma: i2c/);
});

test('przy możliwościach z profilu powód podpowiada, co zrobić', () => {
    // Profil opisuje układ, nie płytkę — ta mogła mieć coś, o czym profil
    // nie wie, więc użytkownik może to dopisać zamiast szukać innej części.
    const target = buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { t: { mcu: 'rp2040' } },
    }).targets[0]!;

    const [group] = buildCatalog([pack({ requires: ['wifi'] })], { target });
    expectMatch(group!.entries[0]!.reason!, /wypisz w capabilities/);
});

test('bez wybranego celu nic nie jest wyszarzone', () => {
    const [group] = buildCatalog([pack({ requires: ['wifi'] })]);
    expectEqual(group!.entries[0]!.compatible, true);
});

test('oznacza paczki już użyte w projekcie i magistralę', () => {
    const [group] = buildCatalog([pack(), pack({ pack: 'ina219' })], { used: ['bmp280'] });
    const entries = group!.entries;
    expectEqual(entries.find((e) => e.manifest.pack === 'bmp280')!.used, true);
    expectEqual(entries.find((e) => e.manifest.pack === 'ina219')!.used, false);
    expectEqual(entries[0]!.bus, 'i2c');
});

test('wyszukiwanie pomija wielkość liter i znaki diakrytyczne', () => {
    // Nikt nie przełącza układu klawiatury, szukając czujnika.
    const groups = buildCatalog([pack({ description: 'Ciśnienie i temperatura' })]);
    expectEqual(filterCatalog(groups, 'cisnienie').length, 1);
    expectEqual(filterCatalog(groups, 'CIŚNIENIE').length, 1);
    expectEqual(filterCatalog(groups, 'napęd').length, 0);
    expectEqual(filterCatalog(groups, '').length, 1);
});

// --- formularz z paczki ----------------------------------------------------

const BMP280_SCHEMA: ConfigSchema = {
    type: 'object',
    title: 'BMP280',
    properties: {
        address: { type: 'string', enum: ['0x76', '0x77'], default: '0x76',
                   description: 'Adres na magistrali' },
        period_ms: { type: 'integer', minimum: 10, maximum: 60000, default: 1000, unit: 'ms' },
        iir: { type: 'integer', enum: [0, 2, 4, 8, 16], default: 4 },
        measure: {
            type: 'object', title: 'Pomiar',
            properties: { mode: { type: 'string', enum: ['normal', 'forced'], default: 'normal' } },
        },
        calibration: { oneOf: [{ type: 'string' }, { type: 'object' }] },
    },
    required: ['address'],
};

test('buduje formularz z schematu paczki', () => {
    const form = configFormFor(BMP280_SCHEMA, ['hardware', 'components', 'baro'],
                               { address: '0x77' });

    expectEqual(form.title, 'BMP280');
    const address = form.fields.find((f) => f.key === 'address')!;
    expectEqual(address.kind, 'choice');
    expectDeepEqual([...address.choices!], ['0x76', '0x77']);
    expectEqual(address.required, true);
    expectEqual(address.value, '0x77');
    expectDeepEqual(address.path, ['hardware', 'components', 'baro', 'address']);
});

test('wartość domyślna jest podpowiedzią, nie zapisem', () => {
    // Inaczej użytkownik nie odróżniłby ustawienia świadomego od pominiętego.
    const form = configFormFor(BMP280_SCHEMA, ['x'], {});
    const period = form.fields.find((f) => f.key === 'period_ms')!;
    expectEqual(period.value, 1000);
    expectEqual(period.present, false);
    expectMatch(period.doc, /domyślnie: 1000/);
});

test('zakres, jednostka i całkowitość trafiają do pola', () => {
    const form = configFormFor(BMP280_SCHEMA, ['x'], {});
    const period = form.fields.find((f) => f.key === 'period_ms')!;
    expectEqual(period.min, 10);
    expectEqual(period.max, 60000);
    expectEqual(period.unit, 'ms');
    expectEqual(period.integer, true);
});

test('lista wartości liczbowych też daje wybór', () => {
    const form = configFormFor(BMP280_SCHEMA, ['x'], {});
    const iir = form.fields.find((f) => f.key === 'iir')!;
    expectEqual(iir.kind, 'choice');
    expectDeepEqual([...iir.choices!], ['0', '2', '4', '8', '16']);
});

test('zagnieżdżony obiekt staje się podsekcją', () => {
    const form = configFormFor(BMP280_SCHEMA, ['x'], {});
    expectOk(!form.fields.some((f) => f.key === 'measure'));
    expectEqual(form.sections.find((s) => s.title === 'Pomiar')!.fields[0]!.key, 'mode');
});

test('konstrukcja spoza podzbioru trafia do edycji tekstowej, a nie do kosza', () => {
    // Odrzucenie schematu za `oneOf` zablokowałoby cały komponent.
    const form = configFormFor(BMP280_SCHEMA, ['x'], {});
    expectEqual(form.fields.find((f) => f.key === 'calibration')!.kind, 'free');
    expectDeepEqual(unsupportedFields(BMP280_SCHEMA), ['calibration']);
});

// --- wstawianie ------------------------------------------------------------

test('dobiera nazwę, magistralę i wolny adres bez pytania', () => {
    const plan = planInsert(roverModel, {
        manifest: pack({ pack: 'bme280', defaults: { address: '0x76, 0x77' } }),
    });

    expectEqual(plan.name, 'bme280');
    expectEqual(plan.bus, 'i2c0');
    // 0x76 zajmuje w tym projekcie czujnik `baro`, więc bierzemy drugi adres.
    expectEqual(plan.address, '0x77');
    expectEqual(plan.part, 'BME280 @ i2c0:0x77');
    expectDeepEqual(plan.problems, []);
});

test('drugi taki sam układ dostaje numer, a nie odmowę', () => {
    // Bywają dwa dalmierze albo cztery enkodery.
    const plan = planInsert(roverModel, { manifest: pack({ pack: 'baro' }) });
    expectEqual(plan.name, 'baro_2');
});

test('brak wolnego adresu jest zgłaszany z podpowiedzią', () => {
    const plan = planInsert(roverModel, {
        manifest: pack({ pack: 'bmp280x', defaults: { address: '0x76' } }),
    });
    expectEqual(plan.problems.length, 1);
    expectMatch(plan.problems[0]!, /adresy tego układu na i2c0 są zajęte/);
});

test('brak magistrali mówi, czego dopisać', () => {
    const model = HydraDocument.parse('hydra: "0.4"\nproject: { name: p, version: 1.0.0 }\n' +
                                      'targets: { main: { mcu: esp32s3 } }\n').toJS();
    const plan = planInsert(model, { manifest: pack() });
    expectMatch(plan.problems[0]!, /hardware\.buses/);
});

test('wstawienie dopisuje paczkę i układ, nie ruszając reszty pliku', () => {
    const source = roverSource;
    const doc = HydraDocument.parse(source);
    const model = doc.toJS();
    const manifest = pack({ pack: 'bme280', version: '2.0.0', defaults: { address: '0x76, 0x77' } });

    const plan = planInsert(model, { manifest });
    expectEqual(applyInsert(doc, model, manifest, plan), true);

    const result = doc.toString();
    // Plik wzorcowy nie ma sekcji zależności — pierwszy komponent ją tworzy.
    expectMatch(result, /^dependencies:$/m);
    expectMatch(result, /^ {2}bme280: \^2\.0\.0$/m);
    expectMatch(result, /^ {4}bme280: \{ part: "BME280 @ i2c0:0x77" \}$/m);

    // Reszta pliku bez zmian — komentarze i wyrównanie na miejscu.
    expectMatch(result, /# NIGDY inline — patrz sekcja secrets/);
    expectMatch(result, /psram: opi {14}# off \| quad \| opi/);
    expectOk(result.startsWith(source.slice(0, 200)), 'początek pliku nietknięty');
});

test('wstawienie z zastrzeżeniami nie dotyka pliku', () => {
    const doc = HydraDocument.parse(roverSource);
    const model = doc.toJS();
    const manifest = pack({ pack: 'x', defaults: { address: '0x76' } });

    const plan = planInsert(model, { manifest });
    expectEqual(applyInsert(doc, model, manifest, plan), false);
    expectEqual(doc.modified, false);
});

test('wstawiony wpis daje się odczytać z powrotem', () => {
    // Najpewniejsze sprawdzenie zapisu: przeczytać go tym samym parserem.
    // Zapis jednowierszowy rządzi się innymi regułami cytowania — adres
    // „BMP280 @ i2c0:0x76" bez cudzysłowów rozpadłby się na dwie wartości.
    const doc = HydraDocument.parse(roverSource);
    const model = doc.toJS();
    const manifest = pack({ pack: 'bme280', version: '2.0.0', defaults: { address: '0x76, 0x77' } });
    applyInsert(doc, model, manifest, planInsert(model, { manifest }));

    const reparsed = HydraDocument.parse(doc.toString()).toJS() as any;
    expectEqual(reparsed.hardware.components.bme280.part, 'BME280 @ i2c0:0x77');
    expectEqual(reparsed.dependencies.bme280, '^2.0.0');
    // Reszta pliku odczytuje się tak samo jak przed zmianą.
    expectEqual(reparsed.hardware.components.baro.part, 'BMP280 @ i2c0:0x76');
    expectEqual(reparsed.project.name, 'rover-01');
});
