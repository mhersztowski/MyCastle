/**
 * Generowanie platformio.ini z planu budowy.
 *
 * Plik jest wynikiem, nie źródłem — nagłówek mówi o tym wprost, bo bez
 * ostrzeżenia ktoś prędzej czy później poprawi go ręcznie i straci zmiany przy
 * następnym zapisie projektu. Ustawień, których `.hydra` nie opisuje, dopisać
 * się nie da; jeśli czegoś brakuje, brakuje tego w modelu i tam trzeba to dodać.
 */

import type { BuildPlan, TargetPlan } from './plan';

export interface PlatformioOptions {
    /** Katalog biblioteki Hydry względem projektu. */
    hydraPath?: string;
    /** Dopisek pozwalający rozpoznać plik jako wygenerowany. */
    generator?: string;
}

/**
 * Zdanie, po którym poznajemy plik nadający się do nadpisania.
 *
 * Sam tekst, bez znaku komentarza: emitery wypisują je w składni swojego
 * formatu — `#` w plikach konfiguracyjnych, blok `/** … *\/` w nagłówkach C++.
 * Wcześniej sprawdzaliśmy początek pliku, przez co nagłówek płytki nigdy nie
 * dawał się odtworzyć: zaczyna się od `#pragma once`, a nie od komentarza.
 */
export const GENERATED_PHRASE = 'wygenerowan* przez Hydra Studio';

/** Wzorzec dopuszczający obie formy gramatyczne. */
const GENERATED_PATTERN = /wygenerowan[ey]\s+przez\s+Hydra\s+Studio/;

export const GENERATED_MARKER = '# wygenerowane przez Hydra Studio';

export function emitPlatformio(plan: BuildPlan, options: PlatformioOptions = {}): string {
    const lines: string[] = [];

    lines.push(GENERATED_MARKER + ' — nie edytuj ręcznie');
    lines.push(`# Źródło: ${plan.projectName}.hydra`);
    lines.push('#');
    lines.push('# Zmiany nanoś w pliku .hydra i zapisz projekt ponownie. Ten plik jest');
    lines.push('# odtwarzany przy każdym zapisie i ręczne poprawki z niego znikną.');
    lines.push('');

    lines.push('[platformio]');
    lines.push(`; ${plan.description ?? plan.projectName}`);
    // Domyślny cel projektu bywa natywny — wtedy nie ma go w tym pliku
    // i wpisanie go dałoby „Unknown environment" przy każdym `pio run`.
    // Bierzemy pierwszy cel sprzętowy; gdy takiego nie ma, sekcji nie ma wcale.
    const hardware = plan.targets.filter((target) => !target.isNative);
    const defaultEnv = hardware.some((target) => target.name === plan.defaultTarget)
        ? plan.defaultTarget
        : hardware[0]?.name;
    if (defaultEnv) lines.push(`default_envs = ${defaultEnv}`);
    lines.push('');

    lines.push(...commonSection(plan, options));

    for (const target of plan.targets) {
        // Cel natywny nie ma tu czego szukać: PlatformIO buduje wsady dla
        // układów, a `native` daje program dla konkretnego systemu i wymaga
        // znalezienia SDL. Próba wtłoczenia tego w `platform = native` kończy
        // się plikiem, który wygląda poprawnie i nie linkuje się na żadnej
        // maszynie. Ten cel obsługuje CMakeLists.txt razem z CMakePresets.json.
        if (target.isNative) continue;
        lines.push('');
        lines.push(...targetSection(target, plan));
    }

    return lines.join('\n') + '\n';
}

function commonSection(plan: BuildPlan, options: PlatformioOptions): string[] {
    const lines: string[] = ['[env]', 'framework = arduino'];

    // Wyjątki i RTTI wyłączone — błędy propaguje expected<T, Err>.
    lines.push('build_unflags = -std=gnu++11 -std=gnu++14 -fexceptions');
    lines.push('build_flags =');
    for (const flag of ['-std=gnu++17', '-fno-exceptions', '-fno-rtti', '-Wall', '-Wextra']) {
        lines.push(`    ${flag}`);
    }
    for (const flag of plan.packBuildFlags) lines.push(`    ${flag}`);

    // Katalog projektu na ścieżce włączeń — bez tego `boards/rover_s3.hpp`
    // z HYDRA_BOARD_HEADER nie zostanie znaleziony: PlatformIO dodaje
    // domyślnie tylko include/ i src/. `$PROJECT_DIR` to zmienna podstawiana
    // w trakcie budowy; zapis `${platformio.project_dir}` jest błędny — taka
    // opcja nie istnieje i PlatformIO odrzuca cały plik.
    lines.push('    -I $PROJECT_DIR');

    lines.push(`monitor_speed = ${plan.monitorSpeed}`);

    // Hydra jest budowana jako biblioteka obok szkicu, więc rozpoznawanie
    // zależności musi zejść w jej źródła i dalej — w biblioteki rdzenia,
    // po które sięga backend HAL, wraz z ich własnymi zależnościami.
    lines.push('lib_ldf_mode = deep+');
    // Biblioteka deklarująca obsługiwane platformy ma być pomijana tam, gdzie
    // nie pasuje; bez tego pakiety jednej platformy trafiają do budowy innej.
    lines.push('lib_compat_mode = strict');

    // Katalog zawierający bibliotekę Hydra — przez zmienną środowiska, nie
    // ścieżką w pliku. Ścieżka względna jest prawdziwa tylko na tej maszynie,
    // na której powstała: w kontenerze projekt leży pod /project, więc zapisane
    // „../.." wskazywało katalog główny i PlatformIO zaczynało przeczesywać
    // cały system plików w poszukiwaniu bibliotek.
    lines.push('; Katalog z biblioteką Hydra. Ustawia go środowisko budowania;');
    lines.push('; przy ręcznym wywołaniu podaj sam:  HYDRA_LIB_DIR=../.. pio run');
    lines.push('lib_extra_dirs = ${sysenv.HYDRA_LIB_DIR}');
    if (options.hydraPath) {
        lines.push(`; na tej maszynie: ${options.hydraPath}`);
    }

    if (plan.packLibDeps.length > 0) {
        lines.push('lib_deps =');
        for (const dep of plan.packLibDeps) lines.push(`    ${dep}`);
    }

    return lines;
}

function targetSection(target: TargetPlan, plan: BuildPlan): string[] {
    const lines: string[] = [];

    lines.push(`; --- ${target.name} (${target.mcu}) ${'-'.repeat(Math.max(0, 56 - target.name.length - target.mcu.length))}`);
    if (!target.hasFpu) {
        lines.push('; Bez jednostki zmiennoprzecinkowej — regulatory pracują na Q16.16.');
    }
    lines.push(`[env:${target.name}]`);
    lines.push(`platform = ${target.profile.platform}`);
    lines.push(`board = ${target.board}`);

    for (const [key, value] of Object.entries(target.settings)) {
        if (key === 'build_flags.extra') continue;   // dokładane niżej
        lines.push(`${key} = ${value}`);
    }

    lines.push('build_flags =');
    lines.push('    ${env.build_flags}');
    for (const flag of target.flags) lines.push(`    ${flag}`);
    const extra = target.settings['build_flags.extra'];
    if (extra) lines.push(`    ${extra}`);

    const deps = [...target.libDeps];
    if (deps.length > 0) {
        // Zależności celu dopisujemy do wspólnych, a nie zamiast nich.
        lines.push('lib_deps =');
        for (const dep of plan.packLibDeps) lines.push(`    ${dep}`);
        for (const dep of deps) lines.push(`    ${dep}`);
    }

    return lines;
}

/**
 * Czy plik wolno nadpisać, czy ktoś napisał go ręcznie.
 *
 * Szukamy w nagłówku pliku, a nie w pierwszej linii: nagłówek płytki zaczyna
 * się od `#pragma once`, a zdanie o pochodzeniu stoi kilka wierszy niżej,
 * w bloku dokumentacyjnym.
 */
export function isGenerated(existing: string): boolean {
    const head = existing.split('\n', 12).join('\n');
    return GENERATED_PATTERN.test(head);
}
