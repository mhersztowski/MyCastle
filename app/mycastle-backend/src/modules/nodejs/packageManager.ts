/**
 * packageManager.ts — którym narzędziem budować ten projekt.
 *
 * ## Dlaczego to nie jest szczegół
 *
 * `npm install` w projekcie pnpm-owym **nie jest** wolniejszym pnpm-em: stawia
 * inne drzewo zależności niż to opisane w `pnpm-lock.yaml` — płaskie zamiast
 * ścisłego, z innymi wersjami przechodnimi. Projekt buduje się wtedy inaczej
 * niż u autora, a objawem bywa błąd w cudzej bibliotece, który wygląda na jej
 * usterkę.
 *
 * ## Dlaczego domysł jest oznaczony
 *
 * Brak pliku blokady nie znaczy „npm" — znaczy „nie wiadomo". Rozróżnienie
 * wychodzi na wierzch (`detected`), żeby interfejs mógł powiedzieć „zgaduję",
 * zamiast twierdzić coś, czego nie wie.
 */

export type PackageManagerId = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PackageManagerInfo {
    id: PackageManagerId;
    /** Nazwa pliku blokady. */
    lockfile: string;
    command: string;
}

/**
 * Kolejność ma znaczenie: po migracji z npm na pnpm stary `package-lock.json`
 * często zostaje w drzewie, a projekt jest już budowany pnpm-em.
 */
export const PACKAGE_MANAGERS: readonly PackageManagerInfo[] = [
    { id: 'pnpm', lockfile: 'pnpm-lock.yaml', command: 'pnpm' },
    { id: 'yarn', lockfile: 'yarn.lock', command: 'yarn' },
    { id: 'bun', lockfile: 'bun.lockb', command: 'bun' },
    { id: 'npm', lockfile: 'package-lock.json', command: 'npm' },
];

export interface DetectedManager extends PackageManagerInfo {
    /** `false` = domysł przy braku jakiejkolwiek wskazówki. */
    detected: boolean;
    /** Czy plik blokady jest obecny — decyduje o wariancie instalacji. */
    hasLockfile: boolean;
}

const byId = (id: PackageManagerId): PackageManagerInfo =>
    PACKAGE_MANAGERS.find((m) => m.id === id)!;

/**
 * Menedżer projektu.
 *
 * `packageManagerField` to wartość pola `packageManager` z `package.json`
 * (np. `pnpm@9.0.0`) — deklaracja autora, mocniejsza niż plik, który mógł
 * zostać po poprzednim narzędziu.
 */
export function detectPackageManager(
    files: readonly string[],
    packageManagerField?: string,
): DetectedManager {
    const names = new Set(files);
    const hasLock = (m: PackageManagerInfo): boolean => names.has(m.lockfile);

    const declared = packageManagerField?.split('@')[0]?.trim().toLowerCase();
    const fromField = PACKAGE_MANAGERS.find((m) => m.id === declared);
    if (fromField) return { ...fromField, detected: true, hasLockfile: hasLock(fromField) };

    const fromLock = PACKAGE_MANAGERS.find(hasLock);
    if (fromLock) return { ...fromLock, detected: true, hasLockfile: true };

    return { ...byId('npm'), detected: false, hasLockfile: false };
}

export interface CommandPlan {
    command: string;
    args: string[];
    /** Zdanie dla użytkownika, dlaczego akurat tak. */
    note?: string;
}

/**
 * Instalacja zależności.
 *
 * Przy obecnym pliku blokady wariant **powtarzalny**: instaluje dokładnie to,
 * co w blokadzie, i nie dopisuje do niej niczego. Zwykły `install` po cichu ją
 * aktualizuje, a zmiana wraca potem jako niezrozumiały diff w gicie — zwykle
 * u kogoś innego.
 */
export function installPlan(id: PackageManagerId, hasLockfile: boolean): CommandPlan {
    const command = byId(id).command;
    if (!hasLockfile) {
        return {
            command,
            args: id === 'npm' ? ['install', '--include=dev'] : ['install'],
            note: 'Brak pliku blokady — instalacja rozwiąże wersje od nowa.',
        };
    }
    const note = 'Plik blokady obecny — instaluję dokładnie z niego (bez jego zmiany).';
    switch (id) {
        case 'npm': return { command, args: ['ci'], note };
        case 'pnpm': return { command, args: ['install', '--frozen-lockfile'], note };
        case 'yarn': return { command, args: ['install', '--immutable'], note };
        case 'bun': return { command, args: ['install', '--frozen-lockfile'], note };
    }
}

/** Uruchomienie skryptu z `scripts`. */
export function runPlan(id: PackageManagerId, script: string): CommandPlan {
    const command = byId(id).command;
    // `yarn build` zamiast `yarn run build`: obie postacie działają, ale ta
    // pierwsza widnieje w dokumentacji projektów yarnowych, więc łatwiej
    // porównać to, co robi Drive, z tym, co użytkownik wpisuje w terminalu.
    return id === 'yarn'
        ? { command, args: [script] }
        : { command, args: ['run', script] };
}
