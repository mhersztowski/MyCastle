import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@mhersztowski/core', '@mhersztowski/ui-core', 'mqtt', 'uuid', '@mui/material', '@mui/x-tree-view', '@emotion/react', '@emotion/styled', 'monaco-editor'],
  treeshake: true,
});
