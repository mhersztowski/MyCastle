import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core-cad-viewer',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
