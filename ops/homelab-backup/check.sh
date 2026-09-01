#!/usr/bin/env bash
# Weryfikacja repozytorium. Backup, którego nikt nigdy nie sprawdził, jest
# tylko przypuszczeniem — a uszkodzenie w chmurze wychodzi zwykle dopiero
# przy odtwarzaniu, czyli w najgorszym możliwym momencie.
#
# Co tydzień sprawdzamy strukturę (tanie: czytane są indeksy i metadane).
# W pierwszym tygodniu miesiąca dodatkowo pobieramy i przeliczamy próbkę
# danych — to jedyny sposób, żeby wykryć ciche przekłamanie treści paczek,
# ale kosztuje transfer, więc nie robimy tego co tydzień.
set -uo pipefail

CONFIG="${BACKUP_CONFIG:-/etc/homelab-backup/backup.env}"
[[ -r $CONFIG ]] || { echo "Brak pliku konfiguracji: $CONFIG" >&2; exit 1; }
# shellcheck source=/dev/null
source "$CONFIG"
export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

# rclone traktuje zmienną USTAWIONĄ-ale-pustą jako wartość do sparsowania:
# RCLONE_BWLIMIT="" wywraca każde wywołanie ("invalid argument \"\" for
# --bwlimit"). Pusta wartość ma tu znaczyć "bez ograniczenia", więc zmienną
# w takim wypadku usuwamy zamiast przekazywać dalej.
[[ -z ${RCLONE_BWLIMIT:-} ]] && unset RCLONE_BWLIMIT

LOG_DIR="${LOG_DIR:-/var/log/homelab-backup}"
STATE_DIR="/var/lib/homelab-backup"
mkdir -p "$LOG_DIR" "$STATE_DIR"
exec > >(tee -a "$LOG_DIR/check-$(date +%Y-%m-%d).log") 2>&1

args=(check)
if (( $(date +%d) <= 7 )); then
  args+=(--read-data-subset=2%)
  echo "[$(date +%H:%M:%S)] Weryfikacja pełna: struktura + 2% danych."
else
  echo "[$(date +%H:%M:%S)] Weryfikacja struktury repozytorium."
fi

if restic "${args[@]}"; then
  printf '%s\tok\tweryfikacja repozytorium OK\n' "$(date -Is)" >"$STATE_DIR/last-check"
  echo "[$(date +%H:%M:%S)] Repozytorium spójne."
else
  rc=$?
  printf '%s\tfail\tweryfikacja repozytorium zgłosiła błędy (kod %s)\n' "$(date -Is)" "$rc" >"$STATE_DIR/last-check"
  echo "[$(date +%H:%M:%S)] BŁĄD: restic check zakończył się kodem $rc" >&2
  [[ -n ${NOTIFY_CMD:-} ]] && "$NOTIFY_CMD" fail "restic check zgłosił błędy w repozytorium (kod $rc)"
  exit "$rc"
fi
