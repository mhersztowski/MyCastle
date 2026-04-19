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
    },
  },
  build: {
    outDir: 'build',
    // Modern target required for Monaco workers — old targets cause esbuild to transform
    // import.meta.url, which breaks Vite's ?worker URL construction and prevents
    // Monaco language workers (JSON, TS, CSS) from starting.
    target: 'esnext',
  },
});
