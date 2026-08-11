import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNoMatch,
    expectOk,
} from '../testing/assert';

/** Generowanie plików budowania z pliku projektu. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument } from './document.js';
import { buildPlan } from './emit/plan.js';
import { emitPlatformio, isGenerated } from './emit/platformio.js';
import { emitCMake } from './emit/cmake.js';
import { boardSourceFrom, emitBoardHeader } from './emit/board.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '__fixtures__/rover-01.hydra'), 'utf8');
const roverModel = HydraDocument.parse(roverSource).toJS();

// --- plan ------------------------------------------------------------------

test('plan wyodrębnia wszystkie cele z pliku wzorcowego', () => {
    const plan = buildPlan(roverModel);
    expectDeepEqual(plan.targets.map((t) => t.name), ['esp32s3-main', 'pico2-dev', 'stm32-minimal']);
    expectEqual(plan.defaultTarget, 'esp32s3-main');
    expectEqual(plan.projectName, 'rover-01');
});

test('cel wyłączający moduł nie dostaje jego flagi', () => {
    const plan = buildPlan(roverModel);
    const main = plan.targets.find((t) => t.name === 'esp32s3-main')!;
    const dev = plan.targets.find((t) => t.name === 'pico2-dev')!;

    // Płytka rozwojowa nie ma napędu — `modules: { motion: off }` w pliku.
    expectOk(main.modules.includes('motion'));
    expectOk(!dev.modules.includes('motion'));
    expectOk(main.flags.includes('-D HYDRA_ENABLE_MOTION=1'));
    expectOk(!dev.flags.some((f) => f.includes('MOTION')));
});

test('nadpisanie zagnieżdżone zostawia moduł włączony', () => {
    // `modules: { ui: off, net: { tls: off } }` — ui znika, net zostaje.
    const plan = buildPlan(roverModel);
    const minimal = plan.targets.find((t) => t.name === 'stm32-minimal')!;
    expectOk(!minimal.modules.includes('ui'));
    expectOk(minimal.modules.includes('net'));
});

test('brak jednostki zmiennoprzecinkowej jest odnotowany', () => {
    const plan = buildPlan(roverModel);
    // RP2350 ma FPU, ale RP2040 już nie — na nim regulatory idą na Q16.16.
    expectEqual(plan.targets.find((t) => t.name === 'pico2-dev')!.hasFpu, true);
    expectEqual(buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { pico: { mcu: 'rp2040' } },
    }).targets[0]!.hasFpu, false);
});

test('możliwości pochodzą z pliku, a gdy go milczy — z profilu układu', () => {
    const declared = buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { t: { mcu: 'esp32s3', capabilities: ['i2c'] } },
    }).targets[0]!;
    expectDeepEqual(declared.capabilities, ['i2c']);
    expectEqual(declared.capabilitiesDeclared, true);

    const inferred = buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { t: { mcu: 'esp32s3' } },
    }).targets[0]!;
    expectOk(inferred.capabilities.includes('wifi'));
    expectEqual(inferred.capabilitiesDeclared, false);
});

// --- platformio.ini --------------------------------------------------------

test('platformio.ini niesie ustawienia, bez których build się nie udaje', () => {
    // Każde z nich kosztowało nieudaną kompilację przy uruchamianiu Hydry
    // na prawdziwych platformach.
    const ini = emitPlatformio(buildPlan(roverModel));

    expectMatch(ini, /^lib_ldf_mode = deep\+$/m, 'bez tego nie znajdzie zależności przechodnich');
    expectMatch(ini, /^lib_compat_mode = strict$/m, 'bez tego pakiet jednej platformy trafia do innej');
    expectMatch(ini, /-fno-exceptions/);
    expectMatch(ini, /-fno-rtti/);
});

test('RP2350 dostaje przełącznik FreeRTOS i wskazanie rdzenia', () => {
    const ini = emitPlatformio(buildPlan(roverModel));
    const section = ini.slice(ini.indexOf('[env:pico2-dev]'));

    // Bez __FREERTOS nagłówek jądra celowo przerywa kompilację.
    expectMatch(section, /-D __FREERTOS=1/);
    expectMatch(section, /board_build\.core = earlephilhower/);
});

test('ESP32-C3 dostaje deklarację trybu USB', () => {
    // Bez ARDUINO_USB_MODE rdzeń nie deklaruje `Serial` w ogóle.
    const ini = emitPlatformio(buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { c3: { mcu: 'esp32c3' } },
    }));
    expectMatch(ini, /-D ARDUINO_USB_CDC_ON_BOOT=1/);
    expectMatch(ini, /-D ARDUINO_USB_MODE=1/);
});

test('STM32 dostaje FreeRTOS w swoim środowisku, nie globalnie', () => {
    // Filtr platform nie działa dla zależności z rejestru, więc deklaracja
    // musi siedzieć w środowisku celu.
    const ini = emitPlatformio(buildPlan(roverModel));
    const stm = ini.slice(ini.indexOf('[env:stm32-minimal]'));
    const esp = ini.slice(ini.indexOf('[env:esp32s3-main]'), ini.indexOf('[env:pico2-dev]'));

    expectMatch(stm, /STM32duino FreeRTOS/);
    expectNoMatch(esp, /STM32duino FreeRTOS/);
});

test('PSRAM wymaga i ustawienia, i definicji', () => {
    const ini = emitPlatformio(buildPlan(roverModel));
    const main = ini.slice(ini.indexOf('[env:esp32s3-main]'), ini.indexOf('[env:pico2-dev]'));
    expectMatch(main, /board_build\.psram_type = opi/);
    // Sam typ pamięci nie wystarcza — rdzeń szuka tej definicji.
    expectMatch(main, /-D BOARD_HAS_PSRAM/);
});

test('nagłówek płytki trafia do flag w postaci gotowej do włączenia', () => {
    const ini = emitPlatformio(buildPlan(roverModel));
    expectMatch(ini, /-D HYDRA_BOARD_HEADER='"boards\/rover_s3\.hpp"'/);
});

test('poziom logowania z pliku wycina logi już przy kompilacji', () => {
    const ini = emitPlatformio(buildPlan(roverModel));
    // modules.core.log.default: info → próg 2
    expectMatch(ini, /-D HYDRA_LOG_COMPILE_LEVEL=2/);
});

test('cel domyślny trafia do sekcji platformio', () => {
    const ini = emitPlatformio(buildPlan(roverModel));
    expectMatch(ini, /^default_envs = esp32s3-main$/m);
});

test('plik jest oznaczony jako wygenerowany', () => {
    // Bez ostrzeżenia ktoś poprawi go ręcznie i straci zmiany przy zapisie.
    const ini = emitPlatformio(buildPlan(roverModel));
    expectOk(isGenerated(ini));
    expectMatch(ini, /nie edytuj ręcznie/);
    expectEqual(isGenerated('[env]\nframework = arduino\n'), false);
});

test('zależności paczek trafiają do wspólnej sekcji i do celów z własnymi', () => {
    const ini = emitPlatformio(buildPlan(roverModel, {
        packLibDeps: ['adafruit/Adafruit BMP280 Library@^2.6'],
    }));
    const common = ini.slice(ini.indexOf('[env]'), ini.indexOf('[env:'));
    expectMatch(common, /Adafruit BMP280/);

    // Cel z własnymi zależnościami musi je dopisać, a nie zastąpić wspólne.
    const stm = ini.slice(ini.indexOf('[env:stm32-minimal]'));
    expectMatch(stm, /Adafruit BMP280/);
    expectMatch(stm, /STM32duino FreeRTOS/);
});

// --- CMakeLists.txt --------------------------------------------------------

test('CMake sprawdza nazwę celu już przy konfiguracji', () => {
    // Literówka ujawniłaby się inaczej dopiero jako brak definicji przy
    // kompilacji, czyli setki linii dalej.
    const cmake = emitCMake(buildPlan(roverModel));
    expectMatch(cmake, /set\(HYDRA_KNOWN_TARGETS esp32s3-main pico2-dev stm32-minimal\)/);
    expectMatch(cmake, /if\(NOT HYDRA_TARGET IN_LIST HYDRA_KNOWN_TARGETS\)/);
    expectMatch(cmake, /FATAL_ERROR/);
});

test('CMake dokłada źródła tylko włączonych modułów', () => {
    const cmake = emitCMake(buildPlan(roverModel));
    const dev = cmake.slice(cmake.indexOf('STREQUAL "pico2-dev"'), cmake.indexOf('STREQUAL "stm32-minimal"'));
    expectMatch(dev, /src\/sense/);
    expectNoMatch(dev, /src\/motion/, 'napęd jest wyłączony dla tego celu');
});

test('CMake zna build hostowy z atrapami', () => {
    const cmake = emitCMake(buildPlan(roverModel));
    expectMatch(cmake, /HYDRA_FORCE_HOST=1/);
    expectMatch(cmake, /hal\/mock/);
    expectMatch(cmake, /Threads::Threads/);
});

test('CMake przekazuje nagłówek płytki w cudzysłowach', () => {
    const cmake = emitCMake(buildPlan(roverModel));
    expectMatch(cmake, /HYDRA_BOARD_HEADER="boards\/rover_s3\.hpp"/);
});

// --- nagłówek płytki -------------------------------------------------------

test('nagłówek płytki używa liczb, nie nazw wariantu', () => {
    // Trafia do jednostek kompilacji, które nie widzą Arduino i widzieć go
    // nie mogą — LED_BUILTIN ani PA5 nie są tam zadeklarowane.
    const header = emitBoardHeader({
        name: 'rover-s3',
        led: { pin: 48, activeLow: false },
        buses: [{ id: 'i2c0', pins: { sda: 8, scl: 9 }, hz: 400000 }],
        pins: [{ name: 'MotorLeftPwm', pin: 17, comment: 'DRV8833 AIN1' }],
    }, undefined, 'rover-01');

    expectMatch(header, /#define HYDRA_BOARD_LED 48/);

    // Sprawdzamy same definicje, nie komentarze — te ostatnie wspominają
    // LED_BUILTIN właśnie po to, żeby wytłumaczyć, czemu go tu nie ma.
    const defines = header.split('\n').filter((line) => line.startsWith('#define'));
    for (const line of defines) {
        expectNoMatch(line, /\b(LED_BUILTIN|P[A-H]\d+)\b/,
                            `nazwa wariantu w definicji: ${line}`);
    }
    expectMatch(header, /#define HYDRA_BOARD_I2C0_SDA 8/);
    expectMatch(header, /#define HYDRA_BOARD_I2C0_HZ 400000/);
    expectMatch(header, /constexpr ::hydra::hal::PinNum MotorLeftPwm = 17;\s+\/\/\/< DRV8833 AIN1/);
});

test('nagłówek wypisuje możliwości płytki', () => {
    const plan = buildPlan(roverModel);
    const header = emitBoardHeader({ name: 'x', buses: [], pins: [] },
                                   plan.targets[0], 'rover-01');
    expectMatch(header, /#define HYDRA_BOARD_HAS_WIFI 1/);
    expectMatch(header, /#define HYDRA_BOARD_HAS_USB_DEVICE 1/);
});

test('opis płytki z modelu bierze magistrale i przypisane piny', () => {
    const source = boardSourceFrom(roverModel, 'rover-s3')!;
    expectOk(source);
    expectDeepEqual(source.buses.map((b) => b.id), ['i2c0', 'spi1', 'uart1']);
    expectEqual(source.buses.find((b) => b.id === 'i2c0')!.hz, 400000);
});

test('piny podane jako nazwy ze schematu są pomijane, nie zgadywane', () => {
    // `pins: { ain1: Pin.MotA1 }` odsyła do schematu; bez niego nie ma czego
    // wygenerować, a wpisanie tam zmyślonego numeru byłoby gorsze niż brak.
    const source = boardSourceFrom(roverModel, 'rover-s3')!;
    expectEqual(source.pins.length, 0);
});

test('nagłówek płytki także daje się odtworzyć', () => {
    // Znacznik szukany w pierwszej linii sprawiał, że plik C++ nigdy nie
    // przechodził sprawdzenia: zaczyna się od `#pragma once`, a zdanie
    // o pochodzeniu stoi w bloku dokumentacyjnym niżej.
    const header = emitBoardHeader({ name: 'x', buses: [], pins: [] }, undefined, 'proj');
    expectOk(isGenerated(header), 'nagłówek płytki ma być rozpoznany jako wygenerowany');

    const ini = emitPlatformio(buildPlan(roverModel));
    expectOk(isGenerated(ini));
    const cmake = emitCMake(buildPlan(roverModel));
    expectOk(isGenerated(cmake));

    // Plik napisany ręcznie nadal nie.
    expectEqual(isGenerated('#pragma once\n#define HYDRA_BOARD_LED 2\n'), false);
});

test('cel wasm: CMake zamawia SDL z portu emscriptena, nie szuka go w systemie', () => {
    const plan = buildPlan({
        project: { name: 'gra', version: '1.0.0' },
        targets: { web: { mcu: 'wasm', native: { window: { width: 128, height: 64, scale: 6 } } } },
    });
    const target = plan.targets[0]!;
    expectEqual(target.isWasm, true);
    expectEqual(target.isNative, false);
    // Wypada z platformio.ini tak samo jak cel natywny: `platform = native`
    // nie zbuduje modułu WebAssembly.
    expectEqual(target.usesCMake, true);

    const cmake = emitCMake(plan, '../..');
    expectOk(cmake.includes('HYDRA_TARGET_IS_WASM'));
    expectOk(cmake.includes('-sUSE_SDL=2'));
    expectOk(cmake.includes('-sASYNCIFY'));
    // find_package(SDL2) znalazłby bibliotekę dla architektury hosta —
    // nie do zlinkowania z modułem WebAssembly.
    expectOk(!cmake.includes('find_package(SDL2'));
    // Jednowątkowo: wątek w emscriptenie wymusza COOP/COEP na serwerze.
    expectOk(cmake.includes('if(NOT HYDRA_TARGET_IS_WASM)'));
    // Backend hostowy ten sam co na celu natywnym — SdlDisplay bez zmian.
    expectOk(cmake.includes('src/gfx/sdl/*.cpp'));
});

test('projekt bez celu wasm nie niesie martwego bloku emscriptena', () => {
    const cmake = emitCMake(buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { s3: { mcu: 'esp32s3' }, okno: { mcu: 'native' } },
    }), '../..');
    expectOk(!cmake.includes('HYDRA_TARGET_IS_WASM'));
    expectOk(cmake.includes('find_package(SDL2'));
});

test('cel wasm wypada z platformio.ini', () => {
    const ini = emitPlatformio(buildPlan({
        project: { name: 'p', version: '1.0.0' },
        targets: { web: { mcu: 'wasm' }, s3: { mcu: 'esp32s3' } },
    }));
    expectOk(!ini.includes('[env:web]'));
    expectOk(ini.includes('[env:s3]'));
});
