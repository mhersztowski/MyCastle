/**
 * Polecenie powłoki uruchamiające budowanie Hydry.
 *
 * ## Dlaczego to jest osobny plik
 *
 * Budowanie w Drive idzie przez sesję terminala, więc wynikiem jest **jeden
 * wiersz tekstu**. Sklejanie go w środku obsługi WebSocketa znaczyło, że jedyny
 * sposób sprawdzenia, czy jest poprawny, to uruchomić Dockera i poczekać kilka
 * minut. Tutaj jest to zwykła funkcja i zwykły test.
 *
 * ## Dwie drogi budowania, wybierane z pliku projektu
 *
 * Cele sprzętowe idą przez `pio run -e <cel>`. Cele budowane CMake'em —
 * `mcu: native` i `mcu: wasm` — **nie mają wpisu w `platformio.ini`**;
 * `emitPlatformio` pomija je świadomie, bo `platform = native` nie zbuduje ani
 * programu okienkowego z SDL, ani modułu WebAssembly. Wysłanie ich mimo to do
 * PlatformIO kończy się komunikatem, który każe szukać błędu w pliku projektu:
 *
 *     UnknownEnvNamesError: Unknown environment names 'web'.
 *     Valid names are 'esp32s3'
 *
 * — a projekt jest w porządku, to droga jest zła.
 */

/** Odmowa z powodem nadającym się do pokazania w panelu Kompilacja. */
export class HydraBuildRefused extends Error {}

export type HydraBuildKind = 'pio' | 'native' | 'wasm';

export interface HydraCommandRequest {
    kind: HydraBuildKind;
    /** Katalog biblioteki Hydry na serwerze — z niego bierzemy `docker/hydra.sh`. */
    hydraDir: string;
    /** Katalog projektu na serwerze (ten, w którym leży plik `.hydra`). */
    projectDir: string;
    target?: string;
    upload?: boolean;
    /** Obraz z emscriptenem; `hydra.sh` wybiera obraz zmienną `HYDRA_IMAGE`. */
    wasmImage: string;
}

/** Katalog budowy celu przeglądarkowego — jeden, bo wynik jest przenośny. */
export const WASM_BUILD_DIR = 'build/wasm';

/**
 * Gdzie `hydra.sh project` montuje bibliotekę wewnątrz kontenera.
 *
 * Podajemy to wprost przy konfiguracji, mimo że wygenerowany `CMakeLists.txt`
 * ma tę ścieżkę wpisaną: `HYDRA_ROOT` jest zmienną **cache**, więc raz zapisana
 * wartość przebija plik przy każdej kolejnej konfiguracji. Jedna nieudana próba
 * ze złą ścieżką zostawiała katalog budowy, który mówił „nie znaleziono źródeł
 * Hydry" już zawsze.
 */
const HYDRA_ROOT_IN_CONTAINER = '/hydra/Hydra';

/** Cytowanie na potrzeby powłoki — katalogi użytkowników bywają ze spacjami. */
function quote(value: string): string {
    return `"${value}"`;
}

export function hydraBuildCommand(request: HydraCommandRequest): string {
    const script = quote(`${request.hydraDir}/docker/hydra.sh`);
    const dir = quote(request.projectDir);

    /**
     * `hydra.sh project <katalog> <polecenie…>` — argumenty po katalogu są
     * poleceniem uruchamianym **wewnątrz kontenera**, a nie flagami skryptu.
     */
    const inContainer = (...command: string[]): string =>
        [script, 'project', dir, ...command].join(' ');

    if (request.kind === 'native') {
        /*
         * Cel natywny wymaga presetu opisującego maszynę kontenera, a tego Drive
         * nie ma skąd wziąć — backend MyCastle nie wystawia odpowiednika
         * `/api/hydra/status`.
         *
         * Odmowa wskazuje **cel przeglądarkowy**, a nie inny edytor, bo to on
         * naprawdę rozwiązuje problem użytkownika. Kompilator siedzi w
         * kontenerze z Linuksem, więc wynikiem celu natywnego jest program
         * linuksowy — na macOS nie uruchomi go ani Drive, ani Monaco. Wskazanie
         * innego edytora byłoby odesłaniem po to samo rozczarowanie.
         */
        throw new HydraBuildRefused(
            'Cel natywny buduje się przez CMake z presetem opisującym maszynę, ' +
            'a Drive nie wie, na czym stoi kontener. ' +
            'Żeby uruchomić projekt tutaj, wybierz cel przeglądarkowy (mcu: wasm) — ' +
            'wynik otwiera się w karcie i chodzi na każdym systemie. ' +
            'Sam wsad natywny zbuduje edytor Monaco (monaco-web), ale powstaje ' +
            'w kontenerze z Linuksem, więc uruchomi się tylko na Linuksie.',
        );
    }

    if (request.kind === 'wasm') {
        if (!request.target) {
            throw new HydraBuildRefused(
                'Cel przeglądarkowy wymaga nazwy celu — wygenerowany CMakeLists.txt ' +
                'wybiera go zmienną HYDRA_TARGET.',
            );
        }
        // Emscripten leży w innym obrazie niż toolchainy PlatformIO.
        const image = `HYDRA_IMAGE=${quote(request.wasmImage)}`;
        // Dwa uruchomienia i `&&` między nimi: błąd konfiguracji ma zatrzymać
        // budowę, a nie puścić kompilację przeciw nieaktualnej pamięci
        // podręcznej CMake. `emcmake` przed `cmake` podstawia plik toolchaina
        // emscriptena — bez niego CMake konfiguruje budowę dla architektury
        // kontenera i pomyłka wychodzi dopiero przy konsolidacji.
        const configure = `${image} ${inContainer(
            'emcmake', 'cmake', '-B', WASM_BUILD_DIR,
            '-D', `HYDRA_TARGET=${request.target}`,
            '-D', `HYDRA_ROOT=${HYDRA_ROOT_IN_CONTAINER}`,
            '-D', 'CMAKE_BUILD_TYPE=Release',
        )}`;
        const build = `${image} ${inContainer('cmake', '--build', WASM_BUILD_DIR, '-j', '4')}`;
        /*
         * `upload` nie zmienia tu kroków i nie jest błędem.
         *
         * Dla celu sprzętowego „wgraj" znaczy wgranie wsadu, a dla
         * przeglądarkowego — otwarcie strony z modułem. To ostatnie robi
         * klient, bo tylko on ma przeglądarkę; budowa jest ta sama.
         */
        return `${configure} && ${build}`;
    }

    // Cel wybiera środowisko PlatformIO (`-e`), a wgrywanie osobny cel
    // `upload`. Bez `-e` `pio run` buduje **wszystkie** środowiska z pliku.
    return inContainer(
        'pio', 'run',
        ...(request.target ? ['-e', quote(request.target)] : []),
        ...(request.upload ? ['-t', 'upload'] : []),
    );
}
