#!/bin/bash
set -euo pipefail

# Synchronizacja katalogu data/ między lokalnym dev a serwerem Coolify
# Użycie:
#   ./scripts/sync.sh push [--force]      # local → server (bez user-data, bez SQLite)
#   ./scripts/sync.sh pull [--force]      # server → local (bez user-data, bez SQLite)
#   ./scripts/sync.sh db-push             # local iot.db → server
#   ./scripts/sync.sh db-pull             # server iot.db → local
#   ./scripts/sync.sh backup              # snapshot serwerowego data/Minis/Users na serwerze (tarball)
#   ./scripts/sync.sh backup-list         # lista snapshotów na serwerze
#
# ── KRYTYCZNE OSTRZEŻENIE ────────────────────────────────────────────────
# Dane wprowadzane przez użytkowników w aplikacji webowej (drive, Calendar,
# pliki, tagi, itd.) leżą na serwerze. push/pull DOMYŚLNIE TE DANE POMIJAJĄ
# (przez EXCLUDES poniżej) — żeby push z lokalnej (która ma starą / pustą
# kopię) NIE NADPISAŁ serwerowych zmian użytkownika.
#
# Push synchronizuje WYŁĄCZNIE config / publiczne assety / firmware / inne
# nie-user-generated dane. Drive użytkownika jest święty — sync go nie
# rusza. Jeśli musisz coś przenieść z drive lokal→serwer, zrób to ręcznie
# (scp, rclone, drive UI w aplikacji).
#
# Każdy `push --force` najpierw robi tarball-snapshot serwerowego
# `Minis/Users/` do `/opt/mycastle-backups/users-{TS}.tar.gz` — backup
# został wprowadzony 2026-06 po incydencie utraty danych.
# ─────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_ROOT/data/"
LOCAL_DB="$PROJECT_ROOT/data/iot.db"

# Konfiguracja serwera — nadpisz przez env vars lub .env
if [ -f "$PROJECT_ROOT/.env.sync" ]; then
  source "$PROJECT_ROOT/.env.sync"
fi

SYNC_HOST="${SYNC_HOST:?Ustaw SYNC_HOST w .env.sync lub jako env var (np. root@1.2.3.4)}"
SYNC_REMOTE_PATH="${SYNC_REMOTE_PATH:-/opt/mycastle-data/}"
REMOTE_DB="${SYNC_REMOTE_PATH}iot.db"
REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:-/opt/mycastle-backups}"

# Wykluczenia dla rsync — wszystkie pliki które MOGĄ być modyfikowane przez
# użytkownika przez aplikację webową MUSZĄ tu być, inaczej push z lokalnej
# nadpisze / wykasuje serwerowe dane.
EXCLUDES=(
  # SQLite (WAL mode, binary — osobna komenda db-push/db-pull)
  --exclude='iot.db'
  --exclude='iot.db-wal'
  --exclude='iot.db-shm'

  # ── USER DATA — NIGDY nie synchronizujemy. Te katalogi są tworzone i
  # modyfikowane przez użytkowników w aplikacji webowej; lokalna kopia
  # to dev sandbox, nie source-of-truth.
  --exclude='Minis/Users/*/drive/'
  --exclude='Minis/Users/*/Calendar/'
  --exclude='Minis/Users/*/Project.json'
  --exclude='Minis/Users/*/Projects/'
  --exclude='Minis/Users/*/Tasks/'
  --exclude='Minis/Users/*/Events/'
  --exclude='Minis/Users/*/Notes/'
  --exclude='Minis/Users/*/Shopping/'
  --exclude='Minis/Users/*/Persons/'
  --exclude='Minis/Users/*/Documents/'
  --exclude='Minis/Users/*/Electronics/'
  --exclude='Minis/Users/*/app/'
  --exclude='Minis/Users/*/Snippets/'
  # Auth — nigdy nie nadpisujemy serwerowych hash'ów haseł / API keyów
  --exclude='Minis/Admin/Users.json'
  --exclude='Minis/Admin/ApiKeys.json'

  # Arduino: biblioteki (pobierane przez arduino-cli), output (skompilowane binarki), build cache
  --exclude='projects/*/libraries/'
  --exclude='projects/*/output/'
  --exclude='projects/*/build/'

  # Sidecary aplikacji
  --exclude='.fileproperties.json'
  --exclude='.favorites.json'
  --exclude='.terminal-tickets.json'
)

RSYNC_OPTS=(
  -avz
  --no-o --no-g   # nie próbuj zmieniać owner/group (pliki tworzone przez Docker mają inny UID/GID)
  "${EXCLUDES[@]}"
)
# UWAGA: BRAK `--delete` w domyślnym zestawie. Wcześniej był — i to on
# spowodował utratę danych w incydencie 2026-06: rsync z `--delete` usuwał
# pliki na serwerze nieobecne lokalnie, włącznie z user-data. Teraz push
# DODAJE/AKTUALIZUJE pliki, ale NIGDY nie kasuje czegokolwiek na serwerze.

usage() {
  cat <<EOF
Użycie: $0 {push|pull|db-push|db-pull|backup|backup-list} [--force]

  push          Wyślij lokalne data/ na serwer (DODAJE/UPDATE, NIE kasuje).
                User-data (drive/Calendar/Projects/…) i hashed passwords
                są wykluczone — patrz nagłówek pliku.
                Domyślnie dry-run; --force wykonuje naprawdę.

                Pre-push backup serwerowych Minis/Users/ → tarball
                w \$REMOTE_BACKUP_DIR (domyślnie /opt/mycastle-backups/).

  pull          Ściągnij data/ z serwera (DODAJE/UPDATE, NIE kasuje
                lokalnie). Te same exclude'y co push.

  db-push       Wyślij lokalną bazę iot.db na serwer (sqlite3 .backup)
  db-pull       Ściągnij bazę iot.db z serwera (sqlite3 .backup)

  backup        Ręczny snapshot serwerowego Minis/Users/ → tarball
                w \$REMOTE_BACKUP_DIR. Bezpieczny — można odpalać często.

  backup-list   Pokaż dostępne snapshoty na serwerze (rozmiary + daty).
EOF
  exit 1
}

# Pre-push backup: bezpieczna sieć ratunkowa. Tarball serwerowego
# Minis/Users/ z timestamp'em, w osobnym katalogu poza data/. Tani: dla
# typowego konta to <100MB tar.gz.
remote_backup() {
  local stamp
  stamp=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
  local archive="${REMOTE_BACKUP_DIR}/users-${stamp}.tar.gz"
  echo ">>> Pre-push backup: ${SYNC_HOST}:${archive}"
  ssh "$SYNC_HOST" "mkdir -p '$REMOTE_BACKUP_DIR' && \
    tar -czf '$archive' -C '$SYNC_REMOTE_PATH' Minis/Users 2>/dev/null && \
    ls -lh '$archive' | awk '{print \"    size: \" \$5}'" \
    || { echo "!!! Backup FAILED — przerywam push z bezpieczeństwa"; exit 2; }
}

if [ $# -lt 1 ]; then
  usage
fi

COMMAND="$1"
FORCE="${2:-}"

case "$COMMAND" in
  push)
    if [ "$FORCE" != "--force" ]; then
      RSYNC_OPTS+=(--dry-run)
      echo "=== DRY RUN — podgląd zmian (nic nie zostanie zmienione) ==="
      echo ""
    else
      # Bezpieczna sieć: pre-push tarball nim cokolwiek tknie remote.
      remote_backup
    fi
    echo ">>> Sync: local → $SYNC_HOST:$SYNC_REMOTE_PATH"
    echo "    (user-data wykluczone — patrz EXCLUDES w scripts/sync.sh)"
    rsync "${RSYNC_OPTS[@]}" "$LOCAL_DATA" "$SYNC_HOST:$SYNC_REMOTE_PATH"
    if [ "$FORCE" != "--force" ]; then
      echo ""
      echo "=== To był dry-run. Aby wykonać naprawdę: pnpm sync:push:force ==="
    fi
    ;;

  pull)
    if [ "$FORCE" != "--force" ]; then
      RSYNC_OPTS+=(--dry-run)
      echo "=== DRY RUN — podgląd zmian (nic nie zostanie zmienione) ==="
      echo ""
    fi
    echo ">>> Sync: $SYNC_HOST:$SYNC_REMOTE_PATH → local"
    echo "    (user-data wykluczone — patrz EXCLUDES w scripts/sync.sh)"
    rsync "${RSYNC_OPTS[@]}" "$SYNC_HOST:$SYNC_REMOTE_PATH" "$LOCAL_DATA"
    if [ "$FORCE" != "--force" ]; then
      echo ""
      echo "=== To był dry-run. Aby wykonać naprawdę: pnpm sync:pull:force ==="
    fi
    ;;

  db-push)
    echo ">>> DB sync: local iot.db → server"
    if [ ! -f "$LOCAL_DB" ]; then
      echo "Błąd: lokalna baza $LOCAL_DB nie istnieje"
      exit 1
    fi
    BACKUP_FILE="/tmp/iot-sync-$$.db"
    echo "  Tworzę backup lokalnej bazy..."
    sqlite3 "$LOCAL_DB" ".backup '$BACKUP_FILE'"
    echo "  Wysyłam na serwer..."
    scp "$BACKUP_FILE" "$SYNC_HOST:$REMOTE_DB"
    rm -f "$BACKUP_FILE"
    echo "  Gotowe."
    ;;

  db-pull)
    echo ">>> DB sync: server iot.db → local"
    REMOTE_BACKUP="/tmp/iot-sync-$$.db"
    echo "  Tworzę backup bazy na serwerze..."
    ssh "$SYNC_HOST" "sqlite3 '$REMOTE_DB' '.backup $REMOTE_BACKUP'"
    echo "  Pobieram..."
    scp "$SYNC_HOST:$REMOTE_BACKUP" "$LOCAL_DB"
    ssh "$SYNC_HOST" "rm -f '$REMOTE_BACKUP'"
    echo "  Gotowe."
    ;;

  backup)
    remote_backup
    echo ">>> Backup OK"
    ;;

  backup-list)
    echo ">>> Snapshoty na serwerze (${SYNC_HOST}:${REMOTE_BACKUP_DIR}):"
    ssh "$SYNC_HOST" "ls -lh '$REMOTE_BACKUP_DIR' 2>/dev/null || echo '    (brak katalogu / brak snapshotów)'"
    ;;

  *)
    usage
    ;;
esac
