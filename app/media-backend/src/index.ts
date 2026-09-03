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
}, process.env, {
  // Broker MyCastle — stamtąd Kasia bierze projekty, zadania i kalendarz.
  // Nie REST: `/files/` w MyCastle udostępnia wyłącznie `data/public`, a dane
  // PIM leżą poza nim i chodzą przez VFS po MQTT.
  broker: process.env.MYCASTLE_MQTT ?? '',
  uzytkownik: process.env.MYCASTLE_USER ?? '',
  haslo: process.env.MYCASTLE_PASSWORD ?? '',
});

server.init()
  .then(() => server.start())
  .then(() => {
    // Pętla dopiero po starcie serwera — inaczej pierwszy przebieg mógłby
    // zapisać stan, zanim trasy zaczną odpowiadać, i panel pokazałby zmianę,
    // której źródła nie da się jeszcze podejrzeć.
    server.startKasia();
    void server.startNasluchPolecen();

    console.log(`Media Backend   →  http://localhost:${port}`);
    console.log(`Data dir        →  ${dataDir}`);
    console.log(`Static dir      →  ${staticDir ?? '(brak — uruchom pnpm build:media-web)'}`);
    console.log(`Podcast Index   →  ${server.hasPodcastIndexCredentials()
      ? 'klucze wczytane'
      : '(brak kluczy — szukamy tylko w iTunes)'}`);
    const s = server.opisSrodowiska();
    console.log(`Kasia — model   →  ${s.model}`);
    console.log(`Kasia — głos    →  ${s.elevenlabs
      ? 'ElevenLabs (klucz z .env, domyślny dla TTS i STT)'
      : '(brak ELEVENLABS_API_KEY — mowa przez przeglądarkę)'}`);
    console.log(`Kasia — dostęp  →  ${server.hasKasiaPassword()
      ? 'chroniony hasłem (KASIA_HASLO)'
      : '⚠ OTWARTY — ustaw KASIA_HASLO, jeśli adres jest publiczny'}`);
    console.log(`Dane MyCastle   →  ${server.hasMycastleAccess()
      ? `${process.env.MYCASTLE_MQTT} jako ${process.env.MYCASTLE_USER}`
      : '(brak MYCASTLE_MQTT — Kasia nie zna projektów ani kalendarza)'}`);
  })
  .catch((err: Error) => {
    console.error('Nie udało się wystartować serwera:', err.message);
    process.exit(1);
  });
