import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'hydra-studio',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
