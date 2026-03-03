#!/bin/bash
set -euo pipefail

# Synchronizacja katalogu data/ między lokalnym dev a serwerem Coolify
# Użycie:
#   ./scripts/sync.sh push [--force]      # local → server (pliki, bez SQLite)
#   ./scripts/sync.sh pull [--force]      # server → local (pliki, bez SQLite)
#   ./scripts/sync.sh db-push             # local iot.db → server
#   ./scripts/sync.sh db-pull             # server iot.db → local

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

# Wykluczenia dla rsync
EXCLUDES=(
  # SQLite (WAL mode, binary — osobna komenda db-push/db-pull)
  --exclude='iot.db'
  --exclude='iot.db-wal'
  --exclude='iot.db-shm'
  # Arduino: biblioteki (pobierane przez arduino-cli), output (skompilowane binarki), build cache
  --exclude='projects/*/libraries/'
  --exclude='projects/*/output/'
  --exclude='projects/*/build/'
)

RSYNC_OPTS=(
  -avz
  --delete
  "${EXCLUDES[@]}"
)

usage() {
  echo "Użycie: $0 {push|pull|db-push|db-pull} [--force]"
  echo ""
  echo "  push      Wyślij lokalne data/ na serwer (dry-run domyślnie)"
  echo "  pull      Ściągnij data/ z serwera na lokala (dry-run domyślnie)"
  echo "  db-push   Wyślij lokalną bazę iot.db na serwer (sqlite3 .backup)"
  echo "  db-pull   Ściągnij bazę iot.db z serwera (sqlite3 .backup)"
  echo "  --force   Wykonaj naprawdę (tylko push/pull)"
  exit 1
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
    fi
    echo ">>> Sync: local → $SYNC_HOST:$SYNC_REMOTE_PATH"
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

  *)
    usage
    ;;
esac
