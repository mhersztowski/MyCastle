import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'minis-backend',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
