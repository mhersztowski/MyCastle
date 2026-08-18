/**
 * Zbieranie wsadu Hydry po budowie — do wgrania **z przeglądarki**.
 *
 * „Wgraj na urządzenie" w Studiu wołało dotąd `pio run -t upload` po stronie
 * serwera. To działa wtedy i tylko wtedy, gdy płytka wisi w porcie **serwera** —
 * a zwykle wisi w porcie osoby, która siedzi przed przeglądarką. Ta ścieżka
 * czyta gotowe pliki z katalogu budowy i oddaje je `FlashDialog`, który zna już
 * Web Serial i esptool-js z projektów Arduino.
 *
 * ## Skąd biorą się pliki
 *
 * PlatformIO zostawia wynik w `<projekt>/.pio/build/<środowisko>/`. Środowisko
 * nazywa się tak samo jak cel w pliku `.hydra` (patrz `emitPlatformio`), więc
 * nie trzeba niczego zgadywać ani parsować z wyjścia budowy.
 *
 * ## Dlaczego offsety zależą od układu
 *
 * Wsad ESP32 to nie jeden plik, tylko trzy w ustalonych miejscach pamięci.
 * Bootloader leży pod innym adresem na starszych układach niż na nowszych —
 * ESP32 i S2 mają go pod `0x1000`, S3, C3, C6 i H2 pod `0x0`. Wgranie pod złym
 * adresem daje płytkę, która nie startuje, i komunikat, po którym nie widać
 * dlaczego.
 */

import { FileType, RemoteFS } from '@mhersztowski/core';
import type { FlashFileEntry } from '../../modules/serial';

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
const FIRMWARE_OFFSET = 0x10000;

export interface HydraFlashRequest {
    /** Ścieżka pliku `.hydra` w przestrzeni Drive, np. `/user/drive/proj/x.hydra`. */
    file: string;
    /** Nazwa celu — jest zarazem nazwą środowiska PlatformIO. */
    target: string;
    /** Układ celu: `esp32`, `esp32s3`, … */
    mcu: string;
    userName: string;
    token?: string | undefined;
}

export class HydraFlashError extends Error {}

/** Czy dla tego układu w ogóle umiemy złożyć wsad. */
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

/**
 * Czyta wsad z katalogu budowy.
 *
 * Rzuca `HydraFlashError` z czytelną treścią — brak pliku znaczy zwykle
 * „nie zbudowano jeszcze tego celu", a nie awarię, i tak trzeba to powiedzieć.
 */
export async function collectHydraFirmware(
    request: HydraFlashRequest,
): Promise<FlashFileEntry[]> {
    const bootloaderOffset = BOOTLOADER_OFFSET[request.mcu];
    if (bootloaderOffset === undefined) {
        throw new HydraFlashError(
            `Wgrywanie z przeglądarki obsługuje rodzinę ESP32. Cel „${request.target}" `
            + `używa układu ${request.mcu}.`,
        );
    }

    const fs = new RemoteFS({
        baseUrl: `/api/users/${encodeURIComponent(request.userName)}/vfs`,
        token: request.token ?? undefined,
    });

    // `/user/drive/proj/x.hydra` → `/data/Minis/Users/{u}/drive/proj`
    const relative = request.file.replace(/^\/user\//, '').replace(/\/[^/]+$/, '');
    const buildDir = `/data/Minis/Users/${request.userName}/${relative}/.pio/build/${request.target}`;

    let entries;
    try {
        entries = await fs.readDirectory(buildDir);
    } catch {
        throw new HydraFlashError(
            `Brak katalogu budowy dla celu „${request.target}". Zbuduj projekt przed wgraniem.`,
        );
    }

    const present = new Set(
        entries.filter(e => e.type === FileType.File).map(e => e.name),
    );

    const wanted: Array<{ name: string; address: number; required: boolean }> = [
        { name: 'bootloader.bin', address: bootloaderOffset,  required: true },
        { name: 'partitions.bin', address: PARTITIONS_OFFSET, required: true },
        { name: 'firmware.bin',   address: FIRMWARE_OFFSET,   required: true },
    ];

    const missing = wanted.filter(w => w.required && !present.has(w.name)).map(w => w.name);
    if (missing.length > 0) {
        throw new HydraFlashError(
            `W katalogu budowy brakuje: ${missing.join(', ')}. `
            + 'Zbuduj cel od nowa — wgranie niekompletnego wsadu zostawia płytkę, która nie startuje.',
        );
    }

    const files: FlashFileEntry[] = [];
    for (const item of wanted) {
        const bytes = await fs.readFile(`${buildDir}/${item.name}`);
        files.push({
            data: toBinaryString(bytes),
            address: item.address,
            name: item.name,
        });
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
