import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNotDeepEqual,
    expectOk,
} from '../testing/assert';

/** Symulacja funkcjonalna i odbiór telemetrii. */


import { sampleSource, sourcesFrom, timestepOf } from './runtime/simulation.js';
import {
    LineSplitter, RingBuffer, filterLogs, parseFields, parseLogLine,
} from './runtime/telemetry.js';

// --- symulacja -------------------------------------------------------------

test('ten sam czas i ziarno dają tę samą wartość', () => {
    // Symulacja, której nie da się powtórzyć, nie nadaje się do szukania
    // błędów — a po to głównie istnieje.
    const source = { model: 'atmosphere', p_hpa: 1013.2, noise: 0.5 } as const;
    const a = sampleSource(source, 5_000_000, { seed: 7 });
    const b = sampleSource(source, 5_000_000, { seed: 7 });
    expectDeepEqual(a, b);

    const other = sampleSource(source, 5_000_000, { seed: 8 });
    expectNotDeepEqual(a, other);
});

test('szum mieści się w zadanym zakresie', () => {
    const source = { model: 'atmosphere', p_hpa: 1000, noise: 2 } as const;
    for (let t = 0; t < 2_000_000; t += 37_000) {
        const [pressure] = sampleSource(source, t, { seed: 1 });
        expectOk(Math.abs(pressure! - 1000) <= 2, `ciśnienie poza zakresem: ${pressure}`);
    }
});

test('wartości stałe podaje się wprost jako pola', () => {
    expectDeepEqual(sampleSource({ model: 'constant', v: 7.4, a: 0.35 }, 0), [7.4, 0.35]);
});

test('narastanie wraca do początku po okresie', () => {
    // Piła, nie schodek — po okresie wartość zaczyna od nowa.
    const ramp = { model: 'ramp', from: 0, to: 100, period_s: 10 } as const;
    expectDeepEqual(sampleSource(ramp, 0), [0]);
    expectDeepEqual(sampleSource(ramp, 5_000_000), [50]);
    expectDeepEqual(sampleSource(ramp, 10_000_000), [0]);
});

test('przebieg sinusoidalny ma zadaną amplitudę i okres', () => {
    const sine = { model: 'sine', center: 10, amplitude: 5, period_s: 4 } as const;
    expectOk(Math.abs(sampleSource(sine, 0)[0]! - 10) < 1e-9);
    expectOk(Math.abs(sampleSource(sine, 1_000_000)[0]! - 15) < 1e-9);
    expectOk(Math.abs(sampleSource(sine, 3_000_000)[0]! - 5) < 1e-9);
});

test('odtwarzanie z pliku zatrzaskuje ostatnią próbkę', () => {
    // Czujnik też oddaje ostatni pomiar, a nie wartość pośrednią.
    const playback = [
        { t_us: 0, values: [1] },
        { t_us: 1_000_000, values: [2] },
        { t_us: 2_000_000, values: [3] },
    ];
    expectDeepEqual(sampleSource({ model: 'playback', file: 'x' }, 1_500_000, { playback }), [2]);
    expectDeepEqual(sampleSource({ model: 'playback', file: 'x' }, 9_000_000, { playback }), [3]);
});

test('brak danych do odtworzenia nie wywraca symulacji', () => {
    expectDeepEqual(sampleSource({ model: 'playback', file: 'brak' }, 1000), [0]);
});

test('można przewinąć w dowolne miejsce bez odtwarzania historii', () => {
    // Funkcja czysta — stan wewnętrzny by na to nie pozwolił.
    const sine = { model: 'sine', amplitude: 1, period_s: 6 } as const;
    const direct = sampleSource(sine, 4_000_000);
    let stepped: number[] = [];
    for (let t = 0; t <= 4_000_000; t += 1_000_000) stepped = sampleSource(sine, t);
    expectDeepEqual(direct, stepped);
});

test('odczytuje modele i krok czasu z pliku projektu', () => {
    const model = {
        simulation: {
            timestep_us: 500,
            sources: { baro: { model: 'atmosphere', p_hpa: 1013.2 }, zły: 'nie obiekt' },
        },
    };
    expectDeepEqual(Object.keys(sourcesFrom(model)), ['baro']);
    expectEqual(timestepOf(model), 500);
    expectEqual(timestepOf({}), 1000);
});

// --- telemetria ------------------------------------------------------------

test('rozbiera wiersz logu frameworka', () => {
    const line = parseLogLine('[W][net.mqtt] utracono połączenie', 100);
    expectEqual(line.level, 'warn');
    expectEqual(line.module, 'net.mqtt');
    expectEqual(line.text, 'utracono połączenie');
});

test('wiersz w nieznanej postaci zostaje widoczny', () => {
    // Monitor, który gubi nieznane komunikaty, jest gorszy od takiego,
    // który pokazuje wszystko — szuka się zwykle czegoś nieprzewidzianego.
    const line = parseLogLine('rst:0x1 (POWERON_RESET),boot:0x8', 0);
    expectEqual(line.level, undefined);
    expectMatch(line.text, /POWERON_RESET/);
});

test('rozbiera wyjście shella w postaci klucz=wartość', () => {
    // Ten sam format czyta harness testów sprzętowych.
    const fields = parseFields('taski: 5\ntasks=5\nstack_min=2048\nheap_free=180224\n');
    expectDeepEqual(fields, { tasks: '5', stack_min: '2048', heap_free: '180224' });
});

test('dzieli napływające bajty na całe wiersze', () => {
    // Port oddaje dane porcjami, które nie pokrywają się z wierszami.
    const splitter = new LineSplitter();
    expectDeepEqual(splitter.push('[I][app] za'), []);
    expectDeepEqual(splitter.push('czynam\n[I][app] gotowe\r\nnie'), ['[I][app] zaczynam', '[I][app] gotowe']);
    expectEqual(splitter.flush(), 'nie');
    expectEqual(splitter.flush(), undefined);
});

test('bufor nadpisuje najstarsze wpisy i liczy odrzucone', () => {
    // Bez licznika „widzę 500 wierszy" nie odróżnia się od „widzę wszystkie".
    const buffer = new RingBuffer<number>(3);
    for (let i = 1; i <= 5; i++) buffer.push(i);

    expectDeepEqual([...buffer.toArray()], [3, 4, 5]);
    expectEqual(buffer.droppedCount, 2);

    buffer.clear();
    expectEqual(buffer.length, 0);
    expectEqual(buffer.droppedCount, 0);
});

test('filtr monitora przepuszcza wiersze nierozpoznane', () => {
    const lines = [
        parseLogLine('[D][app] szczegół', 0),
        parseLogLine('[E][net] awaria', 1),
        parseLogLine('rst:0x1 boot', 2),
    ];
    const errors = filterLogs(lines, { minLevel: 'warn' });
    // Ślad po awarii zostaje, choć nie ma poziomu — to zwykle najważniejszy
    // wiersz na ekranie.
    expectDeepEqual(errors.map((l) => l.text), ['awaria', 'rst:0x1 boot']);
});

test('filtr szuka też po nazwie modułu', () => {
    const lines = [parseLogLine('[I][net.mqtt] ok', 0), parseLogLine('[I][ui] ok', 1)];
    expectEqual(filterLogs(lines, { query: 'mqtt' }).length, 1);
    expectEqual(filterLogs(lines, { query: '' }).length, 2);
});
