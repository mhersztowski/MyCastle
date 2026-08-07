import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Zegar symulacji, przebiegi VCD, magistrala zdarzeń, wynik budowy. */


import { SimulationClock } from './runtime/clock.js';
import { signalsForBuses, writeVcd } from './runtime/vcd.js';
import { eventsToVcd, injectCommand, parseEvent, topicsSeen } from './runtime/eventbus.js';
import { formatUsage, parseBuildOutput, parseCompilerMessages } from './runtime/buildOutput.js';
import { checkHil, hilConfigFrom } from './runtime/hil.js';

// --- zegar -----------------------------------------------------------------

test('zatrzymany zegar nie posuwa się', () => {
    const clock = new SimulationClock(1000);
    expectDeepEqual(clock.advance(100), []);
    expectEqual(clock.state.t_us, 0);
});

test('prędkość mnoży liczbę kroków, nie zmienia ich wielkości', () => {
    // Przy 10× nie liczymy szybciej — na klatkę przypada dziesięć razy więcej
    // kroków. Dzięki temu przebieg jest ten sam niezależnie od obciążenia.
    const normal = new SimulationClock(1000);
    normal.start();
    expectEqual(normal.advance(10).length, 10);

    const fast = new SimulationClock(1000);
    fast.start();
    fast.setSpeed(10);
    expectEqual(fast.advance(10).length, 100);
    // Chwile są wielokrotnościami kroku w obu przypadkach.
    expectEqual(fast.state.t_us % 1000, 0);
});

test('reszta niepełnego kroku jest przenoszona, nie zaokrąglana', () => {
    // Przy 60 klatkach na sekundę i kroku 1 ms zaokrąglanie gubiłoby co czwarty
    // krok i symulacja zostawałaby w tyle o kilkanaście procent.
    const clock = new SimulationClock(1000);
    clock.start();

    let steps = 0;
    for (let i = 0; i < 60; i++) steps += clock.advance(16.667).length;

    // Sekunda czasu rzeczywistego to tysiąc kroków po milisekundzie.
    expectOk(Math.abs(steps - 1000) <= 1, `kroków: ${steps}`);
});

test('przewinięcie nie wymaga odtwarzania tego, co pomiędzy', () => {
    const clock = new SimulationClock(1000);
    clock.seek(5_000_000);
    expectEqual(clock.state.t_us, 5_000_000);
    clock.seek(-10);
    expectEqual(clock.state.t_us, 0);
});

test('długa przerwa jest przeskakiwana, nie nadrabiana krok po kroku', () => {
    // Po powrocie z uśpionej karty upłynęły minuty; nadrabianie ich zawiesiłoby
    // przeglądarkę na kilkanaście sekund.
    const clock = new SimulationClock(1000);
    clock.start();

    const times = clock.advance(60_000);
    expectOk(times.length <= 1000, `kroków w jednym wywołaniu: ${times.length}`);
    expectOk(clock.skippedSteps > 0, 'pominięcie ma być policzone, nie przemilczane');
    // Czas i tak dobiega właściwej chwili — nie zostajemy w przeszłości.
    expectEqual(clock.state.t_us, 60_000_000);
});

// --- przebiegi -------------------------------------------------------------

test('składa poprawny plik VCD', () => {
    const signals = [
        { name: 'i2c0_sda', width: 1, scope: 'i2c0' },
        { name: 'i2c0_scl', width: 1, scope: 'i2c0' },
    ];
    const vcd = writeVcd(signals, [
        { t_us: 0, signal: 'i2c0_scl', value: 1 },
        { t_us: 10, signal: 'i2c0_sda', value: 0 },
        { t_us: 10, signal: 'i2c0_scl', value: 0 },
    ], { date: '2026-08-07' });

    expectMatch(vcd, /\$timescale 1us \$end/);
    expectMatch(vcd, /\$scope module i2c0 \$end/);
    expectMatch(vcd, /\$var wire 1 . i2c0_sda \$end/);
    expectMatch(vcd, /\$enddefinitions \$end/);

    // Znacznik czasu pojawia się raz na chwilę, nie raz na zmianę.
    expectEqual((vcd.match(/^#10$/gm) ?? []).length, 1);
});

test('stan początkowy jest nieznany, a nie zerowy', () => {
    // Zero od chwili zerowej byłoby twierdzeniem, którego nie sprawdziliśmy.
    const vcd = writeVcd([{ name: 'a', width: 1 }], []);
    expectMatch(vcd, /\$dumpvars\nx./);
});

test('zapisujemy zmiany, nie każdą próbkę', () => {
    // I²C przy 400 kHz to milion próbek na sekundę, z czego zmienia się garstka.
    const changes = [{ t_us: 0, signal: 'a', value: 1 }, { t_us: 1000, signal: 'a', value: 0 }];
    const vcd = writeVcd([{ name: 'a', width: 1 }], changes);
    expectEqual((vcd.match(/^#\d+$/gm) ?? []).length, 2);
});

test('wartości wielobitowe zapisywane są jako wektory', () => {
    const vcd = writeVcd([{ name: 'temp', width: 16 }], [{ t_us: 0, signal: 'temp', value: 215 }]);
    expectMatch(vcd, /b11010111 ./);
});

test('linie magistral wynikają z jej rodzaju', () => {
    expectDeepEqual(signalsForBuses(['i2c0']).map((s) => s.name), ['i2c0_sda', 'i2c0_scl']);
    expectEqual(signalsForBuses(['spi1']).length, 4);
    expectDeepEqual(signalsForBuses(['uart1']).map((s) => s.name), ['uart1_tx', 'uart1_rx']);
});

// --- magistrala zdarzeń ----------------------------------------------------

test('rozbiera zdarzenie ze strumienia', () => {
    const event = parseEvent('EV sense/sample 21.5 1013.2', 100)!;
    expectEqual(event.topic, 'sense/sample');
    expectDeepEqual(event.values, [21.5, 1013.2]);
});

test('wiersz niebędący zdarzeniem nie trafia do panelu zdarzeń', () => {
    // Panel pokazujący śmieci z portu byłby gorszy od pustego — widać je
    // w monitorze, który po to jest.
    expectEqual(parseEvent('[I][app] gotowe', 0), undefined);
    expectEqual(parseEvent('rst:0x1 boot', 0), undefined);
});

test('wstrzyknięcie sprawdza temat, zanim poleci do urządzenia', () => {
    // Temat ze spacją rozpadłby się na dwa argumenty i shell wykonałby coś
    // innego, niż użytkownik zamierzał.
    expectEqual(injectCommand('sense/sample', [21.5]), 'ev inject sense/sample 21.5');
    expectEqual(injectCommand('sense sample', [1]), undefined);
    expectEqual(injectCommand('sense/sample', [Number.NaN]), undefined);
    expectEqual(injectCommand('sys/tick', []), 'ev inject sys/tick');
});

test('podpowiada tematy widziane w strumieniu', () => {
    const events = ['EV b 1', 'EV a 2', 'EV b 3'].map((line, i) => parseEvent(line, i)!);
    expectDeepEqual(topicsSeen(events), ['a', 'b']);
});

test('zdarzenia trafiają na tę samą oś czasu co sygnały magistral', () => {
    // Dzięki temu widać, że pomiar spadł dokładnie wtedy, gdy magistrala
    // się zacięła.
    const events = [parseEvent('EV sense/baro 1013', 1000)!, parseEvent('EV sense/baro 1010', 1500)!];
    const { signals, changes } = eventsToVcd(events, 1000);

    expectDeepEqual(signals.map((s) => s.name), ['ev_sense_baro']);
    expectDeepEqual(changes.map((c) => c.t_us), [0, 500_000]);
    expectDeepEqual(changes.map((c) => c.value), [1013, 1010]);
});

// --- wynik budowy ----------------------------------------------------------

const BUILD_OK = `Compiling .pio/build/main/src/main.cpp.o
Linking .pio/build/main/firmware.elf
RAM:   [=         ]   7.6% (used 24876 bytes from 327680 bytes)
Flash: [=         ]  10.0% (used 333141 bytes from 3342336 bytes)
========================= [SUCCESS] Took 9.10 seconds =========================
main   SUCCESS   00:00:09.100`;

test('odczytuje zajętość pamięci do paska stanu', () => {
    const summary = parseBuildOutput(BUILD_OK);
    expectEqual(summary.ok, true);
    expectDeepEqual(summary.ram, { used: 24876, total: 327680, percent: 7.6 });
    expectDeepEqual(summary.flash, { used: 333141, total: 3342336, percent: 10 });
    expectEqual(summary.environment, 'main');
    expectEqual(summary.durationMs, 9100);
});

test('nieudana budowa jest odróżniana od udanej', () => {
    const summary = parseBuildOutput('src/main.cpp:22:10: error: coś\n[FAILED] Took 1.00 seconds');
    expectEqual(summary.ok, false);
});

test('komunikaty kompilatora niosą miejsce, żeby dało się tam przejść', () => {
    const messages = parseCompilerMessages(
        "src/main.cpp:22:10: error: 'hydra::hal::Hal' has not been declared\n" +
        'lib/x.hpp:5:1: warning: nieużywana zmienna\n' +
        'src/main.cpp:22:10: note: w rozwinięciu makra');

    expectEqual(messages.length, 3);
    expectDeepEqual(messages[0], {
        file: 'src/main.cpp', line: 22, column: 10, severity: 'error',
        text: "'hydra::hal::Hal' has not been declared",
    });
    expectEqual(messages[1]!.severity, 'warning');
});

test('zajętość formatuje się po polsku', () => {
    expectEqual(formatUsage('Flash', parseBuildOutput(BUILD_OK).flash), 'Flash 10,0%');
    expectEqual(formatUsage('RAM', undefined), 'RAM');
});

// --- farma testowa ---------------------------------------------------------

const HIL_MODEL = {
    test: {
        hil: {
            runner: 'proxmox-hil',
            fixtures: {
                'esp32s3-main': { probe: 'usb-jtag', power: 'uhubctl -l 1-1 -p 2', shield: 'selftest-v2' },
                'pico2-dev': { probe: 'debugprobe' },
            },
            suites: {
                smoke: { on: 'push', timeout_s: 120 },
                soak: { on: 'nightly', duration_h: 8, monitor: ['heap_hwm', 'stack_hwm'] },
            },
        },
    },
};

test('odczytuje stanowiska i zestawy z pliku projektu', () => {
    const config = hilConfigFrom(HIL_MODEL)!;
    expectEqual(config.runner, 'proxmox-hil');
    expectDeepEqual(config.fixtures.map((f) => f.target), ['esp32s3-main', 'pico2-dev']);
    expectEqual(config.fixtures[0]!.shield, 'selftest-v2');
    expectDeepEqual(config.suites.map((s) => s.name), ['smoke', 'soak']);
    expectDeepEqual(config.suites[1]!.monitor, ['heap_hwm', 'stack_hwm']);
});

test('projekt bez farmy nie daje konfiguracji', () => {
    expectEqual(hilConfigFrom({}), undefined);
});

test('stanowisko dla nieistniejącego celu jest błędem', () => {
    // Inaczej wychodzi to dopiero wtedy, gdy nocny przebieg nie ruszy.
    const bad = checkHil(hilConfigFrom(HIL_MODEL)!, ['esp32s3-main']);
    const missing = bad.find((d) => d.path.includes('pico2-dev'));
    expectOk(missing);
    expectEqual(missing!.severity, 'error');
});

test('stanowisko bez odcięcia zasilania to ostrzeżenie', () => {
    // Bez tego nie da się sprawdzić zachowania po zaniku napięcia,
    // a to najczęstsza awaria w terenie.
    const warnings = checkHil(hilConfigFrom(HIL_MODEL)!, ['esp32s3-main', 'pico2-dev']);
    const warn = warnings.find((d) => d.path.includes('pico2-dev'));
    expectOk(warn);
    expectEqual(warn!.severity, 'warning');
    expectMatch(warn!.hint ?? '', /zaniku napięcia/);
});

test('zestaw bez ograniczenia czasu zająłby farmę do rana', () => {
    const config = hilConfigFrom({ test: { hil: { runner: 'r', fixtures: { t: { power: 'x' } },
                                                  suites: { luzny: { on: 'push' } } } } })!;
    const bad = checkHil(config, ['t']).find((d) => d.path.includes('luzny'));
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /timeout_s/);
});

test('nieznany wyzwalacz podaje dozwolone', () => {
    const config = hilConfigFrom({ test: { hil: { fixtures: { t: { power: 'x' } },
                                                  suites: { s: { on: 'zawsze', timeout_s: 10 } } } } })!;
    const bad = checkHil(config, ['t']).find((d) => d.path.includes('.on'));
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /nightly/);
});
