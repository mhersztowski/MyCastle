/**
 * Zbieranie wsadu Hydry po budowie — do wgrania **z przeglądarki**.
 *
 * Odpowiednik `hydraFlash.ts` z Drive'a MyCastle, przełożony na VFS edytora.
 * Różnica jest jedna, ale przechodzi przez cały plik: tam ścieżki idą przez
 * `/api/users/{u}/vfs` i katalog domowy użytkownika, tutaj przez `/api/vfs`
 * zakorzenione wprost w katalogu danych backendu. Reszta — offsety, komplet
 * plików, komunikaty — jest ta sama i ma pozostać ta sama.
 *
 * ## Po co to w ogóle jest
 *
 * „Wgraj na urządzenie" w Studiu woła `pio run -t upload` po stronie serwera.
 * To trafia w port **serwera**, a płytka wisi w porcie osoby siedzącej przed
 * przeglądarką. W tym edytorze dochodzi drugi powód: budowa idzie w kontenerze,
 * któremu `hydra.sh` nie przekazuje żadnego `--device` — więc PlatformIO nie
 * widzi tam portu szeregowego w ogóle.
 *
 * ## Skąd biorą się pliki
 *
 * PlatformIO zostawia wynik w `<projekt>/.pio/build/<środowisko>/`. Środowisko
 * nazywa się tak samo jak cel w pliku `.hydra`, więc nie trzeba niczego
 * zgadywać ani parsować z wyjścia budowy.
 *
 * ## Dlaczego offsety zależą od układu
 *
 * Wsad ESP32 to nie jeden plik, tylko trzy w ustalonych miejscach pamięci.
 * Bootloader leży pod innym adresem na starszych układach niż na nowszych —
 * ESP32 i S2 mają go pod `0x1000`, S3, C3, C6 i H2 pod `0x0`. Wgranie pod złym
 * adresem daje płytkę, która nie startuje, i komunikat, po którym nie widać
 * dlaczego.
 */

import { FileType } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import type { FlashFileEntry } from '@mhersztowski/web-serial';

/** Adres bootloadera. Reszta wsadu leży tak samo na całej rodzinie. */
const BOOTLOADER_OFFSET: Record<string, number> = {
    esp32:   0x1000,
    esp32s2: 0x1000,
    esp32s3: 0x0,
    esp32c3: 0x0,
    esp32c6: 0x0,
    esp32h2: 0x0,
};

const PARTITIONS_OFFSET = 0x8000;
const FIRMWARE_OFFSET   = 0x10000;

export class HydraFlashError extends Error {}

export interface HydraFlashRequest {
    /** Ścieżka pliku `.hydra` w przestrzeni VFS edytora. */
    file: string;
    /** Nazwa celu — jest zarazem nazwą środowiska PlatformIO. */
    target: string;
    /** Układ celu: `esp32`, `esp32s3`, … */
    mcu: string;
}

/**
 * Czy dla tego układu w ogóle umiemy złożyć wsad.
 *
 * Lista bierze się z `esptool-js`, nie z Hydry. RP2040/RP2350 wgrywa się
 * plikiem `.uf2` przeciągniętym na dysk masowy, a STM32 wymaga DFU albo
 * ST-Linka — żadnej z tych dróg Web Serial nie obsługuje.
 */
export function canFlashFromBrowser(mcu: string): boolean {
    return mcu in BOOTLOADER_OFFSET;
}

/**
 * Bajty → napis binarny, którego oczekuje `esptool-js`.
 *
 * Porcjami, bo `String.fromCharCode(...bytes)` przy wsadzie rzędu megabajta
 * przekracza limit argumentów wywołania i kończy się `RangeError`.
 */
function toBinaryString(bytes: Uint8Array): string {
    let out = '';
    const step = 0x8000;
    for (let at = 0; at < bytes.length; at += step) {
        out += String.fromCharCode(...bytes.subarray(at, at + step));
    }
    return out;
}

/** Katalog projektu: ścieżka pliku `.hydra` bez nazwy pliku. */
function projectDirOf(file: string): string {
    const cut = file.replace(/\/[^/]+$/, '');
    return cut === '' ? '/' : cut;
}

/**
 * Czyta wsad z katalogu budowy.
 *
 * Rzuca `HydraFlashError` z czytelną treścią — brak katalogu znaczy zwykle
 * „nie zbudowano jeszcze tego celu", a nie awarię, i tak trzeba to powiedzieć.
 */
export async function collectHydraFirmware(
    request: HydraFlashRequest,
    provider: FileSystemProvider,
): Promise<FlashFileEntry[]> {
    const bootloaderOffset = BOOTLOADER_OFFSET[request.mcu];
    if (bootloaderOffset === undefined) {
        throw new HydraFlashError(
            `Wgrywanie z przeglądarki obsługuje rodzinę ESP32. Cel „${request.target}" `
            + `używa układu ${request.mcu}.`,
        );
    }

    const buildDir = `${projectDirOf(request.file)}/.pio/build/${request.target}`;

    let entries;
    try {
        entries = await provider.readDirectory(buildDir);
    } catch {
        throw new HydraFlashError(
            `Brak katalogu budowy dla celu „${request.target}". Zbuduj projekt przed wgraniem.`,
        );
    }

    const present = new Set(
        entries.filter((e) => e.type === FileType.File).map((e) => e.name),
    );

    const wanted = [
        { name: 'bootloader.bin', address: bootloaderOffset },
        { name: 'partitions.bin', address: PARTITIONS_OFFSET },
        { name: 'firmware.bin',   address: FIRMWARE_OFFSET },
    ];

    const missing = wanted.filter((w) => !present.has(w.name)).map((w) => w.name);
    if (missing.length > 0) {
        throw new HydraFlashError(
            `W katalogu budowy brakuje: ${missing.join(', ')}. `
            + 'Zbuduj cel od nowa — wgranie niekompletnego wsadu zostawia płytkę, '
            + 'która nie startuje.',
        );
    }

    const files: FlashFileEntry[] = [];
    for (const item of wanted) {
        const bytes = await provider.readFile(`${buildDir}/${item.name}`);
        files.push({ data: toBinaryString(bytes), address: item.address, name: item.name });
    }
    return files;
}

/**
 * Czy przed wgraniem trzeba wyczyścić pamięć.
 *
 * `boot_app0.bin` — plik, który zeruje wybór partycji OTA — nie powstaje
 * w katalogu budowy, tylko leży w pakiecie frameworka, poza zasięgiem VFS.
 * Bez niego płytka, na którą kiedyś poszła aktualizacja OTA, wystartowałaby ze
 * starej partycji i wyglądałoby to jak „wgrało się, ale nic się nie zmieniło".
 *
 * Czyszczenie pamięci załatwia to samo: pusty obszar OTA oznacza dla
 * bootloadera „uruchom partycję fabryczną", czyli tę, którą właśnie wgrywamy.
 */
export const RECOMMEND_ERASE = true;
