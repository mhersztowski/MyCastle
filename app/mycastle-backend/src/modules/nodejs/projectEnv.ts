/**
 * projectEnv.ts — zmienne środowiskowe projektu (`.env` obok `package.json`).
 *
 * Bez tego każdy projekt wymagający klucza API dawał się uruchomić wyłącznie
 * z terminala, bo w Drive nie było gdzie tego klucza podać.
 *
 * Czytamy **podzbiór** składni `.env`: pary `KLUCZ=wartość`, komentarze,
 * cudzysłowy i opcjonalne `export`. Świadomie bez rozwijania `${ZMIENNA}`
 * i bez wartości wielolinijkowych — obie funkcje różnią się między narzędziami,
 * więc cicha rozbieżność byłaby gorsza niż ich brak.
 */

/** Nazwy, które powłoka i Node faktycznie przyjmą. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseDotEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const rawLine of String(text ?? '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
        const eq = withoutExport.indexOf('=');
        if (eq < 0) continue;   // linia bez przypisania — nie wywracamy pliku

        const name = withoutExport.slice(0, eq).trim();
        if (!NAME.test(name)) continue;

        // Wartość bierzemy **w całości** za pierwszym znakiem równości: tokeny
        // base64 kończą się `=` i cięcie na każdym uszkadzałoby je po cichu.
        let value = withoutExport.slice(eq + 1).trim();
        const quoted = (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"));
        if (quoted && value.length >= 2) value = value.slice(1, -1);
        out[name] = value;
    }
    return out;
}

/**
 * Zmienne, z którymi uruchomimy proces.
 *
 * Plik projektu przebija środowisko backendu — na tym polega `.env`. Wyjątkiem
 * jest `PATH`: jego podmiana decydowałaby, **który** node i npm się uruchomi,
 * a to nie jest konfiguracja projektu, tylko przejęcie środowiska procesu
 * serwera.
 */
const PROTECTED = new Set(['PATH', 'Path']);

export function mergeProjectEnv(
    base: Record<string, string | undefined>,
    fromFile: Record<string, string>,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(base)) {
        if (value !== undefined) out[key] = value;
    }
    for (const [key, value] of Object.entries(fromFile)) {
        if (PROTECTED.has(key)) continue;
        out[key] = value;
    }
    return out;
}
