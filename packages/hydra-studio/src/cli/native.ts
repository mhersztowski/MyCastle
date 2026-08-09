/**
 * Budowa celu natywnego.
 *
 * Idzie inną drogą niż wsad na układ i musi tak być. Wsad buduje się
 * w kontenerze (`docker/hydra.sh`), bo cały sens tamtego obrazu to przypięte
 * toolchainy i wynik niezależny od maszyny. Cel natywny jest odwrotnością:
 * wynik ma być zależny od maszyny — plik wykonywalny dla tego systemu i tej
 * architektury, zlinkowany z tutejszym SDL. Zbudowanie go w kontenerze
 * z Linuksem dałoby program, którego użytkownik na Windows nie uruchomi.
 *
 * Stąd: cmake lokalnie, preset wybrany po wykrytej maszynie, a na końcu
 * artefakt gotowy do pobrania z przeglądarki.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { artifactName, hostPlatform, type BuildArtifactInfo, type HostPlatform } from '../model';

import { createZip, type ZipEntry } from './zip';

export interface NativeBuildRequest {
    projectRoot: string;
    /** Nazwa celu z pliku `.hydra` — trafia do HYDRA_TARGET. */
    target: string;
    /** Identyfikator maszyny z HOST_PLATFORMS; brak = maszyna, na której stoimy. */
    hostPlatformId?: string;
    /** Katalog biblioteki Hydry — CMake dołącza jej źródła wprost. */
    hydraRoot?: string;
    /** Nazwa projektu; z niej bierze się nazwa pliku wykonywalnego. */
    projectName: string;
    /** Nie buduj, tylko pokaż polecenia. */
    dryRun?: boolean;
}

export interface BuildArtifact extends BuildArtifactInfo {
    /** Ścieżka na dysku — do powtórzenia budowy ręcznie i do logów. */
    path: string;
}

export interface NativeBuildResult {
    ok: boolean;
    exitCode: number;
    /** Uruchomione polecenia — wypisywane, żeby dało się je powtórzyć. */
    commands: readonly string[];
    artifact?: BuildArtifact;
    /** Powód, dla którego artefaktu nie ma, choć budowa się powiodła. */
    artifactProblem?: string;
}

/**
 * Maszyna, na której właśnie stoimy.
 *
 * Używane, gdy budowa idzie z wiersza poleceń, a nie z przeglądarki: wtedy
 * nie ma czego wykrywać, bo proces działa na maszynie docelowej.
 */
export function currentHostPlatformId(
    platform: NodeJS.Platform = process.platform,
    arch: string = process.arch,
): string | undefined {
    const os = platform === 'win32' ? 'win'
             : platform === 'darwin' ? 'mac'
             : platform === 'linux' ? 'linux'
             : undefined;
    if (!os) return undefined;
    const cpu = arch === 'arm64' ? 'arm64' : arch === 'x64' ? 'x64' : undefined;
    return cpu ? `${os}-${cpu}` : undefined;
}

export async function runNativeBuild(request: NativeBuildRequest,
                                     onOutput?: (chunk: string) => void): Promise<NativeBuildResult> {
    const root = resolve(request.projectRoot);
    const id = request.hostPlatformId ?? currentHostPlatformId();
    const platform = id ? hostPlatform(id) : undefined;

    if (!platform) {
        const message = `nieznana maszyna docelowa: ${id ?? '(nie wykryto)'}\n`;
        onOutput?.(message);
        return { ok: false, exitCode: 2, commands: [], artifactProblem: message.trim() };
    }

    if (!existsSync(join(root, 'CMakePresets.json'))) {
        const message =
            'brak CMakePresets.json — wygeneruj pliki budowy (hydra generate) przed budową celu native\n';
        onOutput?.(message);
        return { ok: false, exitCode: 2, commands: [], artifactProblem: message.trim() };
    }

    // Cel przekazujemy zmienną pamięci podręcznej, a nie osobnym presetem:
    // presety opisują maszyny, cele opisuje HYDRA_TARGET. Inaczej projekt
    // z dwoma celami natywnymi na trzech maszynach dawałby sześć presetów.
    const configure = ['--preset', platform.preset, '-D', `HYDRA_TARGET=${request.target}`];
    if (request.hydraRoot) {
        configure.push('-D', `HYDRA_ROOT=${resolve(request.hydraRoot)}`);
    }
    const build = ['--build', '--preset', platform.preset];

    const commands = [`cmake ${configure.join(' ')}`, `cmake ${build.join(' ')}`];
    if (request.dryRun) {
        for (const command of commands) onOutput?.(`${command}\n`);
        return { ok: true, exitCode: 0, commands };
    }

    for (const args of [configure, build]) {
        onOutput?.(`> cmake ${args.join(' ')}\n`);
        const code = await run('cmake', args, root, onOutput);
        if (code !== 0) return { ok: false, exitCode: code, commands };
    }

    const packed = collectArtifact(root, platform, request);
    if (typeof packed === 'string') {
        onOutput?.(`${packed}\n`);
        return { ok: true, exitCode: 0, commands, artifactProblem: packed };
    }

    onOutput?.(`artefakt: ${packed.name} (${Math.round(packed.sizeBytes / 1024)} kB)\n`);
    return { ok: true, exitCode: 0, commands, artifact: packed };
}

function run(command: string, args: readonly string[], cwd: string,
             onOutput?: (chunk: string) => void): Promise<number> {
    return new Promise((resolvePromise) => {
        const child = spawn(command, [...args], {
            cwd,
            stdio: onOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            // Na Windows `cmake` bywa plikiem .cmd z instalatora — bez powłoki
            // spawn zgłasza ENOENT, choć narzędzie jest na ścieżce.
            shell: process.platform === 'win32',
        });
        if (onOutput && child.stdout && child.stderr) {
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', onOutput);
            child.stderr.on('data', onOutput);
        }
        child.on('error', (error) => {
            onOutput?.(`nie udało się uruchomić ${command}: ${error.message}\n`);
            resolvePromise(127);
        });
        child.on('close', (code) => resolvePromise(code ?? 1));
    });
}

/** Pliki, które mają trafić do archiwum obok binarki. */
const RUNTIME_SUFFIXES = ['.dll', '.dylib', '.so'];

/**
 * Zbiera wynik budowy.
 *
 * Zwraca `string` z opisem problemu zamiast rzucać: nieudane spakowanie nie
 * unieważnia udanej kompilacji, a użytkownik ma zobaczyć, czego zabrakło,
 * i móc sięgnąć po plik z katalogu build ręcznie.
 */
function collectArtifact(root: string, platform: HostPlatform,
                         request: NativeBuildRequest): BuildArtifact | string {
    const buildDir = join(root, 'build', platform.preset);
    const exeName = `${request.projectName}${platform.exeSuffix}`;

    const exePath = findExecutable(buildDir, exeName);
    if (!exePath) {
        return `budowa się powiodła, ale nie znaleziono ${exeName} w ${buildDir} — ` +
               'sprawdź, czy projekt ma pliki w src/';
    }

    const exe = readFileSync(exePath);

    // Bez bibliotek obok — oddajemy sam plik wykonywalny. Archiwum byłoby
    // wtedy dodatkowym krokiem dla użytkownika bez żadnego powodu.
    if (!platform.bundlesRuntime) {
        return {
            name: artifactName(request.target, platform, false),
            path: exePath,
            mimeType: 'application/octet-stream',
            sizeBytes: exe.length,
            base64: exe.toString('base64'),
            packaged: false,
        };
    }

    const entries: ZipEntry[] = [{ name: exeName, data: exe }];
    for (const file of siblingRuntimeFiles(exePath)) {
        entries.push({ name: basename(file), data: readFileSync(file) });
    }

    const zip = createZip(entries);
    return {
        name: artifactName(request.target, platform, true),
        path: exePath,
        mimeType: 'application/zip',
        sizeBytes: zip.length,
        base64: zip.toString('base64'),
        packaged: true,
    };
}

/**
 * Szuka pliku wykonywalnego w katalogu budowy i jeden poziom niżej.
 *
 * Poziom niżej, bo generatory wielokonfiguracyjne (Visual Studio, Xcode)
 * wkładają wynik do podkatalogu konfiguracji — `build/<preset>/Release/app.exe`.
 * Ninja kładzie go wprost i wtedy pierwsze sprawdzenie wystarcza.
 */
function findExecutable(buildDir: string, exeName: string): string | undefined {
    const direct = join(buildDir, exeName);
    if (existsSync(direct)) return direct;

    if (!existsSync(buildDir)) return undefined;
    for (const entry of readdirSync(buildDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const nested = join(buildDir, entry.name, exeName);
        if (existsSync(nested)) return nested;
    }
    return undefined;
}

function siblingRuntimeFiles(exePath: string): string[] {
    const dir = exePath.slice(0, exePath.length - basename(exePath).length) || '.';
    try {
        return readdirSync(dir)
            .filter((name) => RUNTIME_SUFFIXES.some((suffix) => name.toLowerCase().endsWith(suffix)))
            .map((name) => join(dir, name))
            .filter((path) => statSync(path).isFile());
    } catch {
        return [];
    }
}
