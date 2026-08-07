/**
 * Wczytywanie schematów z narzędzi zewnętrznych.
 *
 * Nikt nie rysuje płytki od zera w edytorze frameworka — projekt istnieje
 * wcześniej w KiCadzie albo EasyEDA. Import zamienia netlistę na `.hsch`,
 * dzięki czemu reguły elektryczne i generowanie nagłówka działają na czymś,
 * co już powstało, zamiast wymagać przepisania.
 *
 * Czego import **nie** robi: nie odgaduje, który układ jest którą paczką,
 * i nie wymyśla numerów wyprowadzeń. Zamiast tego zapisuje to, co zastał,
 * i wypisuje, czego brakuje. Zgadywanie dawałoby schemat wyglądający na gotowy
 * i generujący zły nagłówek — najgorszy możliwy wynik.
 */

import { warning, type Diagnostic } from '../diagnostics';
import type { Schematic, SchematicComponent, SchematicNet } from './hsch';

export interface ImportResult {
    schematic: Schematic;
    diagnostics: Diagnostic[];
    /** Oznaczenia, dla których nie znamy odpowiadającej paczki. */
    unknownParts: string[];
}

// ---------------------------------------------------------------------------
// KiCad
// ---------------------------------------------------------------------------

/**
 * Netlista KiCada — plik `.net` w składni wyrażeń nawiasowych.
 *
 * Interesują nas dwie sekcje: `components` (oznaczenie i nazwa układu) oraz
 * `nets` (sieć z listą węzłów). Reszta pliku opisuje bibliotekę symboli
 * i pola opisowe, które do schematu połączeń nic nie wnoszą.
 */
export function importKiCadNetlist(source: string): ImportResult {
    const root = parseSExpression(source);
    const diagnostics: Diagnostic[] = [];
    const components: Record<string, SchematicComponent> = {};
    const nets: Record<string, SchematicNet> = {};
    const unknown = new Set<string>();

    for (const comp of findAll(root, 'comp')) {
        const reference = valueOf(comp, 'ref');
        const value = valueOf(comp, 'value');
        if (!reference) continue;

        const part = partNameFor(reference, value);
        components[reference] = {
            part,
            ...(value !== undefined ? { value } : {}),
        };
        if (!PASSIVE_PARTS.has(part)) unknown.add(part);
    }

    for (const net of findAll(root, 'net')) {
        const name = valueOf(net, 'name');
        if (!name) continue;

        const nodes: string[] = [];
        for (const node of findAll(net, 'node')) {
            const reference = valueOf(node, 'ref');
            // KiCad podaje numer nóżki, a nie jej nazwę; nazwa bywa w polu
            // `pinfunction` i to ona odpowiada definicji układu w Hydrze.
            const pin = valueOf(node, 'pinfunction') ?? valueOf(node, 'pin');
            if (reference && pin) nodes.push(`${reference}.${pin}`);
        }
        if (nodes.length === 0) continue;

        nets[normalizeNetName(name)] = { nodes, ...classOf(name) };
    }

    return finish(components, nets, unknown, diagnostics, 'KiCad');
}

// ---------------------------------------------------------------------------
// EasyEDA
// ---------------------------------------------------------------------------

/**
 * Eksport netlisty z EasyEDA — plik JSON.
 *
 * Format ma kilka wariantów zależnie od wersji; obsługujemy ten, w którym
 * `nets` to lista obiektów z nazwą i listą wyprowadzeń. Wariantu nierozpoznanego
 * nie próbujemy interpretować na siłę — komunikat jest uczciwszy niż schemat
 * zbudowany z domysłów.
 */
export function importEasyEda(source: string): ImportResult {
    const diagnostics: Diagnostic[] = [];
    const components: Record<string, SchematicComponent> = {};
    const nets: Record<string, SchematicNet> = {};
    const unknown = new Set<string>();

    let parsed: unknown;
    try {
        parsed = JSON.parse(source);
    } catch (error) {
        return {
            schematic: emptySchematic(),
            unknownParts: [],
            diagnostics: [{
                severity: 'error', path: '',
                message: 'plik nie jest poprawnym JSON-em',
                hint: error instanceof Error ? error.message : String(error),
            }],
        };
    }

    const root = asRecord(parsed);
    const netList = Array.isArray(root?.['nets']) ? root!['nets'] : undefined;
    if (!netList) {
        return {
            schematic: emptySchematic(),
            unknownParts: [],
            diagnostics: [{
                severity: 'error', path: '',
                message: 'nie rozpoznano formatu — brak listy „nets"',
                hint: 'wyeksportuj netlistę (Export → Netlist), a nie plik projektu',
            }],
        };
    }

    for (const entry of netList) {
        const net = asRecord(entry);
        const name = typeof net?.['name'] === 'string' ? net['name'] : undefined;
        const pins = Array.isArray(net?.['pins']) ? net!['pins'] : [];
        if (!name) continue;

        const nodes: string[] = [];
        for (const pinEntry of pins) {
            const pin = asRecord(pinEntry);
            const reference = typeof pin?.['designator'] === 'string' ? pin['designator'] : undefined;
            const pinName = typeof pin?.['name'] === 'string' ? pin['name']
                          : typeof pin?.['number'] === 'string' ? pin['number'] : undefined;
            if (!reference || !pinName) continue;

            nodes.push(`${reference}.${pinName}`);
            if (!components[reference]) {
                const partField = pin?.['part'];
                const part = partNameFor(reference,
                    typeof partField === 'string' ? partField : undefined);
                components[reference] = { part };
                if (!PASSIVE_PARTS.has(part)) unknown.add(part);
            }
        }
        if (nodes.length > 0) nets[normalizeNetName(name)] = { nodes, ...classOf(name) };
    }

    return finish(components, nets, unknown, diagnostics, 'EasyEDA');
}

// ---------------------------------------------------------------------------

function finish(components: Record<string, SchematicComponent>,
                nets: Record<string, SchematicNet>,
                unknown: Set<string>, diagnostics: Diagnostic[], source: string): ImportResult {
    if (Object.keys(components).length === 0) {
        diagnostics.push(warning('components', `import z ${source} nie znalazł żadnych układów`,
                                 'sprawdź, czy plik jest netlistą, a nie samym rysunkiem'));
    }

    // Nazwy paczek trzeba przypisać ręcznie: żaden format zewnętrzny nie wie,
    // że „BMP280" u nas nazywa się paczką `bmp280` z takim a nie innym plikiem
    // definicji. Zgadywanie dałoby schemat wyglądający na gotowy.
    if (unknown.size > 0) {
        diagnostics.push(warning('components',
            `${unknown.size} układów wymaga wskazania paczki`,
            'w polu „part" każdego układu wpisz nazwę paczki Hydry — dopóki tego nie ' +
            'zrobisz, reguły elektryczne nie mają czym sprawdzić wyprowadzeń'));
    }

    return {
        schematic: { hsch: '0.1', components, nets },
        diagnostics,
        unknownParts: [...unknown].sort(),
    };
}

/** Nazwy sieci zasilania i masy rozpoznajemy — resztę zostawiamy bez klasy. */
function classOf(name: string): { class?: string } {
    const upper = name.toUpperCase();
    if (/^(GND|VSS|AGND|DGND)$/.test(upper)) return { class: 'ground' };
    if (/^(\+?\d+V\d?|VCC|VDD|VBUS|3V3|5V)$/.test(upper)) return { class: 'power' };
    return {};
}

/**
 * Nazwa sieci w postaci, którą przyjmuje `.hsch`.
 *
 * KiCad nadaje nienazwanym sieciom identyfikatory w rodzaju `Net-(U1-Pad3)`;
 * zamieniamy je na coś, co da się wpisać, i zostawiamy oryginał w nazwie,
 * żeby dało się odnaleźć odpowiednik w tamtym projekcie.
 */
function normalizeNetName(name: string): string {
    // Ciągi znaków spoza dozwolonego zbioru zwijamy do jednego podkreślenia:
    // `Net-(U1-Pad9)` daje `NET_U1_PAD9`, a nie `NET-_U1-PAD9`. Myślnik jest
    // wprawdzie dozwolony, ale tutaj jest częścią śmieci, nie nazwą.
    return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'NET';
}

/**
 * Nazwa paczki dla układu z importu.
 *
 * Elementy bierne poznajemy po oznaczeniu: `R1` to rezystor niezależnie od
 * tego, czy w polu wartości stoi „4.7k", „4k7" czy „R47". To konwencja
 * obowiązująca we wszystkich narzędziach do projektowania płytek, a nie
 * domysł — bez niej wartość rezystora lądowała jako nazwa paczki („4-7k").
 */
const PASSIVE_BY_PREFIX: Readonly<Record<string, string>> = {
    R: 'resistor', C: 'capacitor', L: 'inductor', D: 'diode', Q: 'transistor',
};

const PASSIVE_PARTS = new Set(Object.values(PASSIVE_BY_PREFIX));

function partNameFor(reference: string, value: string | undefined): string {
    const prefix = /^([A-Z]+)/.exec(reference)?.[1] ?? '';
    const passive = PASSIVE_BY_PREFIX[prefix];
    if (passive) return passive;
    return normalizePart(value ?? reference);
}

function normalizePart(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function emptySchematic(): Schematic {
    return { hsch: '0.1', components: {}, nets: {} };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

// --- wyrażenia nawiasowe ---------------------------------------------------

type SExpression = (string | SExpression)[];

/**
 * Rozbiór składni nawiasowej KiCada.
 *
 * Własny, a nie z biblioteki: format jest prosty (atomy, ciągi w cudzysłowach,
 * zagnieżdżone listy), a zależność ciągnęłaby się do przeglądarki, gdzie ten
 * kod też musi działać.
 */
function parseSExpression(source: string): SExpression {
    const tokens = source.match(/"(?:[^"\\]|\\.)*"|\(|\)|[^\s()]+/g) ?? [];
    const stack: SExpression[] = [[]];

    for (const token of tokens) {
        if (token === '(') {
            const child: SExpression = [];
            stack[stack.length - 1]!.push(child);
            stack.push(child);
        } else if (token === ')') {
            if (stack.length > 1) stack.pop();
        } else if (token.startsWith('"')) {
            stack[stack.length - 1]!.push(token.slice(1, -1).replace(/\\(.)/g, '$1'));
        } else {
            stack[stack.length - 1]!.push(token);
        }
    }
    return stack[0]!;
}

/** Wszystkie podlisty zaczynające się od podanego znacznika, na dowolnej głębokości. */
function findAll(node: SExpression, tag: string): SExpression[] {
    const out: SExpression[] = [];
    const visit = (current: SExpression): void => {
        if (current[0] === tag) out.push(current);
        for (const child of current) if (Array.isArray(child)) visit(child);
    };
    visit(node);
    return out;
}

/** Wartość pola `(tag wartość)` wewnątrz listy. */
function valueOf(node: SExpression, tag: string): string | undefined {
    for (const child of node) {
        if (Array.isArray(child) && child[0] === tag && typeof child[1] === 'string') {
            return child[1];
        }
    }
    return undefined;
}
