#!/bin/bash
set -euo pipefail

# Synchronizacja katalogu data/ między lokalnym dev a serwerem Coolify
# Użycie:
#   ./scripts/sync.sh push [--force]   # local → server
#   ./scripts/sync.sh pull [--force]   # server → local

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOCAL_DATA="$PROJECT_ROOT/data/"

# Konfiguracja serwera — nadpisz przez env vars lub .env
if [ -f "$PROJECT_ROOT/.env.sync" ]; then
  source "$PROJECT_ROOT/.env.sync"
fi

SYNC_HOST="${SYNC_HOST:?Ustaw SYNC_HOST w .env.sync lub jako env var (np. root@1.2.3.4)}"
SYNC_REMOTE_PATH="${SYNC_REMOTE_PATH:-/opt/mycastle-data/}"

# SQLite nie nadaje się do rsync (WAL mode, binary) — wykluczamy
EXCLUDES=(
  --exclude='iot.db'
  --exclude='iot.db-wal'
  --exclude='iot.db-shm'
)

RSYNC_OPTS=(
  -avz
  --delete
  "${EXCLUDES[@]}"
)

usage() {
  echo "Użycie: $0 {push|pull} [--force]"
  echo ""
  echo "  push    Wyślij lokalne data/ na serwer (dry-run domyślnie)"
  echo "  pull    Ściągnij data/ z serwera na lokala (dry-run domyślnie)"
  echo "  --force Wykonaj naprawdę (bez --force robi tylko dry-run)"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

COMMAND="$1"
FORCE="${2:-}"

if [ "$FORCE" != "--force" ]; then
  RSYNC_OPTS+=(--dry-run)
  echo "=== DRY RUN (dodaj --force żeby wykonać naprawdę) ==="
  echo ""
fi

case "$COMMAND" in
  push)
    echo ">>> Sync: local → $SYNC_HOST:$SYNC_REMOTE_PATH"
    rsync "${RSYNC_OPTS[@]}" "$LOCAL_DATA" "$SYNC_HOST:$SYNC_REMOTE_PATH"
    ;;
  pull)
    echo ">>> Sync: $SYNC_HOST:$SYNC_REMOTE_PATH → local"
    rsync "${RSYNC_OPTS[@]}" "$SYNC_HOST:$SYNC_REMOTE_PATH" "$LOCAL_DATA"
    ;;
  *)
    usage
    ;;
esac

if [ "$FORCE" != "--force" ]; then
  echo ""
  echo "=== To był dry-run. Dodaj --force żeby wykonać naprawdę ==="
fi
