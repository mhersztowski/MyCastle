import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import { resolvePreview, PreviewPathError } from './preview';

const DATA = '/srv/monaco/data';

describe('resolvePreview', () => {
    it('wydaje stronę i moduł z katalogu budowy', () => {
        for (const [name, type] of [
            ['gra.html', 'text/html; charset=utf-8'],
            ['gra.js', 'text/javascript; charset=utf-8'],
            ['gra.wasm', 'application/wasm'],
        ] as const) {
            const file = resolvePreview(`gra/build/wasm/${name}`, DATA);
            expect(file.absolute).toBe(path.join(DATA, 'gra/build/wasm', name));
            expect(file.contentType).toBe(type);
        }
    });

    it('nie wychodzi poza katalog budowy', () => {
        // Źródła projektu nie są wynikiem budowy — do nich jest VFS.
        expect(() => resolvePreview('gra/src/main.cpp', DATA)).toThrow(PreviewPathError);
    });

    it('nie wydaje plików pośrednich z katalogu budowy', () => {
        // Katalog budowy niesie też `.o`, cache CMake i logi z pełnymi
        // ścieżkami maszyny — udostępnienie całego katalogu oddałoby je razem
        // ze stroną.
        expect(() => resolvePreview('gra/build/wasm/CMakeCache.txt', DATA)).toThrow(PreviewPathError);
        expect(() => resolvePreview('gra/build/wasm/main.cpp.o', DATA)).toThrow(PreviewPathError);
    });

    it('nie daje się wyprowadzić poza katalog danych', () => {
        expect(() => resolvePreview('../../etc/build/wasm/passwd.js', DATA)).toThrow(PreviewPathError);
        expect(() => resolvePreview('gra/build/wasm/../../../../etc/x.js', DATA)).toThrow(PreviewPathError);
    });

    it('rozwija kodowanie procentowe przed sprawdzeniem granicy', () => {
        // Bez tego `%2e%2e` przeszłoby sprawdzenie i rozwinęło się dopiero
        // przy odczycie z dysku.
        expect(() => resolvePreview('%2e%2e/%2e%2e/etc/build/wasm/x.js', DATA)).toThrow(PreviewPathError);
    });

    it('katalog o nazwie zaczynającej się jak katalog danych nie przechodzi', () => {
        expect(() => resolvePreview('../data-inne/build/wasm/x.js', DATA)).toThrow(PreviewPathError);
    });
});
