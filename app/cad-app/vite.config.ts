import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load shared CAD env — single source of truth for ports
config({ path: resolve(__dirname, '../cad-backend/.env') });

const BACKEND_PORT = parseInt(process.env.CAD_BACKEND_PORT ?? '1897', 10);
const APP_PORT = parseInt(process.env.CAD_APP_PORT ?? '1898', 10);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Force all workspace packages to use cad-app's react instance
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
      '@emotion/react': resolve(__dirname, 'node_modules/@emotion/react'),
      '@emotion/styled': resolve(__dirname, 'node_modules/@emotion/styled'),
    },
    dedupe: ['react', 'react-dom', 'three', '@emotion/react', '@emotion/styled', '@mhersztowski/core'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'three', '@emotion/react', '@emotion/styled'],
    // Exclude local workspace packages so Vite always loads the fresh built dist
    // instead of a stale pre-bundled cache
    exclude: [
      '@mhersztowski/web-client',
      '@mhersztowski/core',
      '@mhersztowski/ui-core',
      '@mhersztowski/ui-components-scene3d',
      '@mhersztowski/core-scene3d',
      '@mhersztowski/core-cad',
    ],
  },
  build: {
    outDir: '../cad-backend/public',
    emptyOutDir: true,
  },
  server: {
    port: APP_PORT,
    host: true,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
