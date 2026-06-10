#!/bin/bash
set -euo pipefail

# Pobieranie plików z serwera do wskazanego lokalnego katalogu.
# Użycie:
#   ./scripts/fetch.sh <local-dest-dir> [remote-subpath]
#
#   <local-dest-dir>   — lokalny katalog docelowy (tworzony jeśli nie istnieje)
#   [remote-subpath]   — ścieżka względem SYNC_REMOTE_PATH na serwerze
#                        (domyślnie: cały SYNC_REMOTE_PATH)
#
# Przykłady:
#   ./scripts/fetch.sh /tmp/backup-test
#   ./scripts/fetch.sh /tmp/users Minis/Users/marcin
#   ./scripts/fetch.sh ./local-copy Minis/Admin

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.env.sync" ]; then
  source "$PROJECT_ROOT/.env.sync"
fi

SYNC_HOST="${SYNC_HOST:?Ustaw SYNC_HOST w .env.sync lub jako env var (np. root@1.2.3.4)}"
SYNC_REMOTE_PATH="${SYNC_REMOTE_PATH:-/opt/mycastle-data/}"

usage() {
  cat <<EOF
Użycie: $0 <local-dest-dir> [remote-subpath]

  <local-dest-dir>   Lokalny katalog docelowy (zostanie utworzony jeśli nie istnieje)
  [remote-subpath]   Podścieżka na serwerze względem SYNC_REMOTE_PATH
                     (domyślnie: cały katalog SYNC_REMOTE_PATH)

Przykłady:
  $0 /tmp/backup
  $0 /tmp/users Minis/Users/marcin
  $0 ./local-copy Minis/Admin
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

LOCAL_DEST="$1"
REMOTE_SUBPATH="${2:-}"

if [ -n "$REMOTE_SUBPATH" ]; then
  # Upewnij się że SYNC_REMOTE_PATH nie kończy się / przed doklejeniem subpath
  REMOTE_SOURCE="${SYNC_REMOTE_PATH%/}/${REMOTE_SUBPATH}"
else
  REMOTE_SOURCE="$SYNC_REMOTE_PATH"
fi

mkdir -p "$LOCAL_DEST"

echo ">>> Fetch: $SYNC_HOST:$REMOTE_SOURCE → $LOCAL_DEST"

rsync -avz --no-o --no-g "$SYNC_HOST:$REMOTE_SOURCE/" "$LOCAL_DEST/"

echo ">>> Gotowe."
