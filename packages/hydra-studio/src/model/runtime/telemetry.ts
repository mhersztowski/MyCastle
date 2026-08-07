/**
 * Odbiór tego, co urządzenie mówi o sobie — panel dolny Studia.
 *
 * Trzy strumienie: wiersze z portu szeregowego, zdarzenia z magistrali
 * i pomiary. Wszystkie trafiają do buforów cyklicznych o stałym rozmiarze,
 * bo urządzenie potrafi mówić szybciej, niż człowiek czyta, a przeglądarka
 * z nieograniczoną listą wierszy zatrzymuje się po kilku minutach pracy.
 *
 * Rozbiór wierszy jest tolerancyjny: to, czego nie rozpoznamy, zostaje
 * wierszem tekstu. Monitor, który gubi nieznane komunikaty, jest gorszy od
 * takiego, który pokazuje wszystko — w tym akurat momencie szuka się zwykle
 * czegoś, czego nikt nie przewidział.
 */

/** Poziomy zgodne z `LogLevel` frameworka. */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogLine {
    /** Chwila odbioru, w milisekundach od uruchomienia Studia. */
    at: number;
    level: LogLevel | undefined;
    /** Moduł frameworka, jeśli dało się go odczytać. */
    module?: string;
    text: string;
    /** Surowy wiersz — do skopiowania bez interpretacji. */
    raw: string;
}

export interface EventLine {
    at: number;
    topic: string;
    payload: string;
}

/**
 * Bufor cykliczny o stałej pojemności.
 *
 * Po zapełnieniu nadpisuje najstarsze wpisy. Liczy też, ile ich odrzucono —
 * bez tego licznika „widzę 500 wierszy" nie odróżnia się od „widzę wszystkie".
 */
export class RingBuffer<T> {
    private readonly items: T[] = [];
    private dropped = 0;

    constructor(readonly capacity: number) {}

    push(item: T): void {
        this.items.push(item);
        if (this.items.length > this.capacity) {
            this.items.shift();
            this.dropped++;
        }
    }

    toArray(): readonly T[] {
        return this.items;
    }

    get length(): number {
        return this.items.length;
    }

    get droppedCount(): number {
        return this.dropped;
    }

    clear(): void {
        this.items.length = 0;
        this.dropped = 0;
    }
}

/**
 * Rozbiera wiersz logu frameworka.
 *
 * Format wypisywany przez `Log`: `[I][net.mqtt] połączono`. Wiersz w innej
 * postaci zwracamy jako sam tekst — bez poziomu i modułu, ale widoczny.
 */
export function parseLogLine(raw: string, at: number): LogLine {
    const match = /^\[([TDIWE])\]\[([^\]]+)\]\s?(.*)$/.exec(raw.trimEnd());
    if (!match) {
        return { at, level: undefined, text: raw.trimEnd(), raw };
    }

    const levels: Record<string, LogLevel> = {
        T: 'trace', D: 'debug', I: 'info', W: 'warn', E: 'error',
    };
    return {
        at,
        level: levels[match[1]!],
        module: match[2]!,
        text: match[3]!,
        raw,
    };
}

/**
 * Rozbiera wiersz w postaci klucz=wartość, którą wypisuje shell diagnostyczny.
 *
 * Ten sam format czyta harness testów sprzętowych — jeden zapis obsługuje
 * i człowieka przy monitorze, i skrypt w CI.
 */
export function parseFields(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const match of text.matchAll(/^([a-z_0-9]+)=(.*)$/gm)) {
        out[match[1]!] = match[2]!.trim();
    }
    return out;
}

/**
 * Dzieli napływające bajty na wiersze.
 *
 * Port szeregowy oddaje dane porcjami, które nie pokrywają się z wierszami —
 * ostatni fragment zwykle jest niedokończony i musi poczekać na resztę.
 * Sklejanie go od razu daje w monitorze wiersze pocięte w losowych miejscach.
 */
export class LineSplitter {
    private pending = '';

    push(chunk: string): string[] {
        const combined = this.pending + chunk;
        const parts = combined.split(/\r?\n/);
        this.pending = parts.pop() ?? '';
        return parts;
    }

    /** Zwraca i czyści niedokończony fragment — przy zamykaniu połączenia. */
    flush(): string | undefined {
        const rest = this.pending;
        this.pending = '';
        return rest === '' ? undefined : rest;
    }
}

/** Filtr monitora: poziom i tekst; pusty przepuszcza wszystko. */
export function filterLogs(lines: readonly LogLine[],
                           options: { minLevel?: LogLevel; query?: string }): LogLine[] {
    const threshold = options.minLevel ? LOG_LEVELS.indexOf(options.minLevel) : 0;
    const needle = (options.query ?? '').toLowerCase();

    return lines.filter((line) => {
        // Wiersz bez rozpoznanego poziomu przepuszczamy zawsze: to zwykle
        // komunikat bootloadera albo ślad po awarii, czyli dokładnie to,
        // czego się w takiej chwili szuka.
        if (line.level !== undefined && LOG_LEVELS.indexOf(line.level) < threshold) return false;
        if (needle === '') return true;
        return line.text.toLowerCase().includes(needle)
            || (line.module ?? '').toLowerCase().includes(needle);
    });
}
