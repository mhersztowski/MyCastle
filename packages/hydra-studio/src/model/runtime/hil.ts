/**
 * Farma testowa — odczyt konfiguracji z pliku projektu.
 *
 * Sekcja `test.hil` opisuje stanowiska: który cel siedzi na której sondzie,
 * czym odciąć mu zasilanie i jaka nakładka jest wpięta. Studio pokazuje to
 * jako listę i pozwala uruchomić zestaw — ale samo niczego nie wykonuje.
 * Testy na sprzęcie prowadzi `tools/hil_run.py` na runnerze, który ma fizyczny
 * dostęp do płytek; przeglądarka go nie ma i mieć nie będzie.
 *
 * Wartością tej warstwy jest więc odczyt i sprawdzenie spójności: stanowisko
 * dla nieistniejącego celu albo zestaw bez określonego wyzwalacza to pomyłki,
 * które inaczej wychodzą dopiero wtedy, gdy nocny przebieg nie ruszy.
 */

import { error, warning, type Diagnostic } from '../diagnostics';

export interface HilFixture {
    /** Nazwa celu, którego dotyczy stanowisko. */
    target: string;
    /** Rodzaj sondy debugowej. */
    probe?: string;
    /** Polecenie odcinające i włączające zasilanie. */
    power?: string;
    /** Nakładka testowa wpięta w płytkę. */
    shield?: string;
}

export interface HilSuite {
    name: string;
    /** Kiedy uruchamiać: przy zmianie, nocnie, ręcznie. */
    on?: string;
    timeoutS?: number;
    durationH?: number;
    /** Co obserwować przez cały przebieg. */
    monitor?: string[];
}

export interface HilConfig {
    /** Nazwa runnera, na którym stoją płytki. */
    runner?: string;
    fixtures: HilFixture[];
    suites: HilSuite[];
}

const TRIGGERS = ['push', 'nightly', 'manual', 'release'];

export function hilConfigFrom(model: unknown): HilConfig | undefined {
    const hil = asRecord(asRecord(asRecord(model)?.['test'])?.['hil']);
    if (!hil) return undefined;

    const fixtures: HilFixture[] = [];
    for (const [target, raw] of Object.entries(asRecord(hil['fixtures']) ?? {})) {
        const fixture = asRecord(raw);
        fixtures.push({
            target,
            ...(asString(fixture?.['probe']) !== undefined ? { probe: asString(fixture!['probe'])! } : {}),
            ...(asString(fixture?.['power']) !== undefined ? { power: asString(fixture!['power'])! } : {}),
            ...(asString(fixture?.['shield']) !== undefined ? { shield: asString(fixture!['shield'])! } : {}),
        });
    }

    const suites: HilSuite[] = [];
    for (const [name, raw] of Object.entries(asRecord(hil['suites']) ?? {})) {
        const suite = asRecord(raw);
        const monitor = Array.isArray(suite?.['monitor'])
            ? (suite['monitor'] as unknown[]).filter((x): x is string => typeof x === 'string')
            : undefined;

        suites.push({
            name,
            ...(asString(suite?.['on']) !== undefined ? { on: asString(suite!['on'])! } : {}),
            ...(typeof suite?.['timeout_s'] === 'number' ? { timeoutS: suite['timeout_s'] } : {}),
            ...(typeof suite?.['duration_h'] === 'number' ? { durationH: suite['duration_h'] } : {}),
            ...(monitor ? { monitor } : {}),
        });
    }

    return {
        ...(asString(hil['runner']) !== undefined ? { runner: asString(hil['runner'])! } : {}),
        fixtures,
        suites,
    };
}

/**
 * Sprawdza spójność konfiguracji farmy.
 *
 * Pomyłki tutaj wychodzą inaczej dopiero wtedy, gdy nocny przebieg nie ruszy —
 * czyli następnego ranka, po straconej nocy testów.
 */
export function checkHil(config: HilConfig, targetNames: readonly string[]): Diagnostic[] {
    const out: Diagnostic[] = [];

    if (config.fixtures.length === 0 && config.suites.length > 0) {
        out.push(error('test.hil.fixtures', 'zdefiniowano zestawy testów, ale żadnego stanowiska',
                       'bez stanowiska nie wiadomo, na jakiej płytce je uruchomić'));
    }

    for (const fixture of config.fixtures) {
        if (!targetNames.includes(fixture.target)) {
            out.push(error(`test.hil.fixtures.${fixture.target}`,
                           `stanowisko opisuje cel „${fixture.target}", którego nie ma`,
                           `zdefiniowane cele: ${targetNames.join(', ')}`));
        }
        if (fixture.power === undefined) {
            // Bez odcięcia zasilania nie da się sprawdzić, jak urządzenie
            // zachowuje się po zaniku napięcia — a to najczęstsza awaria
            // w terenie.
            out.push(warning(`test.hil.fixtures.${fixture.target}`,
                             'stanowisko bez sposobu na odcięcie zasilania',
                             'dopisz „power", żeby dało się sprawdzić zachowanie po zaniku napięcia'));
        }
    }

    for (const suite of config.suites) {
        if (suite.on !== undefined && !TRIGGERS.includes(suite.on)) {
            out.push(error(`test.hil.suites.${suite.name}.on`,
                           `nieznany wyzwalacz „${suite.on}"`,
                           `dozwolone: ${TRIGGERS.join(', ')}`));
        }
        if (suite.timeoutS === undefined && suite.durationH === undefined) {
            out.push(warning(`test.hil.suites.${suite.name}`,
                             'zestaw bez ograniczenia czasu',
                             'przebieg, który się zawiesi, zajmie farmę do rana — dopisz ' +
                             '„timeout_s" albo „duration_h"'));
        }
    }

    if (config.runner === undefined && config.suites.length > 0) {
        out.push(warning('test.hil.runner', 'nie wskazano runnera',
                         'bez nazwy runnera przebieg trafi na pierwszą wolną maszynę, ' +
                         'która może nie mieć podłączonych płytek'));
    }

    return out;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}
