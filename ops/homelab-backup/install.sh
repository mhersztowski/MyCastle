#!/usr/bin/env bash
# Instalacja archiwizacji na maszynie docelowej. Idempotentna — istniejącej
# konfiguracji i hasła NIE nadpisuje, więc można ją puścić ponownie po każdej
# zmianie skryptów.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/opt/homelab-backup
ETC=/etc/homelab-backup

[[ $EUID -eq 0 ]] || { echo "Uruchom przez sudo." >&2; exit 1; }

# Wersje przypięte świadomie: instalacja ma dawać ten sam wynik dziś i za pół
# roku. Podniesienie to zmiana tych dwóch liczb (albo RESTIC_VERSION=… w env).
RESTIC_VERSION="${RESTIC_VERSION:-0.19.1}"
RCLONE_VERSION="${RCLONE_VERSION:-1.75.0}"
ARCH="$(dpkg --print-architecture)"

echo "== Zależności =="
needed=()
for t in curl bzip2 unzip fuse3; do
  command -v "$t" >/dev/null 2>&1 || needed+=("$t")
done
if ((${#needed[@]})); then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${needed[@]}"
fi

# Binarki bierzemy wprost od autorów, nie z apt. Ubuntu 24.04 wozi restica 0.16
# i rclone 1.60 (rocznik 2022); nowsze wydania restica znacząco obniżyły zużycie
# pamięci, co na maszynie z 3,4 GB RAM decyduje o tym, czy przebieg się kończy,
# czy ginie od OOM. Wersja z apt nie ma też `self-update` — Debian buduje ją bez
# tej komendy, więc aktualizacja w miejscu odpada.
#
# Sumy kontrolne pochodzą z tego samego serwera co pliki, więc chronią przed
# uszkodzonym pobraniem, a nie przed skompromitowanym wydawcą. Na tym poziomie
# zaufania świadomie poprzestajemy.
installRestic() {
  if [[ -x /usr/local/bin/restic ]] \
     && /usr/local/bin/restic version 2>/dev/null | grep -q "restic $RESTIC_VERSION"; then
    echo "   restic $RESTIC_VERSION już zainstalowany."
    return 0
  fi
  local name="restic_${RESTIC_VERSION}_linux_${ARCH}.bz2"
  local base="https://github.com/restic/restic/releases/download/v$RESTIC_VERSION"
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/$name" "$base/$name"
  curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
  ( cd "$tmp" && grep "  $name\$" SHA256SUMS | sha256sum -c - >/dev/null )
  bunzip2 -c "$tmp/$name" >"$tmp/restic"
  install -m 0755 "$tmp/restic" /usr/local/bin/restic
  rm -rf "$tmp"
  echo "   $(/usr/local/bin/restic version | head -1)"
}

installRclone() {
  if [[ -x /usr/local/bin/rclone ]] \
     && /usr/local/bin/rclone version 2>/dev/null | grep -q "v$RCLONE_VERSION"; then
    echo "   rclone $RCLONE_VERSION już zainstalowany."
    return 0
  fi
  local name="rclone-v${RCLONE_VERSION}-linux-${ARCH}.zip"
  local base="https://downloads.rclone.org/v$RCLONE_VERSION"
  local tmp; tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/$name" "$base/$name"
  curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"
  ( cd "$tmp" && grep "  $name\$" SHA256SUMS | sha256sum -c - >/dev/null )
  unzip -qo "$tmp/$name" -d "$tmp"
  install -m 0755 "$tmp/rclone-v${RCLONE_VERSION}-linux-${ARCH}/rclone" /usr/local/bin/rclone
  rm -rf "$tmp"
  echo "   $(/usr/local/bin/rclone version | head -1)"
}

echo "== restic i rclone =="
installRestic
installRclone

echo "== Skrypty → $DEST =="
mkdir -p "$DEST/collect"
install -m 0755 "$SRC/backup.sh" "$SRC/check.sh" "$SRC/restore.sh" "$SRC/setup-gdrive.sh" "$DEST/"
install -m 0755 "$SRC/collect/"*.sh "$DEST/collect/"
[[ -f $SRC/README.md ]] && install -m 0644 "$SRC/README.md" "$DEST/README.md"

echo "== Konfiguracja → $ETC =="
mkdir -p "$ETC"
chmod 700 "$ETC"

if [[ -f $ETC/backup.env ]]; then
  echo "   backup.env już istnieje — zostawiam bez zmian."
else
  install -m 0600 "$SRC/backup.env.example" "$ETC/backup.env"
  echo "   utworzono $ETC/backup.env — UZUPEŁNIJ przed pierwszym przebiegiem."
fi

# Wykluczenia to część kodu, nie konfiguracji lokalnej — nadpisujemy, żeby
# poprawka w repozytorium faktycznie dojechała na maszynę.
install -m 0644 "$SRC/excludes.txt" "$ETC/excludes.txt"

if [[ -f $ETC/restic-password ]]; then
  echo "   hasło repozytorium już istnieje — zostawiam bez zmian."
else
  umask 077
  openssl rand -base64 33 >"$ETC/restic-password"
  chmod 600 "$ETC/restic-password"
  cat <<'WARN'

   ┌──────────────────────────────────────────────────────────────────────┐
   │  WYGENEROWANO HASŁO REPOZYTORIUM.                                    │
   │  Bez niego archiwum jest bezużyteczne — także dla Ciebie.            │
   │  Zapisz je TERAZ poza tą maszyną (menedżer haseł, kartka w szufladzie│
   │  — cokolwiek, co przetrwa utratę tego dysku).                        │
   └──────────────────────────────────────────────────────────────────────┘
WARN
  echo "   Hasło: $(cat "$ETC/restic-password")"
  echo
fi

echo "== Katalogi robocze =="
mkdir -p /var/backups/homelab/staging /var/log/homelab-backup /var/lib/homelab-backup /var/cache/restic
chmod 700 /var/backups/homelab/staging /var/log/homelab-backup /var/cache/restic

echo "== Usługi systemd =="
install -m 0644 "$SRC/systemd/"*.service "$SRC/systemd/"*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homelab-backup.timer homelab-backup-check.timer >/dev/null
systemctl list-timers homelab-backup\* --no-pager --no-legend | sed 's/^/   /'

cat <<'NEXT'

Zainstalowane. Co dalej:

  1. Połącz Google Drive:      sudo /opt/homelab-backup/setup-gdrive.sh
  2. Uzupełnij konfigurację:   sudoedit /etc/homelab-backup/backup.env
                               (RESTIC_REPOSITORY, ewentualnie PVE_HOST)
  3. Pierwszy przebieg ręcznie: sudo systemctl start homelab-backup.service
     i podgląd na żywo:         journalctl -u homelab-backup -f

Timer jest już aktywny — kolejne przebiegi ruszą same o 02:30.
NEXT
