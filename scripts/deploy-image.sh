#!/usr/bin/env bash
#
# Buduje obraz backendu i wypycha go do ghcr.io.
#
# Powód istnienia: serwer produkcyjny ma 3,4 GB RAM, a `vite build`
# w mycastle-web żąda 8 GB heapu. Build na serwerze wchodził w swap, mielił
# 19 minut i kończył się zabiciem procesu przez OOM — kładąc przy okazji panel
# Coolify. Obraz powstaje więc poza serwerem, a Coolify tylko go pobiera.
#
#   ./scripts/deploy-image.sh              # zbuduj i wypchnij
#   ./scripts/deploy-image.sh --no-push    # tylko zbuduj (próba przed wysyłką)
#
# Token: GHCR_TOKEN albo GITHUB_TOKEN, z prawem `write:packages`.
# Nowy token: https://github.com/settings/tokens  (classic, zakres write:packages)
#
# UWAGA co do architektury. Serwer jest x86_64. Jeśli budujesz na maszynie ARM
# (Apple Silicon, Windows on ARM + WSL), Docker musi emulować x86 przez QEMU —
# jednorazowo:
#
#     docker run --privileged --rm tonistiigi/binfmt --install amd64
#
# Emulacja działa, ale kompilacja całego monorepo pod nią trwa wielokrotnie
# dłużej niż natywnie. Jeśli to uwiera, ten sam obraz zbuduje workflow
# `.github/workflows/build-image.yml` na runnerze x86 GitHuba.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

OWNER="${GHCR_OWNER:-mhersztowski}"
IMAGE="${GHCR_IMAGE:-ghcr.io/${OWNER}/mycastle-backend}"
# Serwer produkcyjny; obraz zbudowany dla innej architektury po prostu nie
# wystartuje, więc platformę podajemy wprost zamiast liczyć na domyślną.
PLATFORM="${TARGET_PLATFORM:-linux/amd64}"

PUSH=1
[ "${1:-}" = "--no-push" ] && PUSH=0

info() { printf '\033[36m%s\033[0m\n' "$*"; }
die()  { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# --- co dokładnie wypychamy -------------------------------------------------

command -v docker >/dev/null || die "Nie ma dockera w PATH."
docker info >/dev/null 2>&1 || die "Demon Dockera nie odpowiada."

SHA="$(git rev-parse --short HEAD)"
DIRTY=""
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    DIRTY=" (drzewo ma niezacommitowane zmiany)"
fi

info "Obraz:     ${IMAGE}"
info "Platforma: ${PLATFORM}"
info "Commit:    ${SHA}${DIRTY}"

# Znacznik z commita pozwala wrócić do konkretnej wersji; `latest` jest tym,
# po co sięga docker-compose na serwerze.
TAGS=(-t "${IMAGE}:latest" -t "${IMAGE}:sha-${SHA}")

# --- emulacja, jeśli budujemy na innej architekturze -------------------------

HOST_ARCH="$(uname -m)"
case "$PLATFORM" in
    linux/amd64) WANT_ARCH="x86_64" ;;
    linux/arm64) WANT_ARCH="aarch64" ;;
    *)           WANT_ARCH="" ;;
esac

if [ -n "$WANT_ARCH" ] && [ "$HOST_ARCH" != "$WANT_ARCH" ]; then
    info "Budowanie z emulacją: host ${HOST_ARCH} → cel ${WANT_ARCH}."
    # Sprawdzenie zamiast cichego padu w połowie budowy: bez handlerów binfmt
    # pierwsze `RUN` kończy się kodem 255 bez słowa wyjaśnienia.
    if ! docker run --rm --platform "$PLATFORM" alpine true >/dev/null 2>&1; then
        die "Brak emulacji ${WANT_ARCH}. Zainstaluj ją raz:
    docker run --privileged --rm tonistiigi/binfmt --install amd64

Albo zbuduj obraz na runnerze GitHuba — patrz .github/workflows/build-image.yml"
    fi
    info "Uwaga: pod emulacją ta budowa trwa znacznie dłużej niż natywnie."
fi

# --- logowanie ---------------------------------------------------------------

if [ "$PUSH" -eq 1 ]; then
    TOKEN="${GHCR_TOKEN:-${GITHUB_TOKEN:-}}"
    [ -n "$TOKEN" ] || die "Ustaw GHCR_TOKEN (albo GITHUB_TOKEN) z prawem write:packages.
    export GHCR_TOKEN=ghp_..."
    info "Logowanie do ghcr.io jako ${OWNER}…"
    printf '%s' "$TOKEN" | docker login ghcr.io -u "$OWNER" --password-stdin >/dev/null
fi

# --- budowa ------------------------------------------------------------------

# `buildx` zamiast `build`: tylko on potrafi budować na inną platformę.
# `--load`/`--push` wykluczają się wzajemnie, stąd rozgałęzienie.
OUTPUT=(--load)
[ "$PUSH" -eq 1 ] && OUTPUT=(--push)

info "Buduję…"
docker buildx build \
    --platform "$PLATFORM" \
    -f app/mycastle-backend/Dockerfile \
    "${TAGS[@]}" \
    "${OUTPUT[@]}" \
    .

if [ "$PUSH" -eq 1 ]; then
    info "Wypchnięte:"
    printf '  %s:latest\n  %s:sha-%s\n' "$IMAGE" "$IMAGE" "$SHA"
    echo
    info "Teraz w Coolify: Redeploy — pobierze obraz zamiast go budować."
else
    info "Obraz został lokalnie (bez wysyłki): ${IMAGE}:sha-${SHA}"
fi
