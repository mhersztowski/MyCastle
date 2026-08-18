import dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MediaHttpServer } from './MediaHttpServer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, '..');

dotenv.config({ path: path.resolve(appDir, '.env') });

const port = parseInt(process.env.MEDIA_BACKEND_PORT ?? '1996', 10);
// Własny katalog danych — lista odtwarzania i notatki nie mają nic wspólnego
// z danymi MyCastle. Ścieżkę względną liczymy od katalogu aplikacji, bo backend
// bywa uruchamiany z korzenia monorepo.
const dataDir = path.resolve(appDir, process.env.MEDIA_DATA_DIR ?? './data');
// Build media-web ląduje w `public/`; dopóki go nie ma, serwer wystawia samo API.
const publicDir = path.resolve(appDir, 'public');
const staticDir = fs.existsSync(publicDir) ? publicDir : undefined;

fs.mkdirSync(dataDir, { recursive: true });

const server = new MediaHttpServer(port, dataDir, staticDir, {
  key: process.env.PODCASTINDEX_KEY ?? '',
  secret: process.env.PODCASTINDEX_SECRET ?? '',
});

server.init()
  .then(() => server.start())
  .then(() => {
    console.log(`Media Backend   →  http://localhost:${port}`);
    console.log(`Data dir        →  ${dataDir}`);
    console.log(`Static dir      →  ${staticDir ?? '(brak — uruchom pnpm build:media-web)'}`);
    console.log(`Podcast Index   →  ${server.hasPodcastIndexCredentials()
      ? 'klucze wczytane'
      : '(brak kluczy — szukamy tylko w iTunes)'}`);
  })
  .catch((err: Error) => {
    console.error('Nie udało się wystartować serwera:', err.message);
    process.exit(1);
  });
