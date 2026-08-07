import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { config } from 'dotenv';

// Porty czytamy z .env backendu — jedno źródło prawdy dla obu aplikacji,
// tak samo jak cad-app czyta .env cad-backendu.
config({ path: resolve(__dirname, '../monaco-backend/.env') });

const BACKEND_PORT = parseInt(process.env.MONACO_BACKEND_PORT ?? '1994', 10);
const WEB_PORT = parseInt(process.env.MONACO_WEB_PORT ?? '1995', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Wszystkie pakiety workspace muszą używać JEDNEJ instancji Reacta —
      // druga instancja wywraca hooki w komponentach z texteditora.
      react: resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      '@emotion/react': resolve(__dirname, 'node_modules/@emotion/react'),
      '@emotion/styled': resolve(__dirname, 'node_modules/@emotion/styled'),
    },
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled', 'monaco-editor'],
  },
  optimizeDeps: {
    exclude: ['@mhersztowski/texteditor', '@mhersztowski/core'],
    esbuildOptions: { target: 'esnext' },
  },
  server: {
    host: true,
    port: WEB_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      // Upload i serwowanie plików obsługuje HttpUploadServer z core-backend.
      '/upload': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      '/files': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
    },
  },
  build: {
    // Build ląduje w backendzie, który serwuje go jako statyczny frontend —
    // ta sama relacja co cad-app → cad-backend.
    outDir: '../monaco-backend/public',
    emptyOutDir: true,
    // Monaco wymaga nowoczesnego targetu: starszy każe esbuildowi przepisać
    // import.meta.url, co psuje budowanie URL-i workerów przez Vite (`?worker`).
    target: 'esnext',
  },
});
