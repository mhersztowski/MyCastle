/**
 * Zapis przebiegów w formacie VCD.
 *
 * Format wybrany, bo czytają go wszystkie narzędzia do oglądania przebiegów —
 * GTKWave, Surfer, PulseView. Własny format oznaczałby własną przeglądarkę,
 * a tej nikt nie potrzebuje: analiza przebiegów to dojrzała dziedzina
 * z gotowymi narzędziami.
 *
 * Zapisujemy to, co dzieje się na magistralach i na magistrali zdarzeń.
 * Sygnały cyfrowe idą jako pojedyncze bity, wartości liczbowe jako wektory
 * — tak jak zapisałby je analizator stanów logicznych.
 */

export interface VcdSignal {
    /** Nazwa widoczna w przeglądarce przebiegów. */
    name: string;
    /** Liczba bitów; 1 oznacza sygnał pojedynczy. */
    width: number;
    /** Grupa, np. „i2c0" — przeglądarki układają je w drzewo. */
    scope?: string;
}

export interface VcdChange {
    t_us: number;
    signal: string;
    /** Wartość: `0`/`1` dla bitu, liczba dla wektora, `undefined` dla stanu nieznanego. */
    value: number | undefined;
}

/**
 * Składa plik VCD z opisu sygnałów i listy zmian.
 *
 * Zapisujemy wyłącznie zmiany, nie każdą chwilę: przebieg z magistrali I²C
 * przy 400 kHz i kroku 1 µs to milion próbek na sekundę, z czego zmienia się
 * garstka. Plik z każdą próbką byłby setki razy większy i wolniejszy do
 * otwarcia, nie niosąc ani jednej dodatkowej informacji.
 */
export function writeVcd(signals: readonly VcdSignal[], changes: readonly VcdChange[],
                         options: { date?: string; comment?: string } = {}): string {
    const ids = assignIdentifiers(signals);
    const lines: string[] = [];

    lines.push(`$date ${options.date ?? 'nieznana'} $end`);
    lines.push('$version Hydra Studio $end');
    if (options.comment) lines.push(`$comment ${options.comment} $end`);
    // Skala czasu równa krokowi symulacji: mikrosekunda to najmniejsza
    // jednostka, w jakiej cokolwiek tu się zmienia.
    lines.push('$timescale 1us $end');

    // Sygnały bez grupy trafiają do korzenia; reszta do własnych gałęzi.
    const scopes = new Map<string, VcdSignal[]>();
    for (const signal of signals) {
        const scope = signal.scope ?? '';
        scopes.set(scope, [...(scopes.get(scope) ?? []), signal]);
    }

    lines.push('$scope module hydra $end');
    for (const [scope, group] of scopes) {
        if (scope !== '') lines.push(`$scope module ${scope} $end`);
        for (const signal of group) {
            lines.push(`$var wire ${signal.width} ${ids.get(signal.name)} ${signal.name} $end`);
        }
        if (scope !== '') lines.push('$upscope $end');
    }
    lines.push('$upscope $end');
    lines.push('$enddefinitions $end');

    // Stan początkowy: wszystko nieznane. Bez tego przeglądarka rysuje zero
    // od chwili zerowej, co jest twierdzeniem, którego nie sprawdziliśmy.
    lines.push('$dumpvars');
    for (const signal of signals) {
        lines.push(formatValue(signal, undefined, ids.get(signal.name)!));
    }
    lines.push('$end');

    const byName = new Map(signals.map((signal) => [signal.name, signal]));
    let lastTime = -1;

    for (const change of [...changes].sort((a, b) => a.t_us - b.t_us)) {
        const signal = byName.get(change.signal);
        if (!signal) continue;

        if (change.t_us !== lastTime) {
            lines.push(`#${Math.max(0, Math.round(change.t_us))}`);
            lastTime = change.t_us;
        }
        lines.push(formatValue(signal, change.value, ids.get(signal.name)!));
    }

    return lines.join('\n') + '\n';
}

/**
 * Identyfikatory sygnałów w VCD to pojedyncze znaki drukowalne — format
 * powstał, gdy każdy bajt się liczył, i tak już zostało.
 */
function assignIdentifiers(signals: readonly VcdSignal[]): Map<string, string> {
    const ids = new Map<string, string>();
    let code = 33;   // pierwszy znak drukowalny, wykrzyknik
    for (const signal of signals) {
        ids.set(signal.name, String.fromCharCode(code++));
        if (code === 127) code = 33;   // przy setkach sygnałów zaczynamy od nowa
    }
    return ids;
}

function formatValue(signal: VcdSignal, value: number | undefined, id: string): string {
    if (signal.width === 1) {
        const bit = value === undefined ? 'x' : value ? '1' : '0';
        return `${bit}${id}`;
    }
    const bits = value === undefined
        ? 'x'
        : (value >>> 0).toString(2).slice(-signal.width);
    return `b${bits} ${id}`;
}

/**
 * Buduje opis sygnałów dla magistral wskazanych w `simulation.record.vcd`.
 *
 * Każda magistrala daje swoje linie: I²C — dane i zegar, SPI — zegar, dwie
 * linie danych i wybór układu.
 */
export function signalsForBuses(buses: readonly string[]): VcdSignal[] {
    const lines: Readonly<Record<string, readonly string[]>> = {
        i2c: ['sda', 'scl'],
        spi: ['sck', 'mosi', 'miso', 'cs'],
        uart: ['tx', 'rx'],
        can: ['ch', 'cl'],
    };

    const out: VcdSignal[] = [];
    for (const bus of buses) {
        const kind = bus.replace(/\d+$/, '');
        for (const line of lines[kind] ?? ['d']) {
            out.push({ name: `${bus}_${line}`, width: 1, scope: bus });
        }
    }
    return out;
}
