/**
 * Model formularza — wspólny dla obu źródeł pól.
 *
 * Inspektor buduje formularze z dwóch miejsc: ze schematu Hydry (ustawienia
 * projektu, celów i modułów) oraz ze schematu dostarczonego przez paczkę
 * (konfiguracja konkretnego czujnika). Kształt pola jest ten sam, więc opisany
 * jest raz — inaczej interfejs miałby dwie ścieżki renderowania, które
 * rozjechałyby się przy pierwszym nowym rodzaju pola.
 *
 * Inspektor nie ma własnej listy pól. Gdyby ją miał, byłaby to druga definicja
 * formatu obok `hydraSchema.ts` — i przy pierwszej zmianie jedna z nich
 * przestałaby odpowiadać rzeczywistości, najpewniej ta, o której zapomniano.
 * Zamiast tego pola powstają z tego samego opisu, z którego działa walidacja:
 * nowe pole w schemacie pojawia się w interfejsie samo, wraz z opisem, listą
 * dozwolonych wartości i zakresem.
 */

import type { Diagnostic } from './diagnostics';
import type { PathSegment } from './document';
import { HYDRA_SCHEMA } from './hydraSchema';
import type { ObjectNode, SchemaNode } from './schema';

export type FieldKind = 'text' | 'number' | 'toggle' | 'choice' | 'list' | 'section' | 'free';

export interface FormField {
    /** Nazwa klucza. */
    key: string;
    /** Pełna ścieżka w modelu — po niej idzie zapis. */
    path: PathSegment[];
    kind: FieldKind;
    /** Opis ze schematu — trafia do dymka przy polu. */
    doc: string;
    required: boolean;
    /** Bieżąca wartość; `undefined`, gdy pola nie ma w pliku. */
    value: unknown;
    /** Czy wartość jest zapisana w pliku, czy pole jest puste. */
    present: boolean;
    choices?: readonly string[];
    unit?: string;
    min?: number;
    max?: number;
    integer?: boolean;
    /** Zgłoszenia walidatora dotyczące tego pola. */
    diagnostics: Diagnostic[];
}

export interface FormSection {
    path: PathSegment[];
    title: string;
    doc: string;
    fields: FormField[];
    /** Podsekcje — rozwijane w inspektorze. */
    sections: FormSection[];
}

/**
 * Buduje opis formularza dla wskazanego miejsca w modelu.
 *
 * `path` wskazuje sekcję, którą inspektor ma pokazać — na przykład
 * `['targets', 'esp32s3-main']` dla wybranego celu albo `['modules', 'net']`
 * dla ustawień sieci.
 */
export function formFor(model: unknown, path: readonly PathSegment[],
                        diagnostics: readonly Diagnostic[] = []): FormSection | undefined {
    const schema = schemaAt(HYDRA_SCHEMA, path, model);
    if (!schema || schema.kind !== 'object') return undefined;

    return sectionFrom(schema, [...path], valueAt(model, path), diagnostics);
}

function sectionFrom(schema: ObjectNode, path: PathSegment[], value: unknown,
                     diagnostics: readonly Diagnostic[]): FormSection {
    const record = asRecord(value) ?? {};
    const fields: FormField[] = [];
    const sections: FormSection[] = [];

    for (const [key, field] of Object.entries(schema.fields)) {
        const fieldPath = [...path, key];
        const current = record[key];

        // Zagnieżdżony zbiór pól to podsekcja, nie pole — inaczej inspektor
        // pokazywałby „obiekt" bez możliwości zajrzenia do środka.
        if (field.type.kind === 'object') {
            sections.push(sectionFrom(field.type, fieldPath, current, diagnostics));
            continue;
        }

        fields.push({
            key,
            path: fieldPath,
            kind: kindOf(field.type),
            doc: field.type.doc,
            required: field.required === true,
            value: current,
            present: key in record && current !== undefined && current !== null,
            diagnostics: diagnostics.filter((d) => d.path === fieldPath.join('.')),
            ...constraintsOf(field.type),
        });
    }

    return {
        path,
        title: path.length > 0 ? String(path[path.length - 1]) : 'projekt',
        doc: schema.doc,
        fields,
        sections,
    };
}

function kindOf(schema: SchemaNode): FieldKind {
    switch (schema.kind) {
        case 'string': return 'text';
        case 'number': return 'number';
        case 'bool': return 'toggle';
        case 'enum': return 'choice';
        case 'array': return 'list';
        case 'object': case 'map': return 'section';
        // Wariantu ani pola dowolnego nie da się pokazać formularzem bez
        // zgadywania, więc dostają edycję tekstową i etykietę „dowolne".
        case 'union': case 'any': return 'free';
    }
}

function constraintsOf(schema: SchemaNode): Partial<FormField> {
    switch (schema.kind) {
        case 'enum':
            return { choices: schema.values };
        case 'number':
            return {
                ...(schema.unit !== undefined ? { unit: schema.unit } : {}),
                ...(schema.min !== undefined ? { min: schema.min } : {}),
                ...(schema.max !== undefined ? { max: schema.max } : {}),
                ...(schema.integer !== undefined ? { integer: schema.integer } : {}),
            };
        default:
            return {};
    }
}

/**
 * Odnajduje opis schematu dla ścieżki w modelu.
 *
 * Przejście przez `map` wymaga wartości modelu: schemat mówi tylko „dowolna
 * nazwa celu", więc klucz `esp32s3-main` istnieje wyłącznie w danych.
 */
function schemaAt(schema: SchemaNode, path: readonly PathSegment[], model: unknown): SchemaNode | undefined {
    let current: SchemaNode | undefined = schema;
    let value: unknown = model;

    for (const segment of path) {
        if (!current) return undefined;

        if (current.kind === 'object') {
            // Adnotacja typu konieczna: bez niej TypeScript nie potrafi
            // rozwikłać rekurencji SchemaNode → ObjectNode → SchemaNode.
            const field: { type: SchemaNode } | undefined = current.fields[String(segment)];
            if (!field) return undefined;
            current = field.type;
        } else if (current.kind === 'map') {
            if (current.reserved?.includes(String(segment))) return undefined;
            current = current.of;
        } else if (current.kind === 'array') {
            current = current.of;
        } else {
            return undefined;
        }
        value = asRecord(value)?.[String(segment)];
    }
    return current;
}

/** Nazwy wpisów w odwzorowaniu — cele, magistrale, komponenty. */
export function entriesOf(model: unknown, path: readonly PathSegment[]): string[] {
    const schema = schemaAt(HYDRA_SCHEMA, path, model);
    const value = asRecord(valueAt(model, path));
    if (!schema || schema.kind !== 'map' || !value) return [];
    return Object.keys(value).filter((key) => !schema.reserved?.includes(key));
}

function valueAt(model: unknown, path: readonly PathSegment[]): unknown {
    let current: unknown = model;
    for (const segment of path) {
        current = asRecord(current)?.[String(segment)];
        if (current === undefined) return undefined;
    }
    return current;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
