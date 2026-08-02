/**
 * Build bundla dla eksportu statycznego.
 *
 * Osobna konfiguracja od podglądu, bo cel jest inny: jeden zestaw plików do
 * położenia na hostingu, bez serwera deweloperskiego i z Reactem **w środku**
 * bundla (w bibliotece jest tylko `peerDependency`, ale wyeksportowana strona
 * nie ma skąd go wziąć).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Ścieżki względne, bo strony rozwiązują je przez `<base>` wskazujący
  // korzeń bazy — hosting w podkatalogu i otwarcie z dysku mają działać tak
  // samo jak wystawienie w korzeniu domeny.
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist-static'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'static/mount.tsx'),
      output: {
        // Klasyczny skrypt zamiast modułu: przeglądarka odmawia wczytania
        // modułu z `file://` (CORS dla origin `null`), więc baza skopiowana na
        // dysk byłaby pustą stroną. Worker jest wtedy wklejony w bundel.
        format: 'iife',
        // Stała nazwa bundla, bo odwołuje się do niej `exportSite`. Cache
        // busting robi tu więcej szkody niż pożytku: bazę kopiuje się na dysk
        // i otwiera z pliku, gdzie i tak nie ma nagłówków HTTP.
        //
        // Reszta zostaje w `assets/` z układem Vite — fonty KaTeX-a są
        // adresowane z CSS-a względnie i przenoszenie ich rozspójnia ścieżki.
        entryFileNames: 'assets/sci.js',
      },
    },
  },
  worker: { format: 'es' },

});
