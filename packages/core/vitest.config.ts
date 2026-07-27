import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    globals: true,
    // `browser/` trzyma kod ładowany wprost w przeglądarce (poza buildem tsup),
    // ale logika Aury jest czystym TS i ma testy — stąd drugi wzorzec.
    include: ['src/**/*.test.ts', 'browser/**/*.test.ts'],
  },
});
