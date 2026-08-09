/**
 * Generowanie CMakePresets.json dla celów natywnych.
 *
 * Presety istnieją po to, żeby „zbuduj dla mojej maszyny" było jedną nazwą,
 * a nie zestawem flag do zapamiętania. Studio wykrywa system i architekturę
 * przeglądarki (emit/host.ts) i przekazuje odpowiednią nazwę presetu do
 * budowy — nikt nie wpisuje ręcznie generatora ani pliku toolchaina.
 *
 * Preset opisuje **maszynę**, nie cel. Rozróżnienie ma znaczenie praktyczne:
 * projekt z dwoma celami natywnymi (z oknem i bez) na trzech maszynach daje
 * sześć kombinacji, a nie sześć presetów — cel wskazuje się zmienną
 * HYDRA_TARGET, bo tak samo działa wygenerowany CMakeLists.txt.
 *
 * Katalog budowy jest osobny dla każdej maszyny (`build/native-win-arm64`).
 * To nie porządki: drzewo projektu bywa podmontowane do kontenera albo
 * współdzielone przez dysk sieciowy, a wtedy jeden `build/` widzą naraz dwa
 * systemy. CMake rozpoznaje wtedy własną pamięć podręczną jako obcą i przerywa
 * komunikatem o zmienionym kompilatorze — dokładnie ten sam powód, dla którego
 * testy hostowe budują się do `build/$(uname -s)-$(uname -m)`.
 */

import { HOST_PLATFORMS, type HostPlatform } from './host';
import type { BuildPlan } from './plan';

export const GENERATED_MARKER = 'wygenerowane przez Hydra Studio';

export interface PresetsOptions {
    /**
     * Maszyny, dla których wypisać presety. Domyślnie wszystkie — plik trafia
     * do repozytorium i ma działać także u kogoś na innym systemie.
     */
    platforms?: readonly HostPlatform[];
    /** Wersja schematu presetów; 3 wystarcza i działa od CMake 3.21. */
    version?: number;
}

interface Preset {
    name: string;
    displayName: string;
    description: string;
    generator?: string;
    binaryDir: string;
    cacheVariables: Record<string, string>;
    architecture?: { value: string; strategy: string };
    condition?: unknown;
}

/**
 * `null`, gdy projekt nie ma celu natywnego — wtedy pliku nie ma powstać
 * w ogóle. Wypisanie pustych presetów zostawiałoby w repozytorium plik,
 * który wygląda jak konfiguracja, a niczego nie konfiguruje.
 */
export function emitCMakePresets(plan: BuildPlan, options: PresetsOptions = {}): string | null {
    const nativeTargets = plan.targets.filter((target) => target.isNative);
    if (nativeTargets.length === 0) return null;

    const platforms = options.platforms ?? HOST_PLATFORMS;
    const defaultTarget = nativeTargets.find((t) => t.name === plan.defaultTarget)?.name
        ?? nativeTargets[0]!.name;

    const configurePresets: Preset[] = platforms.map((platform) =>
        configurePreset(platform, defaultTarget));

    const document = {
        version: options.version ?? 3,
        // Znacznik pochodzenia w polu `vendor`, bo format presetów odrzuca
        // nieznane klucze w obiekcie głównym — próba z `$comment` kończyła się
        // komunikatem „Invalid extra field" i budową, która nie ruszała.
        // `vendor` jest częścią specyfikacji właśnie na takie rzeczy.
        vendor: {
            'hydra-studio': {
                generated: `${GENERATED_MARKER} — nie edytuj ręcznie`,
                source: `${plan.projectName}.hydra`,
            },
        },
        cmakeMinimumRequired: { major: 3, minor: 21, patch: 0 },
        configurePresets,
        buildPresets: platforms.map((platform) => ({
            name: platform.preset,
            displayName: platform.label,
            configurePreset: platform.preset,
            // Generator wielokonfiguracyjny (Visual Studio) nie zna
            // CMAKE_BUILD_TYPE — konfigurację wybiera się dopiero przy budowie.
            // Bez tego pola powstaje wariant Debug, a artefaktu szukamy
            // w katalogu RelWithDebInfo.
            ...(platform.multiConfig ? { configuration: 'RelWithDebInfo' } : {}),
        })),
    };

    return JSON.stringify(document, null, 2) + '\n';
}

function configurePreset(platform: HostPlatform, defaultTarget: string): Preset {
    const preset: Preset = {
        name: platform.preset,
        displayName: platform.label,
        description: `Cel native na ${platform.label}. SDL2: ${platform.sdlHint}`,
        // Brak pola = wybór należy do CMake. Na Uniksie daje to Unix Makefiles,
        // które są zawsze na miejscu; wymuszenie Ninji oznaczałoby projekt,
        // który nie buduje się na świeżo zainstalowanym systemie.
        ...(platform.generator ? { generator: platform.generator } : {}),
        binaryDir: `\${sourceDir}/build/${platform.preset}`,
        cacheVariables: {
            CMAKE_BUILD_TYPE: 'RelWithDebInfo',
            HYDRA_TARGET: defaultTarget,
            // Nazwa maszyny wchodzi do pamięci podręcznej, żeby dało się
            // sprawdzić, czym naprawdę jest zawartość katalogu build.
            HYDRA_HOST_PLATFORM: platform.id,
        },
    };

    // Preset uruchamiany tylko na swoim systemie. Bez tego lista presetów
    // w edytorach pokazuje warianty, których na tej maszynie nie da się użyć,
    // a wybranie któregoś kończy się błędem generatora zamiast informacją.
    preset.condition = {
        type: 'equals',
        lhs: '${hostSystemName}',
        rhs: hostSystemName(platform),
    };

    // Visual Studio wybiera architekturę osobnym polem, a nie zmienną pamięci
    // podręcznej — to jest to samo, co `-A ARM64` w wierszu poleceń i jedyny
    // sposób, żeby na Windows on ARM powstała binarka arm64, a nie x64.
    if (platform.os === 'windows') {
        preset.architecture = {
            value: platform.arch === 'arm64' ? 'ARM64' : 'x64',
            strategy: 'set',
        };
        preset.cacheVariables['VCPKG_TARGET_TRIPLET'] =
            platform.arch === 'arm64' ? 'arm64-windows' : 'x64-windows';
    }
    if (platform.os === 'macos') {
        preset.cacheVariables['CMAKE_OSX_ARCHITECTURES'] =
            platform.arch === 'arm64' ? 'arm64' : 'x86_64';
    }

    return preset;
}

function hostSystemName(platform: HostPlatform): string {
    switch (platform.os) {
        case 'windows': return 'Windows';
        case 'macos':   return 'Darwin';
        case 'linux':   return 'Linux';
    }
}
