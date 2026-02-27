import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
    dedupe: ['react', 'react-dom', '@mui/material'],
  },
  server: {
    host: true,
    port: 1903,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1902',
        changeOrigin: true,
      },
      '/mqtt': {
        target: 'ws://localhost:1902',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'build',
  },
});
