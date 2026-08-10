import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
 * Mock warstwy VFS, bo testujemy dobór i nazewnictwo plików, a nie transport.
 * Ścieżki są tu najbardziej błędogenne: Drive pokazuje `/user/…`, VFS liczy od
 * katalogu `drive`, a kompilator AssemblyScriptu wymaga klucza dokładnie
 * `assembly/index.ts` — trzy różne zapisy tej samej rzeczy.
 */
vi.mock('./driveVfsClient', () => ({
    listDir: vi.fn(),
    readText: vi.fn(),
    isDirEntry: (e: { type: number }) => e.type === 2,
}));

import { listDir, readText } from './driveVfsClient';
import { loadWasmSources } from './wasmSources';

const listDirMock = vi.mocked(listDir);
const readTextMock = vi.mocked(readText);

describe('loadWasmSources', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        readTextMock.mockImplementation(async (_user, path) => `// ${path}`);
    });

    it('czyta katalog assembly obok pliku projektu', async () => {
        listDirMock.mockResolvedValue([{ name: 'index.ts', type: 1 }]);

        await loadWasmSources('ala', '/user/hydra/blink/blink.hydra');

        expect(listDirMock).toHaveBeenCalledWith('ala', 'hydra/blink/assembly');
    });

    it('kluczuje pliki względem projektu, bo takich nazw chce kompilator', async () => {
        listDirMock.mockResolvedValue([
            { name: 'index.ts', type: 1 },
            { name: 'hydra.ts', type: 1 },
        ]);

        const sources = await loadWasmSources('ala', '/user/hydra/blink/blink.hydra');

        expect(Object.keys(sources ?? {}).sort()).toEqual(['assembly/hydra.ts', 'assembly/index.ts']);
        expect(sources?.['assembly/index.ts']).toBe('// hydra/blink/assembly/index.ts');
    });

    it('pomija podkatalogi i pliki spoza AssemblyScriptu', async () => {
        listDirMock.mockResolvedValue([
            { name: 'index.ts', type: 1 },
            { name: 'build', type: 2 },
            { name: 'README.md', type: 1 },
        ]);

        const sources = await loadWasmSources('ala', '/user/hydra/blink/blink.hydra');

        expect(Object.keys(sources ?? {})).toEqual(['assembly/index.ts']);
    });

    it('brak katalogu assembly to projekt bez modułu, nie błąd', async () => {
        // Zakładka „Moduł WASM" ma się wtedy nie pojawić — większość projektów
        // Hydry modułu nie ma i pusta zakładka byłaby wyłącznie szumem.
        listDirMock.mockRejectedValue(new Error('readdir failed: 404'));

        expect(await loadWasmSources('ala', '/user/hydra/blink/blink.hydra')).toBeUndefined();
    });

    it('pusty katalog assembly też znaczy „bez modułu"', async () => {
        listDirMock.mockResolvedValue([]);

        expect(await loadWasmSources('ala', '/user/hydra/blink/blink.hydra')).toBeUndefined();
    });

    it('radzi sobie z projektem w korzeniu drive', async () => {
        listDirMock.mockResolvedValue([{ name: 'index.ts', type: 1 }]);

        await loadWasmSources('ala', '/user/blink.hydra');

        expect(listDirMock).toHaveBeenCalledWith('ala', 'assembly');
    });
});
