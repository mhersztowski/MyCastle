/**
 * Przydział wyprowadzeń dla układów niepodłączonych do magistrali.
 *
 * Czujnik I²C wystarczy dopiąć do istniejącej magistrali — adres wybiera się
 * sam. Sterownik silnika potrzebuje czterech osobnych wyprowadzeń i nikt nie
 * wskaże ich za użytkownika bez wiedzy o płytce. Ta warstwa dobiera je
 * z definicji mikrokontrolera: bierze piny wolne, pasujące do roli i — o ile
 * to możliwe — leżące obok siebie, bo tak się je potem lutuje.
 *
 * Wynik jest propozycją, nie decyzją: Studio pokazuje ją przed zatwierdzeniem,
 * a użytkownik może każdy pin zmienić. Automat ma oszczędzić klikania,
 * a nie odebrać wybór.
 */

import type { ComponentDefinition, ComponentPin } from './hcomp';
import { parseNode, type Schematic } from './hsch';

export interface PinAssignment {
    /** Wyprowadzenie układu, np. „AIN1". */
    pin: string;
    /** Wyprowadzenie mikrokontrolera, np. „IO17". */
    mcuPin: string;
    gpio: number;
    /** Proponowana nazwa sieci, np. „MOT_L_A1". */
    net: string;
    /** Nazwa w kodzie, np. „MotorLeftA1". */
    pinName: string;
}

export interface AssignmentResult {
    assignments: PinAssignment[];
    /** Wyprowadzenia, dla których nie starczyło wolnych pinów. */
    unassigned: string[];
    /** Czego zabrakło — do pokazania użytkownikowi. */
    problems: string[];
}

export interface AssignOptions {
    /** Definicja mikrokontrolera — z niej biorą się numery i możliwości. */
    mcu: ComponentDefinition;
    /** Oznaczenie mikrokontrolera na schemacie. */
    mcuReference: string;
    /** Schemat — z niego wiadomo, co jest już zajęte. */
    schematic: Schematic;
    /** Przedrostek nazw sieci i stałych, np. „MOT_L" / „MotorLeft". */
    prefix?: string;
}

/**
 * Dobiera wyprowadzenia dla wszystkich pinów układu, które nie należą
 * do żadnej magistrali.
 */
export function assignPins(component: ComponentDefinition,
                           options: AssignOptions): AssignmentResult {
    const taken = takenPins(options.schematic, options.mcuReference);
    const free = options.mcu.pins
        .filter((pin) => typeof pin.gpio === 'number' && !taken.has(pin.name))
        // Kolejność po numerze, nie po zapisie w definicji: piny obok siebie
        // w numeracji zwykle leżą obok siebie na złączu.
        .sort((a, b) => (a.gpio ?? 0) - (b.gpio ?? 0));

    const needed = component.pins.filter((pin) => pin.bus === undefined && needsGpio(pin));

    const assignments: PinAssignment[] = [];
    const unassigned: string[] = [];
    const problems: string[] = [];

    const prefix = options.prefix ?? component.component.toUpperCase().replace(/-/g, '_');
    const namePrefix = pascal(options.prefix ?? component.component);

    for (const pin of needed) {
        const candidate = free.find((mcuPin) => suitableFor(mcuPin, pin));
        if (!candidate) {
            unassigned.push(pin.name);
            continue;
        }
        free.splice(free.indexOf(candidate), 1);

        assignments.push({
            pin: pin.name,
            mcuPin: candidate.name,
            gpio: candidate.gpio!,
            net: `${prefix}_${pin.name.toUpperCase()}`,
            pinName: `${namePrefix}${pascal(pin.name)}`,
        });
    }

    // Brak miejsca na wyprowadzenie opcjonalne nie jest przeszkodą — po to
    // jest opcjonalne. Zgłaszamy tylko te, bez których układ nie zadziała.
    const required = unassigned.filter((name) =>
        needed.find((pin) => pin.name === name)?.optional !== true);

    if (required.length > 0) {
        problems.push(
            `zabrakło wolnych wyprowadzeń dla: ${required.join(', ')} — ` +
            'zwolnij któreś na schemacie albo wybierz płytkę z większą liczbą wyprowadzeń');
    }

    return { assignments, unassigned, problems };
}

/**
 * Czy wyprowadzenie mikrokontrolera nadaje się pod daną rolę.
 *
 * Dziś sprawdzamy tylko kierunek: wyjścia sterownika muszą trafić na piny,
 * które potrafią być wyjściami. Rozróżnienie pinów zdolnych do PWM czy
 * przetwarzania analogowego wymaga bogatszej definicji płytki — do dopisania,
 * gdy definicje zaczną to opisywać.
 */
function suitableFor(mcuPin: ComponentPin, pin: ComponentPin): boolean {
    if (mcuPin.kind === 'bidirectional') return true;
    if (pin.kind === 'input' && mcuPin.kind === 'output') return true;
    if (pin.kind === 'output' && mcuPin.kind === 'input') return true;
    return false;
}

function needsGpio(pin: ComponentPin): boolean {
    return pin.kind !== 'power_in' && pin.kind !== 'ground'
        && pin.kind !== 'power_out' && pin.kind !== 'unconnected'
        && pin.kind !== 'passive';
}

/** Wyprowadzenia mikrokontrolera już użyte na schemacie. */
function takenPins(schematic: Schematic, mcuReference: string): Set<string> {
    const taken = new Set<string>();
    for (const net of Object.values(schematic.nets)) {
        for (const node of net.nodes) {
            const parsed = parseNode(node);
            if (parsed?.component === mcuReference) taken.add(parsed.pin);
        }
    }
    return taken;
}

function pascal(input: string): string {
    return input.split(/[^a-zA-Z0-9]+/).filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

/**
 * Zamienia przydział na sieci gotowe do dopisania do schematu.
 *
 * Nazwa w kodzie ląduje w `pin_name`, dzięki czemu wygenerowany nagłówek
 * płytki od razu daje `Pin::MotorLeftA1` — bez ręcznego dopisywania czegokolwiek.
 */
export function netsFromAssignments(assignments: readonly PinAssignment[],
                                    componentReference: string, mcuReference: string):
        [string, { nodes: string[]; pin_name: string }][] {
    return assignments.map((assignment) => [
        assignment.net,
        {
            nodes: [`${mcuReference}.${assignment.mcuPin}`,
                    `${componentReference}.${assignment.pin}`],
            pin_name: assignment.pinName,
        },
    ]);
}
