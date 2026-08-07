import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Format paczki Hydry i dopasowanie do możliwości płytki. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { collectBuildFlags, collectLibDeps, loadPack, missingCapabilities } from './pack.js';
import { hydraJsonSchema } from './jsonSchema.js';
import type { PackManifest } from './pack.js';

const here = dirname(fileURLToPath(import.meta.url));
const bmp280 = readFileSync(join(here, '__fixtures__/packs/bmp280/hydra-pack.yaml'), 'utf8');

test('wczytuje manifest wzorcowy bez zastrzeżeń', () => {
    const { manifest, diagnostics } = loadPack(bmp280, 'packs/bmp280');
    expectDeepEqual(diagnostics, [], diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n'));

    expectEqual(manifest.pack, 'bmp280');
    expectEqual(manifest.version, '1.2.0');
    expectDeepEqual(manifest.provides, ['sense.driver']);
    expectDeepEqual(manifest.requires, ['i2c']);
    expectEqual(manifest.upstream?.lib_deps, 'adafruit/Adafruit BMP280 Library@^2.6');
});

test('literówka w nazwie pola jest błędem', () => {
    const { diagnostics } = loadPack('pack: x\nversion: 1.0.0\nprovides: [sense.driver]\nadaptor: a.cpp\n');
    const typo = diagnostics.find((d) => d.path === 'adaptor');
    expectOk(typo);
    expectMatch(typo!.hint ?? '', /adapter/);
});

test('nieznany rodzaj w „provides" podpowiada właściwy', () => {
    const { diagnostics } = loadPack('pack: x\nversion: 1.0.0\nprovides: [sense.drivers]\n');
    const bad = diagnostics.find((d) => d.path === 'provides.0');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /sense\.driver/);
});

test('manifest bez żadnego pliku jest ostrzeżeniem', () => {
    // Paczka, która niczego nie wnosi, to prawie zawsze niedokończona edycja.
    const { diagnostics } = loadPack('pack: x\nversion: 1.0.0\nprovides: [sense.driver]\n');
    const warn = diagnostics.find((d) => d.message.includes('nie wskazuje żadnego pliku'));
    expectOk(warn);
    expectEqual(warn!.severity, 'warning');
});

test('sterownik czujnika bez schematu konfiguracji dostaje ostrzeżenie', () => {
    const { diagnostics } = loadPack(
        'pack: x\nversion: 1.0.0\nprovides: [sense.driver]\nadapter: a.cpp\n');
    const warn = diagnostics.find((d) => d.path === 'config_schema');
    expectOk(warn);
    expectMatch(warn!.hint ?? '', /pusty panel/);
});

test('niewłaściwe rozszerzenie pliku jest wyłapywane', () => {
    const { diagnostics } = loadPack(
        'pack: x\nversion: 1.0.0\nprovides: [sense.driver]\ncomponent: bmp280.json\n');
    const bad = diagnostics.find((d) => d.path === 'component');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /\.hcomp/);
});

// --- dopasowanie do płytki -------------------------------------------------

const pack = (requires?: string[]): PackManifest =>
    ({ pack: 'p', version: '1.0.0', provides: ['sense.driver'], ...(requires ? { requires } : {}) });

test('paczka pasuje, gdy płytka ma wszystkie wymagane możliwości', () => {
    expectDeepEqual(missingCapabilities(pack(['i2c']), ['i2c', 'spi', 'wifi']), []);
});

test('brakujące możliwości są wymieniane — Studio ma podać powód', () => {
    // Sam brak pozycji na liście zostawiałby użytkownika z pytaniem, czemu
    // komponentu nie widzi.
    const missing = missingCapabilities(pack(['wifi', 'psram']), ['i2c', 'spi']);
    expectDeepEqual(missing, ['wifi', 'psram']);
});

test('paczka bez wymagań pasuje wszędzie', () => {
    expectDeepEqual(missingCapabilities(pack(), ['i2c']), []);
    expectDeepEqual(missingCapabilities(pack(), undefined), []);
});

test('cel bez zadeklarowanych możliwości nie blokuje niczego', () => {
    // Brak listy znaczy „nie wiadomo", nie „nie potrafi nic".
    expectDeepEqual(missingCapabilities(pack(['wifi']), undefined), []);
});

// --- przekazanie zależności w dół ------------------------------------------

test('zbiera zależności bibliotek bez powtórzeń', () => {
    const packs: PackManifest[] = [
        { pack: 'a', version: '1.0.0', provides: ['sense.driver'],
          upstream: { lib_deps: 'adafruit/Adafruit BMP280 Library@^2.6' } },
        { pack: 'b', version: '1.0.0', provides: ['sense.driver'],
          upstream: { lib_deps: ['adafruit/Adafruit BMP280 Library@^2.6', 'adafruit/Adafruit BusIO@^1.14'] } },
        { pack: 'c', version: '1.0.0', provides: ['ui.widget'] },
    ];
    expectDeepEqual(collectLibDeps(packs),
                     ['adafruit/Adafruit BMP280 Library@^2.6', 'adafruit/Adafruit BusIO@^1.14']);
});

test('zbiera flagi kompilacji bez powtórzeń', () => {
    const packs: PackManifest[] = [
        { pack: 'a', version: '1.0.0', provides: ['sense.driver'], upstream: { build_flags: ['-DA=1'] } },
        { pack: 'b', version: '1.0.0', provides: ['sense.driver'], upstream: { build_flags: ['-DA=1', '-DB=2'] } },
    ];
    expectDeepEqual(collectBuildFlags(packs), ['-DA=1', '-DB=2']);
});

test('zepsuty manifest nie wywraca wczytywania', () => {
    const { diagnostics, manifest } = loadPack('pack: [niedomknięta\n');
    expectOk(diagnostics.length > 0);
    expectEqual(manifest.pack, '');
});

test('eksport do JSON Schema zachowuje pola wymagane i opisy', () => {
    // Z tego korzystają edytory zewnętrzne; sprawdzanie poprawności zostaje
    // po stronie validate(), bo reguł wiążących pola JSON Schema nie wyrazi.
    const schema = hydraJsonSchema() as any;
    expectDeepEqual(schema.required, ['hydra', 'project', 'targets']);
    expectEqual(schema.properties.project.properties.name.type, 'string');
    expectOk(schema.properties.project.properties.name.pattern);
    expectOk(schema.properties.targets.properties.default, 'klucz „default" musi być dozwolony');
    expectEqual(schema.properties.modules.properties.ui.properties.backend.enum.includes('lvgl9'), true);
});

test('zapisane pliki JSON Schema są zgodne ze źródłem', () => {
    // Pliki w schema/ są wynikiem generowania; test pilnuje, żeby ktoś nie
    // zapomniał ich odświeżyć po zmianie schematu.
    const onDisk = JSON.parse(readFileSync(join(here, '../../schema/hydra.schema.json'), 'utf8'));
    expectDeepEqual(onDisk, JSON.parse(JSON.stringify(hydraJsonSchema())),
                     'uruchom „pnpm run schema" w packages/hydra-studio');
});
