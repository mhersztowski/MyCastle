import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'texteditor',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
