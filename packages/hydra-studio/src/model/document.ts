/**
 * Wczytywanie pliku .hydra i nanoszenie na niego punktowych zmian.
 *
 * Plik jest edytowany z dwóch stron: ręcznie i przez formularze w Studiu.
 * Kuszące jest wczytać go do struktury, zmienić pole i zapisać całość z
 * powrotem — ale każdy zapis przechodzi wtedy przez serializator, który
 * normalizuje formatowanie: wyrównanie komentarzy do kolumny, odstępy
 * w listach zapisanych w jednej linii, czasem położenie komentarza względem
 * klucza. Po jednym kliknięciu w inspektorze historia zmian pokazuje
 * przebudowany plik zamiast jednej poprawki.
 *
 * Dlatego zmiany są **przedziałami tekstu**: model YAML służy do nawigacji
 * i do wyznaczania zakresów, a modyfikacja podmienia dokładnie tyle znaków,
 * ile trzeba. Reszta pliku zostaje bajt w bajt. Jest to zarazem dokładnie to,
 * czego oczekuje Monaco, które stosuje listę zmian, a nie całą treść.
 */

import { parseDocument, isMap, isSeq, isScalar, type Document, type Node, type ParsedNode } from 'yaml';

import type { Position } from './diagnostics';

export type PathSegment = string | number;

/** Podmiana fragmentu tekstu — zakres liczony w znakach od początku pliku. */
export interface TextEdit {
    start: number;
    end: number;
    text: string;
}

export class HydraDocument {
    private readonly edits: TextEdit[] = [];

    private constructor(
        private readonly doc: Document.Parsed<ParsedNode>,
        readonly source: string,
    ) {}

    static parse(source: string): HydraDocument {
        return new HydraDocument(parseDocument(source, { keepSourceTokens: true }), source);
    }

    /** Błędy składni YAML — zanim w ogóle da się mówić o schemacie. */
    get syntaxErrors(): readonly { message: string; at: Position }[] {
        return this.doc.errors.map((e) => ({ message: e.message, at: this.positionAt(e.pos[0]) }));
    }

    /** Zwykły obiekt JavaScriptu — do walidacji i emiterów. */
    toJS(): unknown {
        return this.doc.toJS({ maxAliasCount: 100 });
    }

    get(path: readonly PathSegment[]): unknown {
        if (path.length === 0) return this.toJS();
        const node = this.nodeAt(path);
        return node === undefined ? undefined : (node as { toJSON?(): unknown }).toJSON?.() ?? undefined;
    }

    has(path: readonly PathSegment[]): boolean {
        return this.nodeAt(path) !== undefined;
    }

    /** Pozycja pola w pliku — dla panelu „Problemy" i podkreśleń w edytorze. */
    positionOf(path: readonly PathSegment[]): Position | undefined {
        const range = this.nodeAt(path)?.range;
        return range ? this.positionAt(range[0]) : undefined;
    }

    // --- zmiany -----------------------------------------------------------

    /**
     * Podmienia wartość istniejącego pola prostego.
     *
     * Zwraca `false`, gdy pola nie ma albo nie jest wartością prostą — wtedy
     * potrzebna jest zmiana strukturalna, którą wykonuje `insertKey`.
     * Rozdzielenie tych dwóch przypadków jest celowe: podmiana wartości musi
     * być zawsze bezstratna, a wstawianie nowego klucza z natury dopisuje
     * tekst i wymaga decyzji o wcięciu.
     */
    setScalar(path: readonly PathSegment[], value: string | number | boolean): boolean {
        const node = this.nodeAt(path);
        if (!node || !isScalar(node) || !node.range) return false;

        const [start, valueEnd] = node.range;
        this.edits.push({ start, end: valueEnd, text: formatScalar(value, node.source) });
        return true;
    }

    /**
     * Dopisuje klucz do istniejącego odwzorowania, zachowując jego wcięcie.
     * Wstawia na końcu, tuż za ostatnim polem — nie na końcu pliku, bo tam
     * trafiłby do zupełnie innej sekcji.
     */
    insertKey(parentPath: readonly PathSegment[], key: string, value: string | number | boolean): boolean {
        return this.insertRawValue(parentPath, key, formatScalar(value));
    }

    /**
     * Dopisuje klucz o wartości złożonej, zapisanej w jednej linii:
     * `baro: { part: "BMP280 @ i2c0:0x76" }`.
     *
     * Osobna operacja, a nie `insertKey` z gotowym tekstem YAML: tamta traktuje
     * wartość jako tekst i słusznie ujmuje ją w cudzysłowy, bo zaczyna się od
     * klamry. Tutaj składamy zapis sami i cytujemy każdą wartość osobno, więc
     * reguła cytowania zostaje w jednym miejscu.
     */
    insertMapping(parentPath: readonly PathSegment[], key: string,
                  entries: readonly [string, string | number | boolean][]): boolean {
        const body = entries
            .map(([name, value]) => `${name}: ${formatScalar(value, undefined, 'flow')}`)
            .join(', ');
        return this.insertRawValue(parentPath, key, `{ ${body} }`);
    }

    /**
     * Dopisuje sekcję najwyższego poziomu na końcu pliku.
     *
     * Potrzebne, gdy sekcji jeszcze nie ma — projekt bez ani jednej paczki nie
     * ma `dependencies`, a wstawianie pierwszego komponentu musi ją utworzyć.
     * Sekcja ląduje na końcu, bo to jedyne miejsce, w którym nie rozdziela
     * niczego, co autor pliku ułożył obok siebie.
     */
    appendSection(key: string, entries: readonly [string, string][], comment?: string): boolean {
        if (this.nodeAt([key]) !== undefined) return false;

        const lines: string[] = [''];
        if (comment) lines.push(`# ${comment}`);
        lines.push(`${key}:`);
        for (const [name, value] of entries) lines.push(`  ${name}: ${value}`);

        const at = this.source.length;
        const separator = this.source.endsWith('\n') ? '' : '\n';
        this.edits.push({ start: at, end: at, text: separator + lines.join('\n') + '\n' });
        return true;
    }

    /** Wspólna część wstawiania klucza: wcięcie i miejsce w pliku. */
    private insertRawValue(parentPath: readonly PathSegment[], key: string, raw: string): boolean {
        const parent = this.nodeAt(parentPath);
        if (!parent || !isMap(parent) || parent.items.length === 0) return false;

        const last = parent.items[parent.items.length - 1];
        const lastNode = (last?.value ?? last?.key) as Node | undefined;
        if (!lastNode?.range) return false;

        const insertAt = this.endOfLine(lastNode.range[1]);
        const indent = this.indentOfLineAt(this.startOfLine(lastNode.range[0]));
        this.edits.push({ start: insertAt, end: insertAt, text: `\n${indent}${key}: ${raw}` });
        return true;
    }

    /** Usuwa pole razem z jego wierszem — inaczej zostawałaby pusta linia. */
    removeKey(path: readonly PathSegment[]): boolean {
        const node = this.nodeAt(path);
        if (!node?.range) return false;

        const lineStart = this.startOfLine(node.range[0]);
        // Do początku następnego wiersza, żeby nie zostawiać osieroconego \n.
        let end = this.endOfLine(node.range[1]);
        if (this.source[end] === '\n') end += 1;
        this.edits.push({ start: lineStart, end, text: '' });
        return true;
    }

    /** Dopisuje komentarz nad polem, z jego wcięciem. */
    setComment(path: readonly PathSegment[], comment: string): boolean {
        const node = this.nodeAt(path);
        if (!node?.range) return false;

        const lineStart = this.startOfLine(node.range[0]);
        const indent = this.indentOfLineAt(lineStart);
        this.edits.push({ start: lineStart, end: lineStart, text: `${indent}# ${comment}\n` });
        return true;
    }

    /** Naniesione zmiany, uporządkowane — do przekazania edytorowi. */
    pendingEdits(): readonly TextEdit[] {
        return [...this.edits].sort((a, b) => a.start - b.start);
    }

    get modified(): boolean {
        return this.edits.length > 0;
    }

    /**
     * Treść po naniesieniu zmian. Bez zmian zwraca oryginał bajt w bajt —
     * otwarcie pliku i zamknięcie go bez ruchu nie zostawia śladu.
     */
    toString(): string {
        if (this.edits.length === 0) return this.source;

        // Od końca, żeby wcześniejsze podmiany nie przesuwały kolejnych zakresów.
        const ordered = [...this.edits].sort((a, b) => b.start - a.start);
        let result = this.source;
        for (const edit of ordered) {
            result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
        }
        return result;
    }

    // --- wnętrze ----------------------------------------------------------

    private nodeAt(path: readonly PathSegment[]): Node | undefined {
        if (path.length === 0) return (this.doc.contents ?? undefined) as Node | undefined;

        let current: unknown = this.doc.contents;
        for (const segment of path) {
            if (isMap(current)) {
                const pair = current.items.find(
                    (item) => isScalar(item.key) && String(item.key.value) === String(segment));
                if (!pair?.value) return undefined;
                current = pair.value;
            } else if (isSeq(current) && typeof segment === 'number') {
                current = current.items[segment];
            } else {
                return undefined;
            }
            if (current === undefined || current === null) return undefined;
        }
        return current as Node;
    }

    private startOfLine(offset: number): number {
        const previous = this.source.lastIndexOf('\n', Math.max(0, offset - 1));
        return previous === -1 ? 0 : previous + 1;
    }

    private endOfLine(offset: number): number {
        const next = this.source.indexOf('\n', offset);
        return next === -1 ? this.source.length : next;
    }

    private indentOfLineAt(lineStart: number): string {
        const match = /^[ \t]*/.exec(this.source.slice(lineStart));
        return match ? match[0] : '';
    }

    /** Pozycja liczona od 1 — tak pokazują ją edytory i tak czyta ją człowiek. */
    private positionAt(offset: number): Position {
        let line = 1;
        let lineStart = 0;
        for (let i = 0; i < offset && i < this.source.length; i++) {
            if (this.source[i] === '\n') {
                line++;
                lineStart = i + 1;
            }
        }
        return { line, column: offset - lineStart + 1 };
    }
}

/**
 * Zapis wartości w YAML-u.
 *
 * Cudzysłowy dodajemy tylko wtedy, gdy bez nich wartość zmieniłaby znaczenie.
 * Nadgorliwość też jest wadą: „2.0.0" nie jest liczbą w YAML-u i ujęcie go
 * w cudzysłowy zmieniałoby zapis w całym pliku bez powodu, zaśmiecając
 * historię zmian. Za to „0.4" liczbą jest — i bez cudzysłowów przestałoby
 * być wersją schematu.
 */
function formatScalar(value: string | number | boolean, previousSource?: string,
                     context: 'block' | 'flow' = 'block'): string {
    if (typeof value !== 'string') return String(value);

    // Wartość zastana w cudzysłowach zostaje w cudzysłowach — autor pliku
    // mógł mieć powód, którego nie znamy.
    const wasQuoted = previousSource !== undefined
        && (previousSource.startsWith('"') || previousSource.startsWith("'"));

    return wasQuoted || needsQuotes(value, context)
        ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
        : value;
}

/** Wzorce, które YAML przeczytałby jako coś innego niż tekst. */
const YAML_NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const YAML_SPECIAL_NUMBER = /^[-+]?(?:0x[0-9a-fA-F]+|0o[0-7]+|\.inf|\.nan)$/i;
const YAML_BOOL_OR_NULL = /^(?:true|false|null|yes|no|on|off|y|n|~)$/i;

function needsQuotes(value: string, context: 'block' | 'flow' = 'block'): boolean {
    // W zapisie jednowierszowym `{ a: b, c: d }` przecinek, dwukropek i klamry
    // rozdzielają wpisy — wartość, która je zawiera, musi być w cudzysłowach,
    // choć w zwykłym zapisie byłaby poprawna bez nich. Adres „BMP280 @ i2c0:0x76"
    // to dokładnie ten przypadek.
    if (context === 'flow' && /[:,{}[\]]/.test(value)) return true;

    if (value === '') return true;
    if (value !== value.trim()) return true;                    // odstępy na brzegach giną
    if (YAML_NUMBER.test(value)) return true;
    if (YAML_SPECIAL_NUMBER.test(value)) return true;
    if (YAML_BOOL_OR_NULL.test(value)) return true;

    // Znaki, które na początku wartości mają w YAML-u własne znaczenie.
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(value)) return true;

    // Dwukropek ze spacją rozpoczyna nową parę klucz-wartość, a spacja
    // z kratką — komentarz do końca wiersza.
    if (/:\s/.test(value) || /\s#/.test(value)) return true;

    return false;
}
