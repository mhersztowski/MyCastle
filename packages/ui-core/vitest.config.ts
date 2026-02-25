import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ui-core',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
