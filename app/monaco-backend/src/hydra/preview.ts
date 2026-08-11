import * as path from 'node:path';

/**
 * Ścieżka pliku wydanego przez budowę dla przeglądarki.
 *
 * Wydzielone z serwowania z tego samego powodu, co `planHydraBuild`: to jedyne
 * miejsce, w którym da się pomylić granicę katalogu danych, a granicę chcemy
 * sprawdzać testem, nie zapytaniem HTTP.
 *
 * Dlaczego osobna trasa, a nie `/files/`: tamta serwuje wyłącznie
 * `data/public`, i słusznie — jest publiczna. Tu potrzebny jest dostęp do
 * wyniku budowy leżącego przy projekcie, więc zamiast rozluźniać tamtą regułę
 * dokładamy własną, węższą: **tylko** katalog `build/wasm` i **tylko** te trzy
 * rozszerzenia, które składają się na stronę z modułem.
 */

/** Katalog budowy — ten sam, który wpisuje `wasmSteps`. */
const BUILD_SEGMENT = 'build/wasm/';

/**
 * Rozszerzenia strony z modułem WebAssembly.
 *
 * Lista zamknięta, bo katalog budowy zawiera też pliki pośrednie: `.o`,
 * pamięć podręczną CMake, logi z pełnymi ścieżkami maszyny. Udostępnianie
 * całego katalogu oznaczałoby oddanie ich razem ze stroną.
 */
const SERVED: Readonly<Record<string, string>> = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.data': 'application/octet-stream',
};

export class PreviewPathError extends Error {}

export interface PreviewFile {
    /** Ścieżka bezwzględna na dysku. */
    absolute: string;
    contentType: string;
}

/**
 * @param relative ścieżka spod `/api/hydra/preview/`, np.
 *                 `gra/build/wasm/gra.html`
 * @param dataDir  katalog danych backendu
 */
export function resolvePreview(relative: string, dataDir: string): PreviewFile {
    const cleaned = decodeURIComponent(relative).replace(/^\/+/, '');

    if (!cleaned.includes(BUILD_SEGMENT)) {
        throw new PreviewPathError(
            `Podgląd obejmuje wyłącznie wynik budowy (${BUILD_SEGMENT}): ${relative}`,
        );
    }

    const extension = path.extname(cleaned).toLowerCase();
    const contentType = SERVED[extension];
    if (!contentType) {
        throw new PreviewPathError(`Tego pliku podgląd nie wydaje: ${relative}`);
    }

    const root = path.resolve(dataDir);
    const absolute = path.resolve(root, cleaned);

    // Granica katalogu danych — z separatorem, żeby `…/data-inne` nie przeszło
    // jako „wewnątrz `…/data`". Sprawdzane po `resolve`, więc `..` w ścieżce
    // jest już rozwinięte i nie ma jak wyprowadzić poza katalog.
    if (absolute !== root && !absolute.startsWith(root + path.sep)) {
        throw new PreviewPathError(`Ścieżka wychodzi poza katalog danych: ${relative}`);
    }

    return { absolute, contentType };
}
