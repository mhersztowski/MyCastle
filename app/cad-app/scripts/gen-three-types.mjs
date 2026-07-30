/**
 * gen-three-types.mjs — pakuje deklaracje `@types/three` w jeden plik JSON,
 * który edytor kodu w cad-app dociąga na żądanie.
 *
 * Dlaczego nie CDN i nie bundle:
 *  • wbudowany plugin TypeScript IntelliSense pobiera z CDN tylko `index.d.ts`,
 *    a ten w @types/three od wersji 0.130 zawiera samo `export * from "./src/Three.js"`
 *    — bez pozostałych ~570 plików nie powstaje ani jedna podpowiedź;
 *  • `import.meta.glob` na 570 plikach wyprodukowałby 570 chunków w buildzie.
 *
 * Wynik ląduje w `public/types/three.json` (gitignorowany, generowany przed
 * `dev` i `build`), więc nie wchodzi do bundla JS i jest pobierany dopiero, gdy
 * ktoś naprawdę otworzy plik TypeScript.
 *
 * Użycie: node scripts/gen-three-types.mjs [--examples]
 */
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const appRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
const OUT = join(appRoot, 'public', 'types', 'three.json');

/** Katalog @types/three (pnpm trzyma go pod symlinkiem — resolve go rozwija). */
function typesThreeDir() {
  try {
    return dirname(require.resolve('@types/three/package.json', { paths: [appRoot] }));
  } catch {
    return join(appRoot, 'node_modules', '@types', 'three');
  }
}

/** Wszystkie pliki `.d.ts` w katalogu (rekurencyjnie), ścieżki względne. */
function collectDts(root, subdir) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      // statSync przechodzi przez symlinki — pnpm linkuje cały pakiet.
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.d.ts')) out.push(relative(root, full));
    }
  };
  const start = subdir ? join(root, subdir) : root;
  try { walk(start); } catch { /* brak katalogu (np. examples) — pomijamy */ }
  return out;
}

const withExamples = process.argv.includes('--examples');
const root = typesThreeDir();

const files = new Set([
  'index.d.ts',
  ...collectDts(root, 'src'),
  ...collectDts(root, 'build'),
  // Loadery i kontrolki z `three/examples/jsm` — dobre kilobajty, więc tylko na żądanie.
  ...(withExamples ? collectDts(root, 'examples') : []),
]);

const bundle = {};
for (const rel of files) {
  try {
    bundle[rel.split('\\').join('/')] = await readFile(join(root, rel), 'utf-8');
  } catch { /* plik zniknął między listowaniem a czytaniem — pomijamy */ }
}

// package.json jest potrzebny resolverowi TypeScriptu do pola `types`.
try {
  bundle['package.json'] = await readFile(join(root, 'package.json'), 'utf-8');
} catch { /* brak — TS spadnie na index.d.ts */ }

if (!bundle['index.d.ts']) {
  console.error(`[gen-three-types] Nie znalazłem @types/three w ${root} — pomijam (podpowiedzi three będą niedostępne).`);
  process.exit(0);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bundle), 'utf-8');

const bytes = Buffer.byteLength(JSON.stringify(bundle));
console.log(`[gen-three-types] ${Object.keys(bundle).length} plików, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${relative(appRoot, OUT)}`);
