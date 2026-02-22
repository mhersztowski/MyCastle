import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  tsconfig: 'tsconfig.json',
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['@mhersztowski/core', '@mhersztowski/core-backend'],
});
