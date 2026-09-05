/**
 * Uruchamianie budowania Hydry przez sesję terminala.
 *
 * Studio nie ma jak samo odpalić Dockera z przeglądarki, a backend nie ma
 * punktu wykonującego polecenia. Zamiast go dopisywać — co znaczyłoby dołożyć
 * do serwera możliwość uruchamiania czegokolwiek i osobno przemyśleć jej
 * zabezpieczenie — korzystamy z kanału, który już istnieje i już jest
 * uwierzytelniany biletem: `ws://…/ws/terminal`.
 *
 * Ubocznie wychodzi z tego rzecz, której punkt REST by nie dał: wynik leci
 * wiersz po wierszu w trakcie kompilacji, zamiast pojawić się dopiero na końcu.
 * Przy budowaniu wsadu, które trwa minuty, to różnica między „widzę postęp"
 * a „nie wiem, czy nie zawisło".
 */

import { HydraDocument, buildPlan, emitCMake, emitPlatformio } from '@mhersztowski/hydra-studio/model';

import { hydraBuildCommand, type HydraBuildKind } from './hydraBuildCommand';

import { minisApi } from '../../services/MinisApiService';
import { writeUserFileText } from '../../services/userJson';

/** Katalog Hydry w Drive — z niego bierzemy `docker/hydra.sh`. */
const HYDRA_ROOT = 'git/MinisProjects/libs/Hydra';

/** Gdzie `hydra.sh project` montuje bibliotekę wewnątrz kontenera. */
const HYDRA_PATH_IN_CONTAINER = '/hydra/Hydra';

/**
 * Obraz z emscriptenem.
 *
 * Osobny od obrazu z toolchainami PlatformIO — emscripten waży swoje i projekt
 * na ESP32 nie ma powodu go pobierać. `hydra.sh` wybiera obraz zmienną.
 */
const WASM_IMAGE = 'mycastle-hydra-wasm:local';

export interface HydraBuildRequest {
    /** Ścieżka pliku `.hydra` w przestrzeni Drive. */
    file: string;
    target?: string;
    upload?: boolean;
}

/**
 * Ścieżka Drive → ścieżka w systemie plików serwera.
 *
 * Drive pokazuje `/user/drive/…`, a proces w terminalu widzi prawdziwy katalog
 * użytkownika. To samo odwzorowanie, którego używa `readFile` w warstwie VFS —
 * gdyby się rozjechały, budowanie sięgałoby po nieistniejące pliki.
 */
function toServerPath(driveFile: string, userName: string, dataRoot: string): string {
    const withoutUser = driveFile.replace(/^\/user\//, '');
    return `${dataRoot}/Minis/Users/${userName}/${withoutUser}`;
}

/**
 * Znacznik końca polecenia.
 *
 * Sesja terminala to zwykła powłoka interaktywna — nie kończy się po wykonaniu
 * polecenia, więc zdarzenie `exit` nigdy nie przychodzi i czekanie na nie
 * zawiesza się na zawsze. Doklejamy więc własny znacznik z kodem wyjścia
 * i rozpoznajemy go w strumieniu.
 */
const DONE_MARKER = '__HYDRA_BUILD_DONE__';

/**
 * Uruchamia budowanie i strumieniuje wynik.
 *
 * `onLine` dostaje kolejne wiersze na bieżąco. Obietnica kończy się razem
 * z procesem — wartością jest pełny wynik, żeby wywołujący nie musiał sam
 * sklejać strumienia.
 */
/**
 * Zapisuje `platformio.ini` wyliczony z pliku `.hydra`.
 *
 * Plik jest w `.gitignore` i słusznie: powstaje z projektu, a nie odwrotnie.
 * Kopia w Drive ma więc tylko `.hydra` i `src/`, a `pio run` bez `platformio.ini`
 * kończy się „Not a PlatformIO project". Generujemy go tuż przed budowaniem,
 * żeby zawsze odpowiadał temu, co widać w edytorze — a nie temu, co ktoś
 * zbudował poprzednio.
 */
async function writeGeneratedManifest(
    driveFile: string,
    source: string,
    userName: string,
    onLine: (line: string) => void,
): Promise<void> {
    const plan = buildPlan(HydraDocument.parse(source).toJS());
    const ini = emitPlatformio(plan);

    // Ścieżka względna do VFS: bez wiodącego `/user/`.
    const relative = driveFile.replace(/^\/user\//, '').replace(/[^/]+$/, 'platformio.ini');
    await writeUserFileText(userName, relative, ini);
    // Liczymy środowiska, a nie cele: cele budowane CMake'em świadomie nie mają
    // wpisu w tym pliku i podanie ich liczby sugerowałoby, że coś zginęło.
    const environments = plan.targets.filter((target) => !target.usesCMake).length;
    onLine(`Wygenerowano platformio.ini (${environments} środowisk).`);
}

/**
 * Plik budowy celu przeglądarkowego.
 *
 * Presetów nie ma czego opisywać — preset mówi, dla której maszyny budujemy,
 * a `.wasm` jest jeden i chodzi wszędzie.
 */
async function writeWasmManifest(
    driveFile: string,
    plan: ReturnType<typeof buildPlan>,
    userName: string,
    onLine: (line: string) => void,
): Promise<void> {
    const relative = driveFile.replace(/^\/user\//, '').replace(/[^/]+$/, 'CMakeLists.txt');
    await writeUserFileText(userName, relative, emitCMake(plan, { hydraPath: HYDRA_PATH_IN_CONTAINER }));
    onLine('Wygenerowano CMakeLists.txt.');
}

/**
 * Którą drogą idzie ten cel.
 *
 * Rozstrzyga **plik projektu**, a nie osobny przycisk: `mcu` celu decyduje,
 * czy buduje go PlatformIO, czy CMake. Użytkownik wybiera cel, nie narzędzie.
 */
function buildKindFor(plan: ReturnType<typeof buildPlan>, target: string | undefined): HydraBuildKind {
    const chosen = target ?? plan.defaultTarget;
    const found = plan.targets.find((t) => t.name === chosen);
    if (found?.isWasm) return 'wasm';
    if (found?.isNative) return 'native';
    return 'pio';
}

export async function runHydraBuild(
    request: HydraBuildRequest,
    userName: string,
    source: string,
    onLine: (line: string) => void,
): Promise<string> {
    const plan = buildPlan(HydraDocument.parse(source).toJS());
    const kind = buildKindFor(plan, request.target);

    // Każda droga potrzebuje innego pliku budowy — generowanie obu byłoby
    // zapisywaniem do katalogu projektu rzeczy, których nikt nie użyje.
    if (kind === 'wasm') await writeWasmManifest(request.file, plan, userName, onLine);
    else await writeGeneratedManifest(request.file, source, userName, onLine);

    // Katalog danych zna tylko serwer: ścieżki widoczne w Drive są wirtualne.
    const { dataRoot } = await minisApi.getDataRoot();
    const projectDir = toServerPath(request.file, userName, dataRoot).replace(/\/[^/]+$/, '');
    const hydraDir = `${dataRoot}/Minis/Users/${userName}/drive/${HYDRA_ROOT}`;

    // Samo polecenie powstaje w `hydraBuildCommand` — osobno, bo tam da się je
    // sprawdzić testem bez uruchamiania Dockera i czekania kilku minut.
    //
    // Przed otwarciem gniazda, bo ta funkcja **odmawia** dla celów, których
    // Drive nie umie zbudować. Odmowa po nawiązaniu połączenia zostawiałaby
    // wiszącą sesję terminala na serwerze.
    const command = hydraBuildCommand({
        kind,
        hydraDir,
        projectDir,
        ...(request.target !== undefined ? { target: request.target } : {}),
        ...(request.upload !== undefined ? { upload: request.upload } : {}),
        wasmImage: WASM_IMAGE,
    }) + `; echo "${DONE_MARKER}$?"`;

    const { ticket } = await minisApi.getTerminalTicket();
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${proto}://${window.location.host}/ws/terminal`);

    return new Promise<string>((resolve, reject) => {
        const collected: string[] = [];
        let pending = '';
        let settled = false;

        const finish = (result: string): void => {
            if (settled) return;
            settled = true;
            try { socket.close(); } catch { /* już zamknięty */ }
            resolve(result);
        };

        socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', ticket }));

        socket.onmessage = (event) => {
            let message: { type: string; data?: string; code?: number };
            try {
                message = JSON.parse(event.data as string);
            } catch {
                return;   // ramka nie po naszemu — nie nasza sprawa
            }

            if (message.type === 'ready') {
                socket.send(JSON.stringify({ type: 'input', data: `${command}\r` }));
                return;
            }

            if (message.type === 'output' && message.data) {
                // Terminal tnie strumień dowolnie, niekoniecznie na wierszach —
                // ostatni, niepełny fragment czeka na dalszy ciąg.
                pending += message.data;
                const lines = pending.split(/\r?\n/);
                pending = lines.pop() ?? '';
                for (const line of lines) {
                    const clean = stripAnsi(line);

                    // Znacznik kończy budowanie. Powłoka odbija wysłane
                    // polecenie, więc wiersz z samym `echo` też go zawiera —
                    // liczy się tylko ten, w którym po znaczniku stoi liczba.
                    const done = /^(\d+)$/.exec(clean.slice(clean.indexOf(DONE_MARKER) + DONE_MARKER.length));
                    if (clean.includes(DONE_MARKER) && done) {
                        const code = Number(done[1]);
                        const summary = code === 0
                            ? '\nBudowanie zakończone powodzeniem.'
                            : `\nBudowanie nie powiodło się (kod wyjścia ${code}).`;
                        collected.push(summary);
                        onLine(summary);
                        finish(collected.join('\n'));
                        return;
                    }
                    if (clean.includes(DONE_MARKER)) continue;   // odbite polecenie

                    collected.push(clean);
                    onLine(clean);
                }
                return;
            }

            if (message.type === 'exit') {
                if (pending) { collected.push(stripAnsi(pending)); onLine(stripAnsi(pending)); }
                const code = message.code ?? 0;
                const summary = code === 0
                    ? '\nBudowanie zakończone powodzeniem.'
                    : `\nBudowanie nie powiodło się (kod wyjścia ${code}).`;
                collected.push(summary);
                onLine(summary);
                finish(collected.join('\n'));
                return;
            }

            if (message.type === 'error') {
                const text = `Błąd terminala: ${message.data ?? 'nieznany'}`;
                collected.push(text);
                onLine(text);
                finish(collected.join('\n'));
            }
        };

        socket.onerror = () => {
            if (!settled) { settled = true; reject(new Error('nie udało się połączyć z terminalem')); }
        };

        socket.onclose = () => {
            // Zamknięcie przed `exit` znaczy zerwaną sesję, a nie ciche powodzenie.
            if (!settled) {
                settled = true;
                reject(new Error('połączenie z terminalem zostało zerwane'));
            }
        };
    });
}

/** Usuwa sekwencje sterujące — panel Kompilacja pokazuje tekst, nie terminal. */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '');
}
