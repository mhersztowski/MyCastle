import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'devtools',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
