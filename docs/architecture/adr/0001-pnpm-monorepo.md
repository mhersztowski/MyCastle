# 0001. pnpm Workspaces jako monorepo

Data: 2024-01-01
Status: Accepted

## Kontekst

MyCastle składa się z wielu aplikacji (mycastle-backend, mycastle-web, minis-backend, minis-web, demo-scene-3d) oraz pakietów współdzielonych (core, core-backend, web-client, scene3d, ui-core). Potrzebujemy sposobu zarządzania kodem współdzielonym z możliwością jednoczesnej edycji i budowania zależności lokalnych bez publishowania do npm.

## Rozważane opcje

- **pnpm workspaces** — wbudowane workspaces, strict hoisting, wydajny store (hard links)
- **Nx** — zaawansowany build system z cache, task orchestration, generators
- **Turborepo** — task orchestration z caching, thin wrapper nad npm/pnpm workspaces
- **Lerna** — klasyczne narzędzie monorepo (legacy, wymagałoby dodatkowej konfiguracji)
- **Osobne repozytoria** — brak współdzielonego kodu, duplikacja typów

## Decyzja

Wybrana opcja: **pnpm workspaces**, ponieważ:

- Minimalna konfiguracja — wystarczy `pnpm-workspace.yaml`
- Strict mode (`.npmrc: strict-peer-dependencies`) eliminuje ukryte zależności
- Wydajny store z hard links (szybkie `pnpm install`)
- Workspace protocol `workspace:*` — automatyczne linkowanie lokalnych pakietów
- Nie wymaga dodatkowych narzędzi dla obecnej skali projektu (6 pakietów + 5 aplikacji)
- `pnpm --filter` do uruchamiania skryptów per-pakiet

## Konsekwencje

### Pozytywne
- Jedna komenda `pnpm install` instaluje wszystkie zależności
- Zmiany w `packages/core` natychmiast widoczne w aplikacjach (dev)
- `pnpm build` buduje wszystko w kolejności zależności
- Strict hoisting wymusza deklarowanie wszystkich zależności explicite

### Negatywne / kompromisy
- Brak zaawansowanego cachowania tasków (jak w Nx/Turborepo) — pełne przebudowanie przy zmianach
- Bin shims są OS-specific — wszystkie komendy muszą być uruchamiane z WSL (nie Windows cmd)
- TypeScript project references (`tsconfig.json`) wymagają ręcznego utrzymania
- `pnpm install` tworzy `.pnpm-lock.yaml` który może powodować konflikty przy rebase
