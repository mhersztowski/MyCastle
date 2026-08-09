import { test } from 'vitest';

import {
    expectDeepEqual, expectEqual, expectMatch, expectNoMatch, expectOk,
} from '../testing/assert';

/** Cel `native`: wykrywanie maszyny, plan, generowanie i pakowanie wyniku. */

import { inflateRawSync } from 'node:zlib';

import { HydraDocument } from './document.js';
import { buildPlan } from './emit/plan.js';
import { emitCMake } from './emit/cmake.js';
import { emitCMakePresets } from './emit/presets.js';
import { emitPlatformio } from './emit/platformio.js';
import {
    artifactName, decodeBase64, detectHostPlatform, detectHostPlatformSync,
    hostPlatform, type NavigatorLike,
} from './emit/host.js';
import { createZip } from '../cli/zip.js';
import { currentHostPlatformId } from '../cli/native.js';

const SOURCE = `
hydra: "0.4"
project:
  name: okienko
  version: 0.1.0
targets:
  default: podglad
  podglad:
    mcu: native
    native:
      window: { width: 128, height: 64, scale: 4, format: mono1, title: "OLED" }
  esp32s3-main:
    mcu: esp32s3
    board: boards/dev.hpp
modules:
  ui:
    backend: lvgl9
`;

const model = HydraDocument.parse(SOURCE).toJS();

// --- wykrywanie maszyny ----------------------------------------------------

function chromium(platform: string, architecture: string, bitness = '64'): NavigatorLike {
    return {
        userAgent: 'Mozilla/5.0',
        userAgentData: {
            platform,
            getHighEntropyValues: async () => ({ platform, architecture, bitness }),
        },
    };
}

test('Client Hints rozpoznają Windows on ARM, którego User-Agent ukrywa', async () => {
    // Sedno sprawy: klasyczny nagłówek podaje tu „Win64; x64" i to nie pomyłka
    // przeglądarki, tylko celowa zgodność wsteczna. Bez Client Hints wynik
    // byłby binarką x64 uruchamianą przez emulację.
    const found = await detectHostPlatform(chromium('Windows', 'arm'));
    expectEqual(found.platform.id, 'win-arm64');
    expectEqual(found.confidence, 'high');
});

test('Client Hints rozpoznają Windows x64 i macOS na Apple Silicon', async () => {
    expectEqual((await detectHostPlatform(chromium('Windows', 'x86'))).platform.id, 'win-x64');
    expectEqual((await detectHostPlatform(chromium('macOS', 'arm'))).platform.id, 'mac-arm64');
});

test('Safari na Apple Silicon rozpoznaje się po układzie graficznym', async () => {
    // Safari nie ma Client Hints i podaje „Intel Mac OS X" niezależnie od
    // procesora. Nazwa GPU z WebGL jest jedynym tropem, jaki zostaje.
    const safari: NavigatorLike = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15',
    };
    const found = await detectHostPlatform(safari, () => 'Apple M2 Pro');
    expectEqual(found.platform.id, 'mac-arm64');
    expectEqual(found.confidence, 'high');
});

test('bez dowodu na ARM schodzimy do x64, nie do wariantu prawdopodobniejszego', async () => {
    // Pomyłka w stronę x64 jest odwracalna (Rosetta 2, warstwa x64 w Windows
    // on ARM), pomyłka w stronę arm64 daje plik, który nie uruchomi się wcale.
    const safari: NavigatorLike = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
    };
    const found = await detectHostPlatform(safari, () => 'Intel Iris Pro');
    expectEqual(found.platform.id, 'mac-x64');
    expectEqual(found.confidence, 'low');
});

test('odmowa podania Client Hints nie wywraca wykrywania', async () => {
    const hostile: NavigatorLike = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        userAgentData: {
            platform: 'Windows',
            getHighEntropyValues: async () => { throw new Error('odmowa'); },
        },
    };
    const found = await detectHostPlatform(hostile);
    expectEqual(found.platform.os, 'windows');
    expectEqual(found.confidence, 'low');
});

test('wersja bez oczekiwania rozpoznaje system i aarch64 na Linuksie', () => {
    expectEqual(detectHostPlatformSync({ userAgent: 'X11; Linux x86_64' }).platform.id, 'linux-x64');
    const arm = detectHostPlatformSync({ userAgent: 'X11; Linux aarch64' });
    expectEqual(arm.platform.id, 'linux-arm64');
    expectEqual(arm.confidence, 'high');
});

test('maszyna procesu odwzorowuje się na identyfikator platformy', () => {
    expectEqual(currentHostPlatformId('win32', 'arm64'), 'win-arm64');
    expectEqual(currentHostPlatformId('darwin', 'arm64'), 'mac-arm64');
    expectEqual(currentHostPlatformId('linux', 'x64'), 'linux-x64');
    expectEqual(currentHostPlatformId('aix' as NodeJS.Platform, 'x64'), undefined);
});

// --- plan ------------------------------------------------------------------

test('cel native jest rozpoznany i dostaje plik płytki z biblioteki', () => {
    const plan = buildPlan(model);
    const target = plan.targets.find((t) => t.name === 'podglad')!;

    expectEqual(target.isNative, true);
    expectEqual(target.boardHeader, 'hydra/boards/native.hpp');
    expectOk(target.flags.includes('-D HYDRA_FORCE_HOST=1'));
});

test('okno przekłada się na flagi kompilacji', () => {
    const target = buildPlan(model).targets.find((t) => t.name === 'podglad')!;

    expectDeepEqual(target.native, {
        display: true, width: 128, height: 64, scale: 4, format: 'mono1', title: 'OLED',
    });
    expectOk(target.flags.includes('-D HYDRA_NATIVE_WINDOW_W=128'));
    expectOk(target.flags.includes('-D HYDRA_NATIVE_WINDOW_SCALE=4'));
    expectOk(target.flags.some((f) => f.includes('HYDRA_NATIVE_WINDOW_TITLE')));
});

test('cel sprzętowy nie dostaje niczego natywnego', () => {
    const target = buildPlan(model).targets.find((t) => t.name === 'esp32s3-main')!;
    expectEqual(target.isNative, false);
    expectEqual(target.native, undefined);
    expectNoMatch(target.flags.join(' '), /HYDRA_FORCE_HOST|HYDRA_NATIVE/);
});

test('display: false daje cel bez okna', () => {
    const headless = HydraDocument.parse(SOURCE.replace(
        '    native:\n      window:', '    native:\n      display: false\n      window:')).toJS();
    const target = buildPlan(headless).targets.find((t) => t.name === 'podglad')!;
    expectEqual(target.native?.display, false);
    expectOk(target.flags.includes('-D HYDRA_NATIVE_HEADLESS=1'));
    expectNoMatch(target.flags.join(' '), /HYDRA_NATIVE_WINDOW_W/);
});

// --- PlatformIO ------------------------------------------------------------

test('platformio.ini pomija cel native i nie wskazuje go jako domyślnego', () => {
    // Domyślnym celem projektu jest „podglad", którego w tym pliku nie ma.
    // Wpisanie go dałoby „Unknown environment" przy każdym `pio run`.
    const ini = emitPlatformio(buildPlan(model));
    expectNoMatch(ini, /\[env:podglad\]/);
    expectMatch(ini, /default_envs = esp32s3-main/);
    expectMatch(ini, /\[env:esp32s3-main\]/);
});

test('projekt wyłącznie natywny nie dostaje default_envs', () => {
    const onlyNative = HydraDocument.parse(`
hydra: "0.4"
project: { name: okno, version: 0.1.0 }
targets:
  default: podglad
  podglad: { mcu: native }
`).toJS();
    expectNoMatch(emitPlatformio(buildPlan(onlyNative)), /default_envs/);
});

// --- CMake -----------------------------------------------------------------

test('CMakeLists dokłada backend hostowy i wyszukiwanie SDL', () => {
    const cmake = emitCMake(buildPlan(model));

    expectMatch(cmake, /if\(HYDRA_TARGET STREQUAL "podglad"\)/);
    expectMatch(cmake, /set\(HYDRA_TARGET_IS_NATIVE ON\)/);
    expectMatch(cmake, /src\/hal\/mock\/\*\.cpp/);
    expectMatch(cmake, /src\/gfx\/sdl\/\*\.cpp/);
    expectMatch(cmake, /find_package\(SDL2 CONFIG QUIET\)/);
    expectMatch(cmake, /HYDRA_WITH_SDL=1/);
});

test('brak SDL jest ostrzeżeniem, nie błędem konfiguracji', () => {
    // Ta sama budowa musi przejść w CI bez serwera X i na maszynie z monitorem.
    const cmake = emitCMake(buildPlan(model));
    expectMatch(cmake, /message\(WARNING/);
    expectNoMatch(cmake, /message\(FATAL_ERROR\s*\n?\s*"Hydra: nie znaleziono SDL2/);
});

test('backend modułu wybierany jest jawnie, bez mieszania atrap z Arduino', () => {
    // Wzorzec `*/` brał naraz net/arduino i net/mock — konsolidator zgłaszał
    // wtedy zduplikowany symbol w miejscu niezwiązanym z przyczyną.
    const cmake = emitCMake(buildPlan(model));
    // Wszystkie podkatalogi wchodzą do listy, a niewłaściwy backend wypada
    // filtrem — inaczej `media/elements/` i `minis/links/` nie trafiłyby
    // do budowy w ogóle.
    expectMatch(cmake, /src\/ui\/\*\/\*\.cpp/);
    expectMatch(cmake, /EXCLUDE REGEX "\/\(arduino\)\/"/);
    expectMatch(cmake, /EXCLUDE REGEX "\/\(mock\|sdl\)\/"/);
});

// --- presety ---------------------------------------------------------------

test('presety powstają dla wszystkich maszyn i wskazują cel natywny', () => {
    const json = emitCMakePresets(buildPlan(model))!;
    expectOk(json);
    const presets = JSON.parse(json);

    const names = presets.configurePresets.map((p: { name: string }) => p.name);
    expectOk(names.includes('native-win-arm64'));
    expectOk(names.includes('native-win-x64'));
    expectOk(names.includes('native-mac-arm64'));

    const arm = presets.configurePresets.find((p: { name: string }) => p.name === 'native-win-arm64');
    expectEqual(arm.cacheVariables.HYDRA_TARGET, 'podglad');
    expectEqual(arm.cacheVariables.VCPKG_TARGET_TRIPLET, 'arm64-windows');
    expectEqual(arm.condition.rhs, 'Windows');
    // Katalog osobny na maszynę — jedno drzewo bywa widziane przez dwa systemy.
    expectMatch(arm.binaryDir, /build\/native-win-arm64$/);

    const mac = presets.configurePresets.find((p: { name: string }) => p.name === 'native-mac-arm64');
    expectEqual(mac.cacheVariables.CMAKE_OSX_ARCHITECTURES, 'arm64');
});

test('projekt bez celu natywnego nie dostaje pliku presetów', () => {
    const hardwareOnly = HydraDocument.parse(`
hydra: "0.4"
project: { name: wsad, version: 0.1.0 }
targets:
  main: { mcu: esp32s3 }
`).toJS();
    expectEqual(emitCMakePresets(buildPlan(hardwareOnly)), null);
});

// --- artefakt --------------------------------------------------------------

test('nazwa artefaktu mówi, na czym się uruchomi', () => {
    // W katalogu pobranych plików leżą obok siebie wyniki z kilku sesji.
    expectEqual(artifactName('podglad', hostPlatform('win-arm64')!, true),
                'podglad-win-arm64.zip');
    expectEqual(artifactName('podglad', hostPlatform('mac-arm64')!, false),
                'podglad-mac-arm64');
});

test('archiwum ZIP daje się rozpakować i zachowuje treść', () => {
    const exe = Buffer.from('MZ' + 'x'.repeat(5000));
    const dll = Buffer.from('SDL2 ' + 'y'.repeat(3000));
    const zip = createZip([{ name: 'okienko.exe', data: exe }, { name: 'SDL2.dll', data: dll }]);

    // Sygnatura i liczba wpisów w rekordzie końcowym.
    expectEqual(zip.readUInt32LE(0), 0x04034b50);
    const eocd = zip.length - 22;
    expectEqual(zip.readUInt32LE(eocd), 0x06054b50);
    expectEqual(zip.readUInt16LE(eocd + 10), 2);

    // Pierwszy wpis rozpakowany z powrotem — sprawdza metodę i rozmiary,
    // a nie tylko to, że bajty w ogóle powstały.
    const nameLen = zip.readUInt16LE(26);
    const extraLen = zip.readUInt16LE(28);
    const method = zip.readUInt16LE(8);
    const compressedSize = zip.readUInt32LE(18);
    const start = 30 + nameLen + extraLen;
    const payload = zip.subarray(start, start + compressedSize);
    const restored = method === 8 ? inflateRawSync(payload) : payload;

    expectEqual(zip.subarray(30, 30 + nameLen).toString('utf8'), 'okienko.exe');
    expectEqual(restored.toString('utf8'), exe.toString('utf8'));
});

test('base64 wraca do bajtów bez psucia wartości powyżej 127', () => {
    // Zapis wprost z `atob` do Blob kodował te bajty w UTF-8 i każdy rósł
    // do dwóch — plik wykonywalny przestawał być plikiem wykonywalnym.
    const bytes = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, 0xff, 0xfe, 0x7f, 0x80]);
    const restored = decodeBase64(Buffer.from(bytes).toString('base64'));
    expectDeepEqual(Array.from(restored), Array.from(bytes));
});

// --- moduł minis -----------------------------------------------------------

test('moduł minis ma własną flagę i da się wyłączyć per cel', () => {
    // Niezależny od `net`: węzeł na końcu RS-485 nie ma stosu TCP/IP,
    // a bramka bez encji własnych używa sieci bez tego modułu.
    const withMinis = HydraDocument.parse(`
hydra: "0.4"
project: { name: brama, version: 0.1.0 }
targets:
  default: gw
  gw: { mcu: esp32s3 }
  node: { mcu: rp2040, modules: { net: off } }
modules:
  net: { profile: mqtt-wifi }
  minis:
    user: user1
    gateway: true
    links:
      - { kind: mqtt }
      - { kind: rs485, uart: 1, node: 0 }
`).toJS();

    const plan = buildPlan(withMinis);
    const gw = plan.targets.find((t) => t.name === 'gw')!;
    const node = plan.targets.find((t) => t.name === 'node')!;

    expectOk(gw.flags.includes('-D HYDRA_ENABLE_MINIS=1'));
    expectOk(gw.flags.includes('-D HYDRA_ENABLE_NET=1'));

    expectOk(node.flags.includes('-D HYDRA_ENABLE_MINIS=1'));
    expectNoMatch(node.flags.join(' '), /HYDRA_ENABLE_NET/);
});

test('moduł media dostaje flagę i opisuje pule oraz domeny', () => {
    const withMedia = HydraDocument.parse(`
hydra: "0.4"
project: { name: audio, version: 0.1.0 }
targets:
  main: { mcu: esp32s3 }
modules:
  media:
    audio: { sample_rate: 16000, format: s16, channels: 1, frames_per_block: 64 }
    pools:
      - { block_bytes: 128, count: 6, memory: internal }
    domains:
      - { name: capture, period_ms: 2, priority: high }
      - { name: slow, period_ms: 100, priority: low }
`).toJS();

    const target = buildPlan(withMedia).targets[0]!;
    expectOk(target.flags.includes('-D HYDRA_ENABLE_MEDIA=1'));
});

test('CMake zostawia main() aplikacji, zamiast oddawać je SDL-owi', () => {
    /*
     * Na Windows `SDL2main` podstawia własne `WinMain` i szuka `SDL_main` —
     * symbolu, który powstaje wyłącznie z `#define main SDL_main` w `<SDL.h>`.
     * Aplikacja Hydry dołącza `Hydra.h`, a nie SDL, bo SDL jest szczegółem
     * backendu wyświetlania; konsolidacja kończyła się więc `undefined symbol:
     * SDL_main`.
     *
     * `SDL_MAIN_HANDLED` zostawia zwykłe `main()` tam, gdzie jest — inaczej
     * niż wymaganie od każdej aplikacji, żeby dołączała nagłówek SDL.
     */
    const cmake = emitCMake(buildPlan(model));
    expectMatch(cmake, /SDL_MAIN_HANDLED/);
    expectNoMatch(cmake, /SDL2::SDL2main/, 'SDL2main przejmuje wejście programu');
});

test('moduł z podkatalogami trafia do budowy w całości', () => {
    // Regresja: emiter brał tylko `src/<moduł>/` i `src/<moduł>/<backend>/`,
    // więc dla `media` szukał nieistniejącego `media/mock/`, a `media/elements/`
    // i `media/sdl/` wypadały z budowy. Kompilacja przechodziła, a konsolidator
    // zgłaszał brak `FileSource`, `Gain` i `SdlAudioSink` — czyli wszystkiego,
    // czego projekt naprawdę używa.
    const withMedia = HydraDocument.parse(`
hydra: "0.4"
project: { name: player, version: 1.0.0 }
targets:
  default: podglad
  podglad: { mcu: native }
  esp32s3: { mcu: esp32s3 }
modules:
  media:
    audio: { sample_rate: 44100 }
`).toJS();

    const cmake = emitCMake(buildPlan(withMedia));

    expectMatch(cmake, /src\/media\/\*\/\*\.cpp/);
    // Katalog, którego nigdy nie było — jego obecność oznacza powrót błędu.
    expectNoMatch(cmake, /src\/media\/mock\/\*\.cpp/);
    expectNoMatch(cmake, /src\/media\/arduino\/\*\.cpp/);

    // Cel natywny odsiewa backend Arduino, sprzętowy — atrapy i SDL.
    expectMatch(cmake, /EXCLUDE REGEX "\/\(arduino\)\/"/);
    expectMatch(cmake, /EXCLUDE REGEX "\/\(mock\|sdl\)\/"/);
});
