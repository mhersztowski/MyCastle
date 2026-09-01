#!/usr/bin/env bash
# Inwentarz maszyny: to, czego nie da się skopiować jako plik, a bez czego
# odtworzenie systemu od zera jest zgadywanką — lista pakietów, układ dysków,
# spis kontenerów i wolumenów, reguły zapory.
#
# Wyjście jest celowo pozbawione znaczników czasu i liczników (uptime, zużycie
# pamięci): plik zmieniający się przy każdym przebiegu kosztowałby nowy blok
# w repozytorium codziennie, nic nie wnosząc.
set -uo pipefail

STAGING="${1:?podaj katalog staging}"
OUT="$STAGING/system"
mkdir -p "$OUT"

save() {
  local name="$1"
  shift
  "$@" >"$OUT/$name" 2>/dev/null || echo "(polecenie niedostępne: $*)" >"$OUT/$name"
}

# ── Pakiety ────────────────────────────────────────────────────────────────
save packages-manual.txt apt-mark showmanual
save packages-all.txt dpkg --get-selections
save snaps.txt snap list
{
  for f in /etc/apt/sources.list /etc/apt/sources.list.d/*; do
    [[ -f $f ]] || continue
    echo "### $f"
    cat "$f"
  done
} >"$OUT/apt-sources.txt" 2>/dev/null

# ── Docker ─────────────────────────────────────────────────────────────────
save docker-containers.txt docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
save docker-volumes.txt docker volume ls --format '{{.Driver}}\t{{.Name}}'
save docker-networks.txt docker network ls --format '{{.Driver}}\t{{.Name}}'
save docker-images.txt docker images --format '{{.Repository}}:{{.Tag}}\t{{.ID}}'

# Pełny opis kontenera niesie zmienne środowiskowe i montowania — bez tego
# odtworzenie stacku spoza Coolify wymagałoby odgadnięcia konfiguracji.
mkdir -p "$OUT/docker-inspect"
for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null); do
  docker inspect "$c" >"$OUT/docker-inspect/$(printf '%s' "$c" | sed -E 's/-[0-9]{6,}$//').json" 2>/dev/null || true
done

# ── System ─────────────────────────────────────────────────────────────────
save os-release.txt cat /etc/os-release
save kernel.txt uname -a
save systemd-enabled.txt systemctl list-unit-files --state=enabled --no-pager --no-legend
save systemd-failed.txt systemctl list-units --state=failed --no-pager --no-legend

# ── Dyski i sieć ───────────────────────────────────────────────────────────
save lsblk.txt lsblk -f -o NAME,FSTYPE,LABEL,UUID,SIZE,MOUNTPOINT
save blkid.txt blkid
save lvm.txt sh -c 'pvs 2>/dev/null; vgs 2>/dev/null; lvs 2>/dev/null'
save mounts.txt findmnt -t ext4,xfs,btrfs,zfs,nfs,cifs -o TARGET,SOURCE,FSTYPE,OPTIONS
save ip-addr.txt ip -o addr show
save ip-route.txt ip route show
save ufw.txt ufw status verbose
save iptables.txt iptables-save

# ── Konta i zadania ────────────────────────────────────────────────────────
save passwd.txt getent passwd
save group.txt getent group
if [[ -d /var/spool/cron/crontabs ]]; then
  mkdir -p "$OUT/crontabs"
  cp -a /var/spool/cron/crontabs/. "$OUT/crontabs/" 2>/dev/null || true
fi

echo "  inwentarz systemu: $(find "$OUT" -type f | wc -l) plików"
