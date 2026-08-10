/**
 * Źródła modułu WebAssembly dla projektu Hydry, czytane z Drive.
 *
 * Osobno od `wasmUpload.tsx`, bo to czysta funkcja nad VFS — bez Reacta, MUI
 * i serwisów aplikacji. Dzięki temu da się ją przetestować bez wciągania
 * edytora, który przychodzi w łańcuchu zależności strony.
 */

import { isDirEntry, listDir, readText } from './driveVfsClient';

/** Katalog źródeł modułu obok pliku projektu — układ z `templates/assemblyscript`. */
const ASSEMBLY_DIR = 'assembly';

/**
 * Drive pokazuje ścieżki jako `/user/…`, a VFS liczy je od katalogu `drive`
 * użytkownika. Ta sama zamiana, co w `hydraBuild.ts`.
 */
function driveRelative(driveFile: string): string {
    return driveFile.replace(/^\/user\//, '').replace(/^\/+/, '');
}

/**
 * Źródła modułu: ścieżka → treść, kluczowane względem katalogu projektu
 * (`assembly/index.ts`), bo takich nazw oczekuje kompilator.
 *
 * `undefined` znaczy „ten projekt nie ma modułu" — brak katalogu `assembly`
 * jest normalnym stanem większości projektów Hydry, a nie błędem.
 */
export async function loadWasmSources(
    userName: string,
    projectFile: string,
): Promise<Record<string, string> | undefined> {
    const projectDir = driveRelative(projectFile).replace(/[^/]+$/, '');
    const assemblyDir = `${projectDir}${ASSEMBLY_DIR}`;

    let entries;
    try {
        entries = await listDir(userName, assemblyDir);
    } catch {
        return undefined;
    }

    const files = entries.filter((e) => !isDirEntry(e) && e.name.endsWith('.ts'));
    if (files.length === 0) return undefined;

    const sources: Record<string, string> = {};
    await Promise.all(files.map(async (file) => {
        sources[`${ASSEMBLY_DIR}/${file.name}`] =
            await readText(userName, `${assemblyDir}/${file.name}`);
    }));
    return sources;
}
