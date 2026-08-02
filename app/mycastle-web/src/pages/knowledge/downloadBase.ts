/**
 * downloadBase.ts — pobranie bazy wiedzy jako archiwum.
 *
 * Strony powstają w przeglądarce, z aktualnej treści dokumentów, więc archiwum
 * nigdy nie jest starsze niż baza. Bundel (`sci.js`, fonty składu wzorów) jest
 * artefaktem buildu i leży w `public/sci-runtime/` — dociągamy go stamtąd.
 *
 * Wynik jest tym samym, co daje eksport z linii poleceń: katalog, który da się
 * położyć na hostingu albo skopiować na dysk i otworzyć wprost z pliku.
 */
import JSZip from 'jszip';
import { planPack, type SourceDocument } from '@mhersztowski/sci-core';

/** Skąd aplikacja bierze bundel — katalog wypełniany przez `build:knowledge`. */
const RUNTIME = '/sci-runtime';

export interface BuildArchiveOptions {
  title?: string;
  /** Wstrzykiwany na potrzeby testów; domyślnie `fetch` przeglądarki. */
  fetcher?: typeof fetch;
}

export interface Archive {
  blob: Blob;
  filename: string;
}

/**
 * Składa archiwum z bazą.
 *
 * Rzuca, gdy czegokolwiek brakuje. Wydanie niekompletnego archiwum byłoby
 * gorsze niż błąd: wygląda na poprawne, a okazuje się listą akapitów bez
 * symulacji dopiero po rozpakowaniu.
 */
export async function buildArchive(
  documents: SourceDocument[],
  options: BuildArchiveOptions = {},
): Promise<Archive> {
  const { title = 'Baza wiedzy', fetcher = fetch } = options;

  const manifest = await fetcher(`${RUNTIME}/manifest.json`);
  if (!manifest.ok) {
    throw new Error(
      'Nie ma bundla bazy wiedzy — nie da się złożyć archiwum, które działa bez serwera. '
      + 'Zbuduj go poleceniem `pnpm --filter mycastle-web run build:knowledge`.',
    );
  }

  const { assets } = (await manifest.json()) as { assets: string[] };
  const plan = planPack(documents, assets, { title });
  if (plan.issues.length) throw new Error(plan.issues.join(' '));

  const zip = new JSZip();
  for (const entry of plan.entries) {
    if (entry.kind === 'text') {
      zip.file(entry.path, entry.content!);
      continue;
    }

    const response = await fetcher(`${RUNTIME}/${entry.path}`);
    // Nazwa pliku w komunikacie, bo „nie udało się pobrać zasobu" nie mówi,
    // czy zabrakło fontu (wzory brzydsze) czy bundla (strona martwa).
    if (!response.ok) throw new Error(`Nie udało się pobrać ${entry.path} (${response.status}).`);
    zip.file(entry.path, await response.blob());
  }

  return {
    blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }),
    filename: plan.filename,
  };
}

/** Podaje archiwum przeglądarce jako pobranie. */
export function saveArchive({ blob, filename }: Archive): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Bez zwolnienia blob zostaje w pamięci do końca życia karty, a baza waży
  // kilka megabajtów.
  URL.revokeObjectURL(url);
}
