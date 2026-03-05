# 0002. MQTT jako primary transport

Data: 2024-01-01
Status: Accepted

## Kontekst

System musi obsługiwać komunikację real-time między frontendem, backendem a urządzeniami IoT (ESP32, Arduino). Urządzenia IoT mają ograniczone zasoby, wysyłają telemetrię cyklicznie i oczekują komend. Frontend potrzebuje live aktualizacji bez pollingu.

## Rozważane opcje

- **MQTT (Aedes broker, WebSocket)** — lekki protokół pub/sub, natywny dla IoT, WebSocket bridge dla przeglądarek
- **WebSocket + custom protocol** — bezpośredni WebSocket, wymaga własnego routing i pub/sub
- **Server-Sent Events (SSE)** — jednokierunkowy push od serwera, nie działa dla IoT devices
- **REST polling** — proste, ale opóźnione, wysokie obciążenie przy wielu urządzeniach
- **gRPC** — wydajne, ale nie natywne dla przeglądarek i mikrokontrolerów

## Decyzja

Wybrana opcja: **MQTT via Aedes broker embedded w Node.js**, ponieważ:

- **Unified transport** — te same tematy obsługują IoT devices (TCP MQTT) i przeglądarkę (MQTT over WebSocket)
- **Pub/sub pattern** — naturalny dla telemetrii, heartbeatów, komend
- **Aedes** — lekki broker MQTT w Node.js bez zewnętrznego serwera (np. Mosquitto)
- **Shared port** — broker działa na tym samym porcie co HTTP (path `/mqtt`) — jeden port w deployment
- **Topic-based routing** — `minis/{user}/{device}/{type}` — strukturyzowana hierarchia

## Konsekwencje

### Pozytywne
- Jedno połączenie WebSocket z frontendu obsługuje wszystkie real-time dane
- IoT devices programowane standardowo (esp-mqtt, Arduino MQTT libraries)
- Topic wildcards (`minis/+/+/telemetry`) do subskrypcji grupy urządzeń
- MQTT auth przez `MqttServer.setAuthenticate()` — JWT lub API key

### Negatywne / kompromisy
- MQTT QoS 0 (fire-and-forget) — brak gwarancji dostarczenia dla komend (obsługiwane przez ACK na poziomie aplikacji)
- Aedes w trybie shared port (HTTP + WS) przez `ws` package — marginalna złożoność konfiguracji
- Brak natywnego request-response — symulowane przez `MqttClient.request()` z unikalnym response topic
- WebSocket MQTT w przeglądarce wymaga clientId unikalnego per tab
