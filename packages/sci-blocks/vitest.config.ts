import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Testy komponentów i hooków potrzebują DOM. Reszta pakietu to czysta
    // logika i działa w obu środowiskach, więc jedno jsdom dla całości
    // kosztuje mniej niż dzielenie konfiguracji na dwie.
    environment: 'jsdom',
  },
});
