# Obraz budujący Hydry rozszerzony o zaplecze celów natywnych.
#
# `ghcr.io/platform-minis/hydra-build` niesie toolchainy PlatformIO dla płytek,
# ale nie ma cmake ani SDL2 — a cel `mcu: native` (okno na maszynie
# deweloperskiej) buduje się właśnie tą drogą: `emitPlatformio` pomija cele
# natywne świadomie, bo `platform = native` ich nie obsłuży.
#
# Warstwa pochodna zamiast poprawki w Dockerfile Hydry, bo obraz bazowy waży
# 13.8 GB i jego przebudowa oznaczałaby ponowne ściągnięcie wszystkich
# toolchainów. Tu dochodzi kilkadziesiąt megabajtów.
#
# Budowanie:
#   docker build -t mycastle-hydra-native:local docker/hydra-native
#
# Użycie — `hydra.sh` czyta nazwę obrazu ze zmiennej:
#   HYDRA_IMAGE=mycastle-hydra-native:local ./docker/hydra.sh project <dir> …
#
# Ten sam obraz obsługuje cele PlatformIO, bo jest nadzbiorem bazowego.
FROM ghcr.io/platform-minis/hydra-build:latest

# `libsdl2-dev`, nie `libsdl2-2.0-0`: CMake szuka nagłówków i pliku
# konfiguracyjnego pakietu, a nie samej biblioteki współdzielonej. Bez wersji
# deweloperskiej `find_package(SDL2)` kończy się cichym HYDRA_WITH_SDL=OFF
# i oknem, które nigdy się nie otwiera.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        cmake \
        ninja-build \
        libsdl2-dev \
        pkg-config \
        xz-utils \
        ca-certificates \
        curl \
        zip \
    && rm -rf /var/lib/apt/lists/*

# Cross-kompilacja na Windows ARM64.
#
# Klasyczny mingw-w64 nie ma wariantu `aarch64-w64-mingw32` — Debian daje
# wyłącznie x86_64 i i686. llvm-mingw dostarcza ten target (i zachowuje
# interfejs GCC: `aarch64-w64-mingw32-g++`), więc `.exe` dla Windows-on-ARM
# powstaje tu, a nie na maszynie z Visual Studio.
#
# Wariant x86_64 byłby prostszy, ale na Windows ARM działa przez emulację —
# przy podglądzie pracującym w czasie rzeczywistym to strata, której nie ma
# powodu ponosić.
ARG LLVM_MINGW=llvm-mingw-20260616-ucrt-ubuntu-22.04-aarch64
RUN curl -fsSL "https://github.com/mstorsjo/llvm-mingw/releases/download/20260616/${LLVM_MINGW}.tar.xz" \
        -o /tmp/llvm-mingw.tar.xz \
    && mkdir -p /opt/llvm-mingw \
    && tar -xf /tmp/llvm-mingw.tar.xz -C /opt/llvm-mingw --strip-components=1 \
    && rm /tmp/llvm-mingw.tar.xz

ENV PATH="/opt/llvm-mingw/bin:${PATH}"

# SDL2 dla Windows ARM64.
#
# Oficjalne archiwa `SDL2-devel-*-mingw` niosą tylko x86_64 i i686, a wersja
# `-VC` tylko biblioteki pod MSVC — dla tego targetu nie ma czego pobrać,
# więc budujemy ze źródeł. Raz, w obrazie: inaczej każde budowanie projektu
# zaczynałoby się od kilku minut kompilowania samego SDL-a.
ARG SDL2_VERSION=2.32.8
RUN curl -fsSL "https://github.com/libsdl-org/SDL/releases/download/release-${SDL2_VERSION}/SDL2-${SDL2_VERSION}.tar.gz" \
        -o /tmp/sdl2.tar.gz \
    && mkdir -p /tmp/sdl2 \
    && tar -xf /tmp/sdl2.tar.gz -C /tmp/sdl2 --strip-components=1 \
    && cmake -S /tmp/sdl2 -B /tmp/sdl2-build -G Ninja \
        -D CMAKE_SYSTEM_NAME=Windows \
        -D CMAKE_C_COMPILER=aarch64-w64-mingw32-gcc \
        -D CMAKE_CXX_COMPILER=aarch64-w64-mingw32-g++ \
        -D CMAKE_RC_COMPILER=aarch64-w64-mingw32-windres \
        -D CMAKE_BUILD_TYPE=Release \
        -D SDL_STATIC=OFF \
        -D SDL_TEST=OFF \
        -D CMAKE_INSTALL_PREFIX=/opt/sdl2-win-arm64 \
    && cmake --build /tmp/sdl2-build --target install \
    && rm -rf /tmp/sdl2 /tmp/sdl2-build /tmp/sdl2.tar.gz
