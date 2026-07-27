/**
 * Rejestr manifestów. Plik jest celowo wolny od kodu renderującego — parser,
 * serializer, walidacja i testy potrzebują wyłącznie deklaracji.
 * Fabryki scen (Three.js, canvas) siedzą w `factories.ts`.
 */

import type { BlockManifest } from '../types';
import { chartManifest } from './chart.manifest';
import { terrainManifest } from './terrain.manifest';

const MANIFESTS: BlockManifest[] = [terrainManifest, chartManifest];

const byType = new Map(MANIFESTS.map(m => [m.type, m]));

/** Klasa w fence Quarto: `scene3d.terrain` → `.scene3d-terrain`. */
export function typeToClass(type: string): string {
  return type.replace(/\./g, '-');
}

const byClass = new Map(MANIFESTS.map(m => [typeToClass(m.type), m]));

export function getManifest(type: string): BlockManifest | undefined {
  return byType.get(type);
}

export function manifestByClass(cls: string): BlockManifest | undefined {
  return byClass.get(cls);
}

export function allManifests(): BlockManifest[] {
  return MANIFESTS;
}

/** Klasa bloku zmiennych dokumentu — nie jest sceną, więc ma osobny manifest-null. */
export const VARS_CLASS = 'rysik-vars';
