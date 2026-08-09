/**
 * Budowanie projektu Hydry z panelu Kompilacja.
 *
 * Przeglądarka nie uruchomi Dockera, więc robi to monaco-backend pod
 * `POST /api/hydra/build`. Odpowiedź jest strumieniem zdarzeń, a nie jedną
 * paczką JSON: budowanie wsadu trwa minuty i różnica między „kompiluje"
 * a „zawisło" jest widoczna tylko wtedy, gdy wiersze przychodzą na bieżąco.
 *
 * Czytamy go `fetch`em, a nie `EventSource`: ten drugi umie wyłącznie GET,
 * a żądanie niesie ciało (plik, cel, wgrywanie).
 */

import {
    HydraDocument, buildPlan, emitPlatformio, emitCMake, emitCMakePresets, hostPlatformFor,
    artifactName,
    type BuildArtifactInfo, type HostPlatform,
} from '@mhersztowski/hydra-studio/model';
import type { BuildOutcome } from '@mhersztowski/hydra-studio';
import type { FileSystemProvider } from '@mhersztowski/core';

export interface HydraBuildRequest {
    /** Ścieżka pliku `.hydra` w przestrzeni VFS edytora. */
    file: string;
    target?: string;
    upload?: boolean;
}

/**
 * Katalog Hydry widziany z wnętrza kontenera.
 *
 * `hydra.sh project` montuje bibliotekę pod `/hydra/Hydra` i ustawia
 * `HYDRA_LIB_DIR=/hydra`. Wygenerowany `CMakeLists.txt` musi wskazywać to samo
 * miejsce, bo powstaje po to, żeby zbudować się właśnie tam.
 */
const HYDRA_PATH_IN_CONTAINER = '/hydra/Hydra';

/**
 * Zapisuje `platformio.ini` wyliczony z pliku `.hydra`.
 *
 * Plik jest wygenerowany i słusznie nie leży w repozytorium: powstaje
 * z projektu, a nie odwrotnie. Bez niego `pio run` kończy się „Not a PlatformIO
 * project". Generujemy go tuż przed budowaniem, żeby odpowiadał temu, co widać
 * w edytorze — łącznie z niezapisanymi jeszcze zmianami.
 */
async function writeGeneratedManifest(
    file: string,
    source: string,
    provider: FileSystemProvider,
    onLine: (line: string) => void,
): Promise<void> {
    const plan = buildPlan(HydraDocument.parse(source).toJS());
    const ini = emitPlatformio(plan);
    const target = file.replace(/[^/]+$/, 'platformio.ini');

    await provider.writeFile?.(target, new TextEncoder().encode(ini), {
        create: true, overwrite: true,
    });
    const hardware = plan.targets.filter((t) => !t.isNative).length;
    onLine(`Wygenerowano platformio.ini (${hardware} środowisk).`);
}

/**
 * Pliki budowania dla celu natywnego.
 *
 * Cel `mcu: native` nie ma wpisu w `platformio.ini` — `emitPlatformio` pomija
 * go świadomie, bo `platform = native` nie obsłuży programu okienkowego z SDL.
 * Idzie więc przez CMake, a to znaczy dwa pliki: `CMakeLists.txt` opisujący,
 * co zbudować, i `CMakePresets.json` mówiący, dla jakiej maszyny.
 */
async function writeNativeManifests(
    file: string,
    plan: ReturnType<typeof buildPlan>,
    provider: FileSystemProvider,
    onLine: (line: string) => void,
): Promise<void> {
    const write = async (name: string, content: string): Promise<void> => {
        await provider.writeFile?.(
            file.replace(/[^/]+$/, name),
            new TextEncoder().encode(content),
            { create: true, overwrite: true },
        );
    };

    await write('CMakeLists.txt', emitCMake(plan, { hydraPath: HYDRA_PATH_IN_CONTAINER }));

    const presets = emitCMakePresets(plan);
    if (presets === null) {
        // Nie powinno się zdarzyć — tu trafiamy wyłącznie dla celu natywnego.
        throw new Error('Projekt nie ma celu natywnego, mimo że wybrano budowanie natywne.');
    }
    await write('CMakePresets.json', presets);

    onLine('Wygenerowano CMakeLists.txt i CMakePresets.json.');
}

/**
 * Preset dla maszyny, na której stoi kontener — nie dla tej, na której otwarto
 * edytor.
 *
 * Studio wykrywa system z przeglądarki, ale kompilator siedzi w kontenerze:
 * edytor bywa otwarty na Windows, gdy backend działa w WSL na ARM. Preset ma
 * warunek `hostSystemName == Linux`, więc podanie wariantu z przeglądarki
 * kończy się odmową cmake zamiast budową.
 */
async function containerPlatform(os: 'linux' | 'windows'): Promise<HostPlatform> {
    const response = await fetch('/api/hydra/status');
    const status = await response.json() as { arch?: string };
    const arch = status.arch === 'arm64' ? 'arm64' : 'x64';

    const platform = hostPlatformFor(os, arch);
    if (!platform) throw new Error(`Brak presetu dla maszyny ${os}-${arch}.`);
    return platform;
}

/**
 * Dla jakiego systemu budować cel natywny.
 *
 * Program natywny jest dla **maszyny użytkownika**, a nie dla kontenera, więc
 * pytamy przeglądarkę, na czym stoi. Edytor otwarty na Windows ma dostać
 * `.exe`, a nie binarkę Linuksa, której nie da się tam uruchomić — to był
 * pierwszy wynik tej ścieżki i nie nadawał się do niczego.
 *
 * Architektura zostaje architekturą kontenera: krosskompilujemy tym, co jest
 * w obrazie, a nie tym, co widzi przeglądarka.
 */
function targetOs(): 'linux' | 'windows' {
    const platform = typeof navigator === 'undefined' ? '' : navigator.platform;
    const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    return /win/i.test(platform) || /windows/i.test(agent) ? 'windows' : 'linux';
}

/**
 * Gotowy program po udanej budowie natywnej.
 *
 * Plik leży w katalogu projektu, czyli **wewnątrz katalogu danych** — czyta go
 * więc ta sama warstwa VFS, którą edytor listuje pliki. Osobna trasa do
 * pobierania artefaktów byłaby drugim sposobem na to samo.
 *
 * Nazwa pliku wykonywalnego to nazwa projektu, bo tak nazywa go wygenerowany
 * `CMakeLists.txt` (`add_executable(${projectName} …)`), a katalog budowy
 * bierze się z presetu (`build/<preset>`).
 */
async function collectArtifact(
    file: string,
    projectName: string,
    target: string,
    platform: HostPlatform,
    provider: FileSystemProvider,
): Promise<{ artifact?: BuildArtifactInfo; problem?: string }> {
    const dir = file.replace(/[^/]+$/, '');

    /*
     * Windows dostaje archiwum, Linux sam plik.
     *
     * `.exe` bez `SDL2.dll` nie uruchomi się u odbiorcy, a pobranie
     * pojedynczego pliku nie ma jak zabrać jej ze sobą — dlatego budowanie dla
     * Windows kończy się `zip`em, a tutaj czytamy jego wynik. Na Linuksie
     * biblioteki są systemowe i pakowanie niczego by nie wnosiło.
     */
    const packaged = platform.os === 'windows';
    const path = packaged
        ? `${dir}build/${platform.preset}/${projectName}.zip`
        : `${dir}build/${platform.preset}/${projectName}${platform.exeSuffix}`;

    try {
        const bytes = await provider.readFile?.(path);
        if (!bytes) return { problem: `Nie udało się odczytać ${path}.` };

        return {
            artifact: {
                name: artifactName(target, platform, packaged),
                mimeType: packaged ? 'application/zip' : 'application/octet-stream',
                sizeBytes: bytes.length,
                base64: toBase64(bytes),
                packaged,
            },
        };
    } catch (err) {
        // Budowa się udała, więc brak pliku znaczy, że szukamy go nie tam —
        // to warto powiedzieć wprost razem ze ścieżką.
        return { problem: `Budowa się udała, ale nie ma pliku ${path}: ${String(err)}` };
    }
}

/**
 * Bajty → base64 porcjami.
 *
 * `String.fromCharCode(...bytes)` na pliku wykonywalnym przekracza limit
 * argumentów wywołania i kończy się „Maximum call stack size exceeded".
 * Program natywny to setki kilobajtów, więc to nie jest przypadek brzegowy.
 */
function toBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

export async function runHydraBuild(
    request: HydraBuildRequest,
    source: string,
    provider: FileSystemProvider,
    onLine: (line: string) => void,
): Promise<string | BuildOutcome> {
    /*
     * Droga budowania wynika z celu, a nie z osobnego przycisku.
     *
     * Cel natywny („okno na maszynie deweloperskiej") i cel sprzętowy różnią
     * się całym zapleczem: CMake z SDL kontra PlatformIO. Pytanie o to
     * użytkownika byłoby pytaniem o rzecz, którą plik projektu już mówi.
     */
    const plan = buildPlan(HydraDocument.parse(source).toJS());
    const chosen = request.target ?? plan.defaultTarget;
    // Cel jako obiekt, nie flaga: dalej potrzebna jest jego nazwa, a wersja
    // z `some()` zostawiała ją typem `string | undefined` mimo że w tej gałęzi
    // jest już pewna.
    const nativeTarget = plan.targets.find((t) => t.name === chosen && t.isNative);

    let payload: Record<string, unknown>;
    if (nativeTarget) {
        await writeNativeManifests(request.file, plan, provider, onLine);
        const os = targetOs();
        const platform = await containerPlatform(os);
        payload = {
            ...request,
            // Cel natywny musi być nazwany wprost: `CMakeLists.txt` wybiera go
            // zmienną `HYDRA_TARGET` i niczego nie zgaduje.
            target: nativeTarget.name,
            kind: 'native',
            os,
            preset: platform.preset,
            // Backend nie czyta `.hydra`, więc nazwę pliku wykonywalnego zna
            // tylko ten, kto plik parsował. Bierze się z `add_executable`
            // w wygenerowanym CMakeLists.txt, czyli z nazwy projektu.
            executable: `${plan.projectName}${platform.exeSuffix}`,
            // Zostaje po stronie klienta — backendowi wystarcza nazwa presetu.
            platform,
        };
        onLine(os === 'windows'
            ? `Cel natywny „${nativeTarget.name}" — buduję ${platform.label} (archiwum z .exe i SDL2.dll).`
            : request.upload
                ? `Cel natywny „${nativeTarget.name}" — buduję i uruchamiam (preset ${platform.preset}).`
                : `Cel natywny „${nativeTarget.name}" — buduję przez CMake (preset ${platform.preset}).`);
    } else {
        await writeGeneratedManifest(request.file, source, provider, onLine);
        payload = { ...request, kind: 'pio' };
    }

    const { platform: _platform, ...wire } = payload;
    const response = await fetch('/api/hydra/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wire),
    });

    // Odmowa przychodzi zwykłym JSON-em — strumień zaczyna się dopiero wtedy,
    // gdy backend wie, że ma co uruchomić.
    if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(String((detail as { error?: string }).error ?? response.statusText));
    }

    const { output, code } = await readBuildStream(response.body, onLine);

    // Wsad zostaje na urządzeniu, więc nie ma czego oddawać. Program natywny
    // jest plikiem dla maszyny użytkownika — budowa, po której trzeba go
    // jeszcze samemu znaleźć w katalogu build, nie jest skończona.
    if (!nativeTarget || code !== 0) return output;

    const { artifact, problem } = await collectArtifact(
        request.file, plan.projectName, nativeTarget.name,
        payload.platform as HostPlatform, provider,
    );

    return {
        output,
        ...(artifact ? { artifact } : {}),
        ...(problem ? { artifactProblem: problem } : {}),
    };
}

/**
 * Czyta strumień zdarzeń do końca budowania.
 *
 * `code` jest `undefined`, gdy strumień urwał się przed zdarzeniem `done` —
 * wtedy o wyniku nic nie wiadomo i nie ma po co szukać artefaktu.
 */
async function readBuildStream(
    body: ReadableStream<Uint8Array>,
    onLine: (line: string) => void,
): Promise<{ output: string; code?: number }> {
    const collected: string[] = [];
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let pending = '';

    const push = (text: string): void => { collected.push(text); onLine(text); };

    for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
            chunk = await reader.read();
        } catch (err) {
            // Zerwane połączenie w trakcie budowania — najczęściej restart
            // backendu. Surowy `TypeError: network error` wyglądał jak błąd
            // kompilacji, a to nie o kompilację chodzi.
            push(`\nPołączenie z serwerem budowania zostało przerwane (${String(err)}).`);
            push('Budowanie mogło działać dalej po stronie serwera — spróbuj ponownie.');
            return { output: collected.join('\n') };
        }
        if (chunk.done) break;

        pending += decoder.decode(chunk.value, { stream: true });

        // Zdarzenia SSE rozdziela pusty wiersz; ostatni, niepełny fragment
        // czeka na dalszy ciąg.
        const frames = pending.split('\n\n');
        pending = frames.pop() ?? '';

        for (const frame of frames) {
            const line = frame.split('\n').find((l) => l.startsWith('data:'));
            if (!line) continue;
            let event: { type?: string; text?: string; code?: number };
            try {
                event = JSON.parse(line.slice('data:'.length).trim());
            } catch {
                continue;   // ramka nie po naszemu — nie nasza sprawa
            }

            if (event.type === 'line' && event.text !== undefined) {
                push(event.text);
                continue;
            }
            if (event.type === 'done') {
                push(event.code === 0
                    ? '\nBudowanie zakończone powodzeniem.'
                    : `\nBudowanie nie powiodło się (kod wyjścia ${event.code}).`);
                return { output: collected.join('\n'), code: event.code };
            }
        }
    }

    // Strumień skończył się bez `done` — połączenie zerwane w trakcie budowania.
    push('\nPołączenie z serwerem budowania zostało przerwane.');
    return { output: collected.join('\n') };
}
