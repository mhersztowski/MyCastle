/**
 * Generowanie CMakeLists.txt z planu budowy.
 *
 * Drugi równorzędny wynik obok platformio.ini, nie etap pośredni w drodze do
 * niego. Powód jest praktyczny: PlatformIO nie pokrywa wszystkich płytek —
 * RP2350 wymaga forka platformy, a projekty na pico-sdk i ESP-IDF budują się
 * cmakiem zupełnie obok. Ta sama Hydra ma się kompilować w obu światach.
 *
 * Odwrotny kierunek — platformio.ini z CMake'a — nie działa: CMake nie zna
 * pojęcia płytki PlatformIO, frameworka, partycji ani portu wgrywania.
 * Przepchnięcie tego przez niego oznaczałoby zapisanie danych z .hydra
 * w zmiennych CMake wyłącznie po to, by zaraz je stamtąd wyjąć.
 */

import type { BuildPlan, TargetPlan } from './plan';

export interface CMakeOptions {
    /** Ścieżka do katalogu Hydry względem generowanego pliku. */
    hydraPath?: string;
    /** Minimalna wersja CMake. */
    minimumVersion?: string;
}

export const GENERATED_MARKER = '# wygenerowane przez Hydra Studio';

export function emitCMake(plan: BuildPlan, options: CMakeOptions = {}): string {
    const lines: string[] = [];
    const hydraPath = options.hydraPath ?? '../Hydra';

    lines.push(GENERATED_MARKER + ' — nie edytuj ręcznie');
    lines.push(`# Źródło: ${plan.projectName}.hydra`);
    lines.push('#');
    lines.push('# Buduje Hydrę jako bibliotekę dla wybranego celu. Cel wskazuje się przy');
    lines.push('# konfiguracji:  cmake -B build -D HYDRA_TARGET=<nazwa>');
    lines.push('');

    lines.push(`cmake_minimum_required(VERSION ${options.minimumVersion ?? '3.20'})`);
    lines.push(`project(${plan.projectName} VERSION ${plan.projectVersion} LANGUAGES C CXX)`);
    lines.push('');
    lines.push('set(CMAKE_CXX_STANDARD 17)');
    lines.push('set(CMAKE_CXX_STANDARD_REQUIRED ON)');
    lines.push('set(CMAKE_CXX_EXTENSIONS OFF)');
    lines.push('');

    lines.push(...targetChoice(plan));
    lines.push('');
    lines.push(...sourceCollection(hydraPath));
    lines.push('');
    lines.push(...perTargetSettings(plan));
    if (plan.targets.some((target) => target.isNative)) {
        lines.push('');
        lines.push(...nativeSupport());
    }
    if (plan.targets.some((target) => target.isWasm)) {
        lines.push('');
        lines.push(...wasmSupport());
    }
    lines.push('');
    lines.push(...linkage(plan, hydraPath));

    return lines.join('\n') + '\n';
}

/**
 * Zależności celu natywnego: wątki i SDL.
 *
 * Blok jest wspólny dla wszystkich celów natywnych i stoi **po** łańcuchu
 * if/elseif, a nie w środku: `find_package` w gałęzi warunkowej wykonywałby
 * się przy każdej rekonfiguracji z innym celem i zostawiał w pamięci podręcznej
 * wyniki z poprzedniego.
 *
 * Brak SDL nie zatrzymuje konfiguracji. Ta sama budowa musi przejść w CI bez
 * serwera X i na maszynie z monitorem — różnicą jest wtedy `HYDRA_WITH_SDL`
 * i to, czy `SdlDisplay::begin()` otworzy okno, czy zwróci NotSupported.
 */
/**
 * Zależności celu przeglądarkowego.
 *
 * SDL nie jest tu szukany, tylko **zamawiany**: emscripten ma własny port
 * (`-sUSE_SDL=2`), który przy pierwszej budowie pobiera źródła i kompiluje je
 * pod WebAssembly. `find_package` znalazłby w tym miejscu SDL dla architektury
 * hosta — bibliotekę, której nie da się zlinkować z modułem WebAssembly,
 * i to jest gorsze niż jej brak, bo błąd wychodzi dopiero przy konsolidacji.
 *
 * Wątków nie ma świadomie: każdy byłby Web Workerem, a te wymagają
 * SharedArrayBuffer, czyli nagłówków COOP/COEP na serwerze — te z kolei
 * odcinają stronie zasoby cross-origin. Aplikacja z własną pętlą woła
 * `App::housekeeping()` sama (`App::config().housekeepingMs(0)`).
 *
 * ASYNCIFY pozwala zostawić blokującą pętlę `while (...) { loop(); }` taką,
 * jaka jest — bez przepisywania jej na `emscripten_set_main_loop`.
 */
function wasmSupport(): string[] {
    return [
        '# --- cel przeglądarkowy: SDL z portu emscriptena ---------------------------',
        'if(HYDRA_TARGET_IS_WASM)',
        '    if(NOT EMSCRIPTEN)',
        '        message(FATAL_ERROR',
        '            "Cel przeglądarkowy wymaga emscriptena. Konfiguruj przez emcmake:\\n"',
        '            "  emcmake cmake -B build/wasm -D HYDRA_TARGET=<cel>")',
        '    endif()',
        '',
        '    target_compile_definitions(hydra PUBLIC HYDRA_WITH_SDL=1 SDL_MAIN_HANDLED)',
        '    target_compile_options(hydra PUBLIC "-sUSE_SDL=2")',
        '    target_link_options(hydra PUBLIC "-sUSE_SDL=2")',
        '',
        '    # Kod, który istnieje wyłącznie dla karty przeglądarki: gniazdo',
        '    # przez WebSocket i most bodźców. Nie jest modułem — to backend',
        '    # platformy, tak jak `hal/arduino` dla układu.',
        '    file(GLOB HYDRA_WASM_SOURCES "${HYDRA_ROOT}/src/wasm/*.cpp")',
        '    target_sources(hydra PRIVATE ${HYDRA_WASM_SOURCES})',
        '',
        '    # Biblioteka JS emscriptena z API WebSocketu. Bez niej symbole',
        '    # `emscripten_websocket_*` zostają nierozwiązane dopiero przy',
        '    # konsolidacji, a komunikat nie wskazuje przyczyny.',
        '    target_link_options(hydra PUBLIC "-lwebsocket.js")',
        'endif()',
    ];
}

/**
 * Źródła runtime'u silnika skryptowego dla celów budowanych CMakiem.
 *
 * WAMR jest tu świadomie odrzucany, a nie po cichu pomijany. Jego źródła leżą
 * w osobnej bibliotece z własnym zestawem kilkudziesięciu definicji budowy,
 * dobranych pod ESP-IDF — przepisanie ich tutaj dałoby drugą, rozjeżdżającą się
 * konfigurację tego samego runtime'u. Na dodatek w przeglądarce interpreter
 * WebAssembly wewnątrz WebAssembly nie ma sensu: silnik jest już pod spodem.
 */
function scriptRuntime(target: TargetPlan): string[] {
    const engine = target.scriptEngine ?? 'lua';

    if (engine === 'wamr') {
        return [
            '',
            'message(FATAL_ERROR',
            '    "Silnik `wamr` jest dostępny wyłącznie dla celów budowanych PlatformIO.\\n"',
            '    "Dla celu natywnego i przeglądarkowego wybierz `lua` albo `wasm3`:\\n"',
            `    "  targets.${target.name}.modules.script.engine: lua")`,
        ];
    }

    const [dir, glob] = engine === 'wasm3'
        ? ['wasm3', 'src/wasm3/*.c']
        : ['lua', 'src/lua/*.c'];

    return [
        '',
        `# Runtime silnika \`${engine}\` — źródła w C, poza katalogami modułów.`,
        `file(GLOB HYDRA_SCRIPT_RUNTIME "\${HYDRA_ROOT}/${glob}")`,
        'target_sources(hydra PRIVATE ${HYDRA_SCRIPT_RUNTIME})',
        `target_include_directories(hydra PRIVATE "\${HYDRA_ROOT}/src/${dir}")`,
    ];
}

/**
 * Zależności celu natywnego: wątki i SDL.
 */
function nativeSupport(): string[] {
    return [
        '# --- cel natywny: wątki i SDL ----------------------------------------------',
        'if(HYDRA_TARGET_IS_NATIVE)',
        '    find_package(Threads REQUIRED)',
        '    target_link_libraries(hydra PUBLIC Threads::Threads)',
        '',
        '    # Trzy drogi, bo trzy systemy pakują SDL inaczej: vcpkg i Homebrew dają',
        '    # plik konfiguracyjny CMake, dystrybucje Linuksa — pkg-config.',
        '    find_package(SDL2 CONFIG QUIET)',
        '    if(NOT SDL2_FOUND)',
        '        find_package(PkgConfig QUIET)',
        '        if(PkgConfig_FOUND)',
        '            pkg_check_modules(SDL2 IMPORTED_TARGET QUIET sdl2)',
        '        endif()',
        '    endif()',
        '',
        '    if(TARGET SDL2::SDL2)',
        '        target_link_libraries(hydra PUBLIC SDL2::SDL2)',
        '        set(HYDRA_SDL_FOUND ON)',
        '    elseif(TARGET PkgConfig::SDL2)',
        '        target_link_libraries(hydra PUBLIC PkgConfig::SDL2)',
        '        set(HYDRA_SDL_FOUND ON)',
        '    else()',
        '        set(HYDRA_SDL_FOUND OFF)',
        '    endif()',
        '',
        '    if(HYDRA_SDL_FOUND)',
        '        target_compile_definitions(hydra PUBLIC HYDRA_WITH_SDL=1)',
        '        # Wejściem programu zostaje main() aplikacji.',
        '        #',
        '        # Bez tego SDL2main podstawia na Windows własne WinMain i szuka',
        '        # SDL_main — symbolu, który powstaje wyłącznie z `#define main',
        '        # SDL_main` w <SDL.h>. Aplikacja Hydry dołącza Hydra.h, nie SDL,',
        '        # bo SDL jest szczegółem backendu wyświetlania. SDL_MAIN_HANDLED',
        '        # zostawia więc main() tam, gdzie jest; backend woła',
        '        # SDL_SetMainReady() przed inicjalizacją.',
        '        target_compile_definitions(hydra PUBLIC SDL_MAIN_HANDLED)',
        '    else()',
        '        message(WARNING',
        '            "Hydra: nie znaleziono SDL2 — build powstanie bez okna.\\n"',
        '            "  Debian/Ubuntu:  sudo apt install libsdl2-dev\\n"',
        '            "  macOS:          brew install sdl2\\n"',
        '            "  Windows:        vcpkg install sdl2  (+ CMAKE_TOOLCHAIN_FILE)")',
        '    endif()',
        'endif()',
    ];
}

function targetChoice(plan: BuildPlan): string[] {
    const names = plan.targets.map((t) => t.name);
    const fallback = plan.defaultTarget ?? names[0] ?? '';

    return [
        '# --- wybór celu ------------------------------------------------------------',
        `set(HYDRA_KNOWN_TARGETS ${names.join(' ')})`,
        `set(HYDRA_TARGET "${fallback}" CACHE STRING "Cel sprzętowy")`,
        'set_property(CACHE HYDRA_TARGET PROPERTY STRINGS ${HYDRA_KNOWN_TARGETS})',
        '',
        '# Sprawdzenie od razu przy konfiguracji: literówka w nazwie celu ujawniłaby',
        '# się inaczej dopiero jako brak definicji w trakcie kompilacji.',
        'if(NOT HYDRA_TARGET IN_LIST HYDRA_KNOWN_TARGETS)',
        '    message(FATAL_ERROR',
        '        "Nieznany cel \\"${HYDRA_TARGET}\\". Dostępne: ${HYDRA_KNOWN_TARGETS}")',
        'endif()',
        'message(STATUS "Hydra: cel ${HYDRA_TARGET}")',
    ];
}

function sourceCollection(hydraPath: string): string[] {
    return [
        '# --- źródła frameworka -----------------------------------------------------',
        '# Ścieżka względna jest prawdziwa tylko tam, gdzie plik powstał — przy budowie',
        '# w kontenerze albo z innego katalogu wskaż ją jawnie:',
        '#     cmake -B build -D HYDRA_ROOT=/ścieżka/do/Hydry',
        `set(HYDRA_ROOT "${hydraPath}" CACHE PATH "Katalog biblioteki Hydra")`,
        '',
        '# Rdzeń i warstwa sprzętowa są zawsze; moduły opcjonalne dokładane niżej,',
        '# zależnie od celu. Wyłączony moduł nie trafia do kompilacji w ogóle.',
        '#',
        '# gfx jest w rdzeniu, a nie wśród modułów, bo nie ma własnej flagi',
        '# HYDRA_ENABLE_*: to podstawa modułu ui i celu native naraz. Wcześniej',
        '# wypadało z budowy CMake i moduł ui nie linkował się na brak Framebuffer.',
        'file(GLOB HYDRA_CORE_SOURCES',
        '    "${HYDRA_ROOT}/src/core/*.cpp"',
        '    "${HYDRA_ROOT}/src/hal/*.cpp"',
        '    "${HYDRA_ROOT}/src/gfx/*.cpp"',
        '    "${HYDRA_ROOT}/src/util/*.cpp")',
        '',
        '# Pusta lista oznacza złą ścieżkę. Bez tego sprawdzenia CMake kończy',
        '# komunikatem „No SOURCES given to target", który nie mówi, gdzie szukać.',
        'if(NOT HYDRA_CORE_SOURCES)',
        '    message(FATAL_ERROR',
        '        "Nie znaleziono źródeł Hydry w \\"${HYDRA_ROOT}\\". "',
        '        "Wskaż katalog biblioteki: cmake -B build -D HYDRA_ROOT=<ścieżka>")',
        'endif()',
        '',
        'add_library(hydra STATIC ${HYDRA_CORE_SOURCES})',
        'target_include_directories(hydra PUBLIC "${HYDRA_ROOT}/include")',
        '',
        '# Wyjątki i RTTI wyłączone — błędy propaguje expected<T, Err>.',
        'target_compile_options(hydra PUBLIC -fno-exceptions -fno-rtti -Wall -Wextra)',
    ];
}

function perTargetSettings(plan: BuildPlan): string[] {
    const lines: string[] = ['# --- ustawienia zależne od celu --------------------------------------------'];

    plan.targets.forEach((target, index) => {
        lines.push(`${index === 0 ? 'if' : 'elseif'}(HYDRA_TARGET STREQUAL "${target.name}")`);
        lines.push(...indent(targetBody(target)));
    });

    if (plan.targets.length > 0) lines.push('endif()');
    return lines;
}

function targetBody(target: TargetPlan): string[] {
    const lines: string[] = [];

    lines.push(`set(HYDRA_MCU "${target.mcu}")`);
    if (target.isNative) lines.push('set(HYDRA_TARGET_IS_NATIVE ON)');
    if (target.isWasm)   lines.push('set(HYDRA_TARGET_IS_WASM ON)');
    if (target.boardHeader) {
        lines.push(`target_compile_definitions(hydra PUBLIC HYDRA_BOARD_HEADER="${target.boardHeader}")`);
    }

    const defines = target.flags
        .filter((flag) => flag.startsWith('-D '))
        .map((flag) => flag.slice(3).trim())
        // Definicja nagłówka płytki poszła już wyżej we właściwym cytowaniu.
        .filter((define) => !define.startsWith('HYDRA_BOARD_HEADER'));

    if (defines.length > 0) {
        lines.push('target_compile_definitions(hydra PUBLIC');
        for (const define of defines) lines.push(`    ${define.replace(/^-D\s*/, '')}`);
        lines.push(')');
    }

    if (target.modules.length > 0) {
        /*
         * Wszystkie podkatalogi modułu, minus backendy nie dla tego celu.
         *
         * Wcześniej brane były tylko `src/<moduł>/` i `src/<moduł>/<backend>/`,
         * przez co katalogi będące zwykłym podziałem kodu — `media/elements/`,
         * `minis/links/`, `ui/lvgl/` — wypadały z budowy. Objawem był brak
         * symboli elementów potoku przy poprawnie skompilowanym module.
         *
         * Odwrotność, czyli wzorzec `*​/` bez filtra, brała naraz `net/arduino/`
         * i `net/mock/` — konsolidator zgłaszał wtedy zduplikowany symbol
         * w miejscu niezwiązanym z przyczyną. Stąd filtr po nazwie katalogu,
         * a nie lista dozwolonych.
         */
        const excluded = target.usesCMake ? ['arduino'] : ['mock', 'sdl'];

        lines.push('');
        lines.push(`# Moduły włączone dla tego celu; backend: ${target.usesCMake ? 'mock' : 'arduino'}.`);
        lines.push('file(GLOB HYDRA_MODULE_SOURCES');
        for (const module of target.modules) {
            lines.push(`    "\${HYDRA_ROOT}/src/${module}/*.cpp"`);
            lines.push(`    "\${HYDRA_ROOT}/src/${module}/*/*.cpp"`);
        }
        // Sterowniki czujników są zwykłym kodem nad HAL i działają na obu
        // backendach — na hoście rozmawiają z atrapą magistrali.
        if (target.modules.includes('sense')) {
            lines.push('    "${HYDRA_ROOT}/src/drivers/sense/*.cpp"');
        }
        lines.push(')');
        lines.push(`list(FILTER HYDRA_MODULE_SOURCES EXCLUDE REGEX "/(${excluded.join('|')})/")`);
        lines.push('target_sources(hydra PRIVATE ${HYDRA_MODULE_SOURCES})');

        /*
         * Runtime silnika skryptowego.
         *
         * Nie jest modułem i nie leży w `src/<moduł>/`: to kilkadziesiąt plików
         * w C, wciąganych na układzie manifestem biblioteki PlatformIO. CMake
         * takiego manifestu nie czyta, więc bez tych kilku wierszy cel natywny
         * albo przeglądarkowy kompilował `LuaEngine.cpp` i przerywał na
         * `lua.h` — z komunikatem, który o silniku nie mówił nic.
         */
        if (target.modules.includes('script')) {
            lines.push(...scriptRuntime(target));
        }
    }

    if (target.modules.includes('arduboy')) {
        /*
         * Drugi korzeń włączeń — wyłącznie dla projektów z modułem `arduboy`.
         *
         * Gra na Arduboya zaczyna się od `#include <Arduboy2.h>` i oczekuje
         * nazw globalnych: `WIDTH`, `BLACK`, `A_BUTTON`. Nie da się tego podać
         * spod `hydra/`, bo wtedy trzeba by zmienić źródło gry — czyli stracić
         * to, o co w tym module chodzi.
         *
         * Katalog jest osobny, a nie dopisany do `include/`, żeby te nazwy
         * widziały tylko projekty, które o nie poprosiły. Projekt bez modułu
         * `arduboy` nie ma szans przypadkiem złapać makra `WIDTH`.
         */
        lines.push('');
        lines.push('# Nazwy globalne dla niezmienionych źródeł gier: <Arduboy2.h>, WIDTH, A_BUTTON.');
        lines.push('target_include_directories(hydra PUBLIC "${HYDRA_ROOT}/include/compat/arduboy")');
    }

    if (target.usesCMake) {
        lines.push('');
        lines.push('# Backend hostowy: atrapy HAL zamiast Arduino, okno SDL zamiast panelu.');
        lines.push('# Katalogi */arduino/ nie trafiają tu w ogóle — na PC nie ma czego owijać.');
        lines.push('file(GLOB HYDRA_NATIVE_SOURCES');
        lines.push('    "${HYDRA_ROOT}/src/hal/mock/*.cpp"');
        lines.push('    "${HYDRA_ROOT}/src/hal/host/*.cpp"');
        lines.push('    "${HYDRA_ROOT}/src/gfx/sdl/*.cpp")');
        lines.push('target_sources(hydra PRIVATE ${HYDRA_NATIVE_SOURCES})');
    }

    if (!target.hasFpu) {
        lines.push('');
        lines.push('# Bez jednostki zmiennoprzecinkowej — regulatory pracują na Q16.16.');
        lines.push('target_compile_definitions(hydra PUBLIC HYDRA_HAS_FPU=0)');
    }

    return lines;
}

function linkage(plan: BuildPlan, hydraPath: string): string[] {
    const hasWasm = plan.targets.some((target) => target.isWasm);
    return [
        '# --- aplikacja -------------------------------------------------------------',
        '# Backend zależy od tego, czym budujemy: pico-sdk i ESP-IDF dostarczają',
        '# własny, a build hostowy używa atrap i nie potrzebuje żadnego SDK.',
        'if(HYDRA_HOST_BUILD)',
        `    file(GLOB HYDRA_MOCK_SOURCES "${hydraPath}/src/hal/mock/*.cpp")`,
        '    target_sources(hydra PRIVATE ${HYDRA_MOCK_SOURCES})',
        '    target_compile_definitions(hydra PUBLIC HYDRA_FORCE_HOST=1)',
        ...(hasWasm ? [
            '    # Cel przeglądarkowy jest jednowątkowy — patrz wasmSupport().',
            '    if(NOT HYDRA_TARGET_IS_WASM)',
            '        find_package(Threads REQUIRED)',
            '        target_link_libraries(hydra PUBLIC Threads::Threads)',
            '    endif()',
        ] : [
            '    find_package(Threads REQUIRED)',
            '    target_link_libraries(hydra PUBLIC Threads::Threads)',
        ]),
        'endif()',
        '',
        'file(GLOB APP_SOURCES "src/*.cpp")',
        'if(APP_SOURCES)',
        `    add_executable(${plan.projectName} \${APP_SOURCES})`,
        `    target_link_libraries(${plan.projectName} PRIVATE hydra)`,
        '',
        '    # Windows: SDL2.dll leży w katalogu pakietu, nie przy pliku',
        '    # wykonywalnym. Bez tej kopii pobrana binarka nie startuje i mówi',
        '    # o brakującej bibliotece — a użytkownik nie ma jak zgadnąć której.',
        '    if(WIN32 AND HYDRA_TARGET_IS_NATIVE AND CMAKE_VERSION VERSION_GREATER_EQUAL 3.21)',
        `        add_custom_command(TARGET ${plan.projectName} POST_BUILD`,
        '            COMMAND ${CMAKE_COMMAND} -E copy_if_different',
        `                    $<TARGET_RUNTIME_DLLS:${plan.projectName}> $<TARGET_FILE_DIR:${plan.projectName}>`,
        '            COMMAND_EXPAND_LISTS)',
        '    endif()',
        ...(hasWasm ? [
            '',
            '    # Strona z kanwą powstaje razem z modułem: `.html` obok `.js`',
            '    # i `.wasm`. Wersja bez strony wymagałaby własnego gospodarza,',
            '    # a ten i tak jest potrzebny dopiero przy osadzaniu podglądu.',
            '    if(HYDRA_TARGET_IS_WASM)',
            `        set_target_properties(${plan.projectName} PROPERTIES SUFFIX ".html")`,
            '        # ASYNCIFY: blokująca pętla aplikacji zostaje taka, jaka jest.',
            '        # Rosnąca pamięć: rozmiar sterty zależy od projektu, a nie od celu.',
            `        target_link_options(${plan.projectName} PRIVATE`,
            '            "-sASYNCIFY" "-sALLOW_MEMORY_GROWTH" "-sEXIT_RUNTIME=0")',
            '    endif()',
        ] : []),
        'endif()',
    ];
}

function indent(lines: readonly string[]): string[] {
    return lines.map((line) => (line === '' ? line : `    ${line}`));
}
