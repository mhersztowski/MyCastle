/**
 * progressStore.ts — postępy nauki w VFS.
 *
 * Wyniki zadań zapisujemy obok bazy, a nie w `localStorage`: mają przetrwać
 * wyczyszczenie przeglądarki i pojawić się na drugim urządzeniu. Plik leży w
 * katalogu bazy, więc kopia bazy niesie ze sobą historię nauki.
 *
 * Cała logika odstępów mieszka w `sci-core`; tutaj jest tylko odczyt i zapis
 * plus jedna reguła: **awaria zapisu nie może przerwać nauki**. Zadania działają
 * bez serwera, a postęp, którego nie udało się utrwalić, zostaje w pamięci
 * karty — to lepsze niż wyrzucenie czytelnika z lekcji komunikatem o błędzie.
 */
import { emptyProgress, type Progress } from '@mhersztowski/sci-core';
import { ROOT } from './knowledgeFiles';

export const PROGRESS_PATH = `${ROOT}/.postepy.json`;

/** Minimalny kontrakt VFS — tyle, ile ten moduł naprawdę potrzebuje. */
export interface ProgressVfs {
  readFile(path: string): Promise<{ content?: string } | null>;
  writeFile(path: string, content: string): Promise<unknown>;
}

/**
 * Wczytuje postępy.
 *
 * Każdy problem — brak pliku, uszkodzona treść, nieznana wersja formatu —
 * kończy się czystym kontem. Nauka ma ruszyć, a nie stanąć na komunikacie.
 */
export async function loadProgress(vfs: ProgressVfs): Promise<Progress> {
  try {
    const plik = await vfs.readFile(PROGRESS_PATH);
    if (!plik?.content) return emptyProgress();

    const dane = JSON.parse(plik.content) as Progress;
    // Nieznana wersja: odczyt „na ślepo" zgubiłby nieznane pola przy pierwszym
    // zapisie, a to gorsze niż zaczęcie od zera.
    if (dane?.version !== 1 || typeof dane.items !== 'object') return emptyProgress();

    return dane;
  } catch {
    return emptyProgress();
  }
}

/** Zapisuje postępy; awaria jest połykana świadomie (patrz nagłówek pliku). */
export async function saveProgress(vfs: ProgressVfs, progress: Progress): Promise<void> {
  try {
    await vfs.writeFile(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } catch {
    // Bez ponawiania: następna rozwiązana odpowiedź zapisze cały stan od nowa,
    // więc utracony zapis nadrabia się sam.
  }
}
