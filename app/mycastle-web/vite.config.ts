import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Workery jako moduły ES, nie IIFE. Worker kompilatora AssemblyScriptu
  // wciąga `asc` importem dynamicznym, a Rollup nie potrafi podzielić kodu
  // w formacie IIFE — budowa padała na „UMD and IIFE output formats are not
  // supported for code-splitting builds".
  worker: { format: 'es' },
  plugins: [
    react(),
  ],
  optimizeDeps: {
    exclude: ['@mhersztowski/web-cpp'],
    // Ten sam nowoczesny target co w `build` (niżej). Bez niego prebundling
    // wywraca się na zależnościach z top-level await (`@novnc/novnc`), więc
    // serwer dev w ogóle nie wstaje — a produkcyjny build przechodzi, bo tam
    // target jest ustawiony.
    esbuildOptions: { target: 'esnext' },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      // djvu.js (DjVuPage) importuje pngjs tylko do eksportu PNG (nieużywane) — stub.
      'pngjs/browser': path.resolve(__dirname, './src/stubs/pngjs-browser.ts'),
    },
    dedupe: ['react', 'react-dom', '@mui/material', 'dayjs', 'monaco-editor'],
  },
  server: {
    host: true,
    port: 1895,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1894',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/mqtt': {
        target: 'ws://localhost:1894',
        ws: true,
      },
      '/ws/terminal': {
        target: 'ws://localhost:1894',
        ws: true,
      },
      // Public Drive file URLs — backend serves data/Minis/Users/{u}/drive/public/*
      // without auth at /public/drive/users/{u}/{path}.
      '/public': {
        target: 'http://localhost:1894',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    // Modern target required for Monaco workers — old targets cause esbuild to transform
    // import.meta.url, which breaks Vite's ?worker URL construction and prevents
    // Monaco language workers (JSON, TS, CSS) from starting.
    target: 'esnext',
    rollupOptions: {
      onwarn(warning, warn) {
        // three and lit are optional runtime deps in automateLibraries.ts localLoaders.
        // They may not be installed in all environments; suppress the build error so the
        // app compiles — the loader will throw at runtime only if the user actually
        // activates a Plugin Script that uses them without running pnpm install first.
        if (
          warning.code === 'UNRESOLVED_IMPORT' &&
          typeof warning.exporter === 'string' &&
          (warning.exporter === 'three' || warning.exporter.startsWith('lit'))
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
});
