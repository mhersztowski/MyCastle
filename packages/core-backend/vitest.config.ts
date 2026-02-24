import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core-backend',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
