/**
 * Generowanie nagłówka płytki (boards/*.hpp) z sekcji `hardware`.
 *
 * Nagłówek jest jedynym miejscem, w którym numery wyprowadzeń w ogóle
 * występują — reszta kodu mówi `hal::board::led` albo `Pin.MotorLeftPwm`.
 * Dzięki temu zmiana płytki to zmiana jednego pliku, a nie przeszukiwanie
 * projektu za literałami.
 *
 * Uwaga wzięta z prawdziwej kompilacji: nagłówek trafia do każdej jednostki
 * kompilacji, także takiej, która nie widzi Arduino — i widzieć go nie może,
 * bo zabrania tego reguła zależności Hydry. Dlatego numery pinów muszą być
 * liczbami, a nie nazwami w rodzaju `LED_BUILTIN` czy `PA5`.
 */

import type { TargetPlan } from './plan';

export interface BoardSource {
    /** Nazwa płytki — trafia do `hal::board::name`. */
    name: string;
    led?: { pin: number; activeLow?: boolean };
    buses: readonly BusSource[];
    /** Nazwane wyprowadzenia — z nich powstaje `namespace Pin`. */
    pins: readonly { name: string; pin: number; comment?: string }[];
}

export interface BusSource {
    /** `i2c0`, `spi1`, `uart1`… */
    id: string;
    pins: Readonly<Record<string, number>>;
    hz?: number;
    baud?: number;
}

export function emitBoardHeader(source: BoardSource, target: TargetPlan | undefined,
                                projectName: string): string {
    const lines: string[] = [];

    lines.push('#pragma once');
    lines.push('/**');
    lines.push(` * Płytka: ${source.name}.`);
    lines.push(' *');
    lines.push(` * Plik wygenerowany przez Hydra Studio ze schematu projektu ${projectName}.`);
    lines.push(' * Zmiany nanoś w schemacie albo w pliku .hydra — ręczne poprawki znikną');
    lines.push(' * przy następnym zapisie.');
    lines.push(' *');
    lines.push(' * Numery wyprowadzeń są liczbami, a nie nazwami wariantu (LED_BUILTIN, PA5):');
    lines.push(' * ten nagłówek trafia także do jednostek kompilacji, które nie widzą');
    lines.push(' * nagłówków Arduino i widzieć ich nie mogą.');
    lines.push(' */');
    lines.push('');
    lines.push(`#define HYDRA_BOARD_NAME "${source.name}"`);
    lines.push('');

    if (source.led) {
        lines.push(`#define HYDRA_BOARD_LED ${source.led.pin}`);
        if (source.led.activeLow) lines.push('#define HYDRA_BOARD_LED_ACTIVE_LOW 1');
        lines.push('');
    }

    for (const bus of source.buses) {
        lines.push(...busDefines(bus));
        lines.push('');
    }

    if (source.pins.length > 0) {
        lines.push('/**');
        lines.push(' * Wyprowadzenia nazwane. Aplikacja mówi `Pin::MotorLeftPwm`, nigdy „GPIO 17" —');
        lines.push(' * dzięki temu przepięcie sygnału na inną nóżkę nie wymaga szukania liczby');
        lines.push(' * po całym projekcie.');
        lines.push(' */');
        lines.push('namespace Pin {');
        const width = Math.max(...source.pins.map((p) => p.name.length));
        for (const pin of source.pins) {
            const padded = pin.name.padEnd(width);
            const comment = pin.comment ? `  ///< ${pin.comment}` : '';
            lines.push(`constexpr ::hydra::hal::PinNum ${padded} = ${pin.pin};${comment}`);
        }
        lines.push('}  // namespace Pin');
        lines.push('');
    }

    if (target) {
        lines.push('// Możliwości płytki — z nich Studio wie, które komponenty tu pasują.');
        for (const capability of target.capabilities) {
            lines.push(`#define HYDRA_BOARD_HAS_${capability.toUpperCase().replace(/-/g, '_')} 1`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function busDefines(bus: BusSource): string[] {
    const upper = bus.id.toUpperCase();
    const lines: string[] = [`#define HYDRA_BOARD_${upper}_ENABLE 1`];

    for (const [role, pin] of Object.entries(bus.pins)) {
        lines.push(`#define HYDRA_BOARD_${upper}_${role.toUpperCase()} ${pin}`);
    }
    if (bus.hz !== undefined) lines.push(`#define HYDRA_BOARD_${upper}_HZ ${bus.hz}`);
    if (bus.baud !== undefined) lines.push(`#define HYDRA_BOARD_${upper}_BAUD ${bus.baud}`);

    return lines;
}

/**
 * Wyciąga opis płytki z modelu.
 *
 * Docelowo dane pochodzą ze schematu (.hsch) — tam jest źródło prawdy dla
 * wyprowadzeń. Dopóki schematu nie ma, bierzemy to, co da się odczytać
 * z sekcji `hardware`: magistrale i przypisania pinów komponentów.
 */
export function boardSourceFrom(model: unknown, boardName: string): BoardSource | undefined {
    const root = asRecord(model);
    const hardware = asRecord(root?.['hardware']);
    if (!hardware) return undefined;

    const buses: BusSource[] = [];
    for (const [id, raw] of Object.entries(asRecord(hardware['buses']) ?? {})) {
        const bus = asRecord(raw);
        if (!bus) continue;
        buses.push({
            id,
            pins: {},
            ...(typeof bus['hz'] === 'number' ? { hz: bus['hz'] } : {}),
            ...(typeof bus['baud'] === 'number' ? { baud: bus['baud'] } : {}),
        });
    }

    const pins: { name: string; pin: number; comment?: string }[] = [];
    for (const [component, raw] of Object.entries(asRecord(hardware['components']) ?? {})) {
        const spec = asRecord(raw);
        const assigned = asRecord(spec?.['pins']);
        if (!assigned) continue;

        for (const [role, value] of Object.entries(assigned)) {
            // Zapis `Pin.MotA1` odsyła do nazwy, której numer poda schemat.
            // Bez schematu nie ma czego wygenerować i lepiej to pominąć niż
            // zgadywać numer.
            if (typeof value !== 'number') continue;
            pins.push({ name: pascalCase(`${component}_${role}`), pin: value,
                        comment: `${component}.${role}` });
        }
    }

    return { name: boardName, buses, pins };
}

function pascalCase(input: string): string {
    return input.split(/[^a-zA-Z0-9]+/).filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
