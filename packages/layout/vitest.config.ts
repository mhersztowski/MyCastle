import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'layout', globals: true, environment: 'node' },
});
