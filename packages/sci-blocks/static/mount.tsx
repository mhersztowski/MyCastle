/**
 * mount.tsx — punkt wejścia wyeksportowanej bazy wiedzy.
 *
 * Strona statyczna niesie markdown w `<script type="application/json">`, a ten
 * plik zamienia go w to samo, co widać w aplikacji: `ReaderView` z żywymi
 * blokami. Dzięki temu eksport nie jest zrzutem — czytelnik rusza suwakiem i
 * model liczy się u niego, z tych samych wzorów.
 *
 * Skrypt obsługuje obie strony jednym bundlem: dokument (`#sci-document`) i
 * katalog (`#sci-index`). Rozdzielanie ich na dwa pliki oznaczałoby dwa razy
 * Reacta i sci-core na dysku.
 */
import { createRoot } from 'react-dom/client';
import { buildIndex, pagePath } from '@mhersztowski/sci-core';
import { KnowledgeCatalog } from '../src/KnowledgeCatalog';
import { ReaderView } from '../src/ReaderView';
import 'katex/dist/katex.min.css';

/**
 * Worker liczy modele poza wątkiem interfejsu — tak samo jak w aplikacji.
 *
 * `?worker&inline` wkleja go do bundla jako blob zamiast osobnego pliku. To
 * kosztuje kilkaset kilobajtów w `sci.js`, ale pozwala otworzyć bazę wprost z
 * dysku (`file://`), gdzie osobny plik workera zostałby zablokowany przez CORS.
 */
import ModelWorker from './modelWorker?worker&inline';

const createModelWorker = () => new ModelWorker();

function osadzone<T>(id: string): T | undefined {
  const element = document.getElementById(id);
  if (!element?.textContent) return undefined;
  try {
    return JSON.parse(element.textContent) as T;
  } catch {
    // Uszkodzone osadzenie znaczy, że strona jest zepsuta — ale treść w
    // `<noscript>` zostaje, więc lepiej nic nie robić niż wyczyścić kontener.
    return undefined;
  }
}

const root = document.getElementById('sci-root');
const dokument = osadzone<{ path: string; markdown: string }>('sci-document');
const katalog = osadzone<{ documents: Array<{ path: string; markdown: string }> }>('sci-index');

if (root && dokument) {
  createRoot(root).render(
    <ReaderView markdown={dokument.markdown} workerFactory={createModelWorker} />,
  );
} else if (root && katalog) {
  // Katalog liczy się z tych samych dokumentów co w aplikacji, więc dostajemy
  // wyszukiwarkę, graf wiedzy i kolejność nauki bez pisania ich drugi raz.
  // Lista linków w HTML-u zostaje jako wersja dla czytelnika bez JS.
  const index = buildIndex(katalog.documents);
  const bodies = Object.fromEntries(katalog.documents.map((d) => [d.path, d.markdown]));

  createRoot(root).render(
    <KnowledgeCatalog
      index={index}
      bodies={bodies}
      onOpen={(path) => { window.location.href = pagePath(path); }}
    />,
  );
}
