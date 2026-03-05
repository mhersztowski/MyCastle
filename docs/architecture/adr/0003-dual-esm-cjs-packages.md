# 0003. Dual ESM+CJS build dla pakietów współdzielonych

Data: 2024-01-01
Status: Accepted

## Kontekst

Pakiety `@mhersztowski/core`, `@mhersztowski/core-backend` i `@mhersztowski/web-client` są importowane zarówno przez backendy Node.js (ESM `"type": "module"`) jak i frontendy (Vite, który preferuje ESM). TypeScript w 2024 roku w środowisku Node.js wymaga rozróżnienia między CJS a ESM.

## Rozważane opcje

- **Dual build (ESM + CJS)** via tsup — dwa bundled outputs, `exports` field w package.json
- **ESM-only** — prostsze, ale może powodować problemy z narzędziami CJS (Jest, starsze tooling)
- **CJS-only** — szeroka kompatybilność, ale blokuje tree-shaking w Vite/Rollup
- **Bez bundlowania** — raw TypeScript z `tsc`, wymaga od konsumentów konfiguracji TS paths

## Decyzja

Wybrana opcja: **Dual ESM+CJS via tsup** dla `core` i `web-client`, **ESM-only** dla `core-backend`, ponieważ:

- `core` i `web-client` są używane w różnych kontekstach — Vite (ESM) i potencjalnie CJS tooling
- `core-backend` jest importowany WYŁĄCZNIE przez Node.js backendy (`"type": "module"`) — ESM wystarcza
- `tsup` generuje oba formaty z jednej konfiguracji, dunder-resolution przez `exports` field
- TypeScript `declaration: true` generuje `.d.ts` kompatybilne z obu trybów

## Konsekwencje

### Pozytywne
- Konsumenci nie muszą konfigurować TS paths — standardowe `exports` field
- Vite tree-shakes ESM output — mniejszy bundle
- `tsup --dts` generuje declarations automatycznie

### Negatywne / kompromisy
- ESM barrels (index.ts) muszą używać `export type { ... }` dla interfejsów TypeScript — inaczej ESM runtime rzuca "does not provide an export named"
- `pnpm build` musi budować pakiety w kolejności (core → core-backend → web-client → apps)
- Czas budowania x2 dla dual-build packages (pomijalne przy tsup)
