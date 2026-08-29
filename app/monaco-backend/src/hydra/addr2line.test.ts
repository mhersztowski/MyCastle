import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import {
    anyResolved,
    normalizeAddress,
    parseAddr2Line,
    planSymbolize,
    Addr2LineError,
    MAX_ADDRESSES,
} from './addr2line';

const PATHS = { hydraDir: '/opt/Hydra', symbolsDir: '/srv/monaco/symbols' };
const ID = 'a0f173f8300ff46a93261cc0b28fd2dfc9061b6273328c073d4ae6fc57a9a9f1';

describe('plan uruchomienia', () => {
    it('montuje archiwum i wskazuje wsad wewnątrz kontenera', () => {
        const step = planSymbolize(
            { id: ID, machine: 'xtensa', addresses: ['0x40377ed8', '4037b010'] },
            PATHS,
        );

        expect(step.script).toBe(path.join('/opt/Hydra', 'docker', 'hydra.sh'));
        expect(step.args).toEqual([
            'project', '/srv/monaco/symbols',
            '/opt/pio/packages/toolchain-xtensa-esp32s3/bin/xtensa-esp32s3-elf-addr2line',
            '-f', '-C', '-p', '-i',
            '-e', `/project/${ID}.elf`,
            '0x40377ed8', '0x4037b010',
        ]);
    });

    it('każda architektura dostaje swój toolchain', () => {
        const tool = (machine: 'arm' | 'riscv' | 'xtensa'): string =>
            planSymbolize({ id: ID, machine, addresses: ['0x1'] }, PATHS).args[2];

        // Nie ten `addr2line` co trzeba nie zgłasza błędu — zwraca `??` dla
        // wszystkich adresów, czyli wygląda jak wsad zbudowany bez symboli.
        expect(tool('arm')).toContain('arm-none-eabi-addr2line');
        expect(tool('riscv')).toContain('riscv32-esp-elf-addr2line');
        expect(tool('xtensa')).toContain('xtensa-esp32s3-elf-addr2line');
    });

    it('identyfikator spoza wzorca nie staje się ścieżką', () => {
        for (const id of ['../../etc/passwd', `${ID}/../x`, '', 'ZZZ']) {
            expect(() => planSymbolize({ id, machine: 'arm', addresses: ['0x1'] }, PATHS))
                .toThrow(Addr2LineError);
        }
    });

    it('odmawia, gdy nie ma czego rozwijać', () => {
        expect(() => planSymbolize({ id: ID, machine: 'arm', addresses: [] }, PATHS))
            .toThrow(Addr2LineError);
    });

    it('ślad dłuższy niż wolno nie buduje wiersza poleceń', () => {
        const many = Array.from({ length: MAX_ADDRESSES + 1 }, () => '0x1');
        expect(() => planSymbolize({ id: ID, machine: 'arm', addresses: many }, PATHS))
            .toThrow(Addr2LineError);
    });
});

describe('sprowadzanie adresu', () => {
    it('przyjmuje obie postacie i ujednolica zapis', () => {
        expect(normalizeAddress('0x4037B010')).toBe('0x4037b010');
        expect(normalizeAddress('4037b010')).toBe('0x4037b010');
        expect(normalizeAddress('0X1')).toBe('0x1');
    });

    it('nie przepuszcza czegoś, co zostałoby wzięte za flagę', () => {
        // Adresy trafiają do argumentów procesu. `-e` w tym miejscu wskazałby
        // `addr2line` inny plik, niż wybraliśmy.
        expect(() => normalizeAddress('-e')).toThrow(Addr2LineError);
        expect(() => normalizeAddress('-0x10')).toThrow(Addr2LineError);
        expect(() => normalizeAddress('0x10 0x20')).toThrow(Addr2LineError);
        expect(() => normalizeAddress('0xZZ')).toThrow(Addr2LineError);
        expect(() => normalizeAddress('')).toThrow(Addr2LineError);
        expect(() => normalizeAddress(null)).toThrow(Addr2LineError);
    });
});

describe('odczyt wyjścia', () => {
    /*
     * Wyjście przepisane z prawdziwego uruchomienia w obrazie budującym,
     * przeciw `hello-blink/.pio/build/esp32s3/firmware.elf`. Ścieżki skrócone,
     * reszta bez zmian — to jedyny sposób, żeby test pilnował formatu, a nie
     * mojego wyobrażenia o nim.
     */
    const REAL = [
        'Cache_Freeze_DCache_Enable at /esp-idf/components/esp_rom/patches/esp_rom_cache.c:84',
        'Cache_Freeze_ICache_Enable at /esp-idf/components/esp_rom/patches/esp_rom_cache.c:75',
        'Cache_Get_DROM_MMU_End at ??:?',
        '?? ??:0',
    ].join('\n');

    const ADDRS = ['0x40377ed8', '0x40377ebc', '0x4037b010', '0x1'];

    it('składa nazwę, plik i wiersz', () => {
        const frames = parseAddr2Line(REAL, ADDRS);

        expect(frames).toHaveLength(4);
        expect(frames[0]).toEqual({
            address: '0x40377ed8',
            function: 'Cache_Freeze_DCache_Enable',
            file: '/esp-idf/components/esp_rom/patches/esp_rom_cache.c',
            line: 84,
        });
    });

    it('nie robi z „??" nazwy funkcji ani nazwy pliku', () => {
        const frames = parseAddr2Line(REAL, ADDRS);

        // Symbol jest, ale bez informacji o pliku — tak wygląda kod z ROM-u.
        expect(frames[2].function).toBe('Cache_Get_DROM_MMU_End');
        expect(frames[2].file).toBeUndefined();
        expect(frames[2].line).toBeUndefined();

        // Adres spoza kodu: puste pola, a nie funkcja o nazwie „??".
        expect(frames[3]).toEqual({ address: '0x1' });
    });

    it('wiąże wiersze z adresami po kolejności', () => {
        // `-p` nie powtarza adresu w wyjściu, więc kolejność jest jedynym
        // powiązaniem. Pomyłka o jeden przypisałaby ramkę do sąsiada
        // i wyglądała zupełnie wiarygodnie.
        const frames = parseAddr2Line(REAL, ADDRS);
        expect(frames.map((f) => f.address)).toEqual(ADDRS);
    });

    it('rozpoznaje ramkę wstawioną w miejscu wywołania', () => {
        /*
         * Ten kształt wyjścia jest z opisu formatu `addr2line`, nie z
         * obserwacji — na sprawdzanym wsadzie nie udało mi się wywołać ramki
         * wstawianej. Przy `-Os` to jednak większość prawdziwego śladu, więc
         * parser ma ją obsłużyć, zamiast rozjechać numerację adresów.
         */
        const output = [
            'krok at /src/app.cpp:12',
            ' (inlined by) petla at /src/app.cpp:40',
            'main at /src/main.cpp:7',
        ].join('\n');

        const frames = parseAddr2Line(output, ['0x100', '0x200']);

        expect(frames).toHaveLength(3);
        expect(frames[1]).toEqual({
            address: '0x100', function: 'petla', file: '/src/app.cpp', line: 40, inlined: true,
        });
        // Ramka wstawiana nie przesuwa adresu — kolejny wiersz to już 0x200.
        expect(frames[2].address).toBe('0x200');
        expect(frames[2].inlined).toBeUndefined();
    });

    it('nadmiar wierszy nie rozjeżdża przypisania', () => {
        const output = ['a at /x.c:1', 'b at /x.c:2', 'c at /x.c:3'].join('\n');
        const frames = parseAddr2Line(output, ['0x1']);

        expect(frames).toHaveLength(1);
        expect(frames[0].function).toBe('a');
    });

    it('puste wyjście daje pustą listę, a nie ramkę bez treści', () => {
        expect(parseAddr2Line('', ['0x1'])).toEqual([]);
        expect(parseAddr2Line('\n\n', ['0x1'])).toEqual([]);
    });

    it('wiersz w nieznanym kształcie zostawia sam adres', () => {
        // Komunikat błędu narzędzia trafia w to samo miejsce co wynik.
        const frames = parseAddr2Line('addr2line: nie ma takiego pliku', ['0x1']);
        expect(frames).toEqual([{ address: '0x1' }]);
    });

    it('odróżnia zły wsad od złych adresów', () => {
        // Wszystkie `??` znaczą, że wsad jest nie ten — pojedyncze `??` to
        // normalny ślad przechodzący przez ROM.
        expect(anyResolved(parseAddr2Line('?? ??:0\n?? ??:0', ['0x1', '0x2']))).toBe(false);
        expect(anyResolved(parseAddr2Line(REAL, ADDRS))).toBe(true);
    });
});
