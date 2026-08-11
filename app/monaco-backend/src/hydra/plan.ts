import * as path from 'node:path';

/**
 * Co dokładnie uruchomić, żeby zbudować projekt Hydry.
 *
 * Wydzielone z uruchamiania procesu, bo to jedyna część, w której da się
 * pomylić granicę katalogu danych albo kolejność argumentów — a jedno i drugie
 * chcemy sprawdzać testem, nie startem kontenera trwającym minutę.
 */

/** Którą drogą idzie budowanie. */
export type HydraBuildKind = 'pio' | 'native' | 'wasm';

/** Żądanie w postaci, w jakiej przychodzi z panelu Kompilacja Studia. */
export interface HydraBuildRequest {
    /** Ścieżka pliku `.hydra` w przestrzeni VFS edytora (czyli względem katalogu danych). */
    file: string;
    /** Środowisko PlatformIO albo nazwa celu natywnego. */
    target?: string;
    upload?: boolean;
    /**
     * Cele natywne (`mcu: native`) nie mają wpisu w `platformio.ini` —
     * `emitPlatformio` pomija je świadomie, bo `platform = native` nie
     * obsłuży programu okienkowego z SDL. Idą przez CMake.
     */
    kind?: HydraBuildKind;
    /** Preset CMake dla maszyny, na której stoi kontener (tylko dla `native`). */
    preset?: string;
    /**
     * System docelowy celu natywnego. `linux` buduje dla maszyny, na której
     * stoi kontener; `windows` krosskompiluje przez mingw i pakuje wynik.
     */
    os?: 'linux' | 'windows';
    /**
     * Nazwa pliku wykonywalnego w katalogu budowy — potrzebna, gdy program ma
     * po budowie zostać uruchomiony. Backend nie czyta `.hydra`, więc nazwę
     * projektu zna tylko ten, kto plik parsował.
     */
    executable?: string;
}

export interface HydraPaths {
    /** Katalog danych backendu — korzeń VFS edytora. */
    dataDir: string;
    /** Katalog biblioteki Hydra (ten z `docker/hydra.sh`). */
    hydraDir: string;
    /**
     * Obraz kontenera z emscriptenem — dla celu przeglądarkowego.
     * Domyślny obraz Hydry niesie toolchainy PlatformIO, ale nie emsdk.
     */
    wasmImage?: string;
}

/** Jedno uruchomienie procesu — bez powłoki, więc program i argumenty osobno. */
export interface HydraStep {
    script: string;
    args: string[];
    /** Katalog roboczy; bez niego proces dziedziczy katalog backendu. */
    cwd?: string;
    /**
     * Zmienne dołożone do środowiska procesu. Potrzebne celowi
     * przeglądarkowemu: emscripten leży w innym obrazie niż toolchainy
     * PlatformIO, a `hydra.sh` wybiera obraz właśnie zmienną.
     */
    env?: Record<string, string>;
}

export interface HydraPlan {
    /** Kroki w kolejności; pierwszy niezerowy kod wyjścia zatrzymuje resztę. */
    steps: HydraStep[];
    projectDir: string;
}

/** Odmowa z powodem nadającym się do pokazania w panelu. */
export class HydraPlanError extends Error {}

/**
 * Nazwy środowisk PlatformIO i presetów CMake. Wąsko, bo to jedyne wartości
 * z żądania, które trafiają do argumentów procesu.
 */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function planHydraBuild(request: HydraBuildRequest, paths: HydraPaths): HydraPlan {
    if (!request.file.endsWith('.hydra')) {
        throw new HydraPlanError(`To nie jest plik projektu Hydry: ${request.file}`);
    }

    const dataDir = path.resolve(paths.dataDir);
    // Ścieżki VFS są zawsze bezwzględne względem korzenia danych — wiodący
    // ukośnik odcinamy, inaczej `resolve` zignorowałby katalog danych.
    const absolute = path.resolve(dataDir, request.file.replace(/^\/+/, ''));

    // Granica katalogu danych. Porównanie z dołożonym separatorem, żeby
    // `…/data-inne` nie przeszło jako „wewnątrz `…/data`".
    if (absolute !== dataDir && !absolute.startsWith(dataDir + path.sep)) {
        throw new HydraPlanError(`Ścieżka wychodzi poza katalog danych: ${request.file}`);
    }

    if (request.target !== undefined && !NAME_PATTERN.test(request.target)) {
        throw new HydraPlanError(`Niepoprawna nazwa celu: ${request.target}`);
    }

    const projectDir = path.dirname(absolute);
    const script = path.join(paths.hydraDir, 'docker', 'hydra.sh');
    const step = (...command: string[]): HydraStep => ({
        script,
        // `hydra.sh project <katalog> <polecenie…>` — argumenty po katalogu są
        // poleceniem uruchamianym **wewnątrz kontenera**, a nie flagami skryptu.
        args: ['project', projectDir, ...command],
    });

    if (request.kind === 'native') {
        return { steps: nativeSteps(request, step, projectDir), projectDir };
    }

    if (request.kind === 'wasm') {
        return { steps: wasmSteps(request, step, paths.wasmImage), projectDir };
    }

    /*
     * Cel wybiera środowisko PlatformIO (`-e`), a wgrywanie osobny cel
     * `upload`. Bez `-e` `pio run` buduje **wszystkie** środowiska z pliku.
     */
    return {
        steps: [step(
            'pio', 'run',
            ...(request.target ? ['-e', request.target] : []),
            ...(request.upload ? ['-t', 'upload'] : []),
        )],
        projectDir,
    };
}

/** Katalog budowy celu przeglądarkowego — jeden, bo wynik jest przenośny. */
export const WASM_BUILD_DIR = 'build/wasm';

/**
 * Gdzie `hydra.sh project` montuje bibliotekę wewnątrz kontenera.
 *
 * Podajemy to wprost przy konfiguracji, mimo że wygenerowany CMakeLists ma tę
 * ścieżkę wpisaną: `HYDRA_ROOT` jest zmienną **cache**, więc raz zapisana
 * wartość przebija plik przy każdej kolejnej konfiguracji. Jedna nieudana
 * próba ze złą ścieżką zostawiała katalog budowy, który mówił „nie znaleziono
 * źródeł Hydry" już zawsze — i to niezależnie od tego, co potem wygenerował
 * edytor.
 */
const HYDRA_ROOT_IN_CONTAINER = '/hydra/Hydra';

/**
 * Budowa dla przeglądarki.
 *
 * Dwa uruchomienia z tego samego powodu, co przy celu natywnym: błąd
 * konfiguracji ma zatrzymać budowę, a nie puścić kompilację przeciw
 * nieaktualnej pamięci podręcznej CMake.
 *
 * Bez presetu i bez maszyny — i to jest cała różnica wobec `native`. Program
 * dla pulpitu jest inny na każdym systemie, więc tam preset opisuje maszynę;
 * `.wasm` jest jeden i chodzi wszędzie, więc opisywać nie ma czego.
 *
 * `emcmake` przed `cmake` podstawia plik toolchaina emscriptena. Bez niego
 * CMake skonfigurowałby budowę dla architektury kontenera, a wygenerowany
 * CMakeLists przerywa wtedy komunikatem — świadomie, bo pomyłka wyszłaby
 * inaczej dopiero przy konsolidacji.
 */
function wasmSteps(
    request: HydraBuildRequest,
    step: (...command: string[]) => HydraStep,
    wasmImage?: string,
): HydraStep[] {
    if (!request.target) {
        throw new HydraPlanError(
            'Cel przeglądarkowy wymaga nazwy celu — wygenerowany CMakeLists.txt wybiera go zmienną HYDRA_TARGET.',
        );
    }
    /*
     * `upload` nie zmienia tu kroków i nie jest błędem.
     *
     * Dla celu sprzętowego „wgraj" znaczy wgranie wsadu, dla natywnego —
     * uruchomienie okna na tej maszynie, a dla przeglądarkowego: otwarcie
     * strony z modułem. To ostatnie robi klient, bo tylko on ma przeglądarkę;
     * backend buduje tak samo w obu przypadkach.
     */

    const withImage = (...command: string[]): HydraStep => ({
        ...step(...command),
        ...(wasmImage ? { env: { HYDRA_IMAGE: wasmImage } } : {}),
    });

    return [
        withImage('emcmake', 'cmake', '-B', WASM_BUILD_DIR,
                  '-D', `HYDRA_TARGET=${request.target}`,
                  '-D', `HYDRA_ROOT=${HYDRA_ROOT_IN_CONTAINER}`,
                  '-D', 'CMAKE_BUILD_TYPE=Release'),
        withImage('cmake', '--build', WASM_BUILD_DIR, '-j', '4'),
    ];
}

/**
 * Konfiguracja i budowa jako dwa osobne uruchomienia.
 *
 * Połączenie ich w `cmake --preset X && cmake --build --preset X` wymagałoby
 * powłoki, a wtedy nazwa celu z żądania przestaje być samym argumentem.
 * Rozdzielenie ma też sens sam w sobie: błąd konfiguracji zatrzymuje budowę,
 * zamiast puszczać kompilację przeciw nieaktualnej pamięci podręcznej CMake.
 */
function nativeSteps(
    request: HydraBuildRequest,
    step: (...command: string[]) => HydraStep,
    projectDir: string,
): HydraStep[] {
    if (!request.preset) {
        throw new HydraPlanError('Cel natywny wymaga presetu CMake — bez niego cmake nie wie, dla jakiej maszyny budować.');
    }
    if (!NAME_PATTERN.test(request.preset)) {
        throw new HydraPlanError(`Niepoprawna nazwa presetu: ${request.preset}`);
    }
    if (!request.target) {
        throw new HydraPlanError('Cel natywny wymaga nazwy celu — wygenerowany CMakeLists.txt wybiera go zmienną HYDRA_TARGET.');
    }

    if (request.os === 'windows') return windowsSteps(request, step);

    const steps = [
        step('cmake', '--preset', request.preset, '-D', `HYDRA_TARGET=${request.target}`),
        step('cmake', '--build', '--preset', request.preset),
    ];

    if (request.upload) steps.push(runStep(request, projectDir));
    return steps;
}

/** Gdzie w obrazie leży zaplecze krosskompilacji na Windows ARM64. */
const MINGW_PREFIX = 'aarch64-w64-mingw32';
const SDL2_WIN_PREFIX = '/opt/sdl2-win-arm64';

/**
 * Budowanie `.exe` dla Windows w kontenerze linuksowym.
 *
 * Bez presetu: preset `native-win-arm64` Hydry opisuje budowanie **na**
 * Windows generatorem Visual Studio, a tutaj kompilator jest w obrazie, więc
 * cel wskazujemy flagami.
 *
 * Wynikiem jest archiwum, a nie sam plik wykonywalny: `.exe` bez `SDL2.dll`
 * nie uruchomi się u odbiorcy, a pojedynczy plik nie ma jak zabrać jej ze sobą.
 * Runtime kompilatora linkujemy statycznie — inaczej trzeba by dokładać jeszcze
 * `libc++.dll` i `libwinpthread-1.dll`, czyli pliki, o których odbiorca nie ma
 * prawa wiedzieć.
 */
function windowsSteps(
    request: HydraBuildRequest,
    step: (...command: string[]) => HydraStep,
): HydraStep[] {
    if (!request.executable) {
        throw new HydraPlanError('Budowanie dla Windows wymaga nazwy pliku wykonywalnego.');
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.executable)) {
        throw new HydraPlanError(`Niepoprawna nazwa programu: ${request.executable}`);
    }
    if (request.upload) {
        throw new HydraPlanError(
            'Programu dla Windows nie da się uruchomić w kontenerze, w którym powstał — pobierz archiwum i uruchom je u siebie.',
        );
    }

    const build = `build/${request.preset!}`;
    const archive = `${request.executable.replace(/\.exe$/, '')}.zip`;

    return [
        step('cmake', '-S', '.', '-B', build, '-G', 'Ninja',
            '-DCMAKE_SYSTEM_NAME=Windows',
            `-DCMAKE_C_COMPILER=${MINGW_PREFIX}-gcc`,
            `-DCMAKE_CXX_COMPILER=${MINGW_PREFIX}-g++`,
            `-DCMAKE_RC_COMPILER=${MINGW_PREFIX}-windres`,
            '-DCMAKE_BUILD_TYPE=RelWithDebInfo',
            `-DHYDRA_TARGET=${request.target}`,
            `-DCMAKE_PREFIX_PATH=${SDL2_WIN_PREFIX}`,
            '-DCMAKE_EXE_LINKER_FLAGS=-static'),
        step('cmake', '--build', build),
        step('cp', `${SDL2_WIN_PREFIX}/bin/SDL2.dll`, build),
        // `-j` spłaszcza ścieżki: w archiwum mają leżeć dwa pliki obok siebie,
        // a nie drzewo katalogów budowy.
        step('zip', '-j', `${build}/${archive}`, `${build}/${request.executable}`, `${build}/SDL2.dll`),
    ];
}

/**
 * Uruchomienie gotowego programu — **poza kontenerem**.
 *
 * Wsad wgrywa się na płytkę, a program natywny nie ma dokąd jechać: jego
 * „urządzeniem docelowym" jest ta maszyna. W WSL okno SDL trafia na pulpit
 * Windows przez WSLg, o ile proces widzi `WAYLAND_DISPLAY` — a widzi je host,
 * nie kontener, któremu trzeba by osobno przekazać gniazdo Waylanda.
 */
function runStep(request: HydraBuildRequest, projectDir: string): HydraStep {
    if (!request.executable) {
        throw new HydraPlanError('Nie wiadomo, co uruchomić — brak nazwy pliku wykonywalnego.');
    }
    // Sama nazwa pliku, bez ścieżki: to jedyna wartość z żądania, która staje
    // się nazwą uruchamianego programu.
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(request.executable)) {
        throw new HydraPlanError(`Niepoprawna nazwa programu: ${request.executable}`);
    }

    return {
        script: path.join(projectDir, 'build', request.preset!, request.executable),
        args: [],
        // Program szuka zasobów względem katalogu projektu, nie katalogu budowy.
        cwd: projectDir,
    };
}
