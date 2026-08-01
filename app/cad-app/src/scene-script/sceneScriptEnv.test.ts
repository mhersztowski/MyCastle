/**
 * Deklaracje `scene` w edytorze muszą opisywać dokładnie to, co runtime wstrzykuje.
 *
 * Bez tego testu rozjazd wychodzi dopiero u użytkownika: edytor podpowiada metodę,
 * której nie ma (albo milczy o tej, która jest), a błąd widać po kliknięciu „Run".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SceneGraph, MeshNode } from '@mhersztowski/core-scene3d';
import { SceneScriptSession } from './sceneScript';
import {
  SCENE_SCRIPT_ENV_DTS, normalizeDtsImports, isUsableThreeBundle, buildThreeModels, TYPES_ROOT,
} from '../editor/threeTypesData';
import { loadEditorDts } from '../editor/threeTypes';

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

/**
 * Rejestracja deklaracji three.
 *
 * `import * as THREE from 'three'` nie podpowiadał niczego, bo pliki lądowały pod
 * `@types/three`, a resolucję wygrywał wcześniejszy, niekompletny wpis z CDN.
 * Deklaracje idą teraz pod sam pakiet `three`, który w TypeScripcie ma pierwszeństwo.
 */
describe('buildThreeModels', () => {
  const bundle = {
    'index.d.ts': 'export * from "./src/Three.js";',
    'src/Three.d.ts': 'export * from "./math/Vector3.js";',
    'src/math/Vector3.d.ts': 'export class Vector3 {}',
    'package.json': '{"name":"@types/three","version":"0.182.0"}',
    'README.md': 'nieużywane',
  };

  it('rejestruje pliki pod pakietem `three`, nie pod `@types`', () => {
    const models = buildThreeModels(bundle);
    expect(TYPES_ROOT).toBe('file:///node_modules/three');
    expect(models.map((m) => m.uri)).toContain('file:///node_modules/three/src/math/Vector3.d.ts');
    expect(models.every((m) => m.uri.startsWith('file:///node_modules/three/'))).toBe(true);
  });

  it('podstawia własny package.json wskazujący wejście typów', () => {
    const pkg = buildThreeModels(bundle).find((m) => m.uri.endsWith('package.json'));
    expect(pkg?.language).toBe('json');
    expect(JSON.parse(pkg!.content)).toEqual({ name: 'three', version: '0.182.0', types: 'index.d.ts' });
  });

  it('normalizuje importy i pomija pliki inne niż deklaracje', () => {
    const models = buildThreeModels(bundle);
    const index = models.find((m) => m.uri.endsWith('/index.d.ts'));
    expect(index?.content).toBe('export * from "./src/Three";');
    expect(models.some((m) => m.uri.endsWith('README.md'))).toBe(false);
  });

  it('uszkodzony package.json nie blokuje rejestracji', () => {
    const pkg = buildThreeModels({ ...bundle, 'package.json': '{zepsute' })
      .find((m) => m.uri.endsWith('package.json'));
    expect(JSON.parse(pkg!.content).version).toBe('0.0.0');
  });
});

/**
 * Deklaracje wracają JEDNĄ mapą do pluginu TypeScriptu.
 *
 * Wcześniejsza wersja rejestrowała każdy plik jako osobny model Monaco i to
 * zawieszało worker TypeScriptu — podpowiedzi znikały nie tylko dla three, ale
 * w całym edytorze. Test pilnuje kontraktu: jedna mapa, zawsze z globalami
 * skryptu sceny, nawet gdy paczki three nie ma.
 */
describe('loadEditorDts', () => {
  const stubFetch = (impl: () => unknown) => vi.stubGlobal('fetch', vi.fn(impl));
  afterEach(() => vi.unstubAllGlobals());

  it('zwraca globale sceny razem z deklaracjami three', async () => {
    stubFetch(() => Promise.resolve({
      ok: true,
      json: async () => ({
        'index.d.ts': 'export * from "./src/Three.js";',
        'src/Three.d.ts': 'export class Vector3 {}',
      }),
    }));

    const files = await loadEditorDts();

    expect(files['file:///scene-script-env.d.ts']).toContain('declare const scene');
    expect(files['file:///node_modules/three/index.d.ts']).toBe('export * from "./src/Three";');
    expect(files['file:///node_modules/three/package.json']).toContain('"types":"index.d.ts"');
  });

  it('brak paczki nie odcina globali sceny', async () => {
    stubFetch(() => Promise.reject(new Error('offline')));

    const files = await loadEditorDts();

    expect(Object.keys(files)).toEqual(['file:///scene-script-env.d.ts']);
  });

  it('niekompletna paczka (sam index bez src) jest odrzucana', async () => {
    stubFetch(() => Promise.resolve({
      ok: true,
      json: async () => ({ 'index.d.ts': 'export * from "./src/Three.js";' }),
    }));

    const files = await loadEditorDts();

    expect(Object.keys(files)).toEqual(['file:///scene-script-env.d.ts']);
  });
});
