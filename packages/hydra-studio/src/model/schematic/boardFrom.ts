/**
 * Nagłówek płytki ze schematu.
 *
 * To jest powód, dla którego schemat w ogóle jest w tym projekcie. Bez niego
 * `boards/*.hpp` pisze się ręcznie, a numer w kodzie i ścieżka na płytce są
 * dwoma niezależnymi zapisami tej samej rzeczy — rozjeżdżają się po pierwszej
 * poprawce, której ktoś nie przeniósł, i objawiają jako urządzenie, które się
 * kompiluje i nie działa.
 *
 * Tutaj numer wyprowadzenia bierze się z połączenia: sieć `I2C0_SDA` dotyka
 * pinu `IO8` mikrokontrolera, więc `HYDRA_BOARD_I2C0_SDA` to 8. Poprawka na
 * schemacie przenosi się do kodu przy następnym zapisie.
 */

import type { BoardSource, BusSource } from '../emit/board';
import { warning, type Diagnostic } from '../diagnostics';
import type { ComponentDefinition } from './hcomp';
import { parseNode, type Schematic } from './hsch';

export interface BoardFromSchematicOptions {
    definitions: Readonly<Record<string, ComponentDefinition>>;
    /** Nazwa płytki — trafia do `hal::board::name`. */
    boardName: string;
    /**
     * Oznaczenie układu, który jest mikrokontrolerem. Bez wskazania szukamy
     * jedynego układu, którego definicja ma wyprowadzenia z numerami.
     */
    mcuReference?: string;
}

export interface BoardFromSchematicResult {
    source: BoardSource | undefined;
    diagnostics: Diagnostic[];
}

export function boardFromSchematic(schematic: Schematic,
                                   options: BoardFromSchematicOptions): BoardFromSchematicResult {
    const diagnostics: Diagnostic[] = [];

    const mcu = findMcu(schematic, options);
    if (!mcu) {
        diagnostics.push(warning('components',
            'na schemacie nie ma układu z ponumerowanymi wyprowadzeniami',
            'nagłówek płytki powstaje z numerów pinów mikrokontrolera — dodaj go do schematu ' +
            'albo wskaż go jawnie'));
        return { source: undefined, diagnostics };
    }

    const gpioOf = new Map<string, number>();
    for (const pin of mcu.definition.pins) {
        if (typeof pin.gpio === 'number') gpioOf.set(pin.name, pin.gpio);
    }

    /** Numer wyprowadzenia mikrokontrolera podłączonego do danej sieci. */
    const mcuPinOn = (nodes: readonly string[]): { pin: string; gpio: number } | undefined => {
        for (const node of nodes) {
            const parsed = parseNode(node);
            if (!parsed || parsed.component !== mcu.reference) continue;
            const gpio = gpioOf.get(parsed.pin);
            if (gpio !== undefined) return { pin: parsed.pin, gpio };
        }
        return undefined;
    };

    const buses = new Map<string, BusSource>();
    const pins: { name: string; pin: number; comment?: string }[] = [];
    let led: BoardSource['led'];

    for (const [netName, net] of Object.entries(schematic.nets)) {
        const found = mcuPinOn(net.nodes);
        if (!found) {
            // Sieć bez udziału mikrokontrolera to zwykle zasilanie albo masa —
            // do nagłówka nic z niej nie wynika i to jest w porządku.
            if (net.bus !== undefined) {
                diagnostics.push(warning(`nets.${netName}`,
                    `sieć magistrali ${net.bus} nie dotyka mikrokontrolera`,
                    'bez tego połączenia nie wiadomo, które wyprowadzenie wpisać do nagłówka'));
            }
            continue;
        }

        if (net.bus !== undefined) {
            const role = net.role ?? roleFromPins(schematic, options.definitions, net.nodes);
            if (role === undefined) {
                diagnostics.push(warning(`nets.${netName}`,
                    `nie wiadomo, jaką rolę pełni ta sieć na magistrali ${net.bus}`,
                    'dopisz „role: sda" albo oznacz rolę w definicji układu'));
                continue;
            }
            const bus = buses.get(net.bus) ?? { id: net.bus, pins: {} };
            (bus.pins as Record<string, number>)[role] = found.gpio;
            buses.set(net.bus, bus);
            continue;
        }

        if (net.pin_name !== undefined) {
            pins.push({ name: net.pin_name, pin: found.gpio, comment: `${netName} — ${found.pin}` });
        }

        // Dioda rozpoznawana po nazwie sieci — to jedyna nazwa, którą framework
        // zna z góry, bo `hal::board::led` jest częścią jego API. Niezależnie od
        // `pin_name`: sieć diody stanu daje i `board::led`, i stałą Pin::…,
        // a nie jedno albo drugie.
        if (/^LED(_|$)/.test(netName) && led === undefined) {
            led = { pin: found.gpio };
        }
    }

    return {
        source: {
            name: options.boardName,
            ...(led !== undefined ? { led } : {}),
            buses: [...buses.values()].sort((a, b) => a.id.localeCompare(b.id)),
            pins: pins.sort((a, b) => a.name.localeCompare(b.name)),
        },
        diagnostics,
    };
}

function findMcu(schematic: Schematic, options: BoardFromSchematicOptions):
        { reference: string; definition: ComponentDefinition } | undefined {
    if (options.mcuReference) {
        const component = schematic.components[options.mcuReference];
        const definition = component ? options.definitions[component.part] : undefined;
        return definition ? { reference: options.mcuReference, definition } : undefined;
    }

    // Mikrokontroler poznajemy po tym, że jego wyprowadzenia mają numery —
    // czujnik ma SDA i SCL, ale numeruje je producent płytki, nie on.
    for (const [reference, component] of Object.entries(schematic.components)) {
        const definition = options.definitions[component.part];
        if (definition?.pins.some((pin) => typeof pin.gpio === 'number')) {
            return { reference, definition };
        }
    }
    return undefined;
}

/** Rola sieci wywnioskowana z wyprowadzeń układów peryferyjnych. */
function roleFromPins(schematic: Schematic, definitions: Readonly<Record<string, ComponentDefinition>>,
                      nodes: readonly string[]): string | undefined {
    for (const node of nodes) {
        const parsed = parseNode(node);
        const component = parsed ? schematic.components[parsed.component] : undefined;
        const definition = component ? definitions[component.part] : undefined;
        const pin = definition?.pins.find((p) => p.name === parsed!.pin);
        if (pin?.role) return pin.role;
    }
    return undefined;
}
