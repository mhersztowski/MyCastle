/**
 * Build runtime'u publikacji: ten sam kod scen co w edytorze, spakowany do
 * jednego pliku IIFE, który rozszerzenie Quarto dokłada do strony HTML.
 *
 * Uruchomienie: `pnpm --filter cad-app build:rysik-runtime`
 */

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'quarto/_extensions/rysik/resources',
    emptyOutDir: false,
    lib: {
      entry: 'src/rysik/runtime/mount.ts',
      name: 'RysikRuntime',
      formats: ['iife'],
      fileName: () => 'rysik-runtime.js',
    },
    // Publikacja jest statyczna — nic nie może wisieć na CDN-ie.
    rollupOptions: { external: [] },
  },
});
