import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/diagrams/index.ts'],
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', '@xyflow/react'],
  treeshake: true,
});
