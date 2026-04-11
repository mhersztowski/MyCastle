import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@modules': path.resolve(__dirname, './src/modules'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
    },
    dedupe: ['react', 'react-dom', '@mui/material', 'dayjs'],
  },
  server: {
    host: true,
    port: 1895,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:1894',
        changeOrigin: true,
      },
      '/mqtt': {
        target: 'ws://localhost:1894',
        ws: true,
      },
      '/ws/terminal': {
        target: 'ws://localhost:1894',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'build',
    target: ['chrome63', 'safari13', 'firefox78'],
  },
});
