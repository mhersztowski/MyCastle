#!/usr/bin/env bash
# Archiwizacja homelaba do Google Drive przez restic + rclone.
#
# Podział pracy: moduły w collect/ wytwarzają to, czego nie da się skopiować
# plikowo (spójne zrzuty baz, inwentarz maszyny, konfiguracja Proxmoksa) i
# odkładają do katalogu staging; restic bierze staging razem ze zwykłymi
# katalogami i zajmuje się resztą — deduplikacją, szyfrowaniem i wysyłką.
#
# Awaria pojedynczego modułu NIE przerywa przebiegu: lepiej mieć snapshot
# plików bez jednego zrzutu bazy niż nie mieć nic. Przebieg kończy się wtedy
# kodem błędu, żeby systemd i powiadomienie o tym powiedziały.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${BACKUP_CONFIG:-/etc/homelab-backup/backup.env}"

if [[ ! -r $CONFIG ]]; then
  echo "Brak czytelnego pliku konfiguracji: $CONFIG" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$CONFIG"

export RESTIC_REPOSITORY RESTIC_PASSWORD_FILE

# Moduły w collect/ są osobnymi programami, nie funkcjami — bez eksportu
# zmienne z konfiguracji do nich nie docierają, a moduł widzi puste wartości
# i po cichu pomija swoją pracę, meldując sukces.
export PVE_HOST="${PVE_HOST:-}"
export PVE_SSH_KEY="${PVE_SSH_KEY:-}"
export SKIP_DB_CONTAINERS="${SKIP_DB_CONTAINERS:-}"

# rclone traktuje zmienną USTAWIONĄ-ale-pustą jako wartość do sparsowania:
# RCLONE_BWLIMIT="" wywraca każde wywołanie ("invalid argument \"\" for
# --bwlimit"). Pusta wartość ma tu znaczyć "bez ograniczenia", więc zmienną
# w takim wypadku usuwamy zamiast przekazywać dalej.
[[ -z ${RCLONE_BWLIMIT:-} ]] && unset RCLONE_BWLIMIT
STAGING_DIR="${STAGING_DIR:-/var/backups/homelab/staging}"
LOG_DIR="${LOG_DIR:-/var/log/homelab-backup}"
STATE_DIR="/var/lib/homelab-backup"
LOCK_FILE="/var/lock/homelab-backup.lock"

mkdir -p "$LOG_DIR" "$STATE_DIR" "$(dirname "$LOCK_FILE")"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d_%H%M%S).log"

# Cały wynik idzie i na ekran (journald przy starcie z systemd), i do pliku —
# logi w journald rotują się szybciej, niż trwa diagnoza nocnej awarii.
exec > >(tee -a "$LOG_FILE") 2>&1

startedAt=$(date +%s)
warnings=()
failures=()

log()  { echo "[$(date +%H:%M:%S)] $*"; }
warn() { warnings+=("$1"); echo "[$(date +%H:%M:%S)] OSTRZEŻENIE: $1" >&2; }
fail() { failures+=("$1"); echo "[$(date +%H:%M:%S)] BŁĄD: $1" >&2; }

finish() {
  local rc=$1
  local elapsed=$(( $(date +%s) - startedAt ))
  local status summary
  if ((${#failures[@]} > 0)); then
    status="fail"
    summary="archiwizacja zakończona z błędami (${#failures[@]}): ${failures[*]}"
  elif ((${#warnings[@]} > 0)); then
    status="ok"
    summary="archiwizacja OK z ostrzeżeniami (${#warnings[@]}): ${warnings[*]}"
  else
    status="ok"
    summary="archiwizacja OK"
  fi
  summary="$summary [${elapsed}s]"

  log "$summary"
  printf '%s\t%s\t%s\n' "$(date -Is)" "$status" "$summary" >"$STATE_DIR/last-status"

  if [[ -n ${NOTIFY_CMD:-} ]]; then
    # Powiadomienie nie może przewrócić przebiegu, który właśnie się udał.
    "$NOTIFY_CMD" "$status" "$summary" || warn "NOTIFY_CMD zakończyło się błędem"
  fi

  # Logi starsze niż 30 dni nie są już nikomu potrzebne, a przyrastają co noc.
  find "$LOG_DIR" -name '*.log' -mtime +30 -delete 2>/dev/null || true
  exit "$rc"
}

# ── Wyłączność ─────────────────────────────────────────────────────────────
# Przebieg potrafi trwać dłużej niż odstęp między uruchomieniami (pierwszy
# wysyła wszystko od zera). Dwa restici na jednym repozytorium naraz to
# zablokowane repo i przerwany transfer.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Inny przebieg archiwizacji już trwa — kończę bez działania."
  exit 0
fi

log "=== Archiwizacja $(hostname) → $RESTIC_REPOSITORY ==="

for tool in restic rclone docker; do
  command -v "$tool" >/dev/null 2>&1 || { fail "brak narzędzia: $tool"; finish 1; }
done

# ── Staging ────────────────────────────────────────────────────────────────
# Czyścimy przed każdym przebiegiem, żeby zrzut usuniętej bazy nie wisiał
# w archiwum w nieskończoność, udając aktualny.
rm -rf "${STAGING_DIR:?}"/*
mkdir -p "$STAGING_DIR"
chmod 700 "$STAGING_DIR"

log "--- Zrzuty baz danych ---"
"$SCRIPT_DIR/collect/databases.sh" "$STAGING_DIR" || fail "moduł baz danych"

log "--- Inwentarz systemu ---"
"$SCRIPT_DIR/collect/system.sh" "$STAGING_DIR" || warn "moduł inwentarza systemu"

log "--- Proxmox ---"
"$SCRIPT_DIR/collect/proxmox.sh" "$STAGING_DIR" || warn "moduł Proxmoksa"

# Znacznik przebiegu — jedyny plik, który celowo zmienia się za każdym razem.
{
  echo "host: $(hostname)"
  echo "data: $(date -Is)"
  echo "restic: $(restic version 2>/dev/null | head -1)"
  echo "rclone: $(rclone version 2>/dev/null | head -1)"
} >"$STAGING_DIR/BACKUP-INFO.txt"

# ── Repozytorium ───────────────────────────────────────────────────────────
probe="$(restic cat config 2>&1)"
if (($? != 0)); then
  # Rozróżnienie jest tu istotne: literówka w RESTIC_REPOSITORY albo zerwane
  # połączenie z Dyskiem wyglądają dla `cat config` tak samo jak brak
  # repozytorium. Ślepe `init` założyłoby wtedy nowe, puste repozytorium obok
  # prawdziwego, a archiwizacja meldowałaby sukces przez wiele miesięcy.
  if grep -q 'Is there a repository at the following location' <<<"$probe"; then
    log "Repozytorium nie istnieje — inicjalizuję."
    # Wersja 2 daje kompresję po stronie repozytorium; bez niej zrzuty SQL
    # jadą na Drive w całości, a to one ważą najwięcej.
    if ! restic init --repository-version 2; then
      fail "nie udało się zainicjalizować repozytorium"
      finish 1
    fi
  else
    fail "repozytorium nieosiągalne: $(head -2 <<<"$probe" | tr '\n' ' ')"
    finish 1
  fi
fi

# ── Snapshot ───────────────────────────────────────────────────────────────
paths=("$STAGING_DIR")
for p in "${BACKUP_PATHS[@]}"; do
  if [[ -e $p ]]; then
    paths+=("$p")
  else
    warn "ścieżka z konfiguracji nie istnieje: $p"
  fi
done

resticArgs=(
  backup
  --tag homelab
  --exclude-caches
  --one-file-system
)
[[ -n ${EXCLUDE_FILE:-} && -r ${EXCLUDE_FILE:-} ]] && resticArgs+=(--exclude-file "$EXCLUDE_FILE")

log "--- Wysyłka do repozytorium (${#paths[@]} ścieżek) ---"
restic "${resticArgs[@]}" "${paths[@]}"
rc=$?
case $rc in
  0) log "Snapshot zapisany." ;;
  # Kod 3 znaczy, że snapshot powstał, ale części plików nie dało się odczytać
  # (np. gniazdo albo plik skasowany w trakcie). To ostrzeżenie, nie porażka.
  3) warn "część plików była nieodczytywalna — snapshot mimo to powstał" ;;
  *) fail "restic backup zakończył się kodem $rc"; finish 1 ;;
esac

# ── Retencja ───────────────────────────────────────────────────────────────
forgetArgs=(
  forget
  --host "$(hostname)"
  --tag homelab
  --keep-daily "${KEEP_DAILY:-14}"
  --keep-weekly "${KEEP_WEEKLY:-8}"
  --keep-monthly "${KEEP_MONTHLY:-12}"
  --keep-yearly "${KEEP_YEARLY:-3}"
)

# prune przepisuje paczki w repozytorium: na dysku zdalnym to najdroższa
# operacja w całym cyklu, więc puszczamy ją raz w tygodniu, a nie co noc.
if [[ -n ${PRUNE_ON_WEEKDAY:-} && $(date +%u) == "${PRUNE_ON_WEEKDAY}" ]]; then
  log "--- Retencja + prune ---"
  forgetArgs+=(--prune)
else
  log "--- Retencja (bez prune) ---"
fi

restic "${forgetArgs[@]}" || warn "restic forget zakończył się błędem"

if [[ ${forgetArgs[*]} == *--prune* ]]; then
  log "--- Statystyki repozytorium ---"
  restic stats --mode raw-data 2>/dev/null | sed 's/^/  /' || true
fi

finish 0
