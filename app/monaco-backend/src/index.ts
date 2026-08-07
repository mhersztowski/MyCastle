import dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MonacoHttpServer } from './MonacoHttpServer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(appDir, '.env') });

const port = parseInt(process.env.MONACO_BACKEND_PORT ?? '1994', 10);
// Własny katalog danych aplikacji — tak jak w cad-backend, żeby edytor nie
// zaglądał do danych MyCastle. Ścieżkę względną liczymy od katalogu aplikacji,
// a nie od `process.cwd()`, bo backend bywa uruchamiany z korzenia monorepo.
const dataDir = path.resolve(appDir, process.env.MONACO_DATA_DIR ?? './data');
// Build monaco-web ląduje w `public/`; dopóki go nie ma, serwer wystawia samo API.
const publicDir = path.resolve(appDir, 'public');
const staticDir = fs.existsSync(publicDir) ? publicDir : undefined;

fs.mkdirSync(dataDir, { recursive: true });

const server = new MonacoHttpServer(port, dataDir, staticDir);

server.start().then(() => {
  console.log(`Monaco Backend  →  http://localhost:${port}`);
  console.log(`Data dir        →  ${dataDir}`);
  console.log(`Static dir      →  ${staticDir ?? '(brak — uruchom pnpm build:monaco-web)'}`);
}).catch((err: Error) => {
  console.error('Nie udało się wystartować serwera:', err.message);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
