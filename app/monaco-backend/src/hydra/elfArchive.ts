import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Archiwum plików `.elf` — po to, żeby ślad stosu z urządzenia dało się
 * przełożyć na nazwy funkcji.
 *
 * Urządzenie po awarii ma do przekazania same adresy. Zamienia je na nazwy
 * `addr2line`, ale tylko przeciw **temu samemu** plikowi `.elf`, z którego
 * powstał wgrany wsad: adres `0x40378a1c` w kolejnej budowie wskazuje inną
 * funkcję. PlatformIO nadpisuje `firmware.elf` przy każdym uruchomieniu, więc
 * w chwili, gdy raport przychodzi, plik potrzebny do jego odczytania zwykle
 * już nie istnieje. Stąd kopia odkładana zaraz po budowie.
 *
 * **Czym indeksujemy.** Kluczem jest suma SHA-256 pliku `.elf`. Wybór nie jest
 * dowolny: ESP-IDF wpisuje dokładnie tę wartość do deskryptora aplikacji
 * wewnątrz obrazu (`esp_app_desc_t.app_elf_sha256`), a układ potrafi ją o
 * sobie podać w czasie pracy. Nie trzeba więc wymyślać własnego znacznika
 * budowy ani niczego dokładać do procesu kompilacji — identyfikator, którym
 * archiwum się posługuje, jest już wpieczony we wsad przez toolchain.
 * Zgodność sprawdzamy przy odkładaniu (`confirmedByImage`), zamiast zakładać.
 *
 * Dla platform bez deskryptora IDF (STM32, RP2040) klucz działa tak samo, ale
 * potwierdzić się nie ma czym — układ musiałby raportować `.note.gnu.build-id`
 * albo wartość wpisaną przy budowie. Do czasu, aż to powstanie, wsad wskazuje
 * się dla nich ręcznie, po projekcie i środowisku.
 */

/** Architektury, dla których obraz budujący ma `addr2line`. */
export type ElfMachine = 'arm' | 'riscv' | 'xtensa';

export class ElfArchiveError extends Error {}

/** Wpis archiwum. Tyle, ile trzeba, żeby wybrać wsad bez otwierania pliku. */
export interface ArchiveEntry {
    /** SHA-256 pliku `.elf`, zapisany małymi znakami. */
    id: string;
    machine: ElfMachine;
    /** Nazwa katalogu projektu — do pokazania człowiekowi, nie do wyszukiwania. */
    project: string;
    /** Środowisko PlatformIO, np. `esp32s3`. */
    env: string;
    bytes: number;
    /** Kiedy odłożony, ISO 8601. */
    storedAt: string;
    /**
     * Czy identyfikator potwierdził się deskryptorem w `firmware.bin`.
     * `false` znaczy „klucz policzony, ale układ nie ma jak go podać".
     */
    confirmedByImage: boolean;
}

// ---------------------------------------------------------------------------
// Odczyt nagłówków — bez zależności, bo to kilkanaście bajtów w stałych miejscach
// ---------------------------------------------------------------------------

const ELF_MAGIC = 0x7f454c46;

/**
 * Architektura z nagłówka ELF.
 *
 * Potrzebna, bo `addr2line` jest osobny dla każdego toolchaina i użyty nie ten
 * co trzeba nie zgłasza błędu — zwraca `??` dla wszystkich adresów, co wygląda
 * identycznie jak brak symboli.
 */
export function elfMachine(elf: Buffer): ElfMachine | null {
    // e_machine leży pod 0x12, więc krótszy bufor nie ma czego opisywać.
    if (elf.length < 0x14) return null;
    if (elf.readUInt32BE(0) !== ELF_MAGIC) return null;
    // EI_DATA. Wszystkie nasze rdzenie są little-endian, a odczyt pola
    // dwubajtowego zależy od tego, więc big-endian odrzucamy zamiast czytać
    // na odwrót i dostać przypadkową architekturę.
    if (elf[5] !== 1) return null;

    switch (elf.readUInt16LE(0x12)) {
        case 40:  return 'arm';     // EM_ARM
        case 94:  return 'xtensa';  // EM_XTENSA
        case 243: return 'riscv';   // EM_RISCV
        default:  return null;
    }
}

/*
 * Rozkład `esp_app_desc_t` wewnątrz obrazu. Struktura leży zaraz za nagłówkiem
 * obrazu (24 B) i nagłówkiem pierwszego segmentu (8 B), a suma pliku `.elf`
 * jest w niej 144 bajty dalej — po `magic`, `secure_version`, `reserv1[2]`,
 * `version[32]`, `project_name[32]`, `time[16]`, `date[16]` i `idf_ver[32]`.
 */
const APP_DESC_OFFSET = 0x20;
const APP_DESC_MAGIC  = 0xabcd5432;
const SHA256_IN_DESC  = 0x90;

/**
 * Identyfikator wsadu odczytany z obrazu — czyli ta wartość, którą układ
 * potrafi podać o sobie w czasie pracy.
 *
 * `null` dla obrazów bez deskryptora IDF; to nie jest błąd, tylko inna
 * platforma.
 */
export function imageFirmwareId(bin: Buffer): string | null {
    const end = APP_DESC_OFFSET + SHA256_IN_DESC + 32;
    if (bin.length < end) return null;
    if (bin.readUInt32LE(APP_DESC_OFFSET) !== APP_DESC_MAGIC) return null;
    return bin.subarray(end - 32, end).toString('hex');
}

/** Klucz archiwum dla zawartości pliku `.elf`. */
export function firmwareId(elf: Buffer): string {
    return createHash('sha256').update(elf).digest('hex');
}

const ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Czy napis nadaje się na identyfikator wsadu.
 *
 * Sprawdzane przy każdym wejściu z zewnątrz, bo identyfikator staje się
 * **nazwą pliku**. Bez tego `../../etc/passwd` byłby poprawnym żądaniem.
 */
export function isFirmwareId(value: unknown): value is string {
    return typeof value === 'string' && ID_PATTERN.test(value);
}

/** Ścieżka pliku w archiwum. Odmawia, zanim cokolwiek dotknie dysku. */
export function elfPathFor(symbolsDir: string, id: string): string {
    if (!isFirmwareId(id)) throw new ElfArchiveError(`Niepoprawny identyfikator wsadu: ${id}`);
    return path.join(symbolsDir, `${id}.elf`);
}

// ---------------------------------------------------------------------------
// Indeks
// ---------------------------------------------------------------------------

const INDEX_FILE = 'index.json';

/** Ile wsadów zostaje. Plik `.elf` z ESP32 waży ~9 MB, więc bez limitu archiwum zjada dysk. */
export const DEFAULT_KEEP = 20;

export async function readIndex(symbolsDir: string): Promise<ArchiveEntry[]> {
    try {
        const raw = await fs.readFile(path.join(symbolsDir, INDEX_FILE), 'utf8');
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ArchiveEntry[]) : [];
    } catch {
        // Brak indeksu to stan początkowy, a uszkodzony — powód, żeby zacząć od
        // nowa: pliki `.elf` i tak leżą obok, a odmowa zapisu zablokowałaby
        // odkładanie kolejnych wsadów na zawsze.
        return [];
    }
}

async function writeIndex(symbolsDir: string, entries: ArchiveEntry[]): Promise<void> {
    const file = path.join(symbolsDir, INDEX_FILE);
    // Zapis przez plik tymczasowy: przerwanie w połowie zostawiłoby indeks
    // niemożliwy do sparsowania, czyli skasowałoby wiedzę o całym archiwum.
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    await fs.rename(temp, file);
}

/**
 * Zostawia `keep` najnowszych wpisów, resztę usuwa razem z plikami.
 *
 * Zwraca usunięte, żeby wołający miał co zapisać w logu — ciche kasowanie
 * pliku, którego ktoś zaraz poszuka, jest gorsze od braku miejsca.
 */
export function selectForRemoval(entries: ArchiveEntry[], keep: number): ArchiveEntry[] {
    const sorted = [...entries].sort((a, b) => b.storedAt.localeCompare(a.storedAt));
    return sorted.slice(Math.max(keep, 1));
}

// ---------------------------------------------------------------------------
// Odkładanie
// ---------------------------------------------------------------------------

export interface ArchiveRequest {
    /** Katalog projektu — ten z `.pio`. */
    projectDir: string;
    /** Środowisko PlatformIO. */
    env: string;
    /** Katalog archiwum. Poza katalogiem danych, żeby 9 MB nie trafiało do edytora. */
    symbolsDir: string;
    keep?: number;
}

export interface ArchiveResult {
    entry: ArchiveEntry;
    /** `false`, gdy dokładnie ten wsad już był odłożony. */
    stored: boolean;
    removed: ArchiveEntry[];
}

/**
 * Odkłada `.elf` po udanej budowie.
 *
 * Zwraca `null`, gdy nie ma czego odkładać — cel natywny i przeglądarkowy nie
 * wytwarzają `firmware.elf`. To zwykły przebieg, nie błąd, więc wołający nie
 * musi wiedzieć, jakiego rodzaju budowa właśnie się skończyła.
 */
export async function archiveFirmware(request: ArchiveRequest): Promise<ArchiveResult | null> {
    const buildDir = path.join(request.projectDir, '.pio', 'build', request.env);
    const elfPath  = path.join(buildDir, 'firmware.elf');

    let elf: Buffer;
    try {
        elf = await fs.readFile(elfPath);
    } catch {
        return null;
    }

    const machine = elfMachine(elf);
    if (machine === null) {
        throw new ElfArchiveError(`Nieznana architektura pliku ${elfPath} — nie ma czym rozwijać adresów.`);
    }

    const id = firmwareId(elf);

    // Obraz czytamy wyłącznie po to, żeby sprawdzić, czy układ poda ten sam
    // identyfikator. Jego brak nic nie psuje.
    let confirmedByImage = false;
    try {
        const bin = await fs.readFile(path.join(buildDir, 'firmware.bin'));
        confirmedByImage = imageFirmwareId(bin) === id;
    } catch {
        confirmedByImage = false;
    }

    const entry: ArchiveEntry = {
        id,
        machine,
        project: path.basename(request.projectDir),
        env: request.env,
        bytes: elf.length,
        storedAt: new Date().toISOString(),
        confirmedByImage,
    };

    await fs.mkdir(request.symbolsDir, { recursive: true });

    const target = elfPathFor(request.symbolsDir, id);
    let stored = true;
    try {
        await fs.stat(target);
        // Ta sama zawartość, ta sama nazwa — kopiowanie 9 MB nic by nie zmieniło.
        stored = false;
    } catch {
        await fs.writeFile(target, elf);
    }

    const others  = (await readIndex(request.symbolsDir)).filter((e) => e.id !== id);
    const removal = selectForRemoval([entry, ...others], request.keep ?? DEFAULT_KEEP);
    const removed = new Set(removal.map((e) => e.id));

    for (const gone of removal) {
        try {
            await fs.unlink(elfPathFor(request.symbolsDir, gone.id));
        } catch {
            // Plik mógł zniknąć wcześniej — wpis i tak wypada z indeksu.
        }
    }

    await writeIndex(request.symbolsDir, [entry, ...others].filter((e) => !removed.has(e.id)));

    return { entry, stored, removed: removal };
}
