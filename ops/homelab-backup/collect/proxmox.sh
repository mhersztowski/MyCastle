#!/usr/bin/env bash
# Konfiguracja i inwentarz hosta Proxmox, ściągane po SSH.
#
# Świadomie NIE ruszamy obrazów dysków ani zrzutów vzdump — to setki gigabajtów,
# których miejsce jest na lokalnym magazynie backupów, nie w Drive. Tutaj chodzi
# o to, żeby po odbudowie hosta dało się odtworzyć definicje maszyn, sieć,
# magazyny i uprawnienia zamiast składać je z pamięci.
set -uo pipefail

STAGING="${1:?podaj katalog staging}"
OUT="$STAGING/proxmox"
host="${PVE_HOST:-}"
key="${PVE_SSH_KEY:-}"

if [[ -z $host ]]; then
  echo "  Proxmox: pominięty (PVE_HOST puste)"
  exit 0
fi

sshOpts=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new)
[[ -n $key && -r $key ]] && sshOpts+=(-i "$key" -o IdentitiesOnly=yes)

if ! ssh "${sshOpts[@]}" "$host" true 2>/dev/null; then
  echo "  BŁĄD: brak dostępu SSH do $host — moduł Proxmoksa pominięty" >&2
  exit 1
fi

mkdir -p "$OUT"
errors=0

# /etc/pve to system plików klastra (pmxcfs), nie zwykły katalog. Rozpakowujemy
# go po stronie odbiorcy zamiast trzymać jako tarball, bo restic deduplikuje
# pliki — pojedyncze archiwum zmieniałoby się w całości przy każdej drobnej
# edycji konfiguracji.
#
# Pliki wirtualne (.version, .members, .vmlist, .rrd) zmieniają się co sekundę
# i nie niosą konfiguracji, więc je pomijamy. Wzorzec musi wymagać znaku PO
# kropce: `.*` dopasowuje również samo `.`, czyli katalog będący korzeniem
# archiwum — tar wykluczał wtedy CAŁE drzewo i przysyłał zero plików, meldując
# przy tym sukces.
rm -rf "$OUT/etc-pve"
mkdir -p "$OUT/etc-pve"
ssh "${sshOpts[@]}" "$host" 'tar -C /etc/pve --anchored --exclude="./.?*" -cf - . 2>/dev/null' \
  | tar -xf - -C "$OUT/etc-pve" 2>/dev/null

pveFiles=$(find "$OUT/etc-pve" -type f | wc -l)
# Pusty wynik traktujemy jak awarię: na działającym hoście /etc/pve ma zawsze
# co najmniej storage.cfg i user.cfg, więc zero plików znaczy zepsuty transfer.
# Bez tej kontroli wychodzi to dopiero przy odtwarzaniu.
if ((pveFiles > 0)); then
  echo "  Proxmox: /etc/pve pobrane ($pveFiles plików)"
else
  echo "  BŁĄD: /etc/pve przyszło puste — sprawdź dostęp do $host" >&2
  errors=$((errors + 1))
fi

# Konfiguracja hosta spoza pmxcfs — sieć i repozytoria żyją w zwykłym /etc.
rm -rf "$OUT/etc-host"
mkdir -p "$OUT/etc-host"
if ssh "${sshOpts[@]}" "$host" \
     'tar -cf - /etc/network/interfaces /etc/hosts /etc/hostname /etc/resolv.conf /etc/fstab /etc/apt/sources.list /etc/apt/sources.list.d /etc/modprobe.d /etc/vzdump.conf 2>/dev/null' \
     | tar -xf - -C "$OUT/etc-host" 2>/dev/null; then
  :
else
  echo "  OSTRZEŻENIE: część plików /etc hosta nie została pobrana" >&2
fi

# Inwentarz: co na tym hoście w ogóle stoi i na czym leży.
remote() {
  local name="$1"
  shift
  ssh "${sshOpts[@]}" "$host" "$*" >"$OUT/$name" 2>/dev/null \
    || echo "(polecenie niedostępne: $*)" >"$OUT/$name"
}

remote pveversion.txt 'pveversion -v'
remote cluster-resources.json 'pvesh get /cluster/resources --output-format json'
remote vm-list.txt 'qm list'
remote ct-list.txt 'pct list'
remote storage.txt 'pvesm status'
remote storage-cfg.txt 'cat /etc/pve/storage.cfg'
remote lsblk.txt 'lsblk -f -o NAME,FSTYPE,LABEL,UUID,SIZE,MOUNTPOINT'
remote zpool.txt 'zpool status 2>/dev/null; zfs list 2>/dev/null'
remote lvm.txt 'pvs; vgs; lvs'
remote replication.txt 'pvesr status'
remote users.txt 'pveum user list'

echo "  Proxmox: inwentarz zebrany z $host"
exit $((errors > 0 ? 1 : 0))
