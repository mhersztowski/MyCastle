import { defineConfig } from 'tsup';

export default defineConfig({
  // Dwa wejścia zamiast dwóch pakietów: `@mhersztowski/layout` i `/expr`.
  // Kto potrzebuje samego języka wyrażeń, nie ciągnie modelu ani solverów.
  entry: ['src/index.ts', 'src/expr/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
