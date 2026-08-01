import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'web-devtools',
    globals: true,
    // Model i adaptery formatów to czysty TypeScript — DOM potrzebny dopiero
    // przy komponentach edytora, które mają własne testy.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
