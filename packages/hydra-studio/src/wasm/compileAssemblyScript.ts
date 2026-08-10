/**
 * Kompilacja modułu AssemblyScript do WebAssembly — w przeglądarce.
 *
 * To jest ten kawałek, dla którego cała reszta powstała. Wsad na płytkę wymaga
 * kontenera z PlatformIO ważącego 13,8 GB; moduł WebAssembly nie wymaga
 * niczego, bo kompilator AssemblyScriptu jest w JavaScripcie i chodzi tam,
 * gdzie edytor. Użytkownik pisze logikę, klika i wgrywa — bez instalowania
 * czegokolwiek.
 *
 * ## Dlaczego wirtualny system plików
 *
 * `asc` normalnie czyta z dysku. W przeglądarce dysku nie ma, a i w Node nie
 * chcemy zapisywać plików tylko po to, żeby je zaraz odczytać. `asc.main()`
 * przyjmuje trójkę `readFile`/`writeFile`/`listFiles`, więc podajemy mu mapę
 * w pamięci — ta sama funkcja działa wtedy pod testami w Node i w workerze
 * przeglądarki, i to jest jedyny sposób, żeby test naprawdę sprawdzał to, co
 * uruchomi użytkownik.
 *
 * ## Deklaracje importów
 *
 * `assembly/hydra.ts` **generuje Hydra** z `tools/wasm_bindings.def` — tego
 * samego pliku, z którego powstają tablice rejestracyjne w C++. Studio go nie
 * pisze i nie powinno: rozjazd deklaracji z implementacją oznaczałby moduł,
 * który się buduje i wywraca dopiero na urządzeniu.
 */

/** Plik wejściowy modułu. Reszta źródeł dochodzi przez `sources`. */
export const ENTRY_FILE = 'assembly/index.ts';

export interface CompileRequest {
    /**
     * Źródła modułu, ścieżka → treść. Musi zawierać `assembly/index.ts`
     * oraz `assembly/hydra.ts` z deklaracjami importów.
     */
    sources: Record<string, string>;
    /**
     * Optymalizacja. `release` daje mniejszy moduł i szybsze wykonanie,
     * `debug` zachowuje nazwy i asercje — na urządzeniu z ciasną pulą różnica
     * bywa rzędu kilku kilobajtów.
     */
    mode?: 'debug' | 'release';
    /**
     * Strony pamięci liniowej (po 64 kB). Jedna wystarcza logice sterującej;
     * moduł, który przekroczy zadeklarowane maksimum, dostaje błąd zamiast
     * po cichu rosnąć.
     */
    memoryPages?: number;
}

export interface CompileDiagnostic {
    severity: 'error' | 'warning' | 'info';
    text: string;
}

export interface CompileResult {
    ok: boolean;
    /** Bajty modułu. Puste, gdy kompilacja się nie powiodła. */
    wasm: Uint8Array;
    /** Postać tekstowa — do podglądu, nie do wgrywania. */
    wat?: string;
    diagnostics: CompileDiagnostic[];
    /** Surowe wyjście kompilatora; przydatne, gdy diagnostyka nie wystarcza. */
    output: string;
    /** Czas kompilacji w milisekundach. */
    elapsedMs: number;
}

/** Rozdziela wyjście kompilatora na pojedyncze rozpoznania. */
function parseDiagnostics(text: string): CompileDiagnostic[] {
    const out: CompileDiagnostic[] = [];
    // `asc` zaczyna każdą diagnostykę od słowa kluczowego i numeru, a linie
    // kontekstu wcina. Sklejamy je z nagłówkiem, żeby w interfejsie było widać
    // wskazany fragment kodu, a nie samą treść komunikatu.
    let current: CompileDiagnostic | null = null;

    for (const line of text.split('\n')) {
        const header = /^(ERROR|WARNING|INFO)\s/.exec(line);
        if (header) {
            if (current) out.push(current);
            const severity = header[1] === 'ERROR' ? 'error'
                : header[1] === 'WARNING' ? 'warning' : 'info';
            current = { severity, text: line.trim() };
            continue;
        }
        if (current && line.trim().length > 0) current.text += `\n${line}`;
    }
    if (current) out.push(current);
    return out;
}

/**
 * Kompiluje moduł. Nie rzuca — błąd kompilacji jest wynikiem, a nie wyjątkiem:
 * literówka w kodzie użytkownika to normalny bieg rzeczy, a nie awaria Studia.
 */
export async function compileAssemblyScript(request: CompileRequest): Promise<CompileResult> {
    const started = Date.now();

    if (!request.sources[ENTRY_FILE]) {
        return {
            ok: false,
            wasm: new Uint8Array(),
            diagnostics: [{ severity: 'error', text: `Brak pliku wejściowego ${ENTRY_FILE}.` }],
            output: '',
            elapsedMs: 0,
        };
    }

    // Import dynamiczny: `asc` waży kilka megabajtów i nie ma powodu, żeby
    // wchodził do paczki, dopóki nikt nie kliknie „Kompiluj".
    const asc = (await import('assemblyscript/asc')).default;

    const written = new Map<string, Uint8Array | string>();
    let output = '';

    const memoryPages = request.memoryPages ?? 1;
    const args = [
        ENTRY_FILE,
        '--outFile', 'module.wasm',
        '--textFile', 'module.wat',
        // `stub` zamiast pełnego odśmiecacza: ten alokuje w trakcie pracy,
        // a moduł ma się mieścić w puli ustalonej przy linkowaniu urządzenia.
        '--runtime', 'stub',
        '--initialMemory', String(memoryPages),
        '--maximumMemory', String(Math.max(memoryPages, 2)),
        // Bez tego AssemblyScript żąda importu `abort` z modułu `env`,
        // a Hydra wystawia wyłącznie moduł `hydra` — moduł by się nie wczytał.
        '--use', 'abort=',
    ];
    if (request.mode !== 'debug') args.push('--optimize', '--shrinkLevel', '2', '--converge');
    else args.push('--debug');

    const { error, stdout, stderr } = await asc.main(args, {
        readFile(filename: string) {
            const direct = request.sources[filename];
            if (direct !== undefined) return direct;
            // `asc` pyta też o ścieżki względne wobec katalogu wejściowego.
            const trimmed = filename.replace(/^\.\//, '');
            return request.sources[trimmed] ?? null;
        },
        writeFile(filename: string, contents: Uint8Array | string) {
            written.set(filename, contents);
        },
        listFiles() {
            // Biblioteka standardowa AssemblyScriptu jest wpieczona w `asc`,
            // więc katalogów nie ma czego wyliczać — a zwrócenie `null`
            // kończyłoby się szukaniem po nieistniejącym dysku.
            return [];
        },
        stdout: { write(chunk: string) { output += chunk; } } as never,
        stderr: { write(chunk: string) { output += chunk; } } as never,
    });

    void stdout;
    void stderr;

    const diagnostics = parseDiagnostics(output);
    const elapsedMs = Date.now() - started;

    if (error) {
        if (!diagnostics.some(d => d.severity === 'error')) {
            diagnostics.push({ severity: 'error', text: String(error.message ?? error) });
        }
        return { ok: false, wasm: new Uint8Array(), diagnostics, output, elapsedMs };
    }

    const binary = written.get('module.wasm');
    if (!(binary instanceof Uint8Array)) {
        diagnostics.push({ severity: 'error', text: 'Kompilator nie oddał modułu.' });
        return { ok: false, wasm: new Uint8Array(), diagnostics, output, elapsedMs };
    }

    const text = written.get('module.wat');
    return {
        ok: true,
        wasm: binary,
        wat: typeof text === 'string' ? text : undefined,
        diagnostics,
        output,
        elapsedMs,
    };
}

/** Skrót SHA-256 obrazu w zapisie szesnastkowym — tego żąda `begin` przy wgrywaniu. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
