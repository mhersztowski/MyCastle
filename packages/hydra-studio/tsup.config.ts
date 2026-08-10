import { defineConfig } from 'tsup';

/**
 * Trzy wejścia, bo mają różnych odbiorców i różne zależności.
 *
 * `model` to sam opis projektu i generatory — bez Reacta, więc nadaje się
 * i do przeglądarki, i do skryptów. `index` dokłada wtyczkę edytora.
 * `cli` działa wyłącznie w Node: dotyka dysku i uruchamia budowę.
 *
 * Panele stoją osobno, bo wtyczka ładuje je leniwie — edytor nie płaci za
 * interfejs Studia, dopóki nikt nie otworzy pliku `.hydra`.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    model: 'src/model/index.ts',
    panels: 'src/plugin/panels.tsx',
    cli: 'src/cli/main.ts',
    // Worker kompilatora musi zostać osobnym plikiem w `dist/`: hook wskazuje
    // na niego przez `new URL(..., import.meta.url)`, a bundler odbiorcy
    // rozwiązuje ten adres statycznie. Wciągnięty do wspólnej paczki
    // wskazywałby na plik, którego tam nie ma — i budowa aplikacji padała
    // właśnie na tym.
    ascWorker: 'src/wasm/ascWorker.ts',
  },
  format: ['esm', 'cjs'],
  dts: { tsconfig: 'tsconfig.build.json' },
  tsconfig: 'tsconfig.build.json',
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'monaco-editor',
    '@mui/material',
    '@emotion/react',
    '@emotion/styled',
    '@xyflow/react',
    'node:fs',
    'node:path',
    'node:child_process',
  ],
});
