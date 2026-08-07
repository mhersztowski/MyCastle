import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNoMatch,
    expectOk,
} from '../testing/assert';

/** Przydział wyprowadzeń i import z narzędzi zewnętrznych. */


import { assignPins, netsFromAssignments } from './schematic/pins.js';
import { importEasyEda, importKiCadNetlist } from './schematic/import.js';
import type { ComponentDefinition } from './schematic/hcomp.js';
import type { Schematic } from './schematic/hsch.js';
import { DEFINITIONS } from './__fixtures__/schematic/definitions';

const MCU = DEFINITIONS['esp32-s3-devkitc-1']!;

const DRV8833: ComponentDefinition = {
    hcomp: '0.1', component: 'drv8833', name: 'DRV8833',
    pins: [
        { name: 'VM', kind: 'power_in' },
        { name: 'GND', kind: 'ground' },
        { name: 'AIN1', kind: 'input' },
        { name: 'AIN2', kind: 'input' },
        { name: 'BIN1', kind: 'input' },
        { name: 'BIN2', kind: 'input' },
        { name: 'FAULT', kind: 'output', optional: true },
    ],
};

const bare: Schematic = {
    hsch: '0.1',
    components: { U1: { part: 'esp32-s3-devkitc-1' } },
    nets: {},
};

// --- przydział wyprowadzeń -------------------------------------------------

test('dobiera wolne wyprowadzenia dla układu bez magistrali', () => {
    // Sterownik silnika potrzebuje czterech osobnych pinów — nikt nie wskaże
    // ich za użytkownika bez wiedzy o płytce.
    const result = assignPins(DRV8833, { mcu: MCU, mcuReference: 'U1', schematic: bare });

    expectDeepEqual(result.problems, []);
    expectDeepEqual(result.assignments.map((a) => a.pin), ['AIN1', 'AIN2', 'BIN1', 'BIN2']);
    // Piny w kolejności numerów — tak zwykle leżą obok siebie na złączu.
    expectDeepEqual(result.assignments.map((a) => a.gpio), [8, 9, 17, 21]);

    // FAULT jest wyjściem sterownika i nie trafi na wyjście mikrokontrolera:
    // to byłoby zwarcie, które reguły elektryczne i tak by zgłosiły. Zostaje
    // nieprzydzielone, ale bez zastrzeżeń — jest opcjonalne.
    expectDeepEqual(result.unassigned, ['FAULT']);
});

test('zasilanie i masa nie zajmują wyprowadzeń mikrokontrolera', () => {
    const result = assignPins(DRV8833, { mcu: MCU, mcuReference: 'U1', schematic: bare });
    expectOk(!result.assignments.some((a) => a.pin === 'VM' || a.pin === 'GND'));
});

test('pomija wyprowadzenia już zajęte na schemacie', () => {
    const used: Schematic = {
        hsch: '0.1',
        components: { U1: { part: 'esp32-s3-devkitc-1' }, U2: { part: 'bmp280' } },
        nets: { I2C0_SDA: { nodes: ['U1.IO8', 'U2.SDA'] }, I2C0_SCL: { nodes: ['U1.IO9', 'U2.SCL'] } },
    };
    const result = assignPins(DRV8833, { mcu: MCU, mcuReference: 'U1', schematic: used });
    expectOk(!result.assignments.some((a) => a.gpio === 8 || a.gpio === 9));
});

test('brak wolnych wyprowadzeń jest zgłaszany, a nie zgadywany', () => {
    const full: Schematic = {
        hsch: '0.1',
        components: { U1: { part: 'esp32-s3-devkitc-1' } },
        nets: {
            A: { nodes: ['U1.IO8'] }, B: { nodes: ['U1.IO9'] },
            C: { nodes: ['U1.IO17'] }, D: { nodes: ['U1.IO48'] },
        },
    };
    const result = assignPins(DRV8833, { mcu: MCU, mcuReference: 'U1', schematic: full });
    expectOk(result.unassigned.length > 0);
    expectMatch(result.problems[0]!, /zabrakło wolnych wyprowadzeń/);
    // Wyprowadzenie opcjonalne nie trafia do zgłoszenia — po to jest opcjonalne.
    expectNoMatch(result.problems[0]!, /FAULT/);
});

test('nazwy sieci i stałych powstają z przedrostka', () => {
    const result = assignPins(DRV8833, {
        mcu: MCU, mcuReference: 'U1', schematic: bare, prefix: 'MOT_L',
    });
    const first = result.assignments[0]!;
    expectEqual(first.net, 'MOT_L_AIN1');
    expectEqual(first.pinName, 'MotLAin1');
});

test('przydział zamienia się na sieci gotowe do dopisania', () => {
    const result = assignPins(DRV8833, {
        mcu: MCU, mcuReference: 'U1', schematic: bare, prefix: 'MOT_L',
    });
    const nets = netsFromAssignments(result.assignments, 'U3', 'U1');

    const [name, net] = nets[0]!;
    expectEqual(name, 'MOT_L_AIN1');
    expectDeepEqual(net.nodes, ['U1.IO8', 'U3.AIN1']);
    // `pin_name` sprawia, że nagłówek płytki od razu da Pin::MotLAin1.
    expectEqual(net.pin_name, 'MotLAin1');
});

// --- import z KiCada -------------------------------------------------------

const KICAD = `(export (version "E")
  (components
    (comp (ref "U1") (value "ESP32-S3-DevKitC-1") (footprint "Module:ESP32"))
    (comp (ref "U2") (value "BMP280"))
    (comp (ref "R1") (value "4.7k")))
  (nets
    (net (code "1") (name "GND")
      (node (ref "U1") (pin "2") (pinfunction "GND"))
      (node (ref "U2") (pin "1") (pinfunction "GND")))
    (net (code "2") (name "/I2C0_SDA")
      (node (ref "U1") (pin "8") (pinfunction "IO8"))
      (node (ref "U2") (pin "3") (pinfunction "SDA"))
      (node (ref "R1") (pin "2") (pinfunction "B")))
    (net (code "3") (name "Net-(U1-Pad9)")
      (node (ref "U1") (pin "9") (pinfunction "IO9")))))`;

test('wczytuje układy i sieci z netlisty KiCada', () => {
    const { schematic } = importKiCadNetlist(KICAD);

    expectDeepEqual(Object.keys(schematic.components).sort(), ['R1', 'U1', 'U2']);
    expectEqual(schematic.components['U2']!.value, 'BMP280');
    expectDeepEqual(schematic.nets['I2C0_SDA']!.nodes, ['U1.IO8', 'U2.SDA', 'R1.B']);
});

test('używa nazw wyprowadzeń, nie numerów nóżek', () => {
    // Definicja układu w Hydrze mówi „SDA", a nie „3" — bez tego reguły
    // elektryczne nie miałyby czego dopasować.
    const { schematic } = importKiCadNetlist(KICAD);
    expectOk(schematic.nets['I2C0_SDA']!.nodes.every((node) => !/\.\d+$/.test(node)));
});

test('rozpoznaje sieci zasilania i masy', () => {
    const { schematic } = importKiCadNetlist(KICAD);
    expectEqual(schematic.nets['GND']!.class, 'ground');
});

test('nazwy nienadające się do zapisu są porządkowane', () => {
    const { schematic } = importKiCadNetlist(KICAD);
    // `Net-(U1-Pad9)` nie przeszłoby sprawdzenia formatu .hsch.
    expectOk(Object.keys(schematic.nets).includes('NET_U1_PAD9'),
              `nazwy: ${Object.keys(schematic.nets).join(', ')}`);
});

test('import mówi wprost, że paczek nie zgadł', () => {
    // Zgadywanie dałoby schemat wyglądający na gotowy i generujący zły nagłówek.
    const { diagnostics, unknownParts } = importKiCadNetlist(KICAD);
    expectOk(unknownParts.length > 0);
    const note = diagnostics.find((d) => d.message.includes('wymaga wskazania paczki'));
    expectOk(note);
    expectMatch(note!.hint ?? '', /nazwę paczki Hydry/);
});

test('pusty plik nie udaje udanego importu', () => {
    const { diagnostics } = importKiCadNetlist('(export (version "E"))');
    expectOk(diagnostics.some((d) => d.message.includes('nie znalazł żadnych układów')));
});

// --- import z EasyEDA ------------------------------------------------------

const EASYEDA = JSON.stringify({
    nets: [
        { name: 'GND', pins: [
            { designator: 'U1', name: 'GND', part: 'ESP32-S3' },
            { designator: 'U2', name: 'GND', part: 'BMP280' }] },
        { name: 'I2C0_SDA', pins: [
            { designator: 'U1', name: 'IO8', part: 'ESP32-S3' },
            { designator: 'U2', name: 'SDA', part: 'BMP280' }] },
    ],
});

test('wczytuje netlistę EasyEDA', () => {
    const { schematic } = importEasyEda(EASYEDA);
    expectDeepEqual(Object.keys(schematic.components).sort(), ['U1', 'U2']);
    expectDeepEqual(schematic.nets['I2C0_SDA']!.nodes, ['U1.IO8', 'U2.SDA']);
    expectEqual(schematic.components['U2']!.part, 'bmp280');
});

test('plik projektu zamiast netlisty daje czytelny komunikat', () => {
    // Najczęstsza pomyłka: wyeksportowanie nie tego pliku.
    const { diagnostics } = importEasyEda(JSON.stringify({ schematics: [] }));
    expectMatch(diagnostics[0]!.message, /nie rozpoznano formatu/);
    expectMatch(diagnostics[0]!.hint ?? '', /Export → Netlist/);
});

test('zepsuty JSON nie wywraca importu', () => {
    const { diagnostics, schematic } = importEasyEda('{ niepoprawny');
    expectMatch(diagnostics[0]!.message, /nie jest poprawnym JSON-em/);
    expectDeepEqual(schematic.components, {});
});

test('elementy bierne rozpoznaje się po oznaczeniu, nie po wartości', () => {
    // Bez tego wartość rezystora lądowała jako nazwa paczki: „4-7k".
    const { schematic, unknownParts } = importKiCadNetlist(KICAD);
    expectEqual(schematic.components['R1']!.part, 'resistor');
    expectEqual(schematic.components['R1']!.value, '4.7k');
    // I nie trafia na listę do uzupełnienia — tę nazwę znamy.
    expectOk(!unknownParts.includes('resistor'));
    expectOk(unknownParts.includes('bmp280'));
});

test('zaimportowany schemat przechodzi sprawdzenie formatu', () => {
    // Najpewniejszy test importu: wynik musi być poprawnym plikiem .hsch.
    const { schematic } = importKiCadNetlist(KICAD);
    for (const name of Object.keys(schematic.nets)) {
        expectMatch(name, /^[A-Z0-9_+.-]+$/, `nazwa sieci nie do zapisu: ${name}`);
    }
    for (const [reference, component] of Object.entries(schematic.components)) {
        expectMatch(reference, /^[A-Z]+[0-9]+$/);
        expectMatch(component.part, /^[a-z0-9][a-z0-9-]*$/, `nazwa paczki: ${component.part}`);
    }
    for (const net of Object.values(schematic.nets)) {
        for (const node of net.nodes) expectMatch(node, /^[A-Z]+[0-9]+\.[A-Za-z0-9_+-]+$/);
    }
});
