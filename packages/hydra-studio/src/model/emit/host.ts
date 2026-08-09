/**
 * Maszyny, na których buduje się cel `native`.
 *
 * Cel `native` różni się od wszystkich pozostałych jedną rzeczą: wynikiem nie
 * jest wsad przenośny między maszynami, tylko program dla konkretnego systemu
 * i konkretnej architektury. `esp32s3-main` zbudowany na Macu i na Windows
 * daje ten sam plik .bin; `native-sim` daje dwa różne pliki i tylko jeden
 * z nich uruchomi się u użytkownika.
 *
 * Dlatego Studio musi wiedzieć, na czym stoi przeglądarka, zanim zleci budowę.
 * Ten plik zawiera dwie rzeczy: tabelę obsługiwanych maszyn i wykrywanie.
 *
 * Wykrywanie jest zawodne i jest to własność przeglądarek, nie tego kodu:
 *
 *  • Windows on ARM podaje w klasycznym nagłówku User-Agent „Win64; x64",
 *    celowo, dla zgodności ze stronami sprawdzającymi architekturę. Jedynym
 *    wiarygodnym źródłem są Client Hints (`navigator.userAgentData`).
 *  • Safari i Firefox na Apple Silicon podają „Intel Mac OS X" i nie mają
 *    Client Hints. Z poziomu strony nie da się tego rozstrzygnąć wprost —
 *    zostaje nazwa układu graficznego z WebGL.
 *
 * Stąd `confidence`. Gdy pewności nie ma, wybieramy wariant **x64**, a nie ten
 * bardziej prawdopodobny — bo pomyłka jest wtedy odwracalna: x64 uruchomi się
 * na ARM-ie przez emulację (Rosetta 2, warstwa x64 w Windows on ARM), podczas
 * gdy binarka arm64 na maszynie x64 nie uruchomi się w ogóle. Interfejs pokazuje
 * wykrytą maszynę i pozwala ją zmienić — zgadywanie ma być widoczne.
 */

export type HostOs   = 'windows' | 'macos' | 'linux';
export type HostArch = 'x64' | 'arm64';

export interface HostPlatform {
    /** Identyfikator używany w nazwach presetów i artefaktów. */
    id: string;
    os: HostOs;
    arch: HostArch;
    label: string;
    /** Nazwa presetu w CMakePresets.json. */
    preset: string;
    /** Rozszerzenie pliku wykonywalnego. */
    exeSuffix: string;
    /** Format paczki z wynikiem budowy. */
    archive: 'zip' | 'tar.gz';
    /**
     * Czy binarka potrzebuje bibliotek obok siebie.
     *
     * Na Windows SDL2.dll leży w katalogu pakietu, a nie przy pliku
     * wykonywalnym — pobranie samego .exe daje program, który nie startuje
     * i mówi o brakującej bibliotece. Dlatego artefakt dla Windows jest
     * archiwum, nawet gdy wygodniej byłoby oddać jeden plik.
     */
    bundlesRuntime: boolean;
    /** Jak zdobyć SDL2 — trafia do komunikatu CMake i do panelu budowy. */
    sdlHint: string;
    /**
     * Generator CMake albo `undefined`, gdy ma zdecydować CMake.
     *
     * Na Windows wskazujemy Visual Studio, bo sam ustawia środowisko
     * kompilatora. Ninja byłby szybszy, ale `cmake --preset` z Ninją poza
     * wierszem poleceń dewelopera nie znajduje cl.exe i kończy się błędem
     * „No CMAKE_CXX_COMPILER could be found" — a budowa idzie z przeglądarki,
     * czyli nigdy z takiego wiersza poleceń.
     *
     * Na macOS i Linuksie zostawiamy wybór CMake: domyślne Unix Makefiles są
     * zawsze na miejscu, a Ninja bywa doinstalowana. Wymuszenie Ninji
     * oznaczałoby, że projekt nie buduje się na świeżym systemie.
     */
    generator?: string;
    /** Czy generator jest wielokonfiguracyjny — wtedy budowa potrzebuje `--config`. */
    multiConfig: boolean;
}

export const HOST_PLATFORMS: readonly HostPlatform[] = [
    {
        id: 'win-x64', os: 'windows', arch: 'x64',
        label: 'Windows (x64)', preset: 'native-win-x64',
        exeSuffix: '.exe', archive: 'zip', bundlesRuntime: true,
        sdlHint: 'vcpkg install sdl2:x64-windows',
        generator: 'Visual Studio 17 2022', multiConfig: true,
    },
    {
        id: 'win-arm64', os: 'windows', arch: 'arm64',
        label: 'Windows on ARM (arm64)', preset: 'native-win-arm64',
        exeSuffix: '.exe', archive: 'zip', bundlesRuntime: true,
        sdlHint: 'vcpkg install sdl2:arm64-windows',
        generator: 'Visual Studio 17 2022', multiConfig: true,
    },
    {
        id: 'mac-arm64', os: 'macos', arch: 'arm64',
        label: 'macOS Apple Silicon (arm64)', preset: 'native-mac-arm64',
        exeSuffix: '', archive: 'tar.gz', bundlesRuntime: false,
        sdlHint: 'brew install sdl2', multiConfig: false,
    },
    {
        id: 'mac-x64', os: 'macos', arch: 'x64',
        label: 'macOS Intel (x86_64)', preset: 'native-mac-x64',
        exeSuffix: '', archive: 'tar.gz', bundlesRuntime: false,
        sdlHint: 'brew install sdl2', multiConfig: false,
    },
    {
        id: 'linux-x64', os: 'linux', arch: 'x64',
        label: 'Linux (x86_64)', preset: 'native-linux-x64',
        exeSuffix: '', archive: 'tar.gz', bundlesRuntime: false,
        sdlHint: 'sudo apt install libsdl2-dev', multiConfig: false,
    },
    {
        id: 'linux-arm64', os: 'linux', arch: 'arm64',
        label: 'Linux (aarch64)', preset: 'native-linux-arm64',
        exeSuffix: '', archive: 'tar.gz', bundlesRuntime: false,
        sdlHint: 'sudo apt install libsdl2-dev', multiConfig: false,
    },
];

export function hostPlatform(id: string): HostPlatform | undefined {
    return HOST_PLATFORMS.find((entry) => entry.id === id);
}

export function hostPlatformFor(os: HostOs, arch: HostArch): HostPlatform | undefined {
    return HOST_PLATFORMS.find((entry) => entry.os === os && entry.arch === arch);
}

// --- wykrywanie ------------------------------------------------------------

export interface DetectedHost {
    platform: HostPlatform;
    /**
     * `high` — architektura potwierdzona przez Client Hints.
     * `low`  — zgadnięta; interfejs ma to pokazać i pozwolić poprawić.
     */
    confidence: 'high' | 'low';
    /** Skąd wzięła się odpowiedź — do wyświetlenia w podpowiedzi. */
    source: string;
}

/** Kształt `navigator`, którego potrzebujemy. Podstawialny w testach. */
export interface NavigatorLike {
    userAgent?: string;
    platform?: string;
    userAgentData?: {
        platform?: string;
        getHighEntropyValues?(hints: readonly string[]): Promise<{
            platform?: string;
            architecture?: string;
            bitness?: string;
        }>;
    };
}

/** Nazwa układu graficznego z WebGL — jedyny trop dla Apple Silicon w Safari. */
export type RendererProbe = () => string | undefined;

const FALLBACK: HostPlatform = HOST_PLATFORMS[0]!;

function osFrom(nav: NavigatorLike): HostOs | undefined {
    const hint = (nav.userAgentData?.platform ?? '').toLowerCase();
    if (hint.includes('win')) return 'windows';
    if (hint.includes('mac')) return 'macos';
    if (hint.includes('linux') || hint.includes('chrome os')) return 'linux';

    const ua = `${nav.userAgent ?? ''} ${nav.platform ?? ''}`.toLowerCase();
    if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows';
    // Kolejność ma znaczenie: iPadOS podaje „Macintosh", a Android — „Linux".
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('linux') || ua.includes('x11')) return 'linux';
    return undefined;
}

/**
 * Wersja bez oczekiwania — dla pierwszego rysowania interfejsu.
 *
 * Client Hints o wysokiej entropii są asynchroniczne, więc tutaj ich nie ma.
 * Wynik jest zawsze `low` dla architektury i służy wyłącznie temu, żeby panel
 * miał co pokazać, zanim odpowie `detectHostPlatform()`.
 */
export function detectHostPlatformSync(nav: NavigatorLike): DetectedHost {
    const os = osFrom(nav);
    if (!os) {
        return { platform: FALLBACK, confidence: 'low', source: 'nie rozpoznano systemu' };
    }

    // Linux jest tu wyjątkiem: nagłówek User-Agent podaje „aarch64" wprost,
    // bo nikt nie miał powodu tego ukrywać.
    const ua = (nav.userAgent ?? '').toLowerCase();
    if (os === 'linux' && (ua.includes('aarch64') || ua.includes('arm64'))) {
        return {
            platform: hostPlatformFor('linux', 'arm64') ?? FALLBACK,
            confidence: 'high', source: 'User-Agent podaje aarch64',
        };
    }

    return {
        platform: hostPlatformFor(os, 'x64') ?? FALLBACK,
        confidence: 'low',
        source: 'system z User-Agent, architektura założona jako x64',
    };
}

/**
 * Pełne wykrywanie. Pyta o Client Hints, a na macOS bez nich sięga po nazwę
 * układu graficznego.
 *
 * Nie rzuca wyjątków: przeglądarka może odmówić podania podpowiedzi
 * (polityka uprawnień, tryb prywatny), a to jest sytuacja normalna, nie błąd.
 */
export async function detectHostPlatform(nav: NavigatorLike,
                                         renderer?: RendererProbe): Promise<DetectedHost> {
    const hints = nav.userAgentData?.getHighEntropyValues;
    if (hints) {
        try {
            const values = await hints.call(nav.userAgentData,
                                            ['platform', 'architecture', 'bitness']);
            const os = osFrom({ userAgentData: { platform: values.platform }, ...nav });
            const architecture = (values.architecture ?? '').toLowerCase();
            const bitness = values.bitness ?? '';

            if (os && architecture) {
                const arch: HostArch = architecture.startsWith('arm') && bitness !== '32'
                    ? 'arm64' : 'x64';
                const platform = hostPlatformFor(os, arch);
                if (platform) {
                    return {
                        platform, confidence: 'high',
                        source: `Client Hints: ${values.platform} / ${architecture} / ${bitness}-bit`,
                    };
                }
            }
        } catch {
            // Brak zgody na podpowiedzi — schodzimy niżej, bez rozgłosu.
        }
    }

    const guess = detectHostPlatformSync(nav);

    // Apple Silicon w Safari i Firefoksie: User-Agent kłamie („Intel Mac OS X"),
    // ale nazwa układu graficznego z WebGL mówi prawdę.
    if (guess.platform.os === 'macos' && guess.confidence === 'low' && renderer) {
        const name = (renderer() ?? '').toLowerCase();
        if (name.includes('apple m') || name.includes('apple gpu')) {
            return {
                platform: hostPlatformFor('macos', 'arm64') ?? guess.platform,
                confidence: 'high',
                source: `układ graficzny WebGL: ${renderer()}`,
            };
        }
    }

    return guess;
}

/**
 * Odczyt nazwy układu graficznego. Wydzielony, bo wymaga DOM — model ma
 * zostać przenośny między przeglądarką a Node.
 */
export function webglRendererProbe(createCanvas: () => HTMLCanvasElement): RendererProbe {
    return () => {
        try {
            const gl = createCanvas().getContext('webgl');
            if (!gl) return undefined;
            const ext = gl.getExtension('WEBGL_debug_renderer_info');
            if (!ext) return undefined;
            const value: unknown = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL as number);
            return typeof value === 'string' ? value : undefined;
        } catch {
            return undefined;
        }
    };
}

// --- artefakt --------------------------------------------------------------

/**
 * Wynik budowy celu natywnego w postaci, którą da się przenieść do przeglądarki.
 *
 * Treść jedzie jako base64, bo między gospodarzem a wtyczką biegnie zwykłe
 * wywołanie funkcji, a nie strumień — i bo ten sam kształt przechodzi przez
 * JSON, gdy gospodarzem jest serwer, a nie proces lokalny.
 */
export interface BuildArtifactInfo {
    /** Nazwa proponowana przy pobieraniu. */
    name: string;
    mimeType: string;
    sizeBytes: number;
    base64: string;
    /** Czy to archiwum z zawartością, czy sam plik wykonywalny. */
    packaged: boolean;
}

/**
 * Base64 → bajty, bez zależności od Node i bez `Buffer`.
 *
 * `atob` zwraca ciąg znaków, w którym każdy znak to jeden bajt — przekazanie
 * go wprost do `Blob` popsułoby plik, bo tekst zostałby zakodowany w UTF-8
 * i każdy bajt powyżej 127 urósłby do dwóch. Stąd przepisanie znak po znaku.
 */
export function decodeBase64(base64: string): Uint8Array {
    const binary = typeof atob === 'function'
        ? atob(base64)
        // Node bez DOM — używane w testach modelu.
        : Buffer.from(base64, 'base64').toString('binary');

    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; ++i) bytes[i] = binary.charCodeAt(i) & 0xFF;
    return bytes;
}

/**
 * Nazwa artefaktu dla celu i maszyny.
 *
 * Nazwa zawiera maszynę celowo: w katalogu pobranych plików leżą obok siebie
 * wyniki z kilku sesji, a `native-sim.exe` nie mówi, czy uruchomi się na tym
 * komputerze.
 */
export function artifactName(target: string, platform: HostPlatform,
                             packaged: boolean): string {
    return packaged
        ? `${target}-${platform.id}.${platform.archive}`
        : `${target}-${platform.id}${platform.exeSuffix}`;
}
