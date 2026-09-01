import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Rdzeń Rysika (manifest, parser, transakcje) jest czystym TS — testy nie
    // potrzebują DOM-u ani Three.js. Środowisko przeglądarki włącza sobie
    // pojedynczy plik komentarzem `// @vitest-environment jsdom`; domyślnie
    // zostaje `node`, żeby setki testów czystej logiki nie płaciły za DOM.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
