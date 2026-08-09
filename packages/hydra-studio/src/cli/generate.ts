/**
 * Zapis wygenerowanych plików.
 *
 * Zasada, która przesądza o zaufaniu do generatora: nie nadpisujemy pliku,
 * którego nie wygenerowaliśmy. Plik bez znacznika w pierwszej linii mógł
 * powstać ręcznie i zawierać ustawienia, których model nie opisuje — cichy
 * zapis skasowałby czyjąś pracę. Nadpisanie wymaga wtedy jawnej zgody.
 */

import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import {
    boardFromSchematic, boardSourceFrom, buildPlan,
    emitBoardHeader, emitCMake, emitCMakePresets, emitPlatformio, isGenerated,
} from '../model';

import type { LoadedProject } from './project';

export type WriteOutcome = 'zapisany' | 'bez zmian' | 'pominięty';

export interface GeneratedFile {
    path: string;
    content: string;
    outcome: WriteOutcome;
    /** Powód pominięcia — zawsze wypisywany, nigdy po cichu. */
    reason?: string;
}

export interface GenerateOptions {
    /** Nadpisuj także pliki bez znacznika. */
    force?: boolean;
    /** Pokaż, co powstałoby, nic nie zapisując. */
    dryRun?: boolean;
    /**
     * Ścieżka do samej biblioteki Hydra, względem projektu — tego potrzebuje
     * CMake, który dołącza jej źródła wprost.
     */
    hydraPath?: string;
    /**
     * Ścieżka do katalogu **zawierającego** Hydrę — tego potrzebuje PlatformIO,
     * bo `lib_extra_dirs` wskazuje miejsce, w którym szuka bibliotek. Dwie różne
     * ścieżki, bo te dwa systemy rozumieją ją inaczej; jedna wartość dla obu
     * dawała CMake wskazujący katalog wyżej niż trzeba.
     */
    libSearchPath?: string;
    /** Które pliki wytworzyć. */
    only?: readonly ('platformio' | 'cmake' | 'presets' | 'board')[];
}

export function generate(project: LoadedProject, options: GenerateOptions = {}): GeneratedFile[] {
    const plan = buildPlan(project.model, {
        packLibDeps: project.packLibDeps,
        packBuildFlags: project.packBuildFlags,
    });

    const wanted = new Set(options.only ?? ['platformio', 'cmake', 'presets', 'board']);
    const files: GeneratedFile[] = [];

    if (wanted.has('platformio')) {
        files.push(write(project, 'platformio.ini',
                         emitPlatformio(plan, {
                             ...(options.libSearchPath !== undefined
                                 ? { hydraPath: options.libSearchPath } : {}),
                         }), options));
    }

    if (wanted.has('cmake')) {
        files.push(write(project, 'CMakeLists.txt',
                         emitCMake(plan, {
                             ...(options.hydraPath !== undefined ? { hydraPath: options.hydraPath } : {}),
                         }), options));
    }

    if (wanted.has('presets')) {
        // Plik powstaje tylko wtedy, gdy projekt ma cel natywny. Pusty
        // CMakePresets.json wyglądałby jak konfiguracja, a niczego by nie
        // konfigurował — a edytory pokazywałyby go na liście presetów.
        const presets = emitCMakePresets(plan);
        if (presets !== null) {
            files.push(write(project, 'CMakePresets.json', presets, options));
        }
    }

    if (wanted.has('board')) {
        // Nagłówek powstaje tylko tam, gdzie cel go wskazuje — inaczej
        // generator tworzyłby pliki, do których nikt się nie odwołuje.
        for (const target of plan.targets) {
            if (!target.boardHeader) continue;
            // Cel natywny wskazuje plik płytki dostarczony z biblioteką —
            // nie ma pinów do opisania, a wygenerowanie własnego przesłoniłoby
            // ten z Hydry i rozjechało nazwę płytki w logach.
            if (target.isNative) continue;

            // Schemat jest źródłem prawdy dla wyprowadzeń: numer bierze się
            // z połączenia, a nie z ręcznego wpisu. Bez schematu zostaje to,
            // co da się odczytać z sekcji `hardware` — czyli magistrale bez
            // numerów pinów.
            // Nazwa płytki pochodzi ze schematu, a nie z nazwy celu: „main"
            // opisuje środowisko budowania, a `hal::board::name` ma mówić,
            // na czym to działa.
            const boardName = project.schematic?.sheet?.name ?? target.name;

            const source = project.schematic
                ? boardFromSchematic(project.schematic, {
                      definitions: project.definitions,
                      boardName,
                  }).source
                : boardSourceFrom(project.model, boardName);

            if (!source) continue;
            files.push(write(project, target.boardHeader,
                             emitBoardHeader(source, target, plan.projectName), options));
        }
    }

    return files;
}

function write(project: LoadedProject, relativePath: string, content: string,
               options: GenerateOptions): GeneratedFile {
    const path = join(project.root, relativePath);

    if (existsSync(path)) {
        const existing = readFileSync(path, 'utf8');
        if (existing === content) {
            return { path: relativePath, content, outcome: 'bez zmian' };
        }
        if (!isGenerated(existing) && !options.force) {
            return {
                path: relativePath, content, outcome: 'pominięty',
                reason: 'plik nie ma znacznika wygenerowania — mógł powstać ręcznie; ' +
                        'użyj --force, żeby go zastąpić',
            };
        }
    }

    if (!options.dryRun) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content, 'utf8');
    }
    return { path: relativePath, content, outcome: 'zapisany' };
}

export function reportGenerated(files: readonly GeneratedFile[], root: string): boolean {
    let ok = true;
    for (const file of files) {
        const mark = file.outcome === 'zapisany' ? '✓' : file.outcome === 'bez zmian' ? '·' : '∅';
        process.stdout.write(`  ${mark} ${file.path}  (${file.outcome})\n`);
        if (file.reason) {
            process.stdout.write(`      ${file.reason}\n`);
            ok = false;
        }
    }
    if (files.length === 0) process.stdout.write(`  nic do wygenerowania w ${relative(process.cwd(), root) || '.'}\n`);
    return ok;
}
