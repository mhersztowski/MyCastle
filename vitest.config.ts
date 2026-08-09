import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/core/vitest.config.ts',
      'packages/core-backend/vitest.config.ts',
      'packages/core-scene3d/vitest.config.ts',
      'packages/ui-core/vitest.config.ts',
      'packages/web-client/vitest.config.ts',
      'packages/layout/vitest.config.ts',
      'app/mycastle-backend/vitest.config.ts',
      'app/monaco-backend/vitest.config.ts',
      'app/mycastle-web/vitest.config.ts',
      'app/cad-app/vitest.config.ts',
    ],
  },
});
