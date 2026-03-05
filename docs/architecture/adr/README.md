# Architecture Decision Records

ADR (Architecture Decision Records) dokumentują kluczowe decyzje architektoniczne podjęte w projekcie MyCastle. Format: [MADR](https://adr.github.io/madr/).

## Lista decyzji

| Nr | Tytuł | Data | Status |
|----|-------|------|--------|
| [0001](0001-pnpm-monorepo.md) | pnpm Workspaces jako monorepo | 2024-01-01 | Accepted |
| [0002](0002-mqtt-as-transport.md) | MQTT jako primary transport | 2024-01-01 | Accepted |
| [0003](0003-dual-esm-cjs-packages.md) | Dual ESM+CJS build dla pakietów | 2024-01-01 | Accepted |
| [0004](0004-sqlite-iot-storage.md) | SQLite dla telemetrii IoT | 2024-06-01 | Accepted |
| [0005](0005-zod-single-source-of-truth.md) | Zod jako single source of truth | 2024-03-01 | Accepted |
| [0006](0006-app-singleton-pattern.md) | App Singleton Pattern | 2024-02-01 | Accepted |
| [0007](0007-vfs-abstraction.md) | VFS Abstraction Layer | 2024-04-01 | Accepted |
| [0008](0008-jwt-apikey-dual-auth.md) | JWT + API Key dual authentication | 2024-05-01 | Accepted |
| [0009](0009-shared-http-mqtt-port.md) | Shared HTTP + MQTT WebSocket port | 2024-01-01 | Accepted |
| [0010](0010-c4-model-documentation.md) | C4 Model jako standard dokumentacji | 2026-03-05 | Accepted |

## Template MADR

```markdown
# NR. Tytuł decyzji

Data: YYYY-MM-DD
Status: Proposed | Accepted | Deprecated | Superseded by [NR]

## Kontekst

Opis problemu lub sytuacji wymagającej decyzji.

## Rozważane opcje

- Opcja A
- Opcja B
- Opcja C

## Decyzja

Wybrana opcja: **Opcja A**, ponieważ...

## Konsekwencje

### Pozytywne
- ...

### Negatywne / kompromisy
- ...
```

## Jak dodać nowy ADR

1. Skopiuj template powyżej
2. Utwórz plik `NNNN-krotki-opis.md` (następny numer)
3. Dodaj do tabeli w tym pliku
4. Commit z komunikatem: `docs(adr): add ADR-NNNN krotki opis`
