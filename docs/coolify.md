# Deployment — Coolify

## Architektura

Trzy osobne projekty w Coolify, wszystkie z tego samego repo GitHub:

| Projekt Coolify | Typ | Compose file | Domena |
|---|---|---|---|
| MyCastle | Docker Compose | `docker-compose.yml` | mycastle.hersztowski.org |
| Minis | Docker Compose | `docker-compose.minis.yml` | minis.hersztowski.org |
| Demo Scene 3D | Dockerfile | `app/demo-scene-3d/Dockerfile` | scene3d.hersztowski.org |

## Shared data directory

MyCastle i Minis współdzielą katalog danych przez **bind mount** na hoście:

```
/opt/mycastle-data:/data
```

Oba docker-compose montują ten sam katalog hostowy `/opt/mycastle-data`. Przed pierwszym deployem trzeba go utworzyć na serwerze:

```bash
ssh root@server
mkdir -p /opt/mycastle-data
```

### Struktura danych

```
/opt/mycastle-data/
├── *.json              # MyCastle data (osoby, projekty, taski, etc.)
├── Minis/
│   ├── Admin/          # Minis admin data (Users.json, DeviceDefs.json, etc.)
│   └── Users/          # Minis per-user data
└── iot.db              # Minis IoT SQLite database
```

### Bezpieczeństwo współdzielenia

- MyCastle backend czyta/pisze JSON files w rootcie `/data`
- Minis backend czyta/pisze w `/data/Minis/` + SQLite w `/data/iot.db`
- Nie ma konfliktów — każdy backend operuje na swoich plikach
- SQLite (WAL mode) — bezpieczny dopóki tylko jeden proces pisze (minis-backend)

## Tworzenie projektu w Coolify

### 1. Dodaj GitHub source (raz)

Sources → + Add → GitHub App → OAuth flow → autoryzuj repo.

### 2. Nowy resource (Docker Compose)

1. Projects → Twój projekt → + New
2. Wybierz GitHub App jako źródło
3. Wybierz repo i branch `main`
4. Zmień build pack z Nixpacks na **Docker Compose**
5. Skonfiguruj:
   - Base Directory: `/`
   - Docker Compose Location: `/docker-compose.yml` (lub `/docker-compose.minis.yml`)
6. Continue

### 3. Konfiguracja serwisu

- **Domena**: przypisz w ustawieniach serwisu (Coolify routuje przez Traefik)
- **Ports Exposes**: port wewnętrzny kontenera (1894 dla mycastle, 1902 dla minis)
- Nie dodawaj `ports:` w docker-compose — Coolify zarządza portami przez Traefik

### 4. Nowy resource (Dockerfile — demo-scene-3d)

1. Projects → + New → GitHub App → repo → branch `main`
2. Zmień build pack na **Dockerfile**
3. Dockerfile location: `app/demo-scene-3d/Dockerfile`
4. Build context: `/` (root repo — Dockerfile kopiuje packages/)
5. Przypisz domenę, port 80

## Zmienne środowiskowe

### MyCastle backend

Ustawione w `docker-compose.yml`, nie trzeba nic dodawać w Coolify:

| Zmienna | Wartość | Opis |
|---|---|---|
| `PORT` | `1894` | HTTP + MQTT WebSocket port |
| `ROOT_DIR` | `/data` | Katalog danych (bind mount) |
| `STATIC_DIR` | `/app/app/mycastle-web/build` | Statyczne pliki frontendu (serwowane z backendu) |

### Minis backend

Ustawione w `docker-compose.minis.yml`. `JWT_SECRET` trzeba dodać w Coolify (Environment Variables):

| Zmienna | Wartość | Opis |
|---|---|---|
| `PORT` | `1902` | HTTP + MQTT WebSocket port |
| `ROOT_DIR` | `/data` | Katalog danych (bind mount) |
| `STATIC_DIR` | `/app/app/minis-web/build` | Statyczne pliki frontendu |
| `JWT_SECRET` | (secret) | **Wymagany** — ustawić w Coolify env vars |

### Frontend (mycastle-web, minis-web)

Frontendy nie potrzebują zmiennych — `.env` jest usuwany przed buildem, URL-e są auto-detectowane z `window.location`.

## Synchronizacja danych (local ↔ server)

Skrypt `scripts/sync.sh` synchronizuje katalog `data/` między lokalnym dev a serwerem przez rsync.

### Konfiguracja (raz)

Skopiuj `.env.sync.example` → `.env.sync` i uzupełnij:

```bash
cp .env.sync.example .env.sync
# Edytuj .env.sync — ustaw SYNC_HOST
```

### Użycie

```bash
# Podgląd zmian (dry-run, nic nie zmienia):
pnpm sync:push         # co by się zmieniło na serwerze
pnpm sync:pull         # co by się zmieniło lokalnie

# Wykonaj naprawdę:
pnpm sync:push:force   # local → server
pnpm sync:pull:force   # server → local
```

### Co jest synchronizowane

- Wszystkie pliki JSON (dane MyCastle i Minis)
- **Wykluczone**: `iot.db`, `iot.db-wal`, `iot.db-shm` — SQLite w trybie WAL nie nadaje się do rsync (binary, aktywne zapisy). Do backupu SQLite użyj `sqlite3 iot.db ".backup backup.db"` na serwerze.

### Flaga `--delete`

Rsync z `--delete` usuwa pliki na docelowej stronie, których nie ma u źródła. Dlatego domyślnie robi **dry-run** — zawsze najpierw sprawdź co się zmieni.

## Backup

```bash
# Na serwerze
tar czf /root/mycastle-backup-$(date +%Y%m%d).tar.gz /opt/mycastle-data/

# Lub rsync do lokalnej maszyny
pnpm sync:pull:force
```
