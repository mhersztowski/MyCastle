/**
 * Opis budowy pliku .hydra.
 *
 * Schemat jest danymi, nie kodem sprawdzającym. Z jednej deklaracji wychodzi
 * walidacja, podpowiedzi uzupełniania w edytorze i dokumentacja pól — gdyby
 * każde z tych trzech miało własne źródło, rozjechałyby się przy pierwszej
 * zmianie formatu.
 *
 * Świadomie **nie** jest to JSON Schema. Połowa reguł tego pliku to zależności
 * między polami: `targets.default` musi wskazywać istniejący cel, komponent
 * może odwołać się tylko do zadeklarowanej magistrali, pack wymagający Wi-Fi
 * nie pasuje do płytki bez radia. JSON Schema tego nie wyrazi, a właśnie te
 * reguły łapią prawdziwe pomyłki. Eksport do JSON Schema (dla podpowiedzi
 * w edytorach zewnętrznych) robi osobna funkcja i jest z założenia uboższy.
 */

export type SchemaNode =
    | StringNode
    | NumberNode
    | BoolNode
    | EnumNode
    | ArrayNode
    | ObjectNode
    | MapNode
    | UnionNode
    | AnyNode;

interface Base {
    /** Opis pola — trafia do dokumentacji i do dymków w edytorze. */
    doc: string;
}

export interface StringNode extends Base {
    kind: 'string';
    pattern?: RegExp;
    /** Co napisać, gdy wartość nie pasuje do wzorca. */
    patternHint?: string;
    minLength?: number;
}

export interface NumberNode extends Base {
    kind: 'number';
    integer?: boolean;
    min?: number;
    max?: number;
    /** Jednostka dopisywana do komunikatów, np. „µs". */
    unit?: string;
}

export interface BoolNode extends Base {
    kind: 'bool';
}

export interface EnumNode extends Base {
    kind: 'enum';
    values: readonly string[];
}

export interface ArrayNode extends Base {
    kind: 'array';
    of: SchemaNode;
    minItems?: number;
    /** Czy powtórzenia są błędem — dla list nazw zwykle tak. */
    unique?: boolean;
}

export interface Field {
    type: SchemaNode;
    required?: boolean;
}

export interface ObjectNode extends Base {
    kind: 'object';
    fields: Record<string, Field>;
    /**
     * Co zrobić z kluczami spoza listy. `forbid` (domyślnie) wyłapuje literówki
     * — to najczęstszy błąd w pliku konfiguracyjnym i najtrudniejszy do
     * zauważenia, bo nieznany klucz jest po prostu ignorowany i ustawienie
     * cicho nie działa.
     */
    additional?: 'forbid' | 'allow';
}

export interface MapNode extends Base {
    kind: 'map';
    /** Wzorzec klucza — nazwy celów, komponentów, modułów. */
    keyPattern?: RegExp;
    keyHint?: string;
    of: SchemaNode;
    /** Klucze obsługiwane osobno, pomijane przy sprawdzaniu `of`. */
    reserved?: readonly string[];
}

export interface UnionNode extends Base {
    kind: 'union';
    /** Sprawdzane po kolei; pierwszy pasujący wygrywa. */
    options: readonly SchemaNode[];
}

export interface AnyNode extends Base {
    kind: 'any';
}

// --- skróty ---------------------------------------------------------------

export const str = (doc: string, extra: Omit<StringNode, 'kind' | 'doc'> = {}): StringNode =>
    ({ kind: 'string', doc, ...extra });
export const num = (doc: string, extra: Omit<NumberNode, 'kind' | 'doc'> = {}): NumberNode =>
    ({ kind: 'number', doc, ...extra });
export const bool = (doc: string): BoolNode => ({ kind: 'bool', doc });
export const oneOf = (doc: string, values: readonly string[]): EnumNode =>
    ({ kind: 'enum', doc, values });
export const list = (doc: string, of: SchemaNode, extra: Omit<ArrayNode, 'kind' | 'doc' | 'of'> = {}): ArrayNode =>
    ({ kind: 'array', doc, of, ...extra });
export const obj = (doc: string, fields: Record<string, Field>,
                    additional: 'forbid' | 'allow' = 'forbid'): ObjectNode =>
    ({ kind: 'object', doc, fields, additional });
export const map = (doc: string, of: SchemaNode, extra: Omit<MapNode, 'kind' | 'doc' | 'of'> = {}): MapNode =>
    ({ kind: 'map', doc, of, ...extra });
export const anyOf = (doc: string, options: readonly SchemaNode[]): UnionNode =>
    ({ kind: 'union', doc, options });
export const any = (doc: string): AnyNode => ({ kind: 'any', doc });

const required = (type: SchemaNode): Field => ({ type, required: true });
const optional = (type: SchemaNode): Field => ({ type });

export { required, optional };
