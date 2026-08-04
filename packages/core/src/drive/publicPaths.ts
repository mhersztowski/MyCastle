/**
 * publicPaths.ts — które katalogi Drive są dostępne bez logowania.
 *
 * Reguła mieszkała dotąd w dwóch miejscach naraz: backend sprawdzał, czy
 * ścieżka zaczyna się od `drive/public`, a strona Drive miała własną kopię tego
 * samego warunku. Póki katalog był jeden, rozjazd nie miał jak wyjść na jaw —
 * przy trzech wyszedłby przy pierwszym: backend serwowałby plik, którego UI nie
 * oznaczyłoby jako publicznego, albo UI pokazałoby link prowadzący do 403.
 *
 * Stąd jedno źródło prawdy, używane przez obie strony.
 *
 * **To jest decyzja o widoczności danych.** Wszystko, co leży w wymienionych
 * katalogach, może przeczytać każdy, kto zna adres — bez konta i bez hasła.
 * Katalog `git` niesie repozytoria razem z historią, a `knowledge` bazę wiedzy;
 * jedno i drugie bywa publikowane celowo, ale prywatnych notatek nie wolno tam
 * kłaść.
 */

/**
 * Katalogi Drive serwowane publicznie.
 *
 * Lista jest jawna i krótka celowo: każdy wpis to zgoda na czytanie bez
 * uwierzytelnienia, więc dopisanie kolejnego ma wymagać świadomej decyzji,
 * a nie wpadnięcia pod regułę.
 */
export const PUBLIC_DRIVE_DIRS = ['public', 'knowledge', 'git'] as const;

export type PublicDriveDir = typeof PUBLIC_DRIVE_DIRS[number];

/** Ścieżka względem `drive/`, znormalizowana do porównań. */
function normalizuj(relPath: string): string {
  return relPath.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Który katalog publiczny obejmuje tę ścieżkę; `undefined`, gdy żaden.
 *
 * Odrzucamy ścieżki z `..` **przed** dopasowaniem katalogu: `public/../tajne`
 * zaczyna się poprawnie, a wskazuje poza obszar publiczny. Rozstrzyganie tego
 * dopiero przy odczycie pliku zostawiałoby regułę w dwóch miejscach — a to jest
 * dokładnie ten podział, którego ten moduł ma nie dopuścić.
 */
export function publicDriveRoot(relPath: string): PublicDriveDir | undefined {
  const sciezka = normalizuj(relPath);
  if (!sciezka || sciezka.split('/').includes('..')) return undefined;

  return PUBLIC_DRIVE_DIRS.find(
    // Ukośnik jest istotny: `publiczne-notatki` zaczyna się od „public",
    // a nie ma z nim nic wspólnego.
    (dir) => sciezka === dir || sciezka.startsWith(`${dir}/`),
  );
}

/** Czy ścieżka względem `drive/` leży w obszarze publicznym. */
export function isPublicDrivePath(relPath: string): boolean {
  return publicDriveRoot(relPath) !== undefined;
}

/**
 * Adres, pod którym plik jest dostępny bez logowania.
 *
 * `undefined` dla ścieżek spoza obszaru publicznego — link do pliku, którego
 * serwer i tak nie wyda, jest gorszy niż brak przycisku: wygląda jak działający.
 */
export function publicDriveUrl(
  origin: string,
  userName: string,
  relPath: string,
): string | undefined {
  if (!isPublicDrivePath(relPath)) return undefined;

  const sciezka = normalizuj(relPath).split('/').map(encodeURIComponent).join('/');
  return `${origin.replace(/\/+$/, '')}/public/drive/users/${encodeURIComponent(userName)}/${sciezka}`;
}
