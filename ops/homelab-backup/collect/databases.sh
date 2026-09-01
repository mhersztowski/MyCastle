#!/usr/bin/env bash
# Logicznie spójne zrzuty baz z działających kontenerów.
#
# Dlaczego nie kopiować po prostu katalogów PGDATA: serwer trzyma część stanu
# w buforach i WAL-u, więc kopia plików wykonana w locie bywa nie do odtworzenia,
# a przy okazji zmienia się co do bajta między przebiegami i psuje deduplikację.
#
# Zrzuty zapisujemy NIESKOMPRESOWANE — restic sam kompresuje repozytorium, a na
# skompresowanym strumieniu deduplikacja przestaje działać (zmiana jednego
# wiersza przestawia cały plik).
set -uo pipefail

STAGING="${1:?podaj katalog staging}"
OUT="$STAGING/databases"
mkdir -p "$OUT"

errors=0
found=0

# Nazwy kontenerów aplikacji Coolify niosą sufiks przebiegu deploya
# (…-151047807599), który zmienia się przy każdym redeployu. Ucinamy go, żeby
# zrzut tej samej bazy trafiał wciąż do tego samego pliku i miał ciągłą historię.
stableName() {
  printf '%s' "$1" | sed -E 's/-[0-9]{6,}$//'
}

# Lista rozdzielona spacjami, nie tablica: moduł dostaje ją przez środowisko,
# a tablicy bash przez granicę procesu nie przekaże.
skipped() {
  local name="$1" s
  for s in ${SKIP_DB_CONTAINERS:-}; do
    [[ $s == "$name" ]] && return 0
  done
  return 1
}

envOf() {
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2>/dev/null
}

envValue() {
  printf '%s\n' "$2" | sed -n "s/^$1=//p" | head -1
}

for container in $(docker ps --format '{{.Names}}'); do
  if skipped "$container"; then
    echo "  pomijam (SKIP_DB_CONTAINERS): $container"
    continue
  fi

  cenv="$(envOf "$container")"

  # PGDATA jest jedynym wiarygodnym znakiem, że to serwer bazy: POSTGRES_USER
  # kontenery Coolify wstrzykują całemu stackowi — mają je nawet Redisy
  # i frontendy, więc filtr po nim dawałby garść fałszywych trafień.
  if grep -q '^PGDATA=' <<<"$cenv" && docker exec "$container" sh -c 'command -v pg_dumpall' >/dev/null 2>&1; then
    user="$(envValue POSTGRES_USER "$cenv")"
    user="${user:-postgres}"
    pass="$(envValue POSTGRES_PASSWORD "$cenv")"
    target="$OUT/$(stableName "$container").sql"
    found=$((found + 1))
    echo "  postgres: $container (użytkownik $user) → $(basename "$target")"

    if docker exec -e "PGPASSWORD=$pass" "$container" \
         pg_dumpall --clean --if-exists --username="$user" >"$target.part" 2>"$target.err"; then
      # pg_dumpall kończy zrzut stopką; jej brak znaczy, że strumień urwał się
      # w połowie, a plik i tak byłby niepusty i wyglądał poprawnie.
      # Uwaga na brzmienie: pg_dumpall pisze "database CLUSTER dump complete",
      # a nie "database dump complete" jak pg_dump — dosłowna stopka tego
      # drugiego odrzucała komplet poprawnych zrzutów.
      if tail -5 "$target.part" | grep -qE 'PostgreSQL database (cluster )?dump complete'; then
        mv "$target.part" "$target"
        rm -f "$target.err"
      else
        # Niekompletny zrzut usuwamy ze stagingu: w archiwum wyglądałby jak
        # poprawny plik i wyszedłby na jaw dopiero przy odtwarzaniu. Ślad po
        # błędzie zostaje w pliku .err.
        echo "    BŁĄD: zrzut urwany (brak stopki pg_dumpall) — odrzucam" >&2
        rm -f "$target.part"
        errors=$((errors + 1))
      fi
    else
      rc=$?
      echo "    BŁĄD: pg_dumpall zakończył się kodem $rc — patrz $target.err" >&2
      head -5 "$target.err" | sed 's/^/      /' >&2
      rm -f "$target.part"
      errors=$((errors + 1))
    fi
    continue
  fi

  # MariaDB/MySQL — nie ma ich dziś na tej maszynie, ale wykrycie kosztuje
  # jedno grep i oszczędza cichej luki, gdy taki stack kiedyś dojdzie.
  if grep -qE '^(MYSQL|MARIADB)_ROOT_PASSWORD=' <<<"$cenv"; then
    rootpass="$(envValue MYSQL_ROOT_PASSWORD "$cenv")"
    [[ -z $rootpass ]] && rootpass="$(envValue MARIADB_ROOT_PASSWORD "$cenv")"
    dumper=""
    for candidate in mariadb-dump mysqldump; do
      if docker exec "$container" sh -c "command -v $candidate" >/dev/null 2>&1; then
        dumper="$candidate"
        break
      fi
    done
    [[ -z $dumper ]] && continue
    target="$OUT/$(stableName "$container").sql"
    found=$((found + 1))
    echo "  mysql: $container ($dumper) → $(basename "$target")"
    if docker exec -e "MYSQL_PWD=$rootpass" "$container" \
         "$dumper" --all-databases --single-transaction --routines --events -u root >"$target.part" 2>"$target.err"; then
      mv "$target.part" "$target"
      rm -f "$target.err"
    else
      echo "    BŁĄD: $dumper zawiódł — patrz $target.err" >&2
      rm -f "$target.part"
      errors=$((errors + 1))
    fi
  fi
done

echo "  zrzucono baz: $found, błędów: $errors"
exit $((errors > 0 ? 1 : 0))
