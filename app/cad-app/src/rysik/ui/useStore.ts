import { useEffect, useState } from 'react';
import type { RysikStore } from '../store';

/**
 * Rerender przy każdej zmianie dokumentu. Panel czyta model bezpośrednio —
 * store jest jedynym źródłem prawdy, więc nie duplikujemy stanu w Reakcie.
 */
export function useStoreRevision(store: RysikStore): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => store.subscribe(() => setRevision(r => r + 1)), [store]);
  return revision;
}
