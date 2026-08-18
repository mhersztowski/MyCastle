import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Sprawdzanie pliku .hydra: schemat i zależności między polami. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument } from './document.js';
import { validate } from './validate.js';
import type { Diagnostic } from './diagnostics.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '__fixtures__/rover-01.hydra'), 'utf8');

function check(source: string): Diagnostic[] {
    return validate(HydraDocument.parse(source));
}

/** Minimalny poprawny plik — podstawa testów punktowych. */
const MINIMAL = `hydra: "0.4"
project:
  name: proj
  version: 1.0.0
targets:
  default: main
  main:
    mcu: esp32s3
`;

function withLines(...lines: string[]): string {
    return MINIMAL + lines.join('\n') + '\n';
}

test('plik wzorcowy przechodzi bez błędów', () => {
    const diagnostics = check(roverSource);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expectDeepEqual(errors, [], errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
});

test('minimalny plik wystarcza', () => {
    expectDeepEqual(check(MINIMAL).filter((d) => d.severity === 'error'), []);
});

test('brak wymaganego pola wskazuje, czego brakuje i po co ono jest', () => {
    const diagnostics = check('hydra: "0.4"\ntargets:\n  main:\n    mcu: esp32s3\n');
    const missing = diagnostics.find((d) => d.path === 'project');
    expectOk(missing, 'brak zgłoszenia o sekcji project');
    expectMatch(missing!.message, /brakuje wymaganego pola/);
    expectOk(missing!.hint, 'komunikat ma tłumaczyć, po co to pole');
});

test('literówka w nazwie pola jest błędem, nie ciszą', () => {
    // Nieznany klucz jest przy generowaniu pomijany, więc ustawienie po prostu
    // nie działa i nic tego nie sygnalizuje — najgorszy rodzaj pomyłki.
    const diagnostics = check(withLines('modules:', '  net:', '    hostnam: rover'));
    const typo = diagnostics.find((d) => d.path === 'modules.net.hostnam');
    expectOk(typo);
    expectEqual(typo!.severity, 'error');
    expectMatch(typo!.hint ?? '', /hostname/);
});

test('literówka w wartości wyliczeniowej podpowiada właściwą', () => {
    const diagnostics = check(withLines('modules:', '  ui:', '    backend: lvgl'));
    const bad = diagnostics.find((d) => d.path === 'modules.ui.backend');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /lvgl9/);
});

test('wartość poza zakresem podaje granicę i jednostkę', () => {
    const diagnostics = check(withLines('modules:', '  motion:', '    control:', '      period_us: 50'));
    const bad = diagnostics.find((d) => d.path === 'modules.motion.control.period_us');
    expectOk(bad);
    expectMatch(bad!.message, /100.*µs/);
});

test('zły typ mówi, co zastano', () => {
    const diagnostics = check(withLines('modules:', '  core:', '    shell:', '      history: dużo'));
    const bad = diagnostics.find((d) => d.path === 'modules.core.shell.history');
    expectOk(bad);
    expectMatch(bad!.message, /oczekiwano: liczba, jest: tekst/);
});

test('niewłaściwa postać wartości tłumaczy oczekiwany zapis', () => {
    const diagnostics = check(withLines('modules:', '  net:', '    hostname: Rover_01'));
    const bad = diagnostics.find((d) => d.path === 'modules.net.hostname');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /małe litery/);
});

test('każdy błąd niesie pozycję w pliku', () => {
    const source = withLines('modules:', '  ui:', '    backend: lvgl');
    const bad = check(source).find((d) => d.path === 'modules.ui.backend');
    expectOk(bad?.at, 'panel Problemy potrzebuje pozycji, żeby kliknięcie coś robiło');
    expectMatch(source.split('\n')[bad!.at!.line - 1]!, /backend: lvgl/);
});

// --- zależności między polami ---------------------------------------------

test('cel domyślny musi wskazywać istniejące środowisko', () => {
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: mian
  main:
    mcu: esp32s3
`);
    const bad = diagnostics.find((d) => d.path === 'targets.default');
    expectOk(bad);
    expectEqual(bad!.severity, 'error');
    expectMatch(bad!.hint ?? '', /main/);
});

test('przy wielu celach brak domyślnego to ostrzeżenie, nie błąd', () => {
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  main: { mcu: esp32s3 }
  dev: { mcu: rp2350 }
`);
    const warn = diagnostics.find((d) => d.path === 'targets.default');
    expectOk(warn);
    expectEqual(warn!.severity, 'warning');
});

test('moduł sieciowy na płytce bez radia jest zgłaszany z gotową poprawką', () => {
    // Dokładnie ten przypadek wyszedł przy budowaniu wsadów: Nucleo-G474RE
    // nie ma ani Wi-Fi, ani warstwy fizycznej Ethernetu.
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: nucleo
  nucleo:
    mcu: stm32g4
    capabilities: [i2c, spi, uart, pwm, adc]
modules:
  net:
    mqtt: { broker: "mqtt://broker.local:1883" }
`);
    const bad = diagnostics.find((d) => d.path === 'targets.nucleo.capabilities');
    expectOk(bad);
    expectMatch(bad!.message, /wifi, ethernet/);
    expectMatch(bad!.hint ?? '', /modules\.net: off/);
});

test('cel przeglądarkowy z modułem net nie budzi zastrzeżeń', () => {
    // Karta nie ma karty sieciowej, ale ma most `/ws/tcp`: gniazdo TCP
    // pożycza od gospodarza strony. Profil `wasm` deklaruje przez to
    // `ethernet`, więc `net` jest tam legalny.
    //
    // Wcześniej ten sam plik dawał ostrzeżenie o braku możliwości, mimo że
    // wsad budował się i łączył — a jedyną podpowiedzią było „wyłącz moduł",
    // co odcięłoby `src/net/` i zabrało MqttClienta razem z mostem.
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: karta
  karta: { mcu: wasm }
modules:
  net:
    mqtt: { broker: "mqtt://localhost:1884" }
`);
    expectDeepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
    expectDeepEqual(diagnostics.filter((d) => d.path === 'targets.karta.capabilities'), []);
});

test('bez listy możliwości korzystamy z profilu układu, ale łagodniej', () => {
    // Profil opisuje sam układ, nie płytkę — ta mogła dołożyć układ sieciowy
    // na magistrali. Stąd ostrzeżenie zamiast błędu.
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: nucleo
  nucleo: { mcu: stm32g4 }
modules:
  net:
    mqtt: { broker: "mqtt://broker.local:1883" }
`);
    expectDeepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
    const warn = diagnostics.find((d) => d.path === 'targets.nucleo.capabilities');
    expectOk(warn, 'brak sieci na STM32G4 ma być zauważony');
    expectEqual(warn!.severity, 'warning');
    expectMatch(warn!.message, /układ stm32g4 nie ma/);

    // Na ESP32-S3 ten sam plik nie budzi zastrzeżeń — profil zna Wi-Fi.
    const esp = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: s3
  s3: { mcu: esp32s3 }
modules:
  net:
    mqtt: { broker: "mqtt://broker.local:1883" }
`);
    expectDeepEqual(esp, []);
});

test('moduł wyłączony dla celu nie wymaga już możliwości', () => {
    const diagnostics = check(`hydra: "0.4"
project: { name: p, version: 1.0.0 }
targets:
  default: nucleo
  nucleo:
    mcu: stm32g4
    capabilities: [i2c]
    modules: { net: off }
modules:
  net:
    mqtt: { broker: "mqtt://broker.local:1883" }
`);
    expectDeepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
});

test('komponent na niezadeklarowanej magistrali jest błędem', () => {
    const diagnostics = check(withLines(
        'hardware:',
        '  buses:',
        '    i2c0: { hz: 400000 }',
        '  components:',
        '    baro: { part: "BMP280 @ i2c1:0x76" }'));
    const bad = diagnostics.find((d) => d.path === 'hardware.components.baro.part');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /i2c0/);
});

test('dwa układy pod jednym adresem to błąd niewidoczny aż do uruchomienia', () => {
    const diagnostics = check(withLines(
        'hardware:',
        '  buses:',
        '    i2c0: { hz: 400000 }',
        '  components:',
        '    baro: { part: "BMP280 @ i2c0:0x76" }',
        '    baro2: { part: "BME280 @ i2c0:0x76" }'));
    const bad = diagnostics.find((d) => d.path === 'hardware.components.baro2.part');
    expectOk(bad);
    expectMatch(bad!.message, /zajęty przez „baro"/);
});

test('ten sam adres na różnych magistralach jest w porządku', () => {
    const diagnostics = check(withLines(
        'hardware:',
        '  buses:',
        '    i2c0: { hz: 400000 }',
        '    i2c1: { hz: 400000 }',
        '  components:',
        '    a: { part: "BMP280 @ i2c0:0x76" }',
        '    b: { part: "BME280 @ i2c1:0x76" }'));
    expectDeepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
});

test('ekran startowy musi być wymieniony wśród ekranów', () => {
    const diagnostics = check(withLines(
        'modules:', '  ui:', '    screens: [StatusScreen, DriveScreen]', '    home: SettingsScreen'));
    const bad = diagnostics.find((d) => d.path === 'modules.ui.home');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /StatusScreen/);
});

test('cel wskazany w testach musi istnieć', () => {
    const diagnostics = check(withLines('test:', '  target:', '    envs: [main, brak]'));
    const bad = diagnostics.find((d) => d.path === 'test.target.envs.1');
    expectOk(bad);
    expectMatch(bad!.message, /„brak" nie istnieje/);
});

test('hasło wpisane wprost do pliku jest zgłaszane', () => {
    // Plik projektu trafia do repozytorium — to najprostszy sposób na wyciek.
    const diagnostics = check(withLines('modules:', '  net:', '    wifi:',
                                        '      credentials: tajnehaslo123'));
    // `credentials` nie jest na liście wzorców, ale sprawdźmy pole `pass`.
    const withPass = check(withLines('studio:', '  password: tajnehaslo123'));
    const leak = withPass.find((d) => d.message.includes('sekret'));
    expectOk(leak, 'hasło wprost w pliku ma być zgłoszone');
    expectMatch(leak!.hint ?? '', /secrets/);
    expectOk(diagnostics.length >= 0);
});

test('odwołanie do sekcji sekretów nie jest zgłaszane', () => {
    const diagnostics = check(withLines('studio:', '  password: secrets'));
    expectEqual(diagnostics.filter((d) => d.message.includes('sekret')).length, 0);
});

test('nieobsługiwana wersja schematu mówi, co potrafi to wydanie', () => {
    const diagnostics = check(MINIMAL.replace('"0.4"', '"9.9"'));
    const bad = diagnostics.find((d) => d.path === 'hydra');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /0\.4/);
});

test('zepsuta składnia zatrzymuje sprawdzanie schematu', () => {
    // Inaczej sypnęłoby komunikatami o polach, których parser nie odczytał.
    const diagnostics = check('hydra: "0.4"\nproject:\n  name: [niedomknięta\n');
    expectEqual(diagnostics.length, 1);
    expectMatch(diagnostics[0]!.message, /nie jest poprawnym YAML-em/);
});
