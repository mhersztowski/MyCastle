import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { config } from 'dotenv';

// Porty czytamy z .env backendu — jedno źródło prawdy dla obu aplikacji,
// tak samo jak monaco-web czyta .env monaco-backendu.
config({ path: resolve(__dirname, '../media-backend/.env') });

const BACKEND_PORT = parseInt(process.env.MEDIA_BACKEND_PORT ?? '1996', 10);
const WEB_PORT = parseInt(process.env.MEDIA_WEB_PORT ?? '1997', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
    dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
  },
  server: {
    host: true,
    port: WEB_PORT,
    proxy: {
      // `/api/media` przekazuje plik odcinka strumieniowo — bez wyłączonych
      // limitów czasu pośrednik zrywałby dłuższe odcinki w połowie.
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/upload': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
      '/files': { target: `http://localhost:${BACKEND_PORT}`, changeOrigin: true },
    },
  },
  build: {
    // Build ląduje w backendzie, który serwuje go jako statyczny frontend —
    // ta sama relacja co monaco-web → monaco-backend.
    outDir: '../media-backend/public',
    emptyOutDir: true,
  },
});
