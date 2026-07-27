/**
 * Kopiowanie rozszerzenia Quarto do VFS, obok dokumentów `.qmd`.
 *
 * Źródłem są pliki z repo (`quarto/_extensions/rysik/`) wczytywane jako tekst —
 * jedno źródło prawdy dla wersji w repozytorium i tej wgranej na serwer.
 * Runtime JS powstaje z tego samego kodu co edytor: `pnpm --filter cad-app
 * build:rysik-runtime`.
 */

import extensionYml from '../../../quarto/_extensions/rysik/_extension.yml?raw';
import filterLua from '../../../quarto/_extensions/rysik/rysik.lua?raw';
import runtimeCss from '../../../quarto/_extensions/rysik/resources/rysik.css?raw';
import { getCurrentUserId, createDirectory, vfsWriteFileBin } from '../../vfs/cadProjectApi';

const encoder = new TextEncoder();

export async function writeQuartoExtension(userId = getCurrentUserId()): Promise<string> {
  const base = `users/${userId}/rysik/_extensions/rysik`;
  await createDirectory(`${base}/resources`);

  const files: [string, string][] = [
    [`${base}/_extension.yml`, extensionYml],
    [`${base}/rysik.lua`, filterLua],
    [`${base}/resources/rysik.css`, runtimeCss],
  ];

  for (const [path, text] of files) {
    await vfsWriteFileBin(path, encoder.encode(text));
  }
  return base;
}
