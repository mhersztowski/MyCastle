import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web-client',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
