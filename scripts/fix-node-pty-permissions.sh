#!/usr/bin/env bash
#
# Przywraca bit wykonywalności pomocnikowi node-pty.
#
# pnpm rozpakowuje paczki bez zachowania uprawnień, a node-pty na macOS
# uruchamia `spawn-helper` przez posix_spawnp. Bez prawa wykonywania każda
# sesja terminala kończy się „posix_spawnp failed" — komunikatem, który nie
# wskazuje ani na uprawnienia, ani na ten plik.
#
# Uruchamiane po instalacji zależności; bez tego problem wraca przy każdym
# `pnpm install`.

set -euo pipefail

found=0
while IFS= read -r helper; do
    if [ ! -x "$helper" ]; then
        chmod +x "$helper"
        echo "node-pty: nadano prawo wykonywania — $helper"
    fi
    found=1
done < <(find node_modules/.pnpm -path '*node-pty*/prebuilds/*/spawn-helper' 2>/dev/null)

# Brak pliku nie jest błędem: na Linuksie node-pty go nie używa, a bez
# zainstalowanych zależności nie ma czego poprawiać.
[ "$found" -eq 1 ] || echo "node-pty: nie znaleziono spawn-helper (pomijam)"
