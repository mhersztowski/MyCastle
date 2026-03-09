import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  sourcemap: true,
  clean: true,
  target: 'node20',
  external: ['@mhersztowski/core', 'aedes', 'ws', 'bcryptjs', 'jsonwebtoken', 'zod'],
});
