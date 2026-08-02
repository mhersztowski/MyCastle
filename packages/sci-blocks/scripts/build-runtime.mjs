/**
 * build-runtime.mjs — bundel bazy wiedzy dla aplikacji.
 *
 * Ten sam bundel co w eksporcie z linii poleceń, tylko bez stron HTML: kładzie
 * `sci.js` i fonty tam, skąd aplikacja może je dociągnąć, gdy czytelnik
 * poprosi o pobranie bazy. Strony powstają wtedy w przeglądarce, z aktualnej
 * treści dokumentów — dzięki temu archiwum nigdy nie jest starsze niż baza.
 *
 * Użycie: node scripts/build-runtime.mjs <katalog-docelowy>
 */
import { build } from 'vite';
import { readdir, writeFile, rm, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname);
const cel = resolve(process.argv[2] ?? join(here, '..', 'dist-runtime'));

const tymczasowy = join(here, '..', 'dist-static-runtime');
await rm(tymczasowy, { recursive: true, force: true });
await build({
  configFile: join(here, '..', 'vite.static.config.ts'),
  build: { outDir: tymczasowy },
});

await rm(cel, { recursive: true, force: true });
await cp(join(tymczasowy, 'assets'), join(cel, 'assets'), { recursive: true });
await rm(tymczasowy, { recursive: true, force: true });

// Manifest, bo przeglądarka nie umie wylistować katalogu na serwerze — bez
// niego trzeba by zgadywać nazwy fontów albo trzymać je w kodzie.
const pliki = (await readdir(join(cel, 'assets'))).map((nazwa) => `assets/${nazwa}`);
await writeFile(join(cel, 'manifest.json'), `${JSON.stringify({ assets: pliki }, null, 2)}\n`, 'utf8');

console.log(`Bundel bazy wiedzy: ${pliki.length} plików w ${cel}`);
