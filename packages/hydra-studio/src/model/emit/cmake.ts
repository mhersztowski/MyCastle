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
    lines.push('');
    lines.push(...linkage(plan, hydraPath));

    return lines.join('\n') + '\n';
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
        'file(GLOB HYDRA_CORE_SOURCES',
        '    "${HYDRA_ROOT}/src/core/*.cpp"',
        '    "${HYDRA_ROOT}/src/hal/*.cpp"',
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
        lines.push('');
        lines.push('# Moduły włączone dla tego celu.');
        lines.push('file(GLOB HYDRA_MODULE_SOURCES');
        for (const module of target.modules) {
            lines.push(`    "\${HYDRA_ROOT}/src/${module}/*.cpp"`);
            lines.push(`    "\${HYDRA_ROOT}/src/${module}/*/*.cpp"`);
        }
        lines.push(')');
        lines.push('target_sources(hydra PRIVATE ${HYDRA_MODULE_SOURCES})');
    }

    if (!target.hasFpu) {
        lines.push('');
        lines.push('# Bez jednostki zmiennoprzecinkowej — regulatory pracują na Q16.16.');
        lines.push('target_compile_definitions(hydra PUBLIC HYDRA_HAS_FPU=0)');
    }

    return lines;
}

function linkage(plan: BuildPlan, hydraPath: string): string[] {
    return [
        '# --- aplikacja -------------------------------------------------------------',
        '# Backend zależy od tego, czym budujemy: pico-sdk i ESP-IDF dostarczają',
        '# własny, a build hostowy używa atrap i nie potrzebuje żadnego SDK.',
        'if(HYDRA_HOST_BUILD)',
        `    file(GLOB HYDRA_MOCK_SOURCES "${hydraPath}/src/hal/mock/*.cpp")`,
        '    target_sources(hydra PRIVATE ${HYDRA_MOCK_SOURCES})',
        '    target_compile_definitions(hydra PUBLIC HYDRA_FORCE_HOST=1)',
        '    find_package(Threads REQUIRED)',
        '    target_link_libraries(hydra PUBLIC Threads::Threads)',
        'endif()',
        '',
        'file(GLOB APP_SOURCES "src/*.cpp")',
        'if(APP_SOURCES)',
        `    add_executable(${plan.projectName} \${APP_SOURCES})`,
        `    target_link_libraries(${plan.projectName} PRIVATE hydra)`,
        'endif()',
    ];
}

function indent(lines: readonly string[]): string[] {
    return lines.map((line) => (line === '' ? line : `    ${line}`));
}
