/**
 * Testy rdzenia skryptów sceny — części, która nie potrzebuje ani DOM-u, ani
 * Three.js: usuwania importów i API udostępnianego skryptowi w piaskownicy.
 *
 * Transpilacja (worker Monaco) i render (SimpleViewer) są sprawdzane ręcznie —
 * tu pilnujemy tego, co łatwo zepsuć: kolejności bindingów, sprzątania po
 * zatrzymaniu i wyszukiwania węzłów po nazwie.
 */
import { describe, it, expect, vi } from 'vitest';
import { SceneGraph } from '@mhersztowski/core-scene3d';
import { MeshNode } from '@mhersztowski/core-scene3d';
import { stripImports, SceneScriptSession } from './sceneScript';

describe('stripImports', () => {
  it('zamienia import znanego modułu na destrukturyzację namespace’u', () => {
    const three = { Vector3: class {} };
    const out = stripImports("import { Vector3 } from 'three';\nconst v = new Vector3();", () => three);

    expect(out.code).not.toContain('import');
    expect(out.bindings).toEqual(['const { Vector3 } = __ns.__m0;']);
    expect(out.namespaces.__m0).toBe(three);
  });

  it('obsługuje import wieloliniowy — pozycja klamer nie może rozjechać kodu', () => {
    const src = [
      'import {',
      '  Vector3,',
      '  Euler as Rot,',
      "} from 'three';",
      'const v = new Vector3();',
    ].join('\n');
    const out = stripImports(src, () => ({}));

    expect(out.bindings).toEqual(['const { Vector3, Euler: Rot } = __ns.__m0;']);
    expect(out.code.trim()).toBe('const v = new Vector3();');
  });

  it('import domyślny i gwiazdkowy', () => {
    const ns = { default: 'D' };
    const a = stripImports("import THREE from 'three';", () => ns);
    expect(a.bindings).toEqual(['const THREE = (__ns.__m0.default ?? __ns.__m0);']);

    const b = stripImports("import * as THREE from 'three';", () => ns);
    expect(b.bindings).toEqual(['const THREE = __ns.__m0;']);
  });

  it('usuwa importy typów i modułów, których nie znamy — skrypt ma się uruchomić', () => {
    const out = stripImports(
      "import type { SceneNode } from '@mhersztowski/core-scene3d';\nimport 'jakis-styl.css';\nlet x = 1;",
      () => null,
    );
    expect(out.code).not.toContain('import');
    expect(out.bindings).toEqual([]);
    expect(out.code.trim()).toBe('let x = 1;');
  });

  it('nie tyka słowa „import" w środku kodu', () => {
    const src = 'const s = "import { x } from \'y\'";';
    expect(stripImports(src, () => null).code).toBe(src);
  });
});

function graphWithCube(): SceneGraph {
  const graph = new SceneGraph();
  graph.addNode(new MeshNode({ id: 'm1', name: 'Kostka' }));
  return graph;
}

describe('SceneScriptSession — API sceny', () => {
  it('znajduje węzeł po id i po nazwie', () => {
    const session = new SceneScriptSession(graphWithCube());
    expect(session.api.find('m1')?.name).toBe('Kostka');
    expect(session.api.find('Kostka')?.id).toBe('m1');
    expect(session.api.find('brak')).toBeNull();
  });

  it('findAll bez argumentu pomija root, z argumentem filtruje po nazwie', () => {
    const graph = graphWithCube();
    graph.addNode(new MeshNode({ id: 'm2', name: 'Kostka' }));
    const { api } = new SceneScriptSession(graph);

    expect(api.findAll().map((n) => n.id)).toEqual(['m1', 'm2']);
    expect(api.findAll('Kostka')).toHaveLength(2);
    expect(api.findAll('Inna')).toEqual([]);
  });

  it('object() zwraca obiekt Three przypięty przez viewer', () => {
    const graph = graphWithCube();
    const node = graph.findNode('m1')!;
    const fake = { name: 'three-obj' } as never;
    node._threeObject = fake;

    const { api } = new SceneScriptSession(graph);
    expect(api.object('Kostka')).toBe(fake);
    expect(api.object(node)).toBe(fake);
    expect(api.object('brak')).toBeNull();
  });

  it('log trafia do sinka razem z poziomem', () => {
    const onLog = vi.fn();
    const session = new SceneScriptSession(graphWithCube(), { onLog });
    session.api.log('a', { b: 1 });
    session.api.console.error('bum');

    expect(onLog).toHaveBeenNthCalledWith(1, { level: 'log', text: 'a {"b":1}' });
    expect(onLog).toHaveBeenNthCalledWith(2, { level: 'error', text: 'bum' });
  });
});

describe('SceneScriptSession — pętla klatek', () => {
  it('pierwsza klatka ma dt=0, kolejne liczą różnicę w sekundach', () => {
    const seen: Array<[number, number]> = [];
    const session = new SceneScriptSession(graphWithCube());
    session.api.onFrame((dt, t) => seen.push([dt, t]));

    session.tick(1000);
    session.tick(1016);
    session.tick(1032);

    expect(seen[0]).toEqual([0, 0]);
    expect(seen[1][0]).toBeCloseTo(0.016, 5);
    expect(seen[2][1]).toBeCloseTo(0.032, 5);
  });

  it('odsubskrybowanie zdejmuje callback', () => {
    const cb = vi.fn();
    const session = new SceneScriptSession(graphWithCube());
    const off = session.api.onFrame(cb);
    session.tick(0);
    off();
    session.tick(16);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('wyjątek w jednym callbacku nie zabija pozostałych, ale jest zgłoszony', () => {
    const onLog = vi.fn();
    const ok = vi.fn();
    const session = new SceneScriptSession(graphWithCube(), { onLog });
    session.api.onFrame(() => { throw new Error('bum'); });
    session.api.onFrame(ok);

    session.tick(0);

    expect(ok).toHaveBeenCalled();
    expect(onLog).toHaveBeenCalledWith({ level: 'error', text: expect.stringContaining('bum') });
    // Powtarzający się błąd co klatkę zalałby konsolę — zgłaszamy raz.
    session.tick(16);
    expect(onLog).toHaveBeenCalledTimes(1);
  });

  it('stop() zatrzymuje klatki i czyści timery skryptu', () => {
    const clearTimeoutSpy = vi.fn();
    const clearIntervalSpy = vi.fn();
    const cb = vi.fn();
    const session = new SceneScriptSession(graphWithCube(), {
      setTimeout: () => 7,
      setInterval: () => 8,
      clearTimeout: clearTimeoutSpy,
      clearInterval: clearIntervalSpy,
    });
    session.api.onFrame(cb);
    session.api.setTimeout(() => {}, 10);
    session.api.setInterval(() => {}, 10);

    session.stop();
    session.tick(0);

    expect(cb).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(7);
    expect(clearIntervalSpy).toHaveBeenCalledWith(8);
    expect(session.stopped).toBe(true);
  });

  it('po stop() rejestracja nowej klatki lub timera jest ignorowana', () => {
    const setTimeoutSpy = vi.fn(() => 1);
    const session = new SceneScriptSession(graphWithCube(), { setTimeout: setTimeoutSpy });
    session.stop();

    const cb = vi.fn();
    session.api.onFrame(cb);
    session.api.setTimeout(() => {}, 5);
    session.tick(0);

    expect(cb).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
