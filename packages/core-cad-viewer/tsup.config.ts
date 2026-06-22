import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'react', 'react-dom', 'react/jsx-runtime',
    '@mui/material', '@mui/icons-material',
    '@emotion/react', '@emotion/styled',
    'react-leaflet', 'leaflet',
    'three', '@react-three/fiber',
    '@mhersztowski/core-cad', '@mhersztowski/core-scene3d',
  ],
  treeshake: true,
});
