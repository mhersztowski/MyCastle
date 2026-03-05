# 0007. VFS Abstraction Layer

Data: 2024-04-01
Status: Accepted

## Kontekst

System obsługuje pliki z różnych źródeł: lokalny filesystem serwera (Node.js fs), GitHub repozytoria, pamięć (in-memory), przeglądarkowy File System Access API, zdalny VFS przez REST. Potrzebujemy ujednoliconego interfejsu do operacji na plikach niezależnie od źródła.

## Rozważane opcje

- **VFS abstraction (VS Code-inspired)** — `FileSystemProvider` interface, różne implementacje, `CompositeFS` montuje wiele providerów
- **Bezpośrednie użycie Node.js fs** — proste dla backendu, ale nie działa w przeglądarce
- **Cloud storage SDK** — S3/GCS API, vendor lock-in, wymaga zewnętrznego serwisu
- **Abstract filesystem library** — memfs, unionfs — fokus na Node.js, brak browser providers

## Decyzja

Wybrana opcja: **VFS Abstraction Layer** inspirowany VS Code `FileSystemProvider`, ponieważ:

- Znany wzorzec (VS Code) — API dobrze przemyślane dla file operations
- **Implementacje** w `@mhersztowski/core/vfs/`:
  - `MemoryFS` — in-memory, testy i tymczasowe dane
  - `CompositeFS` — mount multiple providers pod różnymi ścieżkami
  - `GitHubFS` — pliki z GitHub API (read-only)
  - `BrowserFS` — File System Access API (desktop-like w przeglądarce)
  - `NodeFS` — Node.js fs (backend only)
  - `RemoteFS` — REST proxy do server-side VFS (`/api/vfs/*`)
- `MonacoMultiEditor` w web-client otwiera pliki z VFS przez double-click
- Minis backend eksponuje `CompositeFS` z NodeFS przez `/api/vfs/*` (admin-only)

## Konsekwencje

### Pozytywne
- Moduł edytora (MonacoMultiEditor) nie zna źródła pliku — to samo API dla GitHub, Memory, Node.js
- MJD editors (`MjdVfsLoader`) ładują/zapisują definicje z dowolnego VFS provider
- Łatwe dodanie nowego providera (np. S3) bez zmiany konsumentów
- `VfsExplorer` UI działa z każdym FileSystemProvider

### Negatywne / kompromisy
- `FileSystemProvider` interface ma 10+ metod — nie wszystkie implementacje wspierają wszystkie operacje (`isWritable()` check)
- `BrowserFS` i `NodeFS` nie działają w każdym środowisku (capability check wymagany)
- `RemoteFS` wymaga HTTP round-trip — latency dla każdej operacji
- `watch()` nie jest implementowany przez wszystkie providery
