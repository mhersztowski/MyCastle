/**
 * Deklaracje `scene` w edytorze muszą opisywać dokładnie to, co runtime wstrzykuje.
 *
 * Bez tego testu rozjazd wychodzi dopiero u użytkownika: edytor podpowiada metodę,
 * której nie ma (albo milczy o tej, która jest), a błąd widać po kliknięciu „Run".
 */
import { describe, it, expect } from 'vitest';
import { SceneGraph, MeshNode } from '@mhersztowski/core-scene3d';
import { SceneScriptSession } from './sceneScript';
import { SCENE_SCRIPT_ENV_DTS, normalizeDtsImports, isUsableThreeBundle } from '../editor/threeTypesData';

/** Nazwy pól zadeklarowane w interfejsie `SceneScriptApi` z pliku .d.ts. */
function declaredApiMembers(dts: string): string[] {
  const body = dts.split('interface SceneScriptApi {')[1]?.split('\n}')[0] ?? '';
  return [...body.matchAll(/^\s{2}([A-Za-z_$][\w$]*)[(?:]/gm)].map((m) => m[1]);
}

describe('SCENE_SCRIPT_ENV_DTS', () => {
  it('opisuje każdą metodę faktycznie wstrzykiwaną jako `scene`', () => {
    const graph = new SceneGraph();
    graph.addNode(new MeshNode({ id: 'm1', name: 'Kostka' }));
    const runtimeKeys = Object.keys(new SceneScriptSession(graph).api).sort();
    const declared = declaredApiMembers(SCENE_SCRIPT_ENV_DTS).sort();

    expect(declared).toEqual(runtimeKeys);
  });

  it('deklaruje globalne `scene` i `THREE` — runtime podaje je bez importu', () => {
    expect(SCENE_SCRIPT_ENV_DTS).toContain('declare const scene: SceneScriptApi;');
    expect(SCENE_SCRIPT_ENV_DTS).toContain("declare const THREE: typeof import('three');");
  });
});

describe('normalizeDtsImports', () => {
  it('zdejmuje .js z relatywnych importów — inaczej @types/three się nie rozwiązuje', () => {
    expect(normalizeDtsImports('export * from "./src/Three.js";')).toBe('export * from "./src/Three";');
    expect(normalizeDtsImports("import { A } from '../core/A.mjs';")).toBe("import { A } from '../core/A';");
  });

  it('nie tyka importów pakietów ani ścieżek bez rozszerzenia', () => {
    expect(normalizeDtsImports("import x from 'three';")).toBe("import x from 'three';");
    expect(normalizeDtsImports('export * from "./src/Three";')).toBe('export * from "./src/Three";');
  });
});

describe('isUsableThreeBundle', () => {
  it('wymaga wejścia i drzewa src — sam index.d.ts nic nie podpowie', () => {
    expect(isUsableThreeBundle({ 'index.d.ts': 'export * from "./src/Three";' })).toBe(false);
    expect(isUsableThreeBundle({
      'index.d.ts': 'export * from "./src/Three";',
      'src/Three.d.ts': 'export class Vector3 {}',
    })).toBe(true);
    expect(isUsableThreeBundle({})).toBe(false);
  });
});
