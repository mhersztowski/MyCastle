# C4 Level 2 — Containers

Diagram pokazuje wszystkie aplikacje i pakiety monorepo z ich zależnościami.

```mermaid
C4Container
    title Containers — MyCastle Monorepo

    Person(user, "Użytkownik / Admin", "Przeglądarka")
    Person(iotDevice, "Urządzenie IoT", "ESP32 / Arduino")

    Container_Boundary(shared, "Shared Packages (@mhersztowski/*)") {
        Container(core, "core", "TypeScript Library\n(tsup dual ESM+CJS)", "Modele, Zod schemas, RPC types,\nMQTT topic registry, VFS, MJD,\nAutomate models, DataSource")
        Container(coreBackend, "core-backend", "TypeScript Library\n(tsup ESM-only)", "FileSystem, HttpUploadServer,\nMqttServer (Aedes), Auth\n(JWT/bcrypt/ApiKey)")
        Container(webClient, "web-client", "TypeScript Library\n(tsup dual ESM+CJS)", "MqttClient, FilesystemService,\nVFS UI, Monaco Editor,\nMJD editors, TypeDoc viewer")
        Container(uiCore, "ui-core", "TypeScript Library", "Theme, hooks, utils\n(React 18)")
    }

    Container_Boundary(mycastle, "MyCastle Platform") {
        Container(mcBackend, "mycastle-backend", "Node.js 20 + TypeScript\nPort: 1894", "HTTP REST + MQTT broker\nOCR (Tesseract+Sharp)\nAutomate engine\nScheduler (node-cron)")
        Container(mcWeb, "mycastle-web", "React 18 + Vite 5\nPort: 1895 (dev)", "Zarządzanie osobami,\nzadaniami, projektami,\nkalendarzem, AI agent,\nautomate designer")
    }

    Container_Boundary(minis, "Minis Platform") {
        Container(minisBackend, "minis-backend", "Node.js 20 + TypeScript\nPort: 1902", "REST API + RPC dispatch\nMQTT IoT broker\nArduino CLI integration\nSQLite telemetry")
        Container(minisWeb, "minis-web", "React 18 + Vite 6\nPort: 1903 (dev)", "IoT dashboard, Blockly Arduino,\nBlockly uPython, Monaco Editor,\nSerial terminal, MQTT Explorer,\nIoT emulator")
        Container(iotDb, "iot.db", "SQLite (WAL mode)", "Telemetria, komendy,\nalert rules, device shares")
        Container(dataFiles, "data/", "JSON files", "Użytkownicy, urządzenia,\nmoduły, projekty, API keys")
    }

    Container_Boundary(scene3d, "Scene3D (Demo)") {
        Container(demoScene, "demo-scene-3d", "React + Three.js\nVite 7", "Demo 3D sceny")
    }

    Container(desktop, "desktop", "Python 3\nWindows", "Agent MQTT\nOperacje systemowe Windows")

    Rel(user, mcWeb, "Używa", "HTTPS")
    Rel(user, minisWeb, "Używa", "HTTPS")
    Rel(iotDevice, minisBackend, "Telemetria / Komendy", "MQTT over WebSocket")

    Rel(mcWeb, mcBackend, "REST API + MQTT", "HTTP / WebSocket")
    Rel(minisWeb, minisBackend, "REST API + MQTT", "HTTP / WebSocket")

    Rel(mcBackend, core, "importuje")
    Rel(mcBackend, coreBackend, "importuje")
    Rel(mcWeb, core, "importuje")
    Rel(mcWeb, webClient, "importuje")

    Rel(minisBackend, core, "importuje")
    Rel(minisBackend, coreBackend, "importuje")
    Rel(minisWeb, core, "importuje")
    Rel(minisWeb, webClient, "importuje")

    Rel(webClient, core, "importuje")
    Rel(webClient, uiCore, "importuje")
    Rel(coreBackend, core, "importuje")

    Rel(minisBackend, iotDb, "odczytuje/zapisuje", "better-sqlite3")
    Rel(minisBackend, dataFiles, "odczytuje/zapisuje", "Node.js fs")

    Rel(desktop, mcBackend, "MQTT", "WebSocket")
```

## Porty i protokoły

| Aplikacja | Port | Protokoły |
|-----------|------|-----------|
| mycastle-backend | 1894 | HTTP REST, MQTT over WebSocket (`/mqtt`) |
| mycastle-web | 1895 (dev) | HTTP (Vite HMR) |
| minis-backend | 1902 | HTTP REST, MQTT over WebSocket (`/mqtt`), WS Terminal (`/ws/terminal`) |
| minis-web | 1903 (dev) | HTTP (Vite HMR), proxy `/api` → 1902, `/mqtt` → ws:1902 |

## Wersje runtime

| Technologia | Wersja |
|-------------|--------|
| Node.js | 20.x |
| TypeScript | 5.9+ |
| React | 18 (MyCastle: MUI 5, Minis: MUI 6) |
| Vite | 5 (mycastle-web), 6 (minis-web), 7 (scene3d) |
| pnpm | 10.28.2 |
| SQLite | via better-sqlite3 |
