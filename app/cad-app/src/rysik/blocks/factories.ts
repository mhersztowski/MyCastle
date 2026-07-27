/**
 * Mapowanie typu bloku na implementację sceny. Oddzielone od `registry.ts`,
 * żeby parser, walidacja i testy nie ciągnęły za sobą Three.js.
 */

import { createChartBlock } from './ChartBlock';
import { createTerrainBlock } from './TerrainBlock';
import type { SceneBlockFactory } from './SceneBlock';

const FACTORIES: Record<string, SceneBlockFactory> = {
  'scene3d.terrain': createTerrainBlock,
  'chart.bars': createChartBlock,
};

export function createSceneBlock(type: string): ReturnType<SceneBlockFactory> | null {
  const factory = FACTORIES[type];
  return factory ? factory() : null;
}
