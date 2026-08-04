import { describe, it, expect } from 'vitest';
import { SceneGraph, GroupNode, SceneSerializer } from '@mhersztowski/core-scene3d';
import { Project } from '@mhersztowski/core-cad';
import { pustaScena, rodzajZeSciezki, scenaZTresci, trescZeSceny } from './sceneFiles';

describe('rodzaj sceny z nazwy pliku', () => {
  it('rozpoznaje scenę 3D i rysunek', () => {
    expect(rodzajZeSciezki('drive/projekty/dom.scene.json')).toBe('scene3d');
    expect(rodzajZeSciezki('drive/projekty/plan.cad.json')).toBe('cad');
  });

  it('nie zgaduje przy nieznanym rozszerzeniu', () => {
    // Zgadywanie kończyłoby się wczytaniem rysunku jako sceny 3D i pustym
    // widokiem bez wyjaśnienia.
    expect(rodzajZeSciezki('drive/notatki/plik.json')).toBeNull();
    expect(rodzajZeSciezki('drive/obraz.png')).toBeNull();
  });

  it('wielkość liter nie ma znaczenia', () => {
    expect(rodzajZeSciezki('DRIVE/Dom.Scene.JSON')).toBe('scene3d');
  });
});

describe('wczytanie i zapis', () => {
  it('scena 3D przechodzi tam i z powrotem bez zmian', () => {
    const graph = new SceneGraph();
    graph.addNode(new GroupNode({ id: 'g', name: 'Grupa' }));

    const scena = scenaZTresci(SceneSerializer.serialize(graph), 'scene3d');
    expect(scena.kind).toBe('scene3d');
    expect(scena.getNode('Grupa')).not.toBeNull();

    const znowu = scenaZTresci(trescZeSceny(scena), 'scene3d');
    expect(znowu.getNode('Grupa')).not.toBeNull();
  });

  it('rysunek przechodzi tam i z powrotem razem z encjami', () => {
    const project = new Project();
    project.entityRegistry.add({ type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 5 } } as never);

    const scena = scenaZTresci(JSON.stringify(project.toJSON()), 'cad');
    expect(scena.kind).toBe('cad');
    expect(scena.getAllNodes().some((n) => n.getData().type === 'line')).toBe(true);

    const znowu = scenaZTresci(trescZeSceny(scena), 'cad');
    expect(znowu.getAllNodes().some((n) => n.getData().type === 'line')).toBe(true);
  });

  it('pusta scena da się utworzyć dla obu rodzajów', () => {
    expect(pustaScena('scene3d').kind).toBe('scene3d');
    expect(pustaScena('cad').kind).toBe('cad');
    expect(pustaScena('scene3d').getAllNodes()).toEqual([]);
  });

  it('uszkodzona treść kończy się błędem, a nie pustą sceną', () => {
    expect(() => scenaZTresci('to nie jest json', 'scene3d')).toThrow();
    expect(() => scenaZTresci('to nie jest json', 'cad')).toThrow();
  });
});
