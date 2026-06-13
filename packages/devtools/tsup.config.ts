import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  target: 'node20',
  // Heavy/native-ish parsing libs are resolved at runtime, never bundled.
  external: ['typescript', 'web-tree-sitter', 'tree-sitter-wasms'],
});
