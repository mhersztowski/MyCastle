import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectNoMatch,
    expectNotEqual,
    expectOk,
} from '../testing/assert';

/** Schemat: format, reguły elektryczne, nagłówek płytki. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { HydraDocument } from './document.js';
import { emitBoardHeader } from './emit/board.js';
import { HCOMP_SCHEMA } from './schematic/hcomp.js';
import { HSCH_SCHEMA, netOfNode, parseNode, type Schematic } from './schematic/hsch.js';
import { checkSchematic } from './schematic/erc.js';
import { boardFromSchematic } from './schematic/boardFrom.js';
import { layoutSchematic } from './schematic/layout.js';
import { validateAgainst } from './validate.js';
import { DEFINITIONS } from './__fixtures__/schematic/definitions';

const here = dirname(fileURLToPath(import.meta.url));
const roverHsch = readFileSync(join(here, '__fixtures__/schematic/rover.hsch'), 'utf8');

function load(source: string): Schematic {
    return HydraDocument.parse(source).toJS() as Schematic;
}

const rover = load(roverHsch);
const erc = (schematic: Schematic, pullups?: string[]) =>
    checkSchematic(schematic, {
        definitions: DEFINITIONS,
        ...(pullups ? { externalPullups: pullups } : {}),
    });

// --- format ----------------------------------------------------------------

test('schemat wzorcowy przechodzi sprawdzenie formatu', () => {
    const diagnostics = validateAgainst(HydraDocument.parse(roverHsch), HSCH_SCHEMA);
    expectDeepEqual(diagnostics, [], diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n'));
});

test('oznaczenie układu musi mieć postać U1, DS1, R3', () => {
    const bad = validateAgainst(HydraDocument.parse(
        'hsch: "0.1"\ncomponents:\n  mikrokontroler: { part: x }\nnets: {}\n'), HSCH_SCHEMA);
    expectOk(bad.some((d) => d.path === 'components.mikrokontroler'));
});

test('węzeł musi mieć zapis „układ.wyprowadzenie"', () => {
    const bad = validateAgainst(HydraDocument.parse(
        'hsch: "0.1"\ncomponents:\n  U1: { part: x }\nnets:\n  N: { nodes: [U1] }\n'), HSCH_SCHEMA);
    expectOk(bad.some((d) => d.hint?.includes('U1.IO8')));
});

test('definicja układu wymaga rodzaju każdego wyprowadzenia', () => {
    const bad = validateAgainst(HydraDocument.parse(
        'hcomp: "0.1"\ncomponent: x\npins:\n  - { name: SDA }\n'), HCOMP_SCHEMA);
    expectOk(bad.some((d) => d.path === 'pins.0.kind'));
});

test('rozbiera i odnajduje węzły', () => {
    expectDeepEqual(parseNode('U1.IO8'), { component: 'U1', pin: 'IO8' });
    expectEqual(parseNode('U1'), undefined);
    expectEqual(netOfNode(rover, 'U2.SDA'), 'I2C0_SDA');
    expectEqual(netOfNode(rover, 'U2.NIEMA'), undefined);
});

// --- reguły elektryczne ----------------------------------------------------

test('poprawny schemat nie budzi zastrzeżeń', () => {
    const diagnostics = erc(rover);
    expectDeepEqual(diagnostics, [], diagnostics.map((d) => `${d.path}: ${d.message}`).join('\n'));
});

test('nieistniejące wyprowadzenie jest błędem z listą dostępnych', () => {
    const broken = load(roverHsch.replace('U2.SDA', 'U2.SDX'));
    const bad = erc(broken).find((d) => d.message.includes('SDX'));
    expectOk(bad);
    expectEqual(bad!.severity, 'error');
    expectMatch(bad!.hint ?? '', /VCC, GND, SDA, SCL, SDO/);
});

test('odwołanie do układu spoza schematu jest błędem', () => {
    const broken = load(roverHsch.replace('U2.SDA', 'U9.SDA'));
    expectOk(erc(broken).some((d) => d.message.includes('U9')));
});

test('niepodłączone wyprowadzenie jest wyłapywane', () => {
    // Zapomniana masa wyświetlacza — układ się nie odezwie, a na schemacie
    // wygląda to niewinnie.
    const broken = load(roverHsch.replace('U1.GND, U2.GND, DS1.GND', 'U1.GND, U2.GND'));
    const bad = erc(broken).find((d) => d.path === 'components.DS1');
    expectOk(bad);
    expectMatch(bad!.message, /niepodłączone wyprowadzenia: GND/);
});

test('wyprowadzenie oznaczone jako opcjonalne wolno zostawić', () => {
    // SDO wybiera adres i bywa zwarte na płytce modułu.
    expectOk(!erc(rover).some((d) => d.message.includes('SDO')));
});

test('dwa wyjścia na jednej sieci to zwarcie', () => {
    const broken = load(roverHsch.replace(
        'MOT_L_PWM:\n    nodes: [U1.IO17]',
        'MOT_L_PWM:\n    nodes: [U1.IO17, U1.IO48]'));
    const bad = erc(broken).find((d) => d.message.includes('dwa wyjścia'));
    expectOk(bad);
    expectEqual(bad!.severity, 'error');
    expectMatch(bad!.hint ?? '', /otwartego drenu/);
});

test('jedno wyprowadzenie w dwóch sieciach jest błędem', () => {
    const broken = load(roverHsch.replace(
        'MOT_L_PWM:\n    nodes: [U1.IO17]',
        'MOT_L_PWM:\n    nodes: [U1.IO17, U1.IO8]'));
    const bad = erc(broken).find((d) => d.message.includes('należy już do sieci'));
    expectOk(bad);
    expectMatch(bad!.message, /I2C0_SDA/);
});

test('sieć z jednym węzłem to ostrzeżenie, nie błąd', () => {
    // Bywa etapem pracy — ktoś dopiero prowadzi połączenie.
    const bad = erc(rover.constructor === Object
        ? load(roverHsch + '  LUZ:\n    nodes: [U1.IO21]\n')
        : rover).find((d) => d.path === 'nets.LUZ');
    expectOk(bad);
    expectEqual(bad!.severity, 'warning');
});

test('magistrala I²C bez podciągnięcia jest zgłaszana', () => {
    // Otwarty dren nie wystawi stanu wysokiego — magistrala nigdy nie ruszy,
    // a widać to dopiero oscyloskopem.
    const broken = load(roverHsch.replace(', R1.B', '').replace(', R2.B', ''));
    const bad = broken && erc(broken).find((d) => d.message.includes('podciągając'));
    expectOk(bad);
    expectEqual(bad!.severity, 'warning');
    expectMatch(bad!.hint ?? '', /pullups: internal/);
});

test('zadeklarowane podciągnięcie w projekcie wycisza to ostrzeżenie', () => {
    const broken = load(roverHsch.replace(', R1.B', '').replace(', R2.B', ''));
    expectOk(!erc(broken, ['i2c0']).some((d) => d.message.includes('podciągając')));
});

test('niekompletna magistrala jest błędem', () => {
    const broken = load(roverHsch.replace(/  I2C0_SCL:[\s\S]*?R2\.B\]\n/, ''));
    const bad = erc(broken).find((d) => d.message.includes('nie ma linii'));
    expectOk(bad);
    expectMatch(bad!.message, /scl/);
});

test('brak definicji układu mówi, czego dodać', () => {
    const broken = load(roverHsch.replace('part: bmp280', 'part: bme680'));
    const bad = erc(broken).find((d) => d.path === 'components.U2');
    expectOk(bad);
    expectMatch(bad!.hint ?? '', /\.hcomp/);
});

// --- nagłówek płytki -------------------------------------------------------

test('numery wyprowadzeń biorą się z połączeń, nie z ręcznego wpisu', () => {
    // Sedno całego formatu: sieć I2C0_SDA dotyka IO8, więc w nagłówku jest 8.
    const { source, diagnostics } = boardFromSchematic(rover,
        { definitions: DEFINITIONS, boardName: 'rover-s3' });

    expectDeepEqual(diagnostics, []);
    expectOk(source);
    const i2c = source!.buses.find((b) => b.id === 'i2c0')!;
    expectDeepEqual(i2c.pins, { sda: 8, scl: 9 });
});

test('nazwane sieci stają się stałymi Pin::…', () => {
    const { source } = boardFromSchematic(rover,
        { definitions: DEFINITIONS, boardName: 'rover-s3' });
    expectDeepEqual(source!.pins.map((p) => [p.name, p.pin]),
                     [['MotorLeftPwm', 17], ['StatusLed', 48]]);
});

test('dioda rozpoznawana jest po nazwie sieci', () => {
    // `hal::board::led` jest częścią API frameworka, więc to jedyna nazwa,
    // którą znamy z góry.
    // Usuwamy cały wiersz razem z wcięciem — sama nazwa pola zostawiłaby
    // osierocone spacje, a YAML wchłonąłby następną sieć do tej.
    const withoutName = roverHsch.replace(/^\s*pin_name: StatusLed\n/m, '');
    const { source } = boardFromSchematic(load(withoutName),
        { definitions: DEFINITIONS, boardName: 'rover-s3' });

    expectDeepEqual(source!.led, { pin: 48 });
    // Bez nazwy sieć daje tylko diodę, bez stałej Pin::…
    expectOk(!source!.pins.some((p) => p.name === 'StatusLed'));
});

test('mikrokontroler poznajemy po ponumerowanych wyprowadzeniach', () => {
    // Czujnik ma SDA i SCL, ale numeruje je producent płytki, nie on.
    const { source } = boardFromSchematic(rover,
        { definitions: DEFINITIONS, boardName: 'rover-s3' });
    expectOk(source);
});

test('schemat bez mikrokontrolera mówi, czego brakuje', () => {
    const bare: Schematic = {
        hsch: '0.1',
        components: { U2: { part: 'bmp280' } },
        nets: { N: { nodes: ['U2.SDA', 'U2.SCL'] } },
    };
    const { source, diagnostics } = boardFromSchematic(bare,
        { definitions: DEFINITIONS, boardName: 'x' });
    expectEqual(source, undefined);
    expectMatch(diagnostics[0]!.message, /ponumerowanymi wyprowadzeniami/);
});

test('sieć magistrali omijająca mikrokontroler jest zgłaszana', () => {
    const orphan = load(roverHsch.replace('nodes: [U1.IO8, U2.SDA', 'nodes: [U2.SDA'));
    const { diagnostics } = boardFromSchematic(orphan,
        { definitions: DEFINITIONS, boardName: 'x' });
    expectOk(diagnostics.some((d) => d.message.includes('nie dotyka mikrokontrolera')));
});

test('cała droga: schemat → nagłówek gotowy do kompilacji', () => {
    const { source } = boardFromSchematic(rover,
        { definitions: DEFINITIONS, boardName: 'rover-s3' });
    const header = emitBoardHeader(source!, undefined, 'rover-01');

    expectMatch(header, /#define HYDRA_BOARD_NAME "rover-s3"/);
    expectMatch(header, /#define HYDRA_BOARD_LED 48/);
    expectMatch(header, /#define HYDRA_BOARD_I2C0_SDA 8/);
    expectMatch(header, /#define HYDRA_BOARD_I2C0_SCL 9/);
    expectMatch(header, /constexpr ::hydra::hal::PinNum MotorLeftPwm = 17;/);
    // Żadnych nazw wariantu — nagłówek trafia też tam, gdzie nie ma Arduino.
    for (const line of header.split('\n').filter((l) => l.startsWith('#define'))) {
        expectNoMatch(line, /\b(LED_BUILTIN|P[A-H]\d+)\b/);
    }
});

// --- układ na płótnie ------------------------------------------------------

test('sieci rysowane są przez węzeł pośredni, nie każdy z każdym', () => {
    // Sieć zasilania z ośmioma odbiornikami dałaby 28 krawędzi zamiast ośmiu.
    const { nodes, edges } = layoutSchematic(rover, { definitions: DEFINITIONS });

    const netNodes = nodes.filter((n) => n.kind === 'net');
    expectEqual(netNodes.length, Object.keys(rover.nets).length);

    const power = edges.filter((e) => e.to === 'net:3V3');
    expectEqual(power.length, rover.nets['3V3']!.nodes.length);
});

test('układy zachowują położenie z pliku', () => {
    const { nodes } = layoutSchematic(rover, { definitions: DEFINITIONS, scale: 2 });
    const u1 = nodes.find((n) => n.id === 'U1')!;
    expectDeepEqual([u1.x, u1.y], [80, 80]);   // [40, 40] × 2
});

test('układy bez położenia nie nachodzą na siebie', () => {
    const bare = { hsch: '0.1', components: { U1: { part: 'bmp280' }, U2: { part: 'bmp280' } }, nets: {} };
    const { nodes } = layoutSchematic(bare, { definitions: DEFINITIONS });
    expectNotEqual(nodes[0]!.y, nodes[1]!.y);
});

test('zasilanie i masa idą po lewej, sygnały po prawej', () => {
    // Tak rysuje się schematy od zawsze — dzięki temu da się je czytać
    // bez śledzenia każdej linii.
    const { nodes } = layoutSchematic(rover, { definitions: DEFINITIONS });
    const ports = nodes.find((n) => n.id === 'U2')!.ports!;

    expectEqual(ports.find((p) => p.name === 'VCC')!.side, 'left');
    expectEqual(ports.find((p) => p.name === 'GND')!.side, 'left');
    expectEqual(ports.find((p) => p.name === 'SDA')!.side, 'right');
});

test('węzeł sieci ląduje między układami, które łączy', () => {
    const { nodes } = layoutSchematic(rover, { definitions: DEFINITIONS });
    const net = nodes.find((n) => n.id === 'net:I2C0_SDA')!;
    // Nie w punkcie zerowym — położenie policzone ze środka ciężkości.
    expectOk(net.x > 0 && net.y > 0);
});

test('układ jest powtarzalny — schemat wygląda tak samo za każdym razem', () => {
    const a = layoutSchematic(rover, { definitions: DEFINITIONS });
    const b = layoutSchematic(rover, { definitions: DEFINITIONS });
    expectDeepEqual(a, b);
});

test('podpis sieci odmienia się poprawnie', () => {
    const { nodes } = layoutSchematic(rover, { definitions: DEFINITIONS });
    expectMatch(nodes.find((n) => n.id === 'net:LED_STATUS')!.sublabel!, /1 połączenie$/);
    expectMatch(nodes.find((n) => n.id === 'net:3V3')!.sublabel!, /5 połączeń$/);
    expectMatch(nodes.find((n) => n.id === 'net:I2C0_SDA')!.sublabel!, /4 połączenia$/);
});
