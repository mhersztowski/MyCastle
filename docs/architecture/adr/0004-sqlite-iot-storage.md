# 0004. SQLite dla telemetrii IoT

Data: 2024-06-01
Status: Accepted

## Kontekst

Minis Platform zbiera telemetrię z urządzeń IoT (temperatury, wilgotność, stany przełączników) w czasie rzeczywistym. Dane muszą być trwałe, odpytywalne (filtrowanie po czasie, agregacja), a deployment musi być prosty (bez osobnego serwera DB).

## Rozważane opcje

- **SQLite** (better-sqlite3) — embedded, zero-config, WAL mode dla concurrent reads
- **PostgreSQL / MySQL** — pełnoprawne RDBMS, wymaga osobnego serwera
- **InfluxDB** — time-series baza danych, specjalizowana dla telemetrii, ale ciężka
- **JSON files** (istniejący pattern) — proste, ale brak queries, wolne przy dużej ilości danych
- **MongoDB** — dokumentowa, wymaga osobnego serwera, overkill dla projektu embedded

## Decyzja

Wybrana opcja: **SQLite via better-sqlite3 z WAL mode**, ponieważ:

- **Zero deployment overhead** — plik `data/iot.db`, nie wymaga osobnego procesu
- **WAL mode** — concurrent reads bez blokowania writes (telemetria + UI czytanie jednocześnie)
- **better-sqlite3** — synchroniczny API, bardziej przewidywalny performance niż async sqlite3
- **Schema** — `telemetry`, `telemetry_config`, `commands`, `alert_rules`, `alerts`, `device_shares`
- **Prepared statements** — wydajność i ochrona przed SQL injection
- Skala projektu (pojedynczy serwer, setki urządzeń) nie uzasadnia zewnętrznego serwera DB

## Konsekwencje

### Pozytywne
- Prosty backup/sync: `pnpm sync:db-push/pull` kopiuje jeden plik
- Agregacja (min/max/avg per window) natywnie w SQL
- `better-sqlite3` + synchroniczny API = prostszy kod bez async/await w IotDatabase
- Dockerfile wymaga `python3, make, g++` dla native module compilation

### Negatywne / kompromisy
- SQLite nie skaluje się poziomo (single writer) — akceptowalne dla single-server deployment
- `better-sqlite3` jest native module — wymaga rebuildu przy zmianie wersji Node.js
- Brak time-series specific features (retention policies, downsample) — ręczna implementacja przy potrzebie
- Sync `iot.db` jest osobny od sync plików JSON (osobne komendy)
