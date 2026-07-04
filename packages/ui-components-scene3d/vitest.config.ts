import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ui-components-scene3d',
    globals: true,
    include: ['src/**/*.test.ts'],
    // This package is entirely React/@react-three/fiber components; the only
    // helper functions are module-private inside .tsx files that import the
    // rendering stack at module scope, so there is no importable pure logic.
    passWithNoTests: true,
  },
});
