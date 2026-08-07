/**
 * Diagnostyka pliku .hydra.
 *
 * Komunikat ma mówić, co jest nie tak, gdzie i co z tym zrobić. Sam „invalid
 * value at targets.esp32s3-main.memory.psram" zmusza czytelnika do zgadywania;
 * dopisanie dozwolonych wartości i pozycji w pliku zamienia to w poprawkę
 * jednym ruchem. Pozycja jest też tym, czego potrzebuje panel „Problemy"
 * w Studiu, żeby kliknięcie przenosiło kursor we właściwe miejsce.
 */

export type Severity = 'error' | 'warning' | 'info';

/** Pozycja w pliku, liczona od 1 — tak jak pokazują ją edytory. */
export interface Position {
    line: number;
    column: number;
}

export interface Diagnostic {
    severity: Severity;
    /** Ścieżka w modelu, np. `targets.esp32s3-main.memory.psram`. */
    path: string;
    message: string;
    /** Co zrobić, żeby naprawić. Wypisywane pod komunikatem. */
    hint?: string;
    /** Miejsce w pliku źródłowym; brak, gdy błąd dotyczy braku klucza. */
    at?: Position;
}

export function error(path: string, message: string, hint?: string, at?: Position): Diagnostic {
    return { severity: 'error', path, message, ...(hint !== undefined ? { hint } : {}),
             ...(at !== undefined ? { at } : {}) };
}

export function warning(path: string, message: string, hint?: string, at?: Position): Diagnostic {
    return { severity: 'warning', path, message, ...(hint !== undefined ? { hint } : {}),
             ...(at !== undefined ? { at } : {}) };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
    return diagnostics.some((d) => d.severity === 'error');
}

/**
 * Podpowiedź „czy chodziło o…" dla literówek w nazwach kluczy i wartości.
 * Odległość Levenshteina z progiem zależnym od długości — przy krótkich
 * nazwach jedna zmiana to już zupełnie inne słowo.
 */
export function didYouMean(input: string, candidates: readonly string[]): string | undefined {
    let best: string | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
        const distance = levenshtein(input.toLowerCase(), candidate.toLowerCase());
        if (distance < bestDistance) {
            bestDistance = distance;
            best = candidate;
        }
    }

    const limit = input.length <= 4 ? 1 : input.length <= 8 ? 2 : 3;
    return best !== undefined && bestDistance <= limit ? best : undefined;
}

function levenshtein(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    let current = new Array<number>(b.length + 1);

    for (let i = 1; i <= a.length; i++) {
        current[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
            const deletion = previous[j]! + 1;
            const insertion = current[j - 1]! + 1;
            current[j] = Math.min(substitution, deletion, insertion);
        }
        [previous, current] = [current, previous];
    }
    return previous[b.length]!;
}

/** Zestawienie dla wiersza poleceń: ścieżka, komunikat, podpowiedź. */
export function formatDiagnostics(diagnostics: readonly Diagnostic[], fileName = '.hydra'): string {
    if (diagnostics.length === 0) return '';

    const lines: string[] = [];
    for (const d of diagnostics) {
        const where = d.at ? `${fileName}:${d.at.line}:${d.at.column}` : fileName;
        const label = d.severity === 'error' ? 'błąd' : d.severity === 'warning' ? 'ostrzeżenie' : 'info';
        lines.push(`${where}: ${label}: ${d.message}`);
        lines.push(`  w: ${d.path}`);
        if (d.hint) lines.push(`  → ${d.hint}`);
    }
    return lines.join('\n');
}
