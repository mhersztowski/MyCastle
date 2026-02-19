import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 1895,
    open: true,
  },
  build: {
    outDir: 'build',
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@mui/material', 'dayjs'],
  },
});
