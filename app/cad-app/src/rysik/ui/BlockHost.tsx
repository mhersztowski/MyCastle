/**
 * Host sceny: montuje implementację bloku, karmi ją rozwiązanymi wartościami
 * i tłumaczy zdarzenia sceny na transakcje dokumentu.
 *
 * To tutaj pilnujemy dwóch niepodlegających negocjacji reguł: scena nie
 * dotyka dokumentu (wszystko idzie przez store), a `apply()` dostaje wyłącznie
 * te klucze, które faktycznie się zmieniły.
 */

import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { createSceneBlock } from '../blocks/factories';
import { getManifest } from '../blocks/registry';
import { coerceValue, literal, resolveProps, varsToScope } from '../props';
import type { PropChangedEvent, ResolvedChild, SceneBlock, SceneProps } from '../blocks/SceneBlock';
import type { RysikStore, Path } from '../store';
import type { BlockNode, Primitive } from '../types';

interface Props {
  store: RysikStore;
  block: BlockNode;
  selection: string | null;
  onSelect: (id: string | null) => void;
  onPick?: (payload: Record<string, Primitive>) => void;
  /** Dostęp do żywej sceny — potrzebny do snapshotu i zapisu kamery. */
  sceneRef?: React.MutableRefObject<SceneBlock | null>;
}

export function BlockHost({ store, block, selection, onSelect, onPick, sceneRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneInstance = useRef<SceneBlock | null>(null);
  const lastProps = useRef<SceneProps>({});
  const lastChildren = useRef<Record<string, string>>({});

  // Callbacki trzymane w refach, żeby remount sceny zależał tylko od bloku.
  const handlers = useRef({ onSelect, onPick });
  handlers.current = { onSelect, onPick };

  useEffect(() => {
    const host = hostRef.current;
    const manifest = getManifest(block.type);
    if (!host || !manifest) return;

    const scene = createSceneBlock(block.type);
    if (!scene) return;
    sceneInstance.current = scene;
    if (sceneRef) sceneRef.current = scene;

    const scope = varsToScope(store.getDoc().vars);
    const initial = resolveProps(manifest.props, block.props, scope);
    scene.mount(host, initial);
    lastProps.current = initial;

    lastChildren.current = {};
    for (const [collection, spec] of Object.entries(manifest.children ?? {})) {
      const items: ResolvedChild[] = (block.children[collection] ?? []).map(child => ({
        id: child.id,
        kind: spec.kind,
        props: resolveProps(spec.props, child.props, scope),
      }));
      scene.setChildren(collection, items);
      lastChildren.current[collection] = JSON.stringify(items);
    }
    scene.select(selection);

    const unsubs = [
      scene.on('propChanged', e => applySceneChange(store, block, e)),
      scene.on('selectionRequest', e => handlers.current.onSelect(e.id)),
      scene.on('pick', payload => handlers.current.onPick?.(payload)),
    ];

    return () => {
      unsubs.forEach(u => u());
      scene.dispose();
      sceneInstance.current = null;
      if (sceneRef) sceneRef.current = null;
    };
    // Scena przeżywa zmiany właściwości — remount tylko przy zmianie bloku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.uid, block.type]);

  // Przyrostowy apply — wysyłamy wyłącznie klucze, które naprawdę się zmieniły.
  useEffect(() => {
    const sync = (): void => {
      const scene = sceneInstance.current;
      const manifest = getManifest(block.type);
      if (!scene || !manifest) return;

      const scope = varsToScope(store.getDoc().vars);
      const next = resolveProps(manifest.props, block.props, scope);
      const patch: Partial<SceneProps> = {};
      for (const [key, value] of Object.entries(next)) {
        if (lastProps.current[key] !== value) patch[key] = value;
      }
      if (Object.keys(patch).length > 0) {
        scene.apply(patch);
        lastProps.current = next;
      }

      for (const [collection, spec] of Object.entries(manifest.children ?? {})) {
        const items: ResolvedChild[] = (block.children[collection] ?? []).map(child => ({
          id: child.id,
          kind: spec.kind,
          props: resolveProps(spec.props, child.props, scope),
        }));
        const signature = JSON.stringify(items);
        if (lastChildren.current[collection] !== signature) {
          scene.setChildren(collection, items);
          lastChildren.current[collection] = signature;
        }
      }
    };

    sync();
    return store.subscribe(sync);
  }, [store, block]);

  useEffect(() => {
    sceneInstance.current?.select(selection);
  }, [selection]);

  return <Box ref={hostRef} sx={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }} />;
}

/**
 * Zdarzenie ze sceny → transakcja dokumentu. Gizmo przechodzi dokładnie tą
 * samą drogą co pole panelu, więc undo i serializacja działają identycznie.
 */
function applySceneChange(store: RysikStore, block: BlockNode, e: PropChangedEvent): void {
  const manifest = getManifest(block.type);
  if (!manifest) return;

  const parts = e.path.split('/');
  let path: Path;
  let value: Primitive;

  if (parts.length === 1) {
    const spec = manifest.props[parts[0]];
    if (!spec) return;
    path = ['blocks', block.uid, 'props', parts[0]];
    value = coerceValue(spec, e.value);
  } else {
    const [collection, childId, key] = parts;
    const childSpec = manifest.children?.[collection]?.props[key];
    if (!childSpec) return;
    path = ['blocks', block.uid, 'children', collection, childId, 'props', key];
    value = coerceValue(childSpec, e.value);
  }

  switch (e.phase) {
    case 'begin':
      store.beginTransaction(e.label ?? 'Zmiana w scenie');
      break;
    case 'change':
      store.set(path, literal(value));
      break;
    case 'end':
      store.commit();
      break;
  }
}
