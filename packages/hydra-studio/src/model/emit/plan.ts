/**
 * Plan budowy — model po scaleniu, zanim zobaczą go emitery.
 *
 * Wszystkie rozstrzygnięcia zapadają tutaj: co nadpisuje co, które moduły są
 * włączone dla którego celu, jakie flagi wymusza układ. Emitery dostają gotowy
 * wynik i zajmują się już tylko składnią swojego formatu. Bez tego rozdziału
 * reguła „cel wyłącza moduł" musiałaby być powtórzona w każdym z nich —
 * i przy trzeciej kopii przestałaby być tą samą regułą.
 */

import { profileFor, type McuProfile } from './mcu';

/** Moduły opcjonalne frameworka i odpowiadające im flagi kompilacji. */
export const MODULE_FLAGS: Readonly<Record<string, string>> = {
    sense: 'HYDRA_ENABLE_SENSE',
    net: 'HYDRA_ENABLE_NET',
    ui: 'HYDRA_ENABLE_UI',
    motion: 'HYDRA_ENABLE_MOTION',
    ota: 'HYDRA_ENABLE_OTA',
};

export interface TargetPlan {
    /** Nazwa celu; służy zarazem za nazwę środowiska PlatformIO. */
    name: string;
    mcu: string;
    profile: McuProfile;
    /** Płytka PlatformIO — z pliku albo z profilu układu. */
    board: string;
    /** Nagłówek z opisem wyprowadzeń. */
    boardHeader: string | undefined;
    /** Moduły włączone dla tego celu, po uwzględnieniu nadpisań. */
    modules: readonly string[];
    /** Możliwości: zadeklarowane w pliku albo typowe dla układu. */
    capabilities: readonly string[];
    /** Czy możliwości podano wprost — brak znaczy „nie wiadomo", nie „nie ma". */
    capabilitiesDeclared: boolean;
    flags: readonly string[];
    libDeps: readonly string[];
    settings: Readonly<Record<string, string>>;
    /** Na platformach bez FPU regulatory pracują na Q16.16. */
    hasFpu: boolean;
}

export interface BuildPlan {
    projectName: string;
    projectVersion: string;
    description: string | undefined;
    defaultTarget: string | undefined;
    targets: readonly TargetPlan[];
    /** Zależności zebrane z paczek — trafiają do każdego środowiska. */
    packLibDeps: readonly string[];
    packBuildFlags: readonly string[];
    monitorSpeed: number;
}

export interface PlanOptions {
    /** Zależności bibliotek wniesione przez paczki. */
    packLibDeps?: readonly string[];
    packBuildFlags?: readonly string[];
}

export function buildPlan(model: unknown, options: PlanOptions = {}): BuildPlan {
    const root = asRecord(model) ?? {};
    const project = asRecord(root['project']) ?? {};
    const targetsSection = asRecord(root['targets']) ?? {};
    const modulesSection = asRecord(root['modules']) ?? {};

    const names = Object.keys(targetsSection).filter((key) => key !== 'default');
    const targets = names
        .map((name) => planTarget(name, targetsSection[name], modulesSection, root))
        .filter((target): target is TargetPlan => target !== undefined);

    const defaultTarget = typeof targetsSection['default'] === 'string'
        ? targetsSection['default']
        : targets[0]?.name;

    return {
        projectName: asString(project['name']) ?? 'projekt',
        projectVersion: asString(project['version']) ?? '0.0.0',
        description: asString(project['description']),
        defaultTarget,
        targets,
        packLibDeps: options.packLibDeps ?? [],
        packBuildFlags: options.packBuildFlags ?? [],
        monitorSpeed: monitorSpeedOf(root),
    };
}

function planTarget(name: string, raw: unknown, globalModules: Record<string, unknown>,
                    root: Record<string, unknown>): TargetPlan | undefined {
    const target = asRecord(raw);
    if (!target) return undefined;

    const mcu = asString(target['mcu']);
    if (!mcu) return undefined;

    // Nieznany układ nie jest powodem, żeby przerwać generowanie — walidator
    // już to zgłosił, a plan bez tego celu jest dalej użyteczny.
    const profile = profileFor(mcu);
    if (!profile) return undefined;

    const pio = asRecord(target['platformio']) ?? {};
    const board = asString(pio['board']) ?? profile.defaultBoard;

    const declared = asStringList(target['capabilities']);
    const capabilities = declared ?? profile.capabilities;

    const modules = enabledModules(globalModules, target);

    const flags: string[] = [...(profile.flags ?? [])];
    const settings: Record<string, string> = {};

    if (profile.core) settings['board_build.core'] = profile.core;

    const boardHeader = asString(target['board']);
    if (boardHeader) {
        flags.push(`-D HYDRA_BOARD_HEADER='"${headerInclude(boardHeader)}"'`);
    }

    for (const module of modules) {
        const flag = MODULE_FLAGS[module];
        if (flag) flags.push(`-D ${flag}=1`);
    }

    applyMemory(asRecord(target['memory']), flags, settings);
    applyClock(asRecord(target['platformio']), flags);
    applyLogLevel(asRecord(root['modules']), flags);

    return {
        name, mcu, profile, board,
        boardHeader: boardHeader ? headerInclude(boardHeader) : undefined,
        modules,
        capabilities,
        capabilitiesDeclared: declared !== undefined,
        flags,
        libDeps: profile.libDeps ?? [],
        settings,
        hasFpu: profile.hasFpu,
    };
}

/**
 * Moduły włączone dla celu.
 *
 * Moduł jest włączony, gdy ma sekcję w `modules` albo gdy cel włącza go
 * jawnie. Nadpisanie w celu jest ważniejsze od ustawienia globalnego —
 * po to istnieje.
 */
function enabledModules(globalModules: Record<string, unknown>, target: Record<string, unknown>): string[] {
    const overrides = asRecord(target['modules']) ?? {};
    const enabled: string[] = [];

    for (const module of Object.keys(MODULE_FLAGS)) {
        const override = overrides[module];
        if (override === 'off' || override === false) continue;
        if (override !== undefined) { enabled.push(module); continue; }
        if (globalModules[module] !== undefined) enabled.push(module);
    }
    return enabled;
}

function applyMemory(memory: Record<string, unknown> | undefined,
                     flags: string[], settings: Record<string, string>): void {
    if (!memory) return;

    const psram = asString(memory['psram']);
    if (psram && psram !== 'off') {
        settings['board_build.psram_type'] = psram;
        // Sam typ pamięci nie wystarcza — rdzeń szuka tej definicji, żeby
        // w ogóle włączyć obsługę PSRAM.
        flags.push('-D BOARD_HAS_PSRAM');
    }

    const flash = asString(memory['flash']);
    if (flash) settings['board_upload.flash_size'] = flash;

    const partitions = asString(memory['partitions']);
    if (partitions) {
        const table = partitionTable(partitions, flash);
        if (table) settings['board_build.partitions'] = table;
    }
}

/**
 * Schematy partycji.
 *
 * W pliku projektu podaje się nazwę logiczną („dwa obrazy z OTA"), a nie plik —
 * bo plik zależy od rozmiaru pamięci i od wersji rdzenia. Dopisanie „.csv" do
 * nazwy z pliku dawało tablicę, która nie istnieje, i build wywracał się na
 * „Source `ota_2app.csv' not found" dopiero po skonfigurowaniu całej platformy.
 *
 * Nazwy po prawej to tablice dostarczane przez rdzeń arduino-esp32.
 */
const PARTITION_TABLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    // schemat        rozmiar pamięci → tablica; `*` gdy rozmiar nie ma znaczenia
    single_app:     { '*': 'no_ota.csv' },
    huge_app:       { '*': 'huge_app.csv' },
    ota_2app:       { '16MB': 'default_16MB.csv', '8MB': 'default_8MB.csv', '*': 'default.csv' },
    ota_2app_small: { '*': 'min_spiffs.csv' },
    ota_2app_fat:   { '8MB': 'default_ffat_8MB.csv', '*': 'default_ffat.csv' },
};

export const PARTITION_SCHEMES = Object.keys(PARTITION_TABLES);

function partitionTable(scheme: string, flash: string | undefined): string | undefined {
    const variants = PARTITION_TABLES[scheme];
    // Nazwa spoza listy trafia dalej bez zmian: użytkownik mógł wskazać własną
    // tablicę w projekcie, a walidator i tak to zgłosił.
    if (!variants) return scheme.endsWith('.csv') ? scheme : `${scheme}.csv`;
    const sized = flash ? variants[flash.toUpperCase()] : undefined;
    return sized ?? variants['*'];
}

function applyClock(pio: Record<string, unknown> | undefined, flags: string[]): void {
    const frequency = pio?.['f_cpu'];
    if (typeof frequency === 'number') flags.push(`-D F_CPU=${frequency}L`);
}

/**
 * Poziom logowania wycinany w kompilacji. Odpowiada progom z Log.hpp:
 * 0 to Trace, 5 to wyłączone.
 */
const LOG_LEVELS: Readonly<Record<string, number>> = {
    trace: 0, debug: 1, info: 2, warn: 3, error: 4, off: 5,
};

function applyLogLevel(modules: Record<string, unknown> | undefined, flags: string[]): void {
    const log = asRecord(asRecord(modules?.['core'])?.['log']);
    const level = asString(log?.['default']);
    if (!level) return;
    const value = LOG_LEVELS[level];
    if (value !== undefined) flags.push(`-D HYDRA_LOG_COMPILE_LEVEL=${value}`);
}

function monitorSpeedOf(root: Record<string, unknown>): number {
    const studio = asRecord(root['studio']);
    const monitor = asRecord(studio?.['serial_monitor']);
    const baud = monitor?.['baud'];
    return typeof baud === 'number' ? baud : 115200;
}

/**
 * Ścieżka do nagłówka płytki w postaci nadającej się do `#include`.
 * W pliku projektu zapisana jest względem jego katalogu (`boards/rover_s3.hpp`),
 * a kompilator szuka jej na ścieżce włączeń.
 */
function headerInclude(path: string): string {
    return path.replace(/^\.\//, '');
}

// --- odczyt bez rzucania wyjątkami -----------------------------------------

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

function asStringList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === 'string');
}
