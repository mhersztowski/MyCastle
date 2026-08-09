import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'monaco-backend',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
