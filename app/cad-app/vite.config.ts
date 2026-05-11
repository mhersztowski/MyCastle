import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'path';

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
  server: {
    port: 1892,
    proxy: {
      // Forward /api/vfs/* to cad-backend (port 1898)
      '/api/vfs': {
        target: 'http://localhost:1892',
        changeOrigin: true,
      },
    },
  },
});
