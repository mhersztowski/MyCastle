/**
 * knowledgeFiles.ts — odczyt bazy wiedzy z drzewa katalogów.
 *
 * Osobno od strony, bo to czysta logika: żadnego Reacta, MQTT ani Monaco.
 * Dzięki temu da się ją sprawdzić testem, a strona zostaje cienka.
 */
import type { DirectoryTree } from '@mhersztowski/core';

/** Nazwa katalogu bazy, widziana z poziomu Drive. */
export const ROOT_LABEL = 'knowledge';

/**
 * Katalog bazy — ścieżka względem katalogu użytkownika.
 *
 * VFS liczy ścieżki od `Minis/Users/{user}`, a Drive mieszka w podkatalogu
 * `drive/`. Bez tego przedrostka trafialiśmy o poziom wyżej niż wszystko, co
 * użytkownik widzi w Drive.
 */
export const ROOT = `drive/${ROOT_LABEL}`;

/**
 * Zbiera ścieżki plików `.md` z drzewa.
 *
 * Rekurencyjnie, bo układ z raportu to `knowledge/{dziedzina}/{temat}.md`, a
 * płaskie wyliczenie zgubiłoby wszystko poza pierwszym poziomem.
 */
export function collectMarkdown(tree: DirectoryTree): string[] {
  if (tree.type === 'file') return tree.name.toLowerCase().endsWith('.md') ? [tree.path] : [];
  return (tree.children ?? []).flatMap(collectMarkdown);
}

/**
 * Ścieżka względem katalogu bazy.
 *
 * Odcinamy wszystko do `knowledge/` włącznie, bez zakładania, gdzie dokładnie
 * baza jest zamontowana — ten sam dokument ma mieć ten sam identyfikator
 * niezależnie od tego, czy przyszedł z Drive, czy z eksportu. Inaczej
 * prerekwizyty przestałyby się zgadzać po przeniesieniu katalogu.
 */
export function relativeToRoot(path: string): string {
  const marker = `${ROOT_LABEL}/`;
  const at = path.lastIndexOf(marker);
  return at < 0 ? path : path.slice(at + marker.length);
}
