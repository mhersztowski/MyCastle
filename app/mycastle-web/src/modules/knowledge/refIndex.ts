/**
 * refIndex — rozwiązywanie odsyłaczy `((id))` poza stroną bazy wiedzy.
 *
 * Edytor Markdown otwiera dokumenty z całego Drive, a odsyłacz do hasła może
 * paść w dowolnej notatce. Cel rozwiązujemy więc przez **indeks całej bazy**,
 * budowany tak samo jak na stronie bazy — tyle że **leniwie i raz**: dokument
 * z odsyłaczem bywa otwierany bez potrzeby wchodzenia do bazy, więc skan
 * katalogu nie ma prawa dziać się przy montowaniu edytora.
 *
 * Wynik jest zapamiętany w module. Świadomie **bez unieważniania po czasie**:
 * baza zmienia się wtedy, gdy ktoś ją edytuje, a wtedy i tak przeładowuje
 * stronę. Jawne `resetKnowledgeIndex()` jest dla tego, kto wie lepiej.
 */
import {
  buildIndex, resolveReference, type KnowledgeIndex, type ReferenceKind,
} from '@mhersztowski/sci-core';
import { mqttClient } from '../mqttclient';
import { ROOT, collectMarkdown, relativeToRoot } from '../../pages/knowledge/knowledgeFiles';

export interface RozwiazanyOdsylacz {
  /** Treść bloku celu — z niej powstaje dymek. */
  code?: string;
  kind?: ReferenceKind;
  /** Ścieżka dokumentu w bazie, względem katalogu `knowledge/`. */
  path: string;
  documentTitle?: string;
}

let wczytywanie: Promise<{ index: KnowledgeIndex; bodies: Record<string, string> }> | undefined;

async function wczytajBaze() {
  const tree = await mqttClient.listDirectory(ROOT);
  const bodies: Record<string, string> = {};

  for (const path of collectMarkdown(tree)) {
    const file = await mqttClient.readFile(path);
    if (file?.content) bodies[relativeToRoot(path)] = file.content;
  }

  const index = buildIndex(Object.entries(bodies).map(([path, markdown]) => ({ path, markdown })));
  return { index, bodies };
}

/** Indeks bazy; kolejne wywołania dostają tę samą obietnicę. */
export function knowledgeIndex() {
  // Nieudany odczyt nie może zablokować kolejnych prób — inaczej jeden błąd
  // sieci wyłączałby odsyłacze do końca sesji.
  if (!wczytywanie) {
    wczytywanie = wczytajBaze().catch((e) => { wczytywanie = undefined; throw e; });
  }
  return wczytywanie;
}

export function resetKnowledgeIndex() {
  wczytywanie = undefined;
}

/**
 * Znajduje cel odsyłacza i wycina treść jego bloku.
 *
 * `undefined` znaczy „nie ma takiego identyfikatora w bazie" — i to jest
 * informacja dla autora, nie awaria: odsyłacz w próżnię ma być widoczny.
 */
export async function resolveKnowledgeRef(id: string): Promise<RozwiazanyOdsylacz | undefined> {
  let baza;
  try {
    baza = await knowledgeIndex();
  } catch {
    return undefined;
  }

  const { index, bodies } = baza;
  const cel = resolveReference(id, {
    anchors: index.anchors,
    formulaHome: index.formulaHome,
    termHome: index.termHome,
    documentTitles: new Map(index.documents.map((d) => [d.path, d.meta.title ?? d.path])),
  }, '');
  if (!cel.found || !cel.path) return undefined;

  // Paragraf nie ma bloku — jego celem jest cały dokument.
  const rodzaj = cel.kind ?? 'formula';
  // Ogrodzenie zakotwiczone na początku wiersza — tak samo jak w indeksie,
  // żeby przykład wcięty w dokumentacji nie udawał prawdziwego bloku.
  const fence = new RegExp(`^ {0,3}\`\`\`${rodzaj}:${id}\\n([\\s\\S]*?)\`\`\``, 'm');

  return {
    code: rodzaj === 'section' ? undefined : fence.exec(bodies[cel.path] ?? '')?.[1],
    kind: cel.kind,
    path: cel.path,
    documentTitle: cel.documentTitle,
  };
}
