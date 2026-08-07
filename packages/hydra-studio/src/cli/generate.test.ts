import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNoMatch,
    expectOk,
    expectThrows,
} from '../testing/assert';

/** Generowanie plików budowania na dysku. */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from './generate.js';
import { findProjectFile, loadProject } from './project.js';

const PROJECT = `hydra: "0.4"
project:
  name: proj
  version: 1.0.0
targets:
  default: main
  main:
    mcu: esp32s3
    board: boards/main.hpp
hardware:
  buses:
    i2c0: { hz: 400000 }
`;

function scratch(files: Record<string, string> = {}): string {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-gen-'));
    writeFileSync(join(dir, 'proj.hydra'), PROJECT);
    for (const [name, content] of Object.entries(files)) {
        writeFileSync(join(dir, name), content);
    }
    return dir;
}

test('znajduje plik projektu w katalogu', () => {
    const dir = scratch();
    try {
        expectEqual(findProjectFile(dir), join(dir, 'proj.hydra'));
        expectEqual(findProjectFile(join(dir, 'proj.hydra')), join(dir, 'proj.hydra'));
    } finally { rmSync(dir, { recursive: true }); }
});

test('przy kilku plikach .hydra odmawia zgadywania', () => {
    // Domyślenie się nie tego projektu bywa kosztowne — lepiej zapytać.
    const dir = scratch({ 'drugi.hydra': PROJECT });
    try {
        expectThrows(() => findProjectFile(dir), /kilka plików \.hydra/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('generuje komplet plików', () => {
    const dir = scratch();
    try {
        const files = generate(loadProject(dir));
        expectDeepEqual(files.map((f) => f.path).sort(),
                         ['CMakeLists.txt', 'boards/main.hpp', 'platformio.ini']);
        expectOk(files.every((f) => f.outcome === 'zapisany'));
        expectMatch(readFileSync(join(dir, 'platformio.ini'), 'utf8'), /\[env:main\]/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('powtórne generowanie nie dotyka niezmienionych plików', () => {
    const dir = scratch();
    try {
        generate(loadProject(dir));
        const files = generate(loadProject(dir));
        expectOk(files.every((f) => f.outcome === 'bez zmian'));
    } finally { rmSync(dir, { recursive: true }); }
});

test('nie nadpisuje pliku napisanego ręcznie', () => {
    // Plik bez znacznika mógł powstać ręcznie i zawierać ustawienia, których
    // model nie opisuje — cichy zapis skasowałby czyjąś pracę.
    const dir = scratch({ 'platformio.ini': '[env]\nframework = arduino\n; moje ustawienia\n' });
    try {
        const files = generate(loadProject(dir));
        const skipped = files.find((f) => f.path === 'platformio.ini')!;
        expectEqual(skipped.outcome, 'pominięty');
        expectMatch(skipped.reason ?? '', /--force/);
        expectMatch(readFileSync(join(dir, 'platformio.ini'), 'utf8'), /moje ustawienia/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('--force nadpisuje mimo braku znacznika', () => {
    const dir = scratch({ 'platformio.ini': '[env]\n; moje ustawienia\n' });
    try {
        const files = generate(loadProject(dir), { force: true });
        expectEqual(files.find((f) => f.path === 'platformio.ini')!.outcome, 'zapisany');
        expectNoMatch(readFileSync(join(dir, 'platformio.ini'), 'utf8'), /moje ustawienia/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('--dry-run pokazuje wynik, nic nie zapisując', () => {
    const dir = scratch();
    try {
        const files = generate(loadProject(dir), { dryRun: true });
        expectOk(files.length > 0);
        expectThrows(() => readFileSync(join(dir, 'platformio.ini'), 'utf8'));
    } finally { rmSync(dir, { recursive: true }); }
});

test('brakująca paczka jest zgłaszana, nie pomijana po cichu', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-pack-'));
    try {
        writeFileSync(join(dir, 'proj.hydra'), PROJECT + 'dependencies:\n  bmp280: "^1.0.0"\n');
        const project = loadProject(dir);
        const missing = project.diagnostics.find((d) => d.path === 'dependencies.bmp280');
        expectOk(missing);
        expectMatch(missing!.message, /nie znaleziono manifestu/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('paczka z katalogu wnosi swoje zależności bibliotek', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-pack-'));
    try {
        writeFileSync(join(dir, 'proj.hydra'),
                      PROJECT + 'dependencies:\n  bmp280: { path: packs/bmp280 }\n');
        mkdirSync(join(dir, 'packs', 'bmp280'), { recursive: true });
        writeFileSync(join(dir, 'packs', 'bmp280', 'hydra-pack.yaml'),
            'pack: bmp280\nversion: 1.0.0\nprovides: [sense.driver]\n' +
            'adapter: a.cpp\nconfig_schema: b.schema.json\n' +
            'upstream:\n  lib_deps: "adafruit/Adafruit BMP280 Library@^2.6"\n');

        const project = loadProject(dir);
        expectDeepEqual(project.diagnostics.filter((d) => d.severity === 'error'), []);
        expectDeepEqual(project.packLibDeps, ['adafruit/Adafruit BMP280 Library@^2.6']);

        generate(project);
        expectMatch(readFileSync(join(dir, 'platformio.ini'), 'utf8'), /Adafruit BMP280/);
    } finally { rmSync(dir, { recursive: true }); }
});

test('wczytuje schemat konfiguracji paczki dla inspektora', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hydra-schema-'));
    try {
        writeFileSync(join(dir, 'proj.hydra'),
                      PROJECT + 'dependencies:\n  bmp280: { path: packs/bmp280 }\n');
        mkdirSync(join(dir, 'packs', 'bmp280'), { recursive: true });
        writeFileSync(join(dir, 'packs', 'bmp280', 'hydra-pack.yaml'),
            'pack: bmp280\nversion: 1.0.0\nprovides: [sense.driver]\n' +
            'adapter: a.cpp\nconfig_schema: bmp280.schema.json\n');
        writeFileSync(join(dir, 'packs', 'bmp280', 'bmp280.schema.json'), JSON.stringify({
            type: 'object', title: 'BMP280',
            properties: { address: { type: 'string', enum: ['0x76', '0x77'] } },
        }));

        const project = loadProject(dir);
        expectDeepEqual(project.diagnostics.filter((d) => d.severity === 'error'), []);
        expectEqual(project.configSchemas['bmp280']?.title, 'BMP280');
    } finally { rmSync(dir, { recursive: true }); }
});

test('zepsuty schemat konfiguracji nie wywraca wczytania projektu', () => {
    // Inspektor pokaże wtedy surowe pola, a użytkownik dowie się dlaczego.
    const dir = mkdtempSync(join(tmpdir(), 'hydra-schema-'));
    try {
        writeFileSync(join(dir, 'proj.hydra'),
                      PROJECT + 'dependencies:\n  bmp280: { path: packs/bmp280 }\n');
        mkdirSync(join(dir, 'packs', 'bmp280'), { recursive: true });
        writeFileSync(join(dir, 'packs', 'bmp280', 'hydra-pack.yaml'),
            'pack: bmp280\nversion: 1.0.0\nprovides: [sense.driver]\n' +
            'adapter: a.cpp\nconfig_schema: bmp280.schema.json\n');
        writeFileSync(join(dir, 'packs', 'bmp280', 'bmp280.schema.json'), '{ niepoprawny');

        const project = loadProject(dir);
        expectEqual(project.packs.length, 1, 'paczka nadal działa');
        expectOk(project.diagnostics.some((d) => d.message.includes('nie jest poprawnym JSON-em')));
    } finally { rmSync(dir, { recursive: true }); }
});
