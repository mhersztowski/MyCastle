import type { ElfMachine } from './elfArchive';
import { elfPathFor, isFirmwareId } from './elfArchive';
import type { HydraStep } from './plan';
import * as path from 'node:path';

/**
 * Zamiana adresów ze śladu stosu na nazwy funkcji.
 *
 * `addr2line` mieszka w obrazie budującym, nie na maszynie z backendem —
 * toolchainów nie ma tu żadnych i nie ma powodu, żeby były. Idziemy więc tą
 * samą drogą co budowanie: `hydra.sh project <katalog> <polecenie…>` montuje
 * podany katalog jako `/project` i uruchamia w kontenerze cokolwiek dostanie.
 * Montujemy katalog archiwum, więc wsad widziany jest pod `/project/<id>.elf`.
 *
 * Plan uruchomienia jest tu oddzielony od samego uruchomienia — tak jak
 * w `plan.ts` i z tego samego powodu: kolejność argumentów i granice ścieżek
 * chcemy sprawdzać testem, a nie startem kontenera.
 */

/** Ramka śladu stosu po rozwinięciu. */
export interface SymbolFrame {
    /** Adres w postaci, w jakiej trafił do `addr2line`. */
    address: string;
    /** Nazwa funkcji; brak, gdy adres nie trafia w kod z symbolami. */
    function?: string;
    file?: string;
    line?: number;
    /**
     * Czy ramka pochodzi z funkcji wstawionej w miejscu wywołania.
     * Przy `-Os` to większość śladu, a bez tej informacji wygląda on na
     * niespójny: kolejne pozycje mają ten sam adres.
     */
    inlined?: boolean;
}

export class Addr2LineError extends Error {}

/**
 * Gdzie w obrazie leży `addr2line` dla danej architektury.
 *
 * Użycie nie tego co trzeba nie kończy się błędem — zwraca `??` dla każdego
 * adresu, czyli wygląda dokładnie jak wsad zbudowany bez symboli. Dlatego
 * architektura bierze się z nagłówka ELF, a nie z nazwy środowiska.
 */
const TOOLCHAIN: Record<ElfMachine, string> = {
    arm:    '/opt/pio/packages/toolchain-gccarmnoneeabi/bin/arm-none-eabi-addr2line',
    riscv:  '/opt/pio/packages/toolchain-riscv32-esp/bin/riscv32-esp-elf-addr2line',
    xtensa: '/opt/pio/packages/toolchain-xtensa-esp32s3/bin/xtensa-esp32s3-elf-addr2line',
};

/**
 * Ile adresów przyjmujemy naraz.
 *
 * Ślad stosu z ESP32 to kilkanaście pozycji; setki znaczą, że ktoś przysłał
 * coś innego niż ślad. Limit jest po to, żeby nie budować wiersza poleceń
 * z tysiąca argumentów.
 */
export const MAX_ADDRESSES = 64;

const ADDRESS_PATTERN = /^(?:0[xX])?[0-9a-fA-F]{1,16}$/;

/**
 * Sprowadza adres do postaci `0x…`.
 *
 * Sprawdzane znak po znaku, bo adresy trafiają do argumentów procesu. `spawn`
 * bez powłoki nie pozwoli im się rozrosnąć do osobnego polecenia, ale wartość
 * zaczynająca się od `-` zostałaby wzięta za flagę `addr2line`.
 */
export function normalizeAddress(raw: unknown): string {
    if (typeof raw !== 'string' || !ADDRESS_PATTERN.test(raw)) {
        throw new Addr2LineError(`To nie jest adres: ${String(raw)}`);
    }
    return `0x${raw.replace(/^0x/i, '').toLowerCase()}`;
}

export interface SymbolizeRequest {
    /** Identyfikator wsadu — klucz archiwum. */
    id: string;
    machine: ElfMachine;
    addresses: unknown[];
}

export interface SymbolizePaths {
    /** Katalog biblioteki Hydra — ten z `docker/hydra.sh`. */
    hydraDir: string;
    /** Katalog archiwum `.elf`. */
    symbolsDir: string;
}

/** Co uruchomić, żeby rozwinąć adresy. */
export function planSymbolize(request: SymbolizeRequest, paths: SymbolizePaths): HydraStep {
    if (!isFirmwareId(request.id)) {
        throw new Addr2LineError(`Niepoprawny identyfikator wsadu: ${request.id}`);
    }
    const tool = TOOLCHAIN[request.machine];
    if (tool === undefined) {
        throw new Addr2LineError(`Brak narzędzi dla architektury: ${request.machine}`);
    }
    if (request.addresses.length === 0) {
        throw new Addr2LineError('Nie podano żadnego adresu.');
    }
    if (request.addresses.length > MAX_ADDRESSES) {
        throw new Addr2LineError(
            `Za dużo adresów: ${request.addresses.length}, najwyżej ${MAX_ADDRESSES}.`,
        );
    }

    // `elfPathFor` sprawdza identyfikator jeszcze raz i odmawia, zanim
    // cokolwiek dotknie dysku — nazwa pliku bierze się wprost z żądania.
    elfPathFor(paths.symbolsDir, request.id);

    return {
        script: path.join(paths.hydraDir, 'docker', 'hydra.sh'),
        args: [
            'project', paths.symbolsDir,
            tool,
            '-f',  // nazwa funkcji
            '-C',  // rozwinięcie nazw C++
            '-p',  // jedna pozycja w jednym wierszu
            '-i',  // funkcje wstawione w miejscu wywołania
            '-e', `/project/${request.id}.elf`,
            ...request.addresses.map(normalizeAddress),
        ],
    };
}

/*
 * Wiersz wygląda tak:
 *
 *     nazwa at /ścieżka/plik.c:84
 *     ?? ??:0
 *     nazwa at ??:?
 *
 * a przy `-i` ramka wstawiona w miejscu wywołania dokłada wiersz zaczynający
 * się od ` (inlined by) `. Wszystkie trzy pierwsze postacie widziałem na
 * prawdziwym wsadzie; czwartej nie udało mi się wywołać na tym pliku, więc
 * obsługa jest napisana z opisu formatu, a nie z obserwacji — stąd parser
 * przyjmuje ją, ale nie polega na niej przy niczym innym.
 */
const LINE_PATTERN   = /^(.*?) at (.*?):(\?|\d+)$/;
const INLINE_PATTERN = /^\s*\(inlined by\)\s*(.*)$/;

/**
 * Składa wyjście `addr2line` w ramki.
 *
 * Adresy podajemy z zewnątrz, bo `-p` nie powtarza ich w wyjściu — kolejność
 * jest jedynym powiązaniem wiersza z adresem. Wierszy może być **więcej** niż
 * adresów, gdy w grę wchodzą funkcje wstawiane; nadmiarowe doklejają się do
 * ostatniego adresu, a nie przesuwają całą resztę.
 */
export function parseAddr2Line(output: string, addresses: string[]): SymbolFrame[] {
    const frames: SymbolFrame[] = [];
    let index = -1;

    for (const raw of output.split(/\r?\n/)) {
        if (raw.trim() === '') continue;

        const continuation = INLINE_PATTERN.exec(raw);
        const body = continuation ? continuation[1] : raw;

        if (!continuation) {
            index += 1;
            // Wyjście dłuższe niż lista adresów znaczy, że coś poszło nie tak
            // z parowaniem. Lepiej uciąć niż przypisać ramkę do adresu, który
            // jej nie dotyczy — pomyłka w numerze ramki jest niewidoczna.
            if (index >= addresses.length) break;
        }

        const address = addresses[Math.max(index, 0)];
        const match = LINE_PATTERN.exec(body);

        if (match === null) {
            frames.push({ address, ...(continuation ? { inlined: true } : {}) });
            continue;
        }

        const [, name, file, line] = match;
        const frame: SymbolFrame = { address };
        // `??` znaczy „nie wiem", a nie nazwę. Przepisane wprost wyglądałoby
        // w interfejsie jak funkcja o takiej nazwie.
        if (name !== '??') frame.function = name;
        if (file !== '??') frame.file = file;
        if (line !== '?' && line !== '0') frame.line = Number(line);
        if (continuation) frame.inlined = true;

        frames.push(frame);
    }

    return frames;
}

/** Czy cokolwiek udało się rozwinąć — do odróżnienia złego wsadu od złych adresów. */
export function anyResolved(frames: SymbolFrame[]): boolean {
    return frames.some((f) => f.function !== undefined);
}
