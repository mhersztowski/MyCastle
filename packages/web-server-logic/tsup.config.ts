import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  target: 'es2020',
  // Keep the shared model external — it ships its own (browser-safe) /web build.
  external: ['@mhersztowski/server-logic', '@mhersztowski/server-logic/web'],
});
