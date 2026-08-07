/**
 * Wczytywanie projektu z dysku.
 *
 * Pakiet `core` celowo nie dotyka systemu plików — ma działać także
 * w przeglądarce. Cały dostęp do dysku jest tutaj, w wierszu poleceń.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import {
    HydraDocument, collectBuildFlags, collectLibDeps, formatDiagnostics, hasErrors,
    HCOMP_SCHEMA, HSCH_SCHEMA, loadPack, validate, validateAgainst,
    type ComponentDefinition, type ConfigSchema, type Diagnostic, type PackManifest,
    type Schematic,
} from '../model';

/** Schematy konfiguracji wczytane z plików wskazanych przez paczki. */
export type ConfigSchemas = Record<string, ConfigSchema>;

export interface LoadedProject {
    /** Ścieżka do pliku .hydra. */
    file: string;
    /** Katalog projektu — względem niego rozwiązywane są wszystkie ścieżki. */
    root: string;
    document: HydraDocument;
    model: unknown;
    diagnostics: Diagnostic[];
    packs: PackManifest[];
    packLibDeps: string[];
    packBuildFlags: string[];
    /** Schematy konfiguracji paczek — z nich inspektor buduje formularze. */
    configSchemas: ConfigSchemas;
    /** Definicje układów z paczek — potrzebne regułom elektrycznym. */
    definitions: Record<string, ComponentDefinition>;
    /** Schemat połączeń, jeśli projekt go wskazuje. */
    schematic?: Schematic;
}

/**
 * Znajduje plik projektu.
 *
 * Przyjmuje ścieżkę do pliku albo katalog — w katalogu szuka jedynego pliku
 * `.hydra`. Gdy jest ich kilka, odmawia zgadywania: wybór należy do
 * użytkownika, a domyślenie się nie tego projektu bywa kosztowne.
 */
export function findProjectFile(pathArgument: string): string {
    const target = resolve(pathArgument);

    if (existsSync(target) && statSync(target).isFile()) return target;

    if (!existsSync(target) || !statSync(target).isDirectory()) {
        throw new Error(`nie ma takiego pliku ani katalogu: ${pathArgument}`);
    }

    const candidates = readdirSync(target).filter((name) => name.endsWith('.hydra'));
    if (candidates.length === 1) return join(target, candidates[0]!);
    if (candidates.length === 0) {
        throw new Error(`w katalogu ${pathArgument} nie ma pliku .hydra`);
    }
    throw new Error(
        `w katalogu ${pathArgument} jest kilka plików .hydra (${candidates.join(', ')}) — wskaż jeden`);
}

export function loadProject(pathArgument: string): LoadedProject {
    const file = findProjectFile(pathArgument);
    const root = dirname(file);

    const document = HydraDocument.parse(readFileSync(file, 'utf8'));
    const diagnostics = validate(document);
    const model = document.toJS();

    const { packs, diagnostics: packDiagnostics, configSchemas, definitions } = loadPacks(model, root);
    diagnostics.push(...packDiagnostics);

    const { schematic, diagnostics: schematicDiagnostics } = loadSchematic(model, root);
    diagnostics.push(...schematicDiagnostics);

    return {
        file, root, document, model, diagnostics, packs, configSchemas, definitions,
        ...(schematic ? { schematic } : {}),
        packLibDeps: collectLibDeps(packs),
        packBuildFlags: collectBuildFlags(packs),
    };
}

/**
 * Wczytuje paczki wskazane w sekcji `dependencies`.
 *
 * Obsługiwane jest źródło lokalne (`path`) — paczka jako katalog w repozytorium.
 * Źródła zdalne (`git`) wymagają pobrania, czym zajmie się osobny etap; na
 * razie zgłaszamy to jako brak, zamiast po cichu pomijać zależność.
 */
function loadPacks(model: unknown, root: string):
        { packs: PackManifest[]; diagnostics: Diagnostic[]; configSchemas: ConfigSchemas;
          definitions: Record<string, ComponentDefinition> } {
    const packs: PackManifest[] = [];
    const diagnostics: Diagnostic[] = [];
    const configSchemas: ConfigSchemas = {};
    const definitions: Record<string, ComponentDefinition> = {};

    const dependencies = asRecord(asRecord(model)?.['dependencies']);
    if (!dependencies) return { packs, diagnostics, configSchemas, definitions };

    for (const [name, spec] of Object.entries(dependencies)) {
        const source = asRecord(spec);
        const path = typeof source?.['path'] === 'string' ? source['path'] : `packs/${name}`;
        const manifestPath = join(root, path, 'hydra-pack.yaml');

        if (!existsSync(manifestPath)) {
            if (source?.['git'] !== undefined) {
                diagnostics.push({
                    severity: 'error', path: `dependencies.${name}`,
                    message: `paczka „${name}" pochodzi z repozytorium, a nie została pobrana`,
                    hint: 'pobieranie paczek zdalnych jeszcze nie działa — wskaż katalog przez „path"',
                });
            } else {
                diagnostics.push({
                    severity: 'error', path: `dependencies.${name}`,
                    message: `nie znaleziono manifestu paczki „${name}"`,
                    hint: `oczekiwana ścieżka: ${relative(root, manifestPath)}`,
                });
            }
            continue;
        }

        const loaded = loadPack(readFileSync(manifestPath, 'utf8'), join(root, path));
        // Zgłoszenia z manifestu opisujemy jego nazwą, inaczej użytkownik nie
        // wie, w którym z kilku plików szukać.
        for (const d of loaded.diagnostics) {
            diagnostics.push({ ...d, path: `${name}:${d.path}` });
        }
        if (!loaded.manifest.pack) continue;
        packs.push(loaded.manifest);

        // Schemat konfiguracji jest opcjonalny; jego brak zgłosił już
        // walidator manifestu, więc tutaj tylko go pomijamy.
        // Definicja układu — z niej reguły elektryczne wiedzą, jakie ma nóżki.
        const componentFile = loaded.manifest.component;
        if (componentFile) {
            const componentPath = join(root, path, componentFile);
            if (existsSync(componentPath)) {
                const componentDoc = HydraDocument.parse(readFileSync(componentPath, 'utf8'));
                for (const d of validateAgainst(componentDoc, HCOMP_SCHEMA)) {
                    diagnostics.push({ ...d, path: `${name}:${componentFile}:${d.path}` });
                }
                definitions[loaded.manifest.pack] = componentDoc.toJS() as ComponentDefinition;
            } else {
                diagnostics.push({
                    severity: 'warning', path: `dependencies.${name}`,
                    message: `paczka „${name}" wskazuje definicję układu, której nie ma`,
                    hint: `oczekiwana ścieżka: ${relative(root, componentPath)}`,
                });
            }
        }

        const schemaFile = loaded.manifest.config_schema;
        if (!schemaFile) continue;

        const schemaPath = join(root, path, schemaFile);
        if (!existsSync(schemaPath)) {
            diagnostics.push({
                severity: 'warning', path: `dependencies.${name}`,
                message: `paczka „${name}" wskazuje schemat konfiguracji, którego nie ma`,
                hint: `oczekiwana ścieżka: ${relative(root, schemaPath)}`,
            });
            continue;
        }

        try {
            configSchemas[loaded.manifest.pack] = JSON.parse(readFileSync(schemaPath, 'utf8')) as ConfigSchema;
        } catch (error) {
            // Zepsuty schemat nie może wywrócić wczytania projektu — inspektor
            // pokaże wtedy surowe pola, a użytkownik dowie się dlaczego.
            diagnostics.push({
                severity: 'warning', path: `dependencies.${name}`,
                message: `schemat konfiguracji paczki „${name}" nie jest poprawnym JSON-em`,
                hint: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { packs, diagnostics, configSchemas, definitions };
}

export function reportDiagnostics(project: LoadedProject): boolean {
    if (project.diagnostics.length === 0) return true;
    const text = formatDiagnostics(project.diagnostics, relative(process.cwd(), project.file) || project.file);
    process.stderr.write(text + '\n');
    return !hasErrors(project.diagnostics);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

/**
 * Wczytuje schemat wskazany przez `hardware.schematic`.
 *
 * Brak schematu nie jest błędem — projekt może opisywać wyprowadzenia wprost
 * w nagłówku płytki. Wskazanie pliku, którego nie ma, już jest: ktoś na niego
 * liczy i przy generowaniu dostałby po cichu pusty nagłówek.
 */
function loadSchematic(model: unknown, root: string):
        { schematic: Schematic | undefined; diagnostics: Diagnostic[] } {
    const hardware = asRecord(asRecord(model)?.['hardware']);
    const file = hardware?.['schematic'];
    if (typeof file !== 'string') return { schematic: undefined, diagnostics: [] };

    const path = join(root, file);
    if (!existsSync(path)) {
        return {
            schematic: undefined,
            diagnostics: [{
                severity: 'error', path: 'hardware.schematic',
                message: `nie znaleziono schematu „${file}"`,
                hint: 'popraw ścieżkę albo usuń wpis, jeśli projekt go nie używa',
            }],
        };
    }

    const doc = HydraDocument.parse(readFileSync(path, 'utf8'));
    const diagnostics = validateAgainst(doc, HSCH_SCHEMA)
        .map((d) => ({ ...d, path: `${file}:${d.path}` }));

    return { schematic: doc.toJS() as Schematic, diagnostics };
}
