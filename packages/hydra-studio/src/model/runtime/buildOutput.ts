/**
 * Odczyt wyniku budowy.
 *
 * Pasek stanu w mockupie pokazuje zajętość pamięci Flash i RAM. Liczby te
 * wypisuje PlatformIO na końcu budowy i to jedyne miejsce, w którym są znane —
 * wyliczanie ich z pliku wsadu wymagałoby własnego czytnika ELF-a dla trzech
 * architektur.
 *
 * Rozbieramy też błędy kompilatora, żeby panel „Problemy" mógł przenieść
 * kursor we właściwy wiersz. Format komunikatów GCC i Clanga jest ten sam
 * od dziesięcioleci, więc jeden wzorzec wystarcza.
 */

export interface MemoryUsage {
    /** Zajęte bajty. */
    used: number;
    /** Całkowity rozmiar. */
    total: number;
    /** Udział w procentach — tak jak pokazuje to pasek stanu. */
    percent: number;
}

export interface BuildSummary {
    ok: boolean;
    ram?: MemoryUsage;
    flash?: MemoryUsage;
    /** Nazwa środowiska, jeśli dało się ją odczytać. */
    environment?: string;
    durationMs?: number;
}

export interface CompilerMessage {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'note';
    text: string;
}

export function parseBuildOutput(output: string): BuildSummary {
    const summary: BuildSummary = { ok: /\[SUCCESS\]/.test(output) };

    const ram = /RAM:\s+\[[^\]]*\]\s+([\d.]+)%\s+\(used (\d+) bytes from (\d+) bytes\)/.exec(output);
    if (ram) {
        summary.ram = { used: Number(ram[2]), total: Number(ram[3]), percent: Number(ram[1]) };
    }

    const flash = /Flash:\s+\[[^\]]*\]\s+([\d.]+)%\s+\(used (\d+) bytes from (\d+) bytes\)/.exec(output);
    if (flash) {
        summary.flash = { used: Number(flash[2]), total: Number(flash[3]), percent: Number(flash[1]) };
    }

    const environment = /^(\S+)\s+(?:SUCCESS|FAILED)\s/m.exec(output);
    if (environment) summary.environment = environment[1]!;

    const duration = /Took ([\d.]+) seconds/.exec(output);
    if (duration) summary.durationMs = Math.round(Number(duration[1]) * 1000);

    return summary;
}

/**
 * Wyłuskuje komunikaty kompilatora.
 *
 * Bierzemy tylko pierwszy wiersz każdego komunikatu — rozwinięcie z nazwami
 * typów szablonowych bywa dłuższe niż ekran i w panelu „Problemy" przesłania
 * pozostałe błędy. Pełną treść widać w zakładce kompilacji.
 */
export function parseCompilerMessages(output: string): CompilerMessage[] {
    const messages: CompilerMessage[] = [];
    const pattern = /^(.+?):(\d+):(\d+):\s+(error|warning|note):\s+(.+)$/gm;

    for (const match of output.matchAll(pattern)) {
        messages.push({
            file: match[1]!,
            line: Number(match[2]),
            column: Number(match[3]),
            severity: match[4] as CompilerMessage['severity'],
            text: match[5]!,
        });
    }
    return messages;
}

/** Udział zajętości jako tekst do paska stanu: „Flash 10,0%". */
export function formatUsage(label: string, usage: MemoryUsage | undefined): string {
    if (!usage) return label;
    return `${label} ${usage.percent.toFixed(1).replace('.', ',')}%`;
}
