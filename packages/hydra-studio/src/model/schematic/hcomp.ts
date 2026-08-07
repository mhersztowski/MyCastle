/**
 * Definicja komponentu (.hcomp) — symbol i wyprowadzenia.
 *
 * Plik dostarcza paczka; wskazuje go pole `component` w `hydra-pack.yaml`.
 * To jedyne miejsce, w którym opisane jest, jakie nóżki ma układ i co każda
 * z nich robi — schemat odwołuje się do nich po nazwie, a reguły elektryczne
 * sprawdzają na tej podstawie, czy połączenie ma sens.
 *
 * Rodzaj wyprowadzenia (`kind`) nie jest ozdobnikiem: z niego wynika, czy dwa
 * połączone piny mogą ze sobą współpracować. Dwa wyjścia na jednej sieci to
 * zwarcie, a wejście bez żadnego wyjścia nigdy nic nie zobaczy — jedno i drugie
 * wychodzi dopiero na płytce, jeśli nikt tego nie sprawdzi wcześniej.
 */

import { list, obj, oneOf, optional, required, str, num, bool, type ObjectNode } from '../schema';

/** Co wyprowadzenie robi z sygnałem. */
export const PIN_KINDS = [
    'input', 'output', 'bidirectional',
    'power_in', 'power_out', 'ground',
    'open_drain', 'passive', 'unconnected',
] as const;

export type PinKind = (typeof PIN_KINDS)[number];

/** Rola wyprowadzenia na magistrali — po niej dobieramy piny przy generowaniu. */
export const PIN_ROLES = [
    'sda', 'scl',                       // I²C
    'sck', 'miso', 'mosi', 'cs',        // SPI
    'tx', 'rx', 'rts', 'cts', 'de',     // UART / RS-485
    'ch', 'cl',                         // CAN
    'pwm', 'dir', 'en', 'fault',        // sterowniki mocy
    'a', 'b', 'z',                      // enkodery
    'int', 'reset', 'dc', 'busy',       // sterowanie
] as const;

export const HCOMP_SCHEMA: ObjectNode = obj('Definicja komponentu', {
    hcomp: required(str('Wersja formatu', {
        pattern: /^\d+\.\d+$/, patternHint: 'wersja w postaci „0.1"',
    })),
    component: required(str('Nazwa — musi odpowiadać nazwie paczki', {
        pattern: /^[a-z0-9][a-z0-9-]*$/, patternHint: 'małe litery, cyfry i myślniki',
    })),
    name: optional(str('Nazwa czytelna, np. „BMP280"')),
    description: optional(str('Krótki opis — pokazywany w bibliotece')),
    package: optional(str('Obudowa, np. LGA-8')),

    pins: required(list('Wyprowadzenia', obj('Wyprowadzenie', {
        name: required(str('Oznaczenie na obudowie, np. SDA')),
        kind: required(oneOf('Co robi z sygnałem', PIN_KINDS)),
        bus: optional(str('Magistrala, do której należy, np. i2c', {
            pattern: /^(i2c|spi|uart|can)$/, patternHint: 'i2c, spi, uart albo can',
        })),
        role: optional(oneOf('Rola na magistrali', PIN_ROLES)),
        /**
         * Wyprowadzenie, które wolno zostawić niepodłączone. Domyślnie każdy
         * pin jest wymagany — łatwiej odznaczyć te kilka opcjonalnych, niż
         * odkryć na płytce, że o którymś się zapomniało.
         */
        optional: optional(bool('Czy wolno zostawić niepodłączone')),
        /**
         * Numer wyprowadzenia w numeracji układu. Dotyczy definicji płytek
         * i mikrokontrolerów — z niego bierze się liczba w `boards/*.hpp`.
         * Bez niego schemat wie, co z czym jest połączone, ale nie wie, jaki
         * numer wpisać do kodu.
         */
        gpio: optional(num('Numer wyprowadzenia w numeracji układu', { integer: true, min: 0 })),
        description: optional(str('Do czego służy')),
    }), { minItems: 1 })),

    symbol: optional(obj('Rozmiar symbolu na schemacie', {
        width: optional(num('Szerokość', { min: 1, unit: 'mm' })),
        height: optional(num('Wysokość', { min: 1, unit: 'mm' })),
    })),
}, 'forbid');

export interface ComponentPin {
    name: string;
    kind: PinKind;
    bus?: string;
    role?: string;
    optional?: boolean;
    /** Numer w numeracji układu — tylko dla płytek i mikrokontrolerów. */
    gpio?: number;
    description?: string;
}

export interface ComponentDefinition {
    hcomp: string;
    component: string;
    name?: string;
    description?: string;
    package?: string;
    pins: ComponentPin[];
    symbol?: { width?: number; height?: number };
}

/** Wyprowadzenie o danej roli na wskazanej magistrali. */
export function pinFor(definition: ComponentDefinition, bus: string, role: string):
        ComponentPin | undefined {
    return definition.pins.find((pin) => pin.bus === bus && pin.role === role);
}

/** Czy wyprowadzenie wolno zostawić niepodłączone. */
export function isOptional(pin: ComponentPin): boolean {
    return pin.optional === true || pin.kind === 'unconnected';
}

/**
 * Czy wyprowadzenie może wystawić sygnał.
 *
 * Dwukierunkowe i otwarty dren też potrafią — na I²C to właśnie one sterują
 * magistralą. Rozróżnienie względem `conflictsWhenShorted` jest istotne:
 * pytanie „czy coś tę sieć steruje" ma inną odpowiedź niż „czy zwarcie tych
 * dwóch wyprowadzeń jest zwarciem".
 */
export function drivesNet(pin: ComponentPin): boolean {
    return pin.kind === 'output' || pin.kind === 'power_out'
        || pin.kind === 'bidirectional' || pin.kind === 'open_drain';
}

/**
 * Czy dwa takie wyprowadzenia na jednej sieci to zwarcie.
 *
 * Tylko wyjścia przeciwsobne: przy przeciwnych stanach płynie prąd ograniczony
 * wyłącznie rezystancją tranzystorów. Otwarty dren i wyprowadzenia dwukierunkowe
 * są od tego wolne — na tym polega I²C, gdzie na jednej linii siedzi kilkanaście
 * układów.
 */
export function conflictsWhenShorted(pin: ComponentPin): boolean {
    return pin.kind === 'output' || pin.kind === 'power_out';
}
