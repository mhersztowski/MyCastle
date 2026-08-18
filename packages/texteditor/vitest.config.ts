import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Patrz `src/test/monacoStub.ts` — bez tego moduły importujące monaco
      // nie dają się w ogóle wczytać w Node.
      'monaco-editor': path.resolve(__dirname, 'src/test/monacoStub.ts'),
    },
  },
  test: {
    name: 'texteditor',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
