#!/usr/bin/env bash
# Podłączenie Google Drive do rclone na maszynie bez przeglądarki.
#
# Google wymaga zalogowania w oknie przeglądarki, którego na serwerze nie ma.
# Dlatego autoryzację przeprowadza się na własnym komputerze poleceniem
# `rclone authorize`, a tutaj wkleja się wynikowy token.
set -euo pipefail

ETC=/etc/homelab-backup
CONF="$ETC/rclone.conf"

[[ $EUID -eq 0 ]] || { echo "Uruchom przez sudo." >&2; exit 1; }
command -v rclone >/dev/null || { echo "Brak rclone — uruchom najpierw install.sh." >&2; exit 1; }

mkdir -p "$ETC"
chmod 700 "$ETC"

read -rp "Nazwa zdalnego magazynu [gdrive]: " remote
remote="${remote:-gdrive}"

if [[ -f $CONF ]] && grep -q "^\[$remote\]" "$CONF"; then
  read -rp "Magazyn '$remote' już jest skonfigurowany. Nadpisać? [t/N]: " ans
  [[ ${ans,,} == t ]] || { echo "Bez zmian."; exit 0; }
  # Usuwamy dotychczasową sekcję, żeby nie zostały po niej osierocone klucze.
  awk -v r="[$remote]" 'BEGIN{skip=0} /^\[/{skip=($0==r)} !skip' "$CONF" >"$CONF.tmp"
  mv "$CONF.tmp" "$CONF"
fi

cat <<'SCOPE'

Zakres uprawnień tokenu:
  1) drive.file  — rclone widzi WYŁĄCZNIE pliki, które samo utworzyło (zalecane)
  2) drive       — pełny dostęp do całego Dysku

Wariant 1 znaczy, że token wykradziony z serwera nie otwiera reszty Twojego
Dysku. Kosztuje tyle, że folderu backupu nie można założyć ręcznie w przeglądarce
— rclone musi utworzyć go sam (zrobi to poniżej).
SCOPE
read -rp "Wybór [1]: " scopeChoice
case "${scopeChoice:-1}" in
  2) scope="drive" ;;
  *) scope="drive.file" ;;
esac

cat <<'CLIENT'

Własne dane klienta OAuth (client_id / client_secret):
Bez nich rclone używa współdzielonego identyfikatora, który Google dławi —
transfer bywa wtedy kilkukrotnie wolniejszy. Założenie własnego zajmuje kilka
minut w Google Cloud Console (API Google Drive → Dane logowania → aplikacja
komputerowa). Można zostawić puste i uzupełnić później.
CLIENT
read -rp "client_id (Enter = pomiń): " clientId
clientSecret=""
if [[ -n $clientId ]]; then
  read -rsp "client_secret: " clientSecret
  echo
fi

authCmd="rclone authorize \"drive\" --drive-scope=$scope"
[[ -n $clientId ]] && authCmd="rclone authorize \"drive\" \"$clientId\" \"$clientSecret\" --drive-scope=$scope"

cat <<AUTH

────────────────────────────────────────────────────────────────────────────
Na komputerze Z PRZEGLĄDARKĄ (nie tutaj) uruchom:

    $authCmd

Otworzy się okno logowania Google. Po zatwierdzeniu rclone wypisze token —
blok zaczynający się od {"access_token": ... . Skopiuj go w CAŁOŚCI.
────────────────────────────────────────────────────────────────────────────

AUTH
read -rp "Wklej token i naciśnij Enter: " token

[[ $token == \{*\} ]] || { echo "To nie wygląda na token JSON — przerywam." >&2; exit 1; }

{
  echo "[$remote]"
  echo "type = drive"
  echo "scope = $scope"
  [[ -n $clientId ]] && echo "client_id = $clientId"
  [[ -n $clientSecret ]] && echo "client_secret = $clientSecret"
  echo "token = $token"
} >>"$CONF"
chmod 600 "$CONF"

export RCLONE_CONFIG="$CONF"
folder="Backups/$(hostname)"

echo
echo "Sprawdzam połączenie…"
if rclone mkdir "$remote:$folder" && rclone lsd "$remote:Backups" >/dev/null; then
  echo "Połączono. Folder docelowy: $remote:$folder"
  echo
  echo "Wpisz w /etc/homelab-backup/backup.env:"
  echo "    RESTIC_REPOSITORY=\"rclone:$remote:$folder\""
else
  echo "Nie udało się połączyć — sprawdź token i uprawnienia." >&2
  exit 1
fi
