/**
 * Uruchamianie budowy — to, co w Studiu kryje się pod „Projekt / Buduj".
 *
 * Hydra ma już środowisko budowania: obraz Dockera z PlatformIO i kompletem
 * toolchainów, obsługiwany przez `docker/hydra.sh`. Studio nie powiela tej
 * wiedzy ani nie woła `pio` bezpośrednio — generuje pliki i przekazuje robotę
 * temu skryptowi. Dzięki temu budowa z edytora, z wiersza poleceń i z CI
 * przechodzi tą samą drogą i nie ma trzech miejsc, w których coś może się
 * rozjechać.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runNativeBuild, type BuildArtifact } from './native';

export interface BuildRequest {
    /** Katalog projektu. */
    projectRoot: string;
    /** Katalog biblioteki Hydry — tam leży docker/hydra.sh. */
    hydraRoot: string;
    /** Cel do zbudowania; brak oznacza domyślny. */
    target?: string;
    /** Co zrobić: zbudować wsad czy wgrać go na urządzenie. */
    action: 'build' | 'upload';
    /** Port urządzenia przy wgrywaniu. */
    port?: string;
    /**
     * Cel natywny — obecność tego pola przełącza budowę na CMake i pomija
     * kontener. Wypełnia je wołający, bo tylko on zna model projektu; build.ts
     * nie parsuje `.hydra`, żeby nie mieć drugiego miejsca, w którym zapada
     * decyzja „to jest cel natywny".
     */
    native?: {
        /** Nazwa projektu — z niej bierze się nazwa pliku wykonywalnego. */
        projectName: string;
        /** Maszyna z HOST_PLATFORMS; brak = ta, na której stoimy. */
        hostPlatformId?: string;
    };
}

export interface BuildResult {
    ok: boolean;
    exitCode: number;
    /** Uruchomione polecenie — wypisywane, żeby dało się je powtórzyć ręcznie. */
    command: string;
    /** Wynik budowy celu natywnego, gotowy do pobrania. */
    artifact?: BuildArtifact;
    /** Dlaczego artefaktu nie ma mimo udanej budowy. */
    artifactProblem?: string;
}

export type { BuildArtifact } from './native';

/** Odnajduje skrypt środowiska budowania. */
export function findBuildScript(hydraRoot: string): string {
    const script = join(resolve(hydraRoot), 'docker', 'hydra.sh');
    if (!existsSync(script)) {
        throw new Error(
            `nie znaleziono ${script}\n` +
            'wskaż katalog Hydry przez --hydra <ścieżka> albo zmienną HYDRA_ROOT');
    }
    return script;
}

export async function runBuild(request: BuildRequest,
                               onOutput?: (chunk: string) => void): Promise<BuildResult> {
    if (request.native) {
        if (request.action === 'upload') {
            const message = 'cel natywny nie ma czego wgrywać — to program na tę maszynę\n';
            onOutput?.(message);
            return { ok: false, exitCode: 2, command: '' };
        }
        const result = await runNativeBuild({
            projectRoot: request.projectRoot,
            target: request.target ?? 'native',
            projectName: request.native.projectName,
            ...(request.native.hostPlatformId !== undefined
                ? { hostPlatformId: request.native.hostPlatformId } : {}),
            hydraRoot: request.hydraRoot,
        }, onOutput);

        return {
            ok: result.ok,
            exitCode: result.exitCode,
            command: result.commands.join(' && '),
            ...(result.artifact ? { artifact: result.artifact } : {}),
            ...(result.artifactProblem ? { artifactProblem: result.artifactProblem } : {}),
        };
    }

    const script = findBuildScript(request.hydraRoot);

    // Polecenie `project` montuje katalog projektu jako roboczy, a Hydrę obok
    // pod /hydra — tak, jak wskazuje na nią wygenerowany platformio.ini.
    const pio = ['pio', 'run'];
    if (request.target) pio.push('-e', request.target);
    if (request.action === 'upload') {
        pio.push('-t', 'upload');
        if (request.port) pio.push('--upload-port', request.port);
    }

    const args = ['project', resolve(request.projectRoot), ...pio];
    const command = `${script} ${args.join(' ')}`;

    return new Promise((resolvePromise) => {
        const child = spawn(script, args, {
            stdio: onOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });

        if (onOutput && child.stdout && child.stderr) {
            child.stdout.setEncoding('utf8');
            child.stderr.setEncoding('utf8');
            child.stdout.on('data', onOutput);
            child.stderr.on('data', onOutput);
        }

        child.on('error', (error) => {
            onOutput?.(`nie udało się uruchomić budowy: ${error.message}\n`);
            resolvePromise({ ok: false, exitCode: 127, command });
        });

        child.on('close', (code) => {
            resolvePromise({ ok: code === 0, exitCode: code ?? 1, command });
        });
    });
}
