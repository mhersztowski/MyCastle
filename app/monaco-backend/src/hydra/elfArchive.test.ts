import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
    archiveFirmware,
    elfMachine,
    elfPathFor,
    firmwareId,
    imageFirmwareId,
    isFirmwareId,
    readIndex,
    selectForRemoval,
    ElfArchiveError,
    type ArchiveEntry,
} from './elfArchive';

/** Nagłówek ELF32 little-endian o zadanej architekturze. */
function elfHeader(machine: number, extra = 0): Buffer {
    const buf = Buffer.alloc(0x40 + extra);
    buf.writeUInt32BE(0x7f454c46, 0);
    buf[4] = 1;  // ELFCLASS32
    buf[5] = 1;  // ELFDATA2LSB
    buf.writeUInt16LE(machine, 0x12);
    return buf;
}

/** Obraz ESP-IDF niosący deskryptor aplikacji z podaną sumą pliku `.elf`. */
function espImage(sha: string): Buffer {
    const buf = Buffer.alloc(0x20 + 0x90 + 32);
    buf.writeUInt32LE(0xabcd5432, 0x20);
    Buffer.from(sha, 'hex').copy(buf, 0x20 + 0x90);
    return buf;
}

describe('odczyt nagłówków', () => {
    it('rozpoznaje architektury, dla których mamy narzędzia', () => {
        expect(elfMachine(elfHeader(40))).toBe('arm');
        expect(elfMachine(elfHeader(94))).toBe('xtensa');
        expect(elfMachine(elfHeader(243))).toBe('riscv');
    });

    it('odmawia zamiast zgadywać', () => {
        // Zła architektura znaczy zły `addr2line`, a ten nie zgłasza błędu —
        // zwraca `??` dla każdego adresu, czyli wygląda jak wsad bez symboli.
        expect(elfMachine(elfHeader(3))).toBeNull();          // x86
        expect(elfMachine(Buffer.alloc(0x40))).toBeNull();    // nie ELF
        expect(elfMachine(Buffer.from('#!/bin/sh\n'))).toBeNull();
    });

    it('nie czyta pola dwubajtowego z pliku big-endian', () => {
        const buf = elfHeader(40);
        buf[5] = 2;  // ELFDATA2MSB
        expect(elfMachine(buf)).toBeNull();
    });

    it('krótki bufor nie wywraca odczytu', () => {
        expect(elfMachine(Buffer.alloc(4))).toBeNull();
        expect(elfMachine(Buffer.alloc(0))).toBeNull();
    });
});

describe('identyfikator wsadu', () => {
    it('to suma SHA-256 pliku', () => {
        const elf = elfHeader(94);
        expect(firmwareId(elf)).toBe(createHash('sha256').update(elf).digest('hex'));
    });

    it('odczytany z obrazu zgadza się z policzonym z pliku', () => {
        // Na tym opiera się całe archiwum: ESP-IDF wpisuje sumę pliku `.elf`
        // do deskryptora w obrazie, więc układ potrafi podać dokładnie ten
        // klucz, którym szukamy. Sprawdzone na prawdziwym wsadzie i utrwalone
        // tutaj, żeby zmiana rozkładu struktury nie przeszła niezauważona.
        const elf = elfHeader(94);
        const id = firmwareId(elf);
        expect(imageFirmwareId(espImage(id))).toBe(id);
    });

    it('obraz bez deskryptora IDF nie udaje, że coś wie', () => {
        expect(imageFirmwareId(Buffer.alloc(0x200))).toBeNull();
        expect(imageFirmwareId(Buffer.alloc(8))).toBeNull();
    });

    it('na identyfikator nadaje się tylko 64 znaki szesnastkowe', () => {
        expect(isFirmwareId('a'.repeat(64))).toBe(true);
        expect(isFirmwareId('A'.repeat(64))).toBe(false);   // wielkie litery to inny zapis
        expect(isFirmwareId('a'.repeat(63))).toBe(false);
        expect(isFirmwareId('../../etc/passwd')).toBe(false);
        expect(isFirmwareId(undefined)).toBe(false);
    });

    it('nazwa pliku nie da się wyprowadzić poza archiwum', () => {
        // Identyfikator przychodzi z zewnątrz i staje się nazwą pliku.
        expect(() => elfPathFor('/srv/symbols', '../../etc/passwd')).toThrow(ElfArchiveError);
        expect(() => elfPathFor('/srv/symbols', 'a'.repeat(64) + '/../x')).toThrow(ElfArchiveError);
        expect(elfPathFor('/srv/symbols', 'b'.repeat(64)))
            .toBe(path.join('/srv/symbols', `${'b'.repeat(64)}.elf`));
    });
});

describe('limit archiwum', () => {
    const entry = (id: string, storedAt: string): ArchiveEntry => ({
        id, machine: 'xtensa', project: 'p', env: 'esp32s3',
        bytes: 1, storedAt, confirmedByImage: true,
    });

    it('zostawia najnowsze', () => {
        const all = [
            entry('a'.repeat(64), '2026-08-01T00:00:00.000Z'),
            entry('b'.repeat(64), '2026-08-03T00:00:00.000Z'),
            entry('c'.repeat(64), '2026-08-02T00:00:00.000Z'),
        ];
        expect(selectForRemoval(all, 2).map((e) => e.id)).toEqual(['a'.repeat(64)]);
    });

    it('nie kasuje wszystkiego przy limicie zero', () => {
        // Plik `.elf` z ESP32 waży ~9 MB, więc limit musi istnieć — ale
        // archiwum bez ani jednego wsadu nie ma po co działać.
        const all = [entry('a'.repeat(64), '2026-08-01T00:00:00.000Z')];
        expect(selectForRemoval(all, 0)).toEqual([]);
    });
});

describe('odkładanie po budowie', () => {
    let root = '';

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'elf-archive-'));
    });
    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    /** Zakłada katalog projektu z wynikiem budowy. */
    async function build(project: string, env: string, elf: Buffer, bin?: Buffer): Promise<string> {
        const projectDir = path.join(root, project);
        const buildDir = path.join(projectDir, '.pio', 'build', env);
        await fs.mkdir(buildDir, { recursive: true });
        await fs.writeFile(path.join(buildDir, 'firmware.elf'), elf);
        if (bin) await fs.writeFile(path.join(buildDir, 'firmware.bin'), bin);
        return projectDir;
    }

    const symbols = (): string => path.join(root, 'symbols');

    it('odkłada plik pod jego własną sumą i zapisuje wpis', async () => {
        const elf = elfHeader(94, 100);
        const projectDir = await build('rover', 'esp32s3', elf, espImage(firmwareId(elf)));

        const result = await archiveFirmware({ projectDir, env: 'esp32s3', symbolsDir: symbols() });

        expect(result).not.toBeNull();
        expect(result!.entry.id).toBe(firmwareId(elf));
        expect(result!.entry.machine).toBe('xtensa');
        expect(result!.entry.project).toBe('rover');
        expect(result!.entry.env).toBe('esp32s3');
        expect(result!.stored).toBe(true);

        const stored = await fs.readFile(elfPathFor(symbols(), result!.entry.id));
        expect(stored.equals(elf)).toBe(true);
        expect((await readIndex(symbols())).map((e) => e.id)).toEqual([result!.entry.id]);
    });

    it('zaznacza, że układ poda ten sam identyfikator', async () => {
        const elf = elfHeader(94, 7);
        const projectDir = await build('rover', 'esp32s3', elf, espImage(firmwareId(elf)));

        const result = await archiveFirmware({ projectDir, env: 'esp32s3', symbolsDir: symbols() });
        expect(result!.entry.confirmedByImage).toBe(true);
    });

    it('brak deskryptora nie blokuje odłożenia', async () => {
        // STM32 i RP2040 nie mają `esp_app_desc_t`. Wsad archiwizujemy tak
        // samo — tyle że wskazać go trzeba będzie ręcznie.
        const elf = elfHeader(40, 7);
        const projectDir = await build('stm32-projekt', 'stm32g4', elf, Buffer.alloc(0x200));

        const result = await archiveFirmware({ projectDir, env: 'stm32g4', symbolsDir: symbols() });
        expect(result!.entry.machine).toBe('arm');
        expect(result!.entry.confirmedByImage).toBe(false);
    });

    it('obraz z innego wsadu nie przechodzi za potwierdzenie', async () => {
        const elf = elfHeader(94, 11);
        const projectDir = await build('rover', 'esp32s3', elf, espImage('f'.repeat(64)));

        const result = await archiveFirmware({ projectDir, env: 'esp32s3', symbolsDir: symbols() });
        expect(result!.entry.confirmedByImage).toBe(false);
    });

    it('budowa bez wsadu to nie błąd', async () => {
        // Cel natywny i przeglądarkowy nie wytwarzają `firmware.elf`.
        const projectDir = path.join(root, 'gra');
        await fs.mkdir(projectDir, { recursive: true });

        await expect(archiveFirmware({ projectDir, env: 'native', symbolsDir: symbols() }))
            .resolves.toBeNull();
    });

    it('nieznana architektura zatrzymuje odkładanie', async () => {
        // Bez `addr2line` dla tej maszyny plik zajmie 9 MB i nie da się nic
        // z niego odczytać.
        const projectDir = await build('obcy', 'x86', elfHeader(3, 7));

        await expect(archiveFirmware({ projectDir, env: 'x86', symbolsDir: symbols() }))
            .rejects.toThrow(ElfArchiveError);
    });

    it('powtórna budowa tego samego wsadu nie kopiuje go drugi raz', async () => {
        const elf = elfHeader(94, 3);
        const projectDir = await build('rover', 'esp32s3', elf);
        const options = { projectDir, env: 'esp32s3', symbolsDir: symbols() };

        await archiveFirmware(options);
        const again = await archiveFirmware(options);

        expect(again!.stored).toBe(false);
        expect(await readIndex(symbols())).toHaveLength(1);
    });

    it('starsze wsady wypadają razem z plikami', async () => {
        const symbolsDir = symbols();
        const ids: string[] = [];

        for (let i = 0; i < 4; i += 1) {
            const elf = elfHeader(94, i + 1);
            const projectDir = await build(`p${i}`, 'esp32s3', elf);
            const r = await archiveFirmware({ projectDir, env: 'esp32s3', symbolsDir, keep: 2 });
            ids.push(r!.entry.id);
        }

        const left = (await readIndex(symbolsDir)).map((e) => e.id);
        expect(left).toHaveLength(2);
        expect(left).toContain(ids[3]);

        // Wpis usunięty z indeksu, ale plik zostawiony na dysku, to najgorszy
        // wariant: miejsce zajęte, a wsad nieosiągalny.
        const onDisk = (await fs.readdir(symbolsDir)).filter((f) => f.endsWith('.elf'));
        expect(onDisk).toHaveLength(2);
    });

    it('uszkodzony indeks nie blokuje archiwum na zawsze', async () => {
        const symbolsDir = symbols();
        await fs.mkdir(symbolsDir, { recursive: true });
        await fs.writeFile(path.join(symbolsDir, 'index.json'), '{to nie jest json');

        const elf = elfHeader(94, 5);
        const projectDir = await build('rover', 'esp32s3', elf);

        const result = await archiveFirmware({ projectDir, env: 'esp32s3', symbolsDir });
        expect(result!.entry.id).toBe(firmwareId(elf));
        expect(await readIndex(symbolsDir)).toHaveLength(1);
    });
});
