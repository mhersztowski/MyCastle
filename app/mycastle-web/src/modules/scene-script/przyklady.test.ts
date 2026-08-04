/**
 * Przykłady z dokumentacji, uruchomione naprawdę.
 *
 * Przykład, którego nikt nie wykonał, jest obietnicą bez pokrycia: nazwa metody
 * zmienia się przy pierwszej poprawce, a w dokumentacji zostaje stara. Te testy
 * wykonują dokładnie ten kod, który pokazujemy użytkownikowi.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, GroupNode, MeshNode, SceneSerializer } from '@mhersztowski/core-scene3d';
import { Scene, setSceneHost, isNode3D } from './index';

const pliki = new Map<string, string>();

const SCENA = (() => {
  const graph = new SceneGraph();
  const dom = new GroupNode({ id: 'dom', name: 'Dom' });
  graph.addNode(dom);
  graph.addNode(new MeshNode({ id: 'sc1', name: 'Sciana', position: [0, 0, 0] }), 'dom');
  graph.addNode(new MeshNode({ id: 'sc2', name: 'Dach', position: [0, 3, 0] }), 'dom');
  return SceneSerializer.serialize(graph);
})();

beforeEach(() => {
  pliki.clear();
  pliki.set('drive/projekty/dom.scene.json', SCENA);
  setSceneHost({
    readFile: async (p) => pliki.get(p) ?? null,
    writeFile: async (p, c) => { pliki.set(p, c); },
  });
});

describe('przykład: podnieś wszystko o metr', () => {
  it('działa dokładnie tak, jak napisano w dokumentacji', async () => {
    const scena = await Scene.load('drive/projekty/dom.scene.json');

    for (const node of scena.getAllNodes()) {
      if (!isNode3D(node)) continue;
      const { position } = node.getTransform();
      node.setTransform({ position: [position[0], position[1] + 1, position[2]] });
    }

    await Scene.save('drive/projekty/dom-podniesiony.scene.json', scena);

    const po = await Scene.load('drive/projekty/dom-podniesiony.scene.json', { silent: true });
    const dach = po.getNode('Dom/Dach');
    expect(dach).not.toBeNull();
    expect(isNode3D(dach!) && dach!.getTransform().position).toEqual([0, 4, 0]);
  });
});

describe('przykład: zestawienie obiektów', () => {
  it('liczy obiekty po rodzaju', async () => {
    const scena = await Scene.load('drive/projekty/dom.scene.json', { silent: true });

    const ile = new Map<string, number>();
    for (const node of scena.getAllNodes()) {
      const typ = node.getData().type;
      ile.set(typ, (ile.get(typ) ?? 0) + 1);
    }

    expect(ile.get('mesh')).toBe(2);
    expect(ile.get('group')).toBe(1);
  });
});

describe('przykład: dołóż obiekt i zapisz', () => {
  it('nowy węzeł trafia pod wskazanego rodzica', async () => {
    const scena = await Scene.load('drive/projekty/dom.scene.json', { silent: true });

    const dom = scena.getNode('Dom')!;
    const komin = scena.nodeCreate({ type: 'mesh', name: 'Komin' }, dom)!;
    if (isNode3D(komin)) komin.setTransform({ position: [1, 4, 0] });

    await Scene.save('drive/projekty/dom.scene.json', scena);

    const po = await Scene.load('drive/projekty/dom.scene.json', { silent: true });
    expect(po.getNode('Dom/Komin')).not.toBeNull();
  });
});

describe('przykład: znajdź po nazwie i ukryj', () => {
  it('`find` z warunkiem działa na nazwie', async () => {
    const scena = await Scene.load('drive/projekty/dom.scene.json', { silent: true });

    const dachy = scena.find((n) => n.getName().startsWith('Dach'));
    expect(dachy).toHaveLength(1);

    for (const node of dachy) if (isNode3D(node)) node.setVisible(false);
    expect(isNode3D(dachy[0]) && dachy[0].getVisible()).toBe(false);
  });
});

describe('przykład: rysunek CAD', () => {
  it('nowa linia trafia na warstwę i da się ją odczytać', async () => {
    const rysunek = Scene.create('cad', { silent: true });

    const linia = rysunek.nodeCreate({
      type: 'line',
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 },
    })!;

    expect(linia.getParent()).not.toBeNull();
    expect(rysunek.getLayers()).toHaveLength(1);
    expect(linia.getData().end).toEqual({ x: 100, y: 0 });

    await Scene.save('drive/projekty/plan.cad.json', rysunek);
    const po = await Scene.load('drive/projekty/plan.cad.json', { silent: true });
    expect(po.getAllNodes().some((n) => n.getData().type === 'line')).toBe(true);
  });
});
