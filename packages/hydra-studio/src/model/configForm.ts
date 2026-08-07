/**
 * Formularz z schematu konfiguracji dostarczonego przez paczkę.
 *
 * Paczka opisuje ustawienia swojego komponentu w JSON Schema — z tego pliku
 * powstaje panel w inspektorze. Świadomie obsługujemy podzbiór: typy proste,
 * `enum`, zakresy, `default`, `description` i zagnieżdżone obiekty. Reszta
 * (warunki, `oneOf`, odwołania) trafia do pola tekstowego z adnotacją, zamiast
 * udawać, że interfejs to rozumie.
 *
 * Powód takiego wyboru: schemat pisze autor paczki, nie my. Odrzucenie pliku
 * za nieobsługiwaną konstrukcję zablokowałoby cały komponent; pokazanie pola
 * jako tekstu pozwala z niego korzystać i mówi wprost, czego formularz nie
 * ogarnia.
 */

import type { Diagnostic } from './diagnostics';
import type { PathSegment } from './document';
import type { FieldKind, FormField, FormSection } from './form';

/** Podzbiór JSON Schema, który potrafimy zamienić na formularz. */
export interface ConfigSchema {
    type?: string;
    title?: string;
    description?: string;
    properties?: Record<string, ConfigSchema>;
    required?: string[];
    enum?: (string | number)[];
    default?: unknown;
    minimum?: number;
    maximum?: number;
    /** Jednostka — rozszerzenie własne; JSON Schema jej nie zna. */
    unit?: string;
    items?: ConfigSchema;
    [key: string]: unknown;
}

/**
 * Buduje formularz dla konfiguracji komponentu.
 *
 * `basePath` wskazuje miejsce w pliku projektu, pod którym siedzą ustawienia —
 * zwykle `hardware.components.<nazwa>`.
 */
export function configFormFor(schema: ConfigSchema, basePath: readonly PathSegment[],
                              value: unknown, diagnostics: readonly Diagnostic[] = []): FormSection {
    return sectionFrom(schema, [...basePath], value, diagnostics,
                       schema.title ?? String(basePath[basePath.length - 1] ?? 'konfiguracja'));
}

function sectionFrom(schema: ConfigSchema, path: PathSegment[], value: unknown,
                     diagnostics: readonly Diagnostic[], title: string): FormSection {
    const record = asRecord(value) ?? {};
    const required = new Set(schema.required ?? []);
    const fields: FormField[] = [];
    const sections: FormSection[] = [];

    for (const [key, property] of Object.entries(schema.properties ?? {})) {
        const fieldPath = [...path, key];
        const current = record[key];

        if (property.type === 'object' && property.properties) {
            sections.push(sectionFrom(property, fieldPath, current, diagnostics,
                                      property.title ?? key));
            continue;
        }

        fields.push({
            key,
            path: fieldPath,
            kind: kindOf(property),
            doc: describe(property),
            required: required.has(key),
            // Wartość domyślna ze schematu pokazujemy jako podpowiedź, ale nie
            // udajemy, że jest zapisana w pliku — inaczej użytkownik nie
            // odróżniłby ustawienia świadomego od pominiętego.
            value: current !== undefined ? current : property.default,
            present: key in record && current !== undefined && current !== null,
            diagnostics: diagnostics.filter((d) => d.path === fieldPath.join('.')),
            ...constraintsOf(property),
        });
    }

    return { path, title, doc: schema.description ?? '', fields, sections };
}

function kindOf(schema: ConfigSchema): FieldKind {
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return 'choice';
    switch (schema.type) {
        case 'string': return 'text';
        case 'number': case 'integer': return 'number';
        case 'boolean': return 'toggle';
        case 'array': return 'list';
        case 'object': return 'section';
        // Brak typu albo konstrukcja spoza podzbioru — pole tekstowe
        // z adnotacją zamiast udawania, że formularz to rozumie.
        default: return 'free';
    }
}

function constraintsOf(schema: ConfigSchema): Partial<FormField> {
    const out: Partial<FormField> = {};
    if (Array.isArray(schema.enum)) out.choices = schema.enum.map(String);
    if (typeof schema.minimum === 'number') out.min = schema.minimum;
    if (typeof schema.maximum === 'number') out.max = schema.maximum;
    if (typeof schema.unit === 'string') out.unit = schema.unit;
    if (schema.type === 'integer') out.integer = true;
    return out;
}

function describe(schema: ConfigSchema): string {
    const parts: string[] = [];
    if (schema.description) parts.push(schema.description);
    if (schema.default !== undefined) parts.push(`domyślnie: ${JSON.stringify(schema.default)}`);
    return parts.join(' · ');
}

/**
 * Sprawdza, czy schemat da się w całości pokazać formularzem.
 *
 * Zwraca nazwy pól, które trafią do edycji tekstowej. Studio wypisuje to przy
 * paczce, żeby jej autor wiedział, że jego schemat jest szerszy niż to, co
 * interfejs potrafi narysować — cisza w tym miejscu wyglądałaby jak usterka
 * inspektora.
 */
export function unsupportedFields(schema: ConfigSchema, prefix = ''): string[] {
    const out: string[] = [];
    for (const [key, property] of Object.entries(schema.properties ?? {})) {
        const name = prefix ? `${prefix}.${key}` : key;
        if (property.type === 'object' && property.properties) {
            out.push(...unsupportedFields(property, name));
        } else if (kindOf(property) === 'free') {
            out.push(name);
        }
    }
    return out;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
