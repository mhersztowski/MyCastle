/**
 * Dostęp do dokumentów `.qmd` w VFS backendu CAD-a. Pliki leżą w
 * `users/{userId}/rysik/` — ta sama przestrzeń, z której korzystają
 * pozostałe tryby aplikacji.
 */

import {
  createDirectory,
  deleteFileAt,
  getCurrentUserId,
  listDirectory,
  readFileAt,
  writeFileAt,
} from '../vfs/cadProjectApi';

export const QMD_EXT = '.qmd';

export function rysikDir(userId = getCurrentUserId()): string {
  return `users/${userId}/rysik`;
}

export async function listRysikDocs(): Promise<string[]> {
  const listing = await listDirectory(rysikDir(), QMD_EXT);
  return listing.files.map(f => f.name);
}

export async function readRysikDoc(name: string): Promise<string> {
  return readFileAt(rysikDir(), name, QMD_EXT);
}

export async function writeRysikDoc(name: string, text: string): Promise<void> {
  await createDirectory(rysikDir());
  await writeFileAt(rysikDir(), name, QMD_EXT, text);
}

export async function deleteRysikDoc(name: string): Promise<void> {
  await deleteFileAt(rysikDir(), name, QMD_EXT);
}

/** Zrzuty scen trafiają obok dokumentu — ścieżka względna, nigdy base64 w pliku. */
export function snapshotPath(docName: string, blockLabel: string): string {
  return `_scenes/${docName}-${blockLabel}.png`;
}
