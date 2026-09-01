#!/usr/bin/env bash
# Pomocnik odtwarzania. Wszystko, co tu jest, da się zrobić gołym resticiem —
# ale w dniu awarii nikt nie pamięta składni, a dokumentacja leży na maszynie,
# której właśnie nie ma.
set -uo pipefail

CONFIG="${BACKUP_CONFIG:-/etc/homelab-backup/backup.env}"
[[ -r $CONFIG ]] || { echo "Brak pliku konfiguracji: $CONFIG" >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

usage() {
  cat <<'USAGE'
Użycie: restore.sh <polecenie> [argumenty]

  snapshots                        lista punktów w czasie
  ls <snapshot> [ścieżka]          zawartość snapshotu (snapshot: id albo "latest")
  find <wzorzec>                   szukanie pliku we wszystkich snapshotach
  diff <snapshot-a> <snapshot-b>   co się zmieniło między snapshotami

  get <snapshot> <ścieżka> [cel]   odtworzenie ścieżki (domyślny cel: /var/tmp/restore)
  mount <katalog>                  podmontowanie repozytorium (wymaga fuse)

  db-list [snapshot]               zrzuty baz dostępne w snapshocie
  db-restore <plik.sql> <kontener> --yes
                                   wgranie zrzutu do działającego kontenera Postgresa

Przykłady:
  restore.sh get latest /opt/mycastle-data
  restore.sh get latest /data/coolify /var/tmp/coolify-odzysk
  restore.sh db-restore coolify-db.sql coolify-db --yes
USAGE
}

cmd="${1:-}"
shift || true

case "$cmd" in
  snapshots)
    restic snapshots --group-by host,tags "$@"
    ;;

  ls)
    snap="${1:?podaj snapshot albo 'latest'}"
    shift || true
    restic ls -l "$snap" "$@"
    ;;

  find)
    restic find "${1:?podaj wzorzec}"
    ;;

  diff)
    restic diff "${1:?podaj snapshot A}" "${2:?podaj snapshot B}"
    ;;

  get)
    snap="${1:?podaj snapshot albo 'latest'}"
    path="${2:?podaj ścieżkę do odtworzenia}"
    target="${3:-/var/tmp/restore}"
    mkdir -p "$target"
    echo "Odtwarzam $path ze snapshotu $snap do $target"
    # --include zamiast --path: odtwarzamy poddrzewo w miejsce docelowe,
    # zachowując oryginalną ścieżkę pod nim, żeby nic nie nadpisać wprost
    # w systemie plików maszyny.
    restic restore "$snap" --target "$target" --include "$path"
    echo "Gotowe: $target$path"
    ;;

  mount)
    dir="${1:?podaj katalog montowania}"
    mkdir -p "$dir"
    echo "Montuję repozytorium w $dir (Ctrl+C kończy)."
    restic mount "$dir"
    ;;

  db-list)
    snap="${1:-latest}"
    restic ls "$snap" 2>/dev/null | grep '/databases/.*\.sql$' || echo "(brak zrzutów w snapshocie $snap)"
    ;;

  db-restore)
    dump="${1:?podaj nazwę pliku zrzutu, np. coolify-db.sql}"
    container="${2:?podaj nazwę kontenera}"
    confirm="${3:-}"
    if [[ $confirm != "--yes" ]]; then
      echo "To NADPISZE bazy w kontenerze $container zrzutem $dump." >&2
      echo "Zrzuty z pg_dumpall zawierają DROP ... — istniejące dane znikną." >&2
      echo "Powtórz z --yes na końcu, jeśli o to chodzi." >&2
      exit 1
    fi

    staging="${STAGING_DIR:-/var/backups/homelab/staging}"
    work="/var/tmp/db-restore.$$"
    mkdir -p "$work"
    echo "Pobieram $dump z ostatniego snapshotu…"
    restic restore latest --target "$work" --include "$staging/databases/$dump" || exit 1
    file="$work$staging/databases/$dump"
    [[ -s $file ]] || { echo "Nie znaleziono zrzutu: $dump" >&2; exit 1; }

    user="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
            | sed -n 's/^POSTGRES_USER=//p' | head -1)"
    user="${user:-postgres}"
    pass="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
            | sed -n 's/^POSTGRES_PASSWORD=//p' | head -1)"

    echo "Wgrywam do kontenera $container jako $user…"
    docker exec -i -e "PGPASSWORD=$pass" "$container" psql -U "$user" -d postgres <"$file"
    rc=$?
    rm -rf "$work"
    if ((rc == 0)); then
      echo "Zrzut wgrany. Zrestartuj aplikacje korzystające z tej bazy."
    else
      echo "psql zakończył się kodem $rc — sprawdź komunikaty powyżej." >&2
    fi
    exit $rc
    ;;

  ""|-h|--help|help)
    usage
    ;;

  *)
    echo "Nieznane polecenie: $cmd" >&2
    usage
    exit 1
    ;;
esac
