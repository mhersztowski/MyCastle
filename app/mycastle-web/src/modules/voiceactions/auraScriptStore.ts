/**
 * Odczyt i zapis skryptów akcji głosowych w `drive/automate/aura/`.
 *
 * Skrypt jest zwykłym plikiem markdown z jednym blokiem ```automate``` — tym
 * samym, który obsługuje edytor notatek. Dzięki temu tę samą logikę można
 * otworzyć i uruchomić z Drive, a Aura czyta ją bez żadnej konwersji.
 */

import { readUserFileText, writeUserFileText } from '../../services/userJson';
import {
  buildAuraScriptFile,
  parseAuraScriptFile,
  starterAuraScript,
  type AuraScriptFile,
} from './auraScriptFile';

/** Ścieżki wariantów są względne do drive — tu doklejamy prefiks katalogu. */
const drivePath = (scriptPath: string): string => `drive/${scriptPath.replace(/^\/+/, '')}`;

/** Zwraca `null`, gdy pliku jeszcze nie ma (wariant dopiero co przełączony). */
export async function readAuraScript(userName: string, scriptPath: string): Promise<AuraScriptFile | null> {
  const text = await readUserFileText(userName, drivePath(scriptPath));
  if (text === null) return null;
  return parseAuraScriptFile(text);
}

export async function writeAuraScript(
  userName: string,
  scriptPath: string,
  file: AuraScriptFile,
): Promise<void> {
  await writeUserFileText(userName, drivePath(scriptPath), buildAuraScriptFile(file));
}

// ── API neutralne — ten sam format czyta blok ```automate``` w notatce ───────

/** Odczyt dowolnego pliku `.automate` z drive (ścieżka względem `drive/`). */
export const readAutomateFile = readAuraScript;
/** Zapis dowolnego pliku `.automate` do drive (ścieżka względem `drive/`). */
export const writeAutomateFile = writeAuraScript;

/**
 * Wczytuje skrypt, a przy pierwszym użyciu zakłada plik ze szkieletem —
 * użytkownik po przełączeniu trybu od razu ma co edytować i uruchomić.
 */
export async function ensureAuraScript(
  userName: string,
  scriptPath: string,
  actionName: string,
  language: string,
): Promise<AuraScriptFile> {
  const existing = await readAuraScript(userName, scriptPath);
  if (existing) return existing;
  const starter = starterAuraScript(actionName, language);
  await writeAuraScript(userName, scriptPath, starter);
  return starter;
}
