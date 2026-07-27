import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RysikStore } from '../store';
import { createBlock, emptyDoc, createChild } from '../serialize';
import { terrainManifest } from '../blocks/terrain.manifest';
import { literal, ref } from '../props';
import type { BlockNode, RysikDoc } from '../types';

function docWithBlock(): { doc: RysikDoc; block: BlockNode } {
  const block = createBlock(terrainManifest);
  const doc: RysikDoc = {
    frontmatter: '',
    segments: [{ kind: 'block', block }],
    vars: [{ name: 'azimuth', value: 210, min: 0, max: 360, step: 1 }],
  };
  return { doc, block };
}

describe('transakcje', () => {
  let store: RysikStore;
  let block: BlockNode;

  beforeEach(() => {
    const built = docWithBlock();
    store = new RysikStore(built.doc);
    block = built.block;
  });

  it('przeciągnięcie suwaka to jeden wpis historii', () => {
    store.beginTransaction('Przewyższenie');
    for (let i = 0; i < 200; i++) {
      store.set(['blocks', block.uid, 'props', 'exaggeration'], literal(1.5 + i * 0.01));
    }
    store.commit();

    expect(store.history).toHaveLength(1);
    expect(block.props.exaggeration).toEqual(literal(1.5 + 199 * 0.01));

    store.undo();
    expect(block.props.exaggeration).toEqual(literal(1.5));
    expect(store.canRedo).toBe(true);
  });

  it('scena widzi zmiany w trakcie transakcji, historia dopiero po commit', () => {
    const seen: unknown[] = [];
    store.subscribe(ops => seen.push(...ops));

    store.beginTransaction('Azymut');
    store.set(['blocks', block.uid, 'props', 'sunAzimuth'], literal(200));
    expect(seen).toHaveLength(1);            // scena dostała apply()
    expect(store.history).toHaveLength(0);   // dokument jeszcze nie zapisany w historii
    store.commit();
    expect(store.history).toHaveLength(1);
  });

  it('rollback przywraca stan sprzed transakcji', () => {
    store.beginTransaction('Próba');
    store.set(['blocks', block.uid, 'props', 'palette'], literal('viridis'));
    store.rollback();
    expect(block.props.palette).toEqual(literal('hypsometric'));
    expect(store.history).toHaveLength(0);
  });

  it('pusta transakcja nie zaśmieca historii', () => {
    store.beginTransaction('Nic');
    store.set(['blocks', block.uid, 'props', 'exaggeration'], literal(1.5));  // ta sama wartość
    store.commit();
    expect(store.history).toHaveLength(0);
  });

  it('zmiana poza transakcją tworzy własny wpis', () => {
    store.set(['blocks', block.uid, 'props', 'wireframe'], literal(true), 'Siatka');
    expect(store.history).toHaveLength(1);
    expect(store.undoLabel).toBe('Siatka');
  });
});

describe('undo/redo', () => {
  it('cofa i ponawia w obie strony', () => {
    const { doc, block } = docWithBlock();
    const store = new RysikStore(doc);

    store.set(['blocks', block.uid, 'props', 'palette'], literal('viridis'), 'Paleta');
    store.set(['blocks', block.uid, 'props', 'showContours'], literal(true), 'Warstwice');

    store.undo();
    expect(block.props.showContours).toEqual(literal(false));
    store.undo();
    expect(block.props.palette).toEqual(literal('hypsometric'));
    expect(store.canUndo).toBe(false);

    store.redo();
    expect(block.props.palette).toEqual(literal('viridis'));
    store.redo();
    expect(block.props.showContours).toEqual(literal(true));
    expect(store.canRedo).toBe(false);
  });

  it('nowa zmiana kasuje gałąź redo', () => {
    const { doc, block } = docWithBlock();
    const store = new RysikStore(doc);
    store.set(['blocks', block.uid, 'props', 'palette'], literal('viridis'));
    store.undo();
    expect(store.canRedo).toBe(true);
    store.set(['blocks', block.uid, 'props', 'wireframe'], literal(true));
    expect(store.canRedo).toBe(false);
  });
});

describe('ścieżki mutacji', () => {
  it('gizmo i panel zmieniają tę samą wartość tą samą drogą', () => {
    const { doc, block } = docWithBlock();
    const store = new RysikStore(doc);
    const path = ['blocks', block.uid, 'props', 'sunAzimuth'];

    // Panel: wpisanie liczby.
    store.beginTransaction('Azymut Słońca');
    store.set(path, literal(120));
    store.commit();

    // Gizmo: przeciągnięcie słońca w scenie.
    store.beginTransaction('Azymut Słońca');
    store.set(path, literal(121));
    store.set(path, literal(133));
    store.commit();

    expect(store.history.map(h => h.label)).toEqual(['Azymut Słońca', 'Azymut Słońca']);
    store.undo();
    expect(block.props.sunAzimuth).toEqual(literal(120));
  });

  it('obsługuje właściwości dzieci, etykiety i zmienne dokumentu', () => {
    const { doc, block } = docWithBlock();
    const child = createChild(terrainManifest.children!.markers, 'barania');
    block.children.markers = [child];
    const store = new RysikStore(doc);

    store.set(['blocks', block.uid, 'children', 'markers', 'barania', 'props', 'lon'], literal(19.0025));
    store.set(['blocks', block.uid, 'label'], 'fig-wisla');
    store.set(['vars', 'azimuth', 'value'], 42);

    expect(child.props.lon).toEqual(literal(19.0025));
    expect(block.label).toBe('fig-wisla');
    expect(doc.vars[0].value).toBe(42);

    store.undo();
    expect(doc.vars[0].value).toBe(210);
  });

  it('zapisuje wiązanie do zmiennej jako wartość właściwości', () => {
    const { doc, block } = docWithBlock();
    const store = new RysikStore(doc);
    store.set(['blocks', block.uid, 'props', 'sunAzimuth'], ref('azimuth'), 'Wiązanie');
    expect(block.props.sunAzimuth).toEqual({ src: 'ref', name: 'azimuth' });
    store.undo();
    expect(block.props.sunAzimuth).toEqual(literal(180));
  });
});

describe('cykl życia dokumentu', () => {
  it('podmiana dokumentu czyści historię i powiadamia', () => {
    const { doc, block } = docWithBlock();
    const store = new RysikStore(doc);
    const cb = vi.fn();
    store.subscribe(cb);
    store.set(['blocks', block.uid, 'props', 'wireframe'], literal(true));
    store.replaceDoc(emptyDoc());
    expect(store.canUndo).toBe(false);
    expect(cb).toHaveBeenCalled();
  });
});
