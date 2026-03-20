# Running MyCastle

## Dev

```bash
pnpm dev:backend     # uruchom backend
pnpm dev:web         # uruchom frontend
pnpm dev:scene3d     # uruchom demo scene3d
pnpm build           # zbuduj wszystko
```

MQTT_PORT służy do dual-port mode — trybu deweloperskiego, gdzie MQTT działa na osobnym porcie niż HTTP.

Jeśli MQTT_PORT nie jest ustawiony lub jest równy PORT → shared mode: HTTP + MQTT WebSocket na jednym porcie (np. 1894), MQTT dostępny pod /mqtt
Jeśli MQTT_PORT jest ustawiony i różny od PORT → dual-port mode: HTTP na PORT, MQTT na osobnym MQTT_PORT

## CLI Tools (Docker)

Osobny compose dla narzędzi kompilacyjnych (arduino, pico, pygame, android).

### Uruchomienie

```bash
# Zbuduj i uruchom wszystkie
docker compose -f docker-compose.cli.yml up -d --build

# Tylko wybrane serwisy
docker compose -f docker-compose.cli.yml up -d arduino pygame
```

### Architektury

Domyślnie `Linux_64bit` (Coolify x86_64). Na laptopie ARM:

```bash
docker compose -f docker-compose.cli.yml build --build-arg ARDUINO_ARCH=Linux_ARM64 arduino
```

### Env vars backendu (dev lokalny)

```env
ARDUINO_CLI_DOCKER_NAME=minis-arduino
PYGAME_DOCKER_NAME=minis-pygame
UPYTHON_DOCKER_NAME=minis-pico
```

### Coolify (produkcja)

Na Coolify narzędzia są wbudowane w obraz backendu — **nie trzeba uruchamiać docker-compose.cli.yml**.
Env vars ustawione automatycznie w Dockerfile:

```env
ARDUINO_CLI_LOCAL_PATH=/usr/local/bin/arduino-cli
PYGBAG_PATH=/usr/local/bin/pygbag
UPYTHON_CLI_LOCAL_PATH=/usr/local/bin/mpremote
```

### Serwisy

| Serwis  | Container     | Dockerfile target        |
|---------|---------------|--------------------------|
| arduino | minis-arduino | Dockerfile.cli → arduino |
| pico    | minis-pico    | Dockerfile.cli → pico    |
| pygame  | minis-pygame  | Dockerfile.cli → pygame  |
| android | minis-android | Dockerfile.android       |

> Android SDK cache trzymany jako named volume `android-sdk-cache` — nie pobiera się ponownie przy restarcie.

### Pico SDK

Kontener `pico` wymaga `~/pico-sdk` na hoście. Na każdej maszynie (laptop + Coolify) musi istnieć:

```bash
git clone https://github.com/raspberrypi/pico-sdk ~/pico-sdk
cd ~/pico-sdk && git submodule update --init
```

Wersja: **2.1.1** (aktualna na 2026-03).
