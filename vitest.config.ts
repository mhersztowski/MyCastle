import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/core-backend/vitest.config.ts',
      'app/minis-backend/vitest.config.ts',
      'app/minis-web/vitest.config.ts',
    ],
  },
});
