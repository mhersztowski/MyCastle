import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Konfiguracja wyłącznie dla playgroundu (`dev/`) — build pakietu robi tsup. */
export default defineConfig({
  root: 'dev',
  plugins: [react()],
  server: { port: 5199, strictPort: true },
});
