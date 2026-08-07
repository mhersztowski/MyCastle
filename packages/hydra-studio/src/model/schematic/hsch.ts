/**
 * Schemat połączeń (.hsch).
 *
 * Źródło prawdy dla wyprowadzeń: z niego powstaje `boards/*.hpp`, a plik
 * projektu odwołuje się do nazw (`Pin.MotorLeftPwm`), nie do numerów.
 * Dopóki schematu nie ma, nagłówek płytki trzeba pisać ręcznie — i wtedy nikt
 * nie sprawdzi, czy numer w kodzie odpowiada temu, co jest na płytce.
 *
 * Format jest listą węzłów, a nie rysunkiem: położenia symboli służą tylko
 * do wyświetlania i nie wpływają na nic, co się generuje. Dzięki temu schemat
 * daje się czytać w recenzji zmian i scalać jak każdy inny plik tekstowy —
 * czego o formatach binarnych z programów do projektowania płytek powiedzieć
 * się nie da.
 */

import { list, map, num, obj, oneOf, optional, required, str, type ObjectNode } from '../schema';

/** Rodzaj sieci — decyduje o tym, które reguły ją obowiązują. */
export const NET_CLASSES = ['power', 'ground', 'signal', 'bus', 'analog'] as const;

export const HSCH_SCHEMA: ObjectNode = obj('Schemat połączeń', {
    hsch: required(str('Wersja formatu', {
        pattern: /^\d+\.\d+$/, patternHint: 'wersja w postaci „0.1"',
    })),

    sheet: optional(obj('Arkusz', {
        name: optional(str('Nazwa')),
        grid_mm: optional(num('Skok siatki', { min: 0.1, unit: 'mm' })),
    })),

    components: required(map('Układy na schemacie', obj('Układ', {
        part: required(str('Nazwa paczki opisującej ten układ', {
            pattern: /^[a-z0-9][a-z0-9-]*$/, patternHint: 'nazwa paczki: małe litery, cyfry i myślniki',
        })),
        /** Położenie symbolu — wyłącznie do wyświetlania. */
        at: optional(list('Położenie [x, y]', num('Współrzędna', { unit: 'mm' }), { minItems: 2 })),
        value: optional(str('Wartość, np. „4.7k" dla rezystora')),
        note: optional(str('Uwaga widoczna przy symbolu')),
    }), {
        keyPattern: /^[A-Z]+[0-9]+$/,
        keyHint: 'oznaczenie układu: litery i numer, np. U1, DS1, R3',
    })),

    nets: required(map('Sieci', obj('Sieć', {
        class: optional(oneOf('Rodzaj sieci', NET_CLASSES)),
        bus: optional(str('Magistrala, do której należy, np. i2c0', {
            pattern: /^(i2c|spi|uart|can)\d$/, patternHint: 'nazwa magistrali: i2c0, spi1, uart1…',
        })),
        role: optional(str('Rola na magistrali, np. sda')),
        nodes: required(list('Podłączone wyprowadzenia w zapisie „U1.SDA"',
            str('Węzeł', {
                pattern: /^[A-Z]+[0-9]+\.[A-Za-z0-9_+-]+$/,
                patternHint: 'zapis „układ.wyprowadzenie", np. U1.IO8',
            }), { minItems: 1, unique: true })),
        /** Nazwa, pod którą sieć trafi do nagłówka płytki jako Pin::… */
        pin_name: optional(str('Nazwa wyprowadzenia w kodzie, np. MotorLeftPwm', {
            pattern: /^[A-Z][A-Za-z0-9]*$/, patternHint: 'nazwa w stylu MotorLeftPwm',
        })),
    }), {
        keyPattern: /^[A-Z0-9_+.-]+$/,
        keyHint: 'nazwa sieci: wielkie litery, cyfry, podkreślenia — np. I2C0_SDA, 3V3',
    })),
}, 'forbid');

export interface SchematicComponent {
    part: string;
    at?: number[];
    value?: string;
    note?: string;
}

export interface SchematicNet {
    class?: string;
    bus?: string;
    role?: string;
    nodes: string[];
    pin_name?: string;
}

export interface Schematic {
    hsch: string;
    sheet?: { name?: string; grid_mm?: number };
    components: Record<string, SchematicComponent>;
    nets: Record<string, SchematicNet>;
}

/** Rozbiera zapis „U1.SDA" na oznaczenie układu i nazwę wyprowadzenia. */
export function parseNode(node: string): { component: string; pin: string } | undefined {
    const index = node.indexOf('.');
    if (index <= 0 || index === node.length - 1) return undefined;
    return { component: node.slice(0, index), pin: node.slice(index + 1) };
}

/** Sieć, do której należy dane wyprowadzenie. */
export function netOfNode(schematic: Schematic, node: string): string | undefined {
    for (const [name, net] of Object.entries(schematic.nets)) {
        if (net.nodes.includes(node)) return name;
    }
    return undefined;
}
