import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Rdzeń Rysika (manifest, parser, transakcje) jest czystym TS — testy nie
    // potrzebują DOM-u ani Three.js.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
