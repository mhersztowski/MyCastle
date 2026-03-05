# 0009. Shared HTTP + MQTT WebSocket port

Data: 2024-01-01
Status: Accepted

## Kontekst

Deployment na serwerze produkcyjnym (Coolify, nginx reverse proxy) komplikuje się gdy aplikacja wymaga wielu portów. Standard webowy to port 80/443. MQTT domyślnie działa na porcie 1883 (TCP) lub 8883 (TLS), ale przeglądarki nie mogą łączyć się bezpośrednio przez TCP.

## Rozważane opcje

- **Shared port** — HTTP server z `upgrade` event dla WebSocket, MQTT broker nasłuchuje na tym samym porcie via path `/mqtt`
- **Osobny port MQTT** — `MQTT_PORT` env var, osobne nasłuchiwanie, wymaga drugiego portu w proxy
- **Zewnętrzny broker MQTT** — Mosquitto/HiveMQ, osobny serwer, wymaga konfiguracji i zarządzania

## Decyzja

Wybrana opcja: **Shared HTTP + MQTT WebSocket port**, ponieważ:

- Jeden port w Dockerfile `EXPOSE` i nginx config
- Nginx proxy `/mqtt` → backend WebSocket: `proxy_pass`, `proxy_http_version 1.1`, `Upgrade/Connection headers`
- Node.js HTTP `server.on('upgrade', ...)` — WebSocket handshake przekierowany do Aedes WS server
- Przeglądarka łączy się: `ws://host/mqtt` (dev) lub `wss://host/mqtt` (prod przez nginx TLS)
- IoT devices (ESP32) łączą się przez TCP MQTT na tym samym porcie `ws://host:port/mqtt` (MQTT over WebSocket)
- Fallback: `MQTT_PORT` env var pozwala uruchomić osobny port TCP dla native MQTT clients

## Konsekwencje

### Pozytywne
- Jeden port = prosta konfiguracja nginx, jeden `EXPOSE` w Dockerfile
- TLS offloading przez nginx — backend nie musi zarządzać certyfikatami
- `ws://172.17.0.1:1902/mqtt` w Node-RED flow eksporcie (Docker bridge network)

### Negatywne / kompromisy
- MQTT over WebSocket ma overhead vs native TCP MQTT (HTTP handshake, framing)
- Native MQTT clients (paho-python, ESP-IDF native mqtt) wymagają WebSocket transport lub osobnego portu
- `ws` package jako MQTT WebSocket adapter — dodatkowa warstwa vs bezpośredniego TCP
