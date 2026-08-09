#!/usr/bin/env node
/**
 * Wiersz poleceń Hydra Studio.
 *
 *   hydra check [ścieżka]            sprawdza plik projektu
 *   hydra gen   [ścieżka]            generuje pliki budowania
 *   hydra build [ścieżka]            generuje i buduje wsad
 *   hydra plan  [ścieżka]            pokazuje, co powstałoby, bez zapisu
 *
 * Ta sama logika stoi za poleceniami menu w Studiu — edytor woła te funkcje,
 * a nie własne kopie. Kod wyjścia zero oznacza powodzenie, co pozwala wstawić
 * `hydra check` do zaczepu przed zatwierdzeniem zmian.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';

import {
    buildPlan, checkSchematic, formatDiagnostics, hasErrors,
    importEasyEda, importKiCadNetlist,
} from '../model';

import { runBuild } from './build';
import { currentHostPlatformId } from './native';
import { generate, reportGenerated } from './generate';
import { loadProject, reportDiagnostics } from './project';

interface Options {
    path: string;
    target: string | undefined;
    hydraRoot: string;
    force: boolean;
    dryRun: boolean;
    port: string | undefined;
    output: string | undefined;
    /** Maszyna dla celu natywnego; brak = ta, na której stoimy. */
    host: string | undefined;
}

function parseOptions(argv: readonly string[]): Options {
    const positional: string[] = [];
    let target: string | undefined;
    let hydraRoot = process.env['HYDRA_ROOT'] ?? '.';
    let port: string | undefined;
    let output: string | undefined;
    let host: string | undefined;
    let force = false;
    let dryRun = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        switch (arg) {
            case '-e': case '--env': case '--target': target = argv[++i]; break;
            case '--hydra': hydraRoot = argv[++i] ?? hydraRoot; break;
            case '--port': port = argv[++i]; break;
            case '--host': host = argv[++i]; break;
            case '-o': case '--output': output = argv[++i]; break;
            case '--force': force = true; break;
            case '--dry-run': dryRun = true; break;
            default:
                if (arg.startsWith('-')) throw new Error(`nieznana opcja: ${arg}`);
                positional.push(arg);
        }
    }

    return { path: positional[0] ?? '.', target, hydraRoot, force, dryRun, port, output, host };
}

function usage(): void {
    process.stdout.write(`Hydra Studio — wiersz poleceń

  hydra check [ścieżka]     sprawdza plik projektu i manifesty paczek
  hydra plan  [ścieżka]     pokazuje cele i ustawienia wyprowadzone z pliku
  hydra gen   [ścieżka]     generuje platformio.ini, CMakeLists.txt, CMakePresets.json
                            i nagłówki płytek
  hydra build [ścieżka]     generuje pliki i buduje wsad w kontenerze
  hydra upload [ścieżka]    to samo plus wgranie na urządzenie
  hydra import <plik>       zamienia netlistę KiCada albo EasyEDA na .hsch

Opcje:
  -e, --target <nazwa>   cel sprzętowy (domyślnie: wskazany w pliku)
      --hydra <ścieżka>  katalog biblioteki Hydry (albo zmienna HYDRA_ROOT)
      --port <urządzenie> port przy wgrywaniu
      --host <maszyna>   dla celu native: win-x64, win-arm64, mac-arm64,
                         mac-x64, linux-x64, linux-arm64 (domyślnie: ta maszyna)
      --force            nadpisz także pliki bez znacznika wygenerowania
      --dry-run          pokaż, co powstałoby, nic nie zapisując
  -o, --output <plik>    dokąd zapisać wynik importu
`);
}

async function main(argv: readonly string[]): Promise<number> {
    const command = argv[0];
    if (!command || command === 'help' || command === '--help' || command === '-h') {
        usage();
        return command ? 0 : 1;
    }

    const options = parseOptions(argv.slice(1));
    const project = loadProject(options.path);
    const where = relative(process.cwd(), project.file) || project.file;

    switch (command) {
        case 'check': {
            // Reguły elektryczne idą razem z resztą sprawdzeń: schemat i plik
            // projektu opisują to samo urządzenie i nie ma powodu pytać o nie
            // osobno.
            if (project.schematic) {
                const erc = checkSchematic(project.schematic, {
                    definitions: project.definitions,
                    externalPullups: externalPullupsOf(project.model),
                });
                if (erc.length > 0) {
                    process.stderr.write(formatDiagnostics(erc, 'schemat') + '\n');
                    if (hasErrors(erc)) return 1;
                }
            }

            const ok = reportDiagnostics(project);
            if (ok && project.diagnostics.length === 0) {
                process.stdout.write(`${where}: bez zastrzeżeń\n`);
            }
            return ok ? 0 : 1;
        }

        case 'plan': {
            if (!reportDiagnostics(project)) return 1;
            printPlan(project);
            return 0;
        }

        case 'gen': {
            if (!reportDiagnostics(project)) return 1;
            const files = generate(project, {
                force: options.force, dryRun: options.dryRun,
                ...hydraPaths(project.root, options.hydraRoot),
            });
            return reportGenerated(files, project.root) ? 0 : 1;
        }

        case 'build':
        case 'upload': {
            if (!reportDiagnostics(project)) return 1;

            // Generujemy przed budową, żeby wsad zawsze odpowiadał plikowi
            // projektu. Inaczej zmiana w .hydra bez ponownego wygenerowania
            // dawałaby wsad zbudowany ze starych ustawień.
            const files = generate(project, {
                force: options.force,
                ...hydraPaths(project.root, options.hydraRoot),
            });
            if (!reportGenerated(files, project.root)) return 1;

            // Czy to cel natywny, rozstrzyga plan — nie nazwa i nie flaga.
            // Nazwa celu jest dowolna („podglad", „okno"), a decyzja musi
            // zapadać w jednym miejscu, tym samym, z którego korzysta Studio.
            const plan = buildPlan(project.model, {
                packLibDeps: project.packLibDeps,
                packBuildFlags: project.packBuildFlags,
            });
            const chosen = options.target ?? plan.defaultTarget;
            const nativeTarget = plan.targets.find((t) => t.name === chosen && t.isNative);

            const result = await runBuild({
                projectRoot: project.root,
                hydraRoot: options.hydraRoot,
                action: command === 'upload' ? 'upload' : 'build',
                ...(chosen !== undefined ? { target: chosen } : {}),
                ...(options.port !== undefined ? { port: options.port } : {}),
                ...(nativeTarget ? {
                    native: {
                        projectName: plan.projectName,
                        hostPlatformId: options.host ?? currentHostPlatformId() ?? 'linux-x64',
                    },
                } : {}),
            });
            if (result.artifact) {
                process.stdout.write(
                    `\nwynik: ${result.artifact.path}\n` +
                    `artefakt: ${result.artifact.name} ` +
                    `(${Math.round(result.artifact.sizeBytes / 1024)} kB)\n`);
            } else if (result.artifactProblem) {
                process.stderr.write(`\n${result.artifactProblem}\n`);
            }
            if (!result.ok) {
                process.stderr.write(`\nbudowa nie powiodła się (kod ${result.exitCode})\n`);
                process.stderr.write(`polecenie: ${result.command}\n`);
            }
            return result.ok ? 0 : result.exitCode;
        }

        case 'import': {
            // Import nie potrzebuje wczytanego projektu — bywa pierwszym
            // krokiem, zanim jakikolwiek plik .hydra powstanie.
            return runImport(options);
        }

        default:
            process.stderr.write(`nieznane polecenie: ${command}\n`);
            usage();
            return 1;
    }
}

function printPlan(project: ReturnType<typeof loadProject>): void {
    const plan = buildPlan(project.model, {
        packLibDeps: project.packLibDeps,
        packBuildFlags: project.packBuildFlags,
    });

    process.stdout.write(`${plan.projectName} ${plan.projectVersion}\n`);
    for (const target of plan.targets) {
        const isDefault = target.name === plan.defaultTarget ? ' (domyślny)' : '';
        process.stdout.write(`\n  ${target.name}${isDefault}\n`);
        process.stdout.write(`    układ:      ${target.mcu}${target.hasFpu ? '' : '  (bez FPU — Q16.16)'}\n`);
        process.stdout.write(`    płytka:     ${target.board}\n`);
        if (target.boardHeader) process.stdout.write(`    piny:       ${target.boardHeader}\n`);
        process.stdout.write(`    moduły:     ${target.modules.join(', ') || '—'}\n`);
        const source = target.capabilitiesDeclared ? 'z pliku' : 'z profilu układu';
        process.stdout.write(`    możliwości: ${target.capabilities.join(', ')}  [${source}]\n`);
    }

    if (project.packs.length > 0) {
        process.stdout.write(`\n  paczki: ${project.packs.map((p) => `${p.pack}@${p.version}`).join(', ')}\n`);
    }
}

/**
 * Dwie ścieżki do Hydry, bo dwa systemy budowania rozumieją je inaczej.
 *
 * CMake dołącza źródła biblioteki wprost, więc potrzebuje jej katalogu.
 * PlatformIO szuka bibliotek w podanym katalogu, więc potrzebuje tego,
 * który Hydrę zawiera. Podanie jednej wartości obu sprawiało, że CMake
 * wskazywał katalog wyżej i nie znajdował żadnego źródła.
 */
function hydraPaths(projectRoot: string, hydraRoot: string): { hydraPath: string; libSearchPath: string } {
    const hydra = resolve(hydraRoot);
    const toHydra = relative(projectRoot, hydra);
    const toParent = relative(projectRoot, dirname(hydra));
    return {
        hydraPath: toHydra === '' ? '.' : toHydra,
        libSearchPath: toParent === '' ? '.' : toParent,
    };
}

main(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });

/** Magistrale, dla których projekt deklaruje podciągnięcie poza schematem. */
function externalPullupsOf(model: unknown): string[] {
    const hardware = (model as { hardware?: { buses?: Record<string, { pullups?: string }> } })?.hardware;
    return Object.entries(hardware?.buses ?? {})
        .filter(([, bus]) => bus?.pullups === 'internal' || bus?.pullups === 'external')
        .map(([name]) => name);
}

/**
 * Import netlisty z narzędzia zewnętrznego.
 *
 * Format rozpoznajemy po rozszerzeniu: `.net` to KiCad, `.json` — EasyEDA.
 * Wynik trafia na standardowe wyjście albo do pliku, żeby dało się go obejrzeć
 * przed zapisaniem: import zapisuje to, co zastał, i wypisuje, czego nie zgadł,
 * a to warto przeczytać przed dopisaniem schematu do projektu.
 */
function runImport(options: Options): number {
    const input = options.path;
    const source = readFileSync(input, 'utf8');
    const kind = extname(input).toLowerCase();

    const result = kind === '.json' ? importEasyEda(source) : importKiCadNetlist(source);

    if (result.diagnostics.length > 0) {
        process.stderr.write(formatDiagnostics(result.diagnostics, input) + '\n');
    }
    if (hasErrors(result.diagnostics)) return 1;

    const yaml = schematicToYaml(result.schematic, input);
    if (options.output) {
        writeFileSync(options.output, yaml, 'utf8');
        process.stdout.write(`zapisano ${options.output}\n`);
        if (result.unknownParts.length > 0) {
            process.stdout.write(
                `uzupełnij pole „part" dla: ${result.unknownParts.join(', ')}\n`);
        }
    } else {
        process.stdout.write(yaml);
    }
    return 0;
}

/** Zapisuje schemat w postaci .hsch — czytelnej i nadającej się do recenzji. */
function schematicToYaml(schematic: { components: Record<string, unknown>;
                                      nets: Record<string, unknown> }, source: string): string {
    const lines: string[] = [
        `# Schemat zaimportowany z ${source}.`,
        '#',
        '# Nazwy paczek w polu „part" trzeba uzupełnić ręcznie: żaden format',
        '# zewnętrzny nie wie, że „BMP280" to u nas paczka `bmp280`. Dopóki tego',
        '# nie zrobisz, reguły elektryczne nie mają czym sprawdzić wyprowadzeń.',
        '',
        'hsch: "0.1"',
        '',
        'components:',
    ];

    for (const [reference, raw] of Object.entries(schematic.components)) {
        const component = raw as { part: string; value?: string };
        const value = component.value ? `, value: "${component.value}"` : '';
        lines.push(`  ${reference}: { part: ${component.part}${value} }`);
    }

    lines.push('', 'nets:');
    for (const [name, raw] of Object.entries(schematic.nets)) {
        const net = raw as { nodes: string[]; class?: string };
        const netClass = net.class ? `class: ${net.class}, ` : '';
        lines.push(`  ${name}: { ${netClass}nodes: [${net.nodes.join(', ')}] }`);
    }

    return lines.join('\n') + '\n';
}
