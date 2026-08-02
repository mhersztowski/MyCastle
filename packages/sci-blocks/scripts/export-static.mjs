/**
 * export-static.mjs — katalog dokumentów → statyczna strona.
 *
 * Skrypt robi tylko to, czego czysta funkcja `exportSite` zrobić nie może:
 * czyta pliki, woła Vite i zapisuje wynik. Cała decyzja o kształcie strony
 * została w `sci-core`, gdzie da się ją sprawdzić testem.
 *
 * Użycie: node scripts/export-static.mjs [katalog-źródłowy] [katalog-wyjściowy]
 */
import { build } from 'vite';
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { exportSite } from '@mhersztowski/sci-core';

const here = dirname(new URL(import.meta.url).pathname);
const zrodlo = resolve(process.argv[2] ?? join(here, '..', 'dokumenty'));
const cel = resolve(process.argv[3] ?? join(here, '..', 'dist-static'));

/** Wszystkie `.md` w drzewie katalogów, ze ścieżkami względnymi wobec bazy. */
async function znajdzDokumenty(katalog, prefix = '') {
  const wpisy = await readdir(katalog, { withFileTypes: true });
  const wynik = [];
  for (const wpis of wpisy) {
    const sciezka = join(katalog, wpis.name);
    const wzgledna = prefix ? `${prefix}/${wpis.name}` : wpis.name;
    if (wpis.isDirectory()) wynik.push(...await znajdzDokumenty(sciezka, wzgledna));
    else if (wpis.name.endsWith('.md')) {
      wynik.push({ path: wzgledna, markdown: await readFile(sciezka, 'utf8') });
    }
  }
  return wynik;
}

const dokumenty = await znajdzDokumenty(zrodlo);
if (!dokumenty.length) {
  console.error(`Nie ma dokumentów .md w ${zrodlo}`);
  process.exit(1);
}

await rm(cel, { recursive: true, force: true });
await build({ configFile: join(here, '..', 'vite.static.config.ts') });

// Bundel i jego zasoby zostają w `assets/`; HTML-e lądują obok, w korzeniu.
const assets = join(cel, 'assets');
const style = (await readdir(assets)).find((n) => n.endsWith('.css'));

for (const plik of exportSite(dokumenty, {
  title: 'Baza wiedzy',
  script: 'assets/sci.js',
  stylesheet: style && `assets/${style}`,
})) {
  const docelowy = join(cel, plik.path);
  await mkdir(dirname(docelowy), { recursive: true });
  await writeFile(docelowy, plik.content, 'utf8');
}

console.log(`Wyeksportowano ${dokumenty.length} dokumentów do ${relative(process.cwd(), cel)}`);
