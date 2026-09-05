/**
 * nodeVersion.ts — czy Node backendu pasuje do wymagań projektu.
 *
 * Niezgodność wersji objawia się **błędem składni w cudzej zależności**:
 * biblioteka używa `??=` albo `Object.groupBy`, starszy Node tego nie parsuje
 * i wypisuje `SyntaxError` ze ścieżką w `node_modules`. Wygląda to na zepsutą
 * bibliotekę i tak się to zwykle najpierw diagnozuje.
 *
 * Sprawdzenie jest **ostrzeżeniem, nie blokadą**: deklaracja `engines` bywa
 * przesadnie ciasna, a projekt i tak działa. Odmowa uruchomienia byłaby
 * gorsza niż zdanie w konsoli.
 */

export interface NodeRequirement {
    /** Skąd wymaganie pochodzi — do pokazania w komunikacie. */
    source: '.nvmrc' | 'engines.node';
    raw: string;
    /** Najmniejsza dopuszczalna wersja główna; `null`, gdy nie da się odczytać. */
    minMajor: number | null;
}

/** Wersja główna z napisu w rodzaju `v20.11.0`, `20`, `20.x`. */
export function majorOf(version: string): number | null {
    const m = /(\d+)/.exec(String(version ?? '').trim().replace(/^v/i, ''));
    if (!m) return null;
    const value = Number(m[1]);
    return Number.isFinite(value) ? value : null;
}

/**
 * Wymaganie z `.nvmrc` albo z `engines.node`.
 *
 * `.nvmrc` ma pierwszeństwo: jest jednoznaczny („ta wersja"), a `engines`
 * bywa zakresem odziedziczonym po szablonie projektu.
 */
export function readRequirement(
    nvmrc: string | null,
    enginesNode: string | undefined,
): NodeRequirement | null {
    if (nvmrc && nvmrc.trim()) {
        return { source: '.nvmrc', raw: nvmrc.trim(), minMajor: majorOf(nvmrc) };
    }
    if (enginesNode && enginesNode.trim()) {
        return { source: 'engines.node', raw: enginesNode.trim(), minMajor: majorOf(enginesNode) };
    }
    return null;
}

/**
 * Ostrzeżenie, gdy działający Node jest **starszy** niż wymagany.
 *
 * Nowszy nie jest ostrzegany: górne ograniczenia w `engines` są prawie zawsze
 * odziedziczone po szablonie i zdezaktualizowane, a ostrzeżenie, które pada
 * przy każdym uruchomieniu, przestaje być czytane.
 */
export function versionWarning(
    requirement: NodeRequirement | null,
    runningVersion: string,
): string | null {
    if (!requirement || requirement.minMajor === null) return null;
    const running = majorOf(runningVersion);
    if (running === null || running >= requirement.minMajor) return null;
    return `Projekt oczekuje Node ${requirement.raw} (${requirement.source}), `
        + `a backend działa na ${runningVersion}. Zależności mogą nie dać się wczytać `
        + '— objawem bywa błąd składni w node_modules.';
}
