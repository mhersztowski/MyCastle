# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types, datasource. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel, MinisModuleDefModel, MinisModuleModel, MinisDeviceDefModel, MinisDeviceModel (isIot field), MinisProjectDefModel, MinisProjectModel, UserModel, IotModels (IotDeviceConfig, TelemetryRecord, TelemetryMetric, TelemetryAggregate, DeviceCommand, AlertRule, Alert, IotDeviceStatus)
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty; metoda `copyBaseStateTo()` do kopiowania UI state przy clone), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode, MinisModuleDefNode, MinisModuleNode, MinisDeviceDefNode, MinisDeviceNode, MinisProjectDefNode, MinisProjectNode, UserNode. Wszystkie nody używają `copyBaseStateTo()` w `clone()` zamiast ręcznego kopiowania pól.
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload
  - `datasource/` — IDataSource interface (w tym kolekcje Minis: minisModuleDefs, minisModules, minisDeviceDefs, minisDevices, minisProjectDefs, minisProjects, users), MemoryDataSource (load* methods per kolekcję), CalendarItem, Calendar
- **@mhersztowski/web-client** (`packages/web-client/`) — reusable React client for MyCastle backend. Dual ESM+CJS build (tsup). React as peerDependency.
  - `mqtt/` — MqttClient (MQTT over WebSocket, request-response, file ops), MqttContext/MqttProvider, useMqtt hook
  - `filesystem/` — FilesystemService (dir tree, batch file loading, calendar, DataSource), FilesystemContext/FilesystemProvider, useFilesystem hook
  - `filesystem/data/` — DirData, FileData, CalendarItem (extends core), Calendar, DataSource (re-export of MemoryDataSource)
  - `filesystem/components/` — DirComponent, FileComponent, FileJsonComponent, FileMarkdownComponent
  - `utils/` — configureUrls(), getHttpUrl(), getMqttUrl() (auto-detect from window.location, configurable)
- **@mhersztowski/core-backend** (`packages/core-backend/`) — współdzielone moduły backendowe wyekstrahowane z mycastle-backend. ESM-only build (tsup).
  - `filesystem/` — FileSystem (in-memory cache, EventEmitter fileChanged, atomic writes, per-file locking, deleteDirectory)
  - `httpserver/` — HttpUploadServer (CORS, POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook). Klasa rozszerzalna: protected server, fileSystem, setCorsHeaders, handleRequest, sendJsonResponse — umożliwia subclassing (np. MinisHttpServer)
  - `mqttserver/` — MqttServer (Aedes, publishMessage(), onMessage(handler) for custom topic routing), MqttMessageHandler type, Client, Packet classes per type
  - `datasource/` — DataSource (in-memory store, auto-reload z FileSystem events)
  - `interfaces.ts` — IAutomateService, IDataSource (dependency inversion — backend-specific modules implementują te interfejsy)
- **@mhersztowski/core-scene3d** (`packages/core-scene3d/`) — 3D scene core (SceneGraph, SceneNode, RenderEngine, IO)
- **@mhersztowski/ui-core** (`packages/ui-core/`) — hooks, theme, utils for scene3d UI
- **@mhersztowski/ui-components-scene3d** (`packages/ui-components-scene3d/`) — scene3d UI components (RichEditor, panels, toolbar)

### Aplikacja backend (`app/mycastle-backend/`)
- Node.js, ESM (`"type": "module"`), build z tsup, dev z tsx watch
- Port: 1894 (HTTP + MQTT WebSocket at `/mqtt` — shared mode). Opcjonalnie MQTT na osobnym porcie via `MQTT_PORT`
- **App singleton** (`src/App.ts`): `App.create(config)` → `App.instance.init()` → `App.instance.shutdown()`. Trzyma referencje do wszystkich modułów.
- Importuje FileSystem, HttpUploadServer, MqttServer, DataSource z `@mhersztowski/core-backend`
- Składa się z następujących modułów (app-specific, nie wyekstrahowane do core-backend):
    - **ocr** — Tesseract.js + Sharp preprocessing, PolishReceiptParser, non-blocking init
    - **automate** — AutomateService (implementuje IAutomateService), BackendAutomateEngine (graph traversal, merge nodes), BackendSystemApi, AutomateSandbox
    - **scheduler** — SchedulerService (node-cron), auto-reload z filesystem events

### Aplikacja frontend (`app/mycastle-web/`)
- React 18 + TypeScript, Vite, Material UI
- Dev port: 1895 (Vite HMR)
- Importuje modele/nody z `@mhersztowski/core`, klient MQTT i filesystem z `@mhersztowski/web-client` (re-exported w `modules/mqttclient/` i `modules/filesystem/`)
- **App singleton** (`src/App.ts`): `App.create()` → `App.instance`. Trzyma referencje do wszystkich serwisów (mqttClient, filesystemService, aiService, speechService, wakeWordService, conversationService, conversationHistoryService, actionRegistry, automateService, uiFormService, receiptScannerService, pageHooksService). Tworzony w `main.tsx` przed renderem React.
- **AppRoot** (`src/AppRoot.tsx`): komponent React z providerami i routingiem (NotificationProvider → MqttProvider → FilesystemProvider → PageHooksRunner → Routes)
- **Env profiles** (Vite native): `.env.development` (ładowany przez `vite dev`, porty dev backendu), `.env.production` (pusty — auto-detect z `window.location`)
- Moduły:
    - **mqttclient** — re-exports z @mhersztowski/web-client (MqttClient, MqttContext, useMqtt)
    - **filesystem** — re-exports z @mhersztowski/web-client (FilesystemService, FilesystemContext, DirData, FileData, etc.) + app-specific models/nodes barrels
    - **uiforms** — system UI (Godot-like): models, nodes, renderer (21 kontrolek), designer (drag & drop), binding (oneWay/twoWay), services
    - **automate** — graficzny język (NodeRed-like): designer (responsive mobile), engine, registry (NODE_TYPE_METADATA), services. Runtime: client/backend/universal. Merge node, Manual Trigger
    - **notification** — NotificationService, NotificationProvider
    - **ai** — providers (OpenAI, Anthropic, Ollama), tool calling, konfiguracja data/ai_config.json
    - **speech** — TTS/STT/Wake Word providers, SpeechService, AudioRecorder, WakeWordService
    - **conversation** — ConversationEngine z tool calling, ActionRegistry (task/calendar/file/person/project/navigation/automate/shopping actions), scenariusze
    - **shopping** — skanowanie paragonów (AI Vision / OCR / Hybrid), ReceiptScannerService
- Komponenty reużywalne: editor (Monaco), mdeditor (Tiptap + extensions), upload, person/project/task (Label, Picker, ListEditor), ObjectSearch
- Strony: /filesystem/list, /person, /project, /calendar, /todolist, /shopping, /agent, /automate, /designer/automate/:id, /designer/ui/:id, /viewer/md/:path, /viewer/ui/:id, /editor/simple/:path, /settings/ai, /settings/speech, /settings/receipt, /settings/hooks, /objectviewer, /components
- **Wzorzec dostępu do serwisów**: strony i komponenty używają `const { aiService } = App.instance;` zamiast bezpośrednich importów singletonów. React contexty (useMqtt, useFilesystem, useNotification) pozostają dla reaktywnego stanu UI.

### Aplikacja backend Minis (`app/minis-backend/`)
- opis w docs/minis.md
- Node.js, ESM, build z tsup, dev z tsx watch
- Port: 1902 (HTTP + MQTT WebSocket at `/mqtt` — shared mode)
- **App singleton** (`src/App.ts`): FileSystem + MinisHttpServer + MqttServer + IotService. `shutdown()` gracefully zamyka IoT service + HTTP server + MQTT. IotService wired via `MqttServer.onMessage()` / `MqttServer.publishMessage()`.
- Importuje FileSystem, MqttServer z `@mhersztowski/core-backend`
- **MinisHttpServer** (`src/MinisHttpServer.ts`): rozszerza HttpUploadServer, dodaje REST API (`/api/*`). Wewnętrznie używa generycznego `handleCrud(config: CrudConfig)` do obsługi CRUD — eliminuje duplikację kodu między endpointami. Przyjmuje IotService w konstruktorze dla endpointów IoT.
    - `/api/auth/login` — logowanie po userId+password
    - `/api/admin/{users,devicedefs,moduledefs,projectdefs}` — CRUD (GET list, POST create, PUT update, DELETE). Dane trzymane w JSON files (`Minis/Admin/*.json`)
    - `/api/admin/{resource}/:id/sources` — upload ZIP z plikami źródłowymi (adm-zip, smart prefix stripping, max 50MB)
    - `/api/users/:userId/{devices,projects}` — CRUD per user (dane w `Minis/Users/:userId/*.json`)
    - `/api/users/:userId/devices/:deviceId/iot-config` — GET/PUT konfiguracja IoT urządzenia
    - `/api/users/:userId/devices/:deviceId/telemetry` — GET historia (from/to/limit), GET latest
    - `/api/users/:userId/devices/:deviceId/commands` — POST wysyłanie, GET lista (limit)
    - `/api/users/:userId/alert-rules` — GET/POST/PUT/DELETE reguły alertów
    - `/api/users/:userId/alerts` — GET lista, PATCH acknowledge/resolve
    - `/api/users/:userId/iot/devices` — GET statusy wszystkich urządzeń IoT
    - `/api/docs` — Swagger UI (swagger-ui-dist)
    - `/api/docs/swagger.json` — OpenAPI 3.0.3 spec (`src/swagger.ts`)
- **IoT Service Layer** (`src/iot/`): IotDatabase (SQLite, better-sqlite3, WAL mode), TelemetryStore (INSERT/query, config CRUD, agregacja), DevicePresence (heartbeat tracking, timeout detection), CommandDispatcher (tworzenie komend, ACK tracking), AlertEngine (reguły CRUD, ewaluacja po telemetrii, cooldown), IotService (orchestrator — parsuje MQTT topics `minis/{userId}/{deviceId}/{type}`, koordynuje stores)
- **MQTT Integration**: IotService subskrybuje `minis/` topics. Przetwarza: telemetry → insert + presence + alert eval + republish, heartbeat → presence, command/ack → update status. Publikuje: status, telemetry/live, alert
- Dependencje: adm-zip, swagger-ui-dist, better-sqlite3
- Dane platformy w `data-minis/` (ROOT_DIR=../../data-minis, JSON files), dane IoT w `data-minis/iot.db` (SQLite)

### Aplikacja frontend Minis (`app/minis-web/`)
- opis w docs/minis.md
- React 18 + TypeScript, Vite 6, Material UI 6, Monaco Editor, Blockly 12, xterm.js, esptool-js, mqtt
- Dev port: 1903 (Vite HMR), proxy `/api` → `localhost:1902`, proxy `/mqtt` → `ws://localhost:1902` (WebSocket)
- Importuje typy z `@mhersztowski/core`, transport MQTT z `@mhersztowski/web-client` (re-exported w `modules/mqttclient/`)
- **Nie używa** web-client's `FilesystemProvider` (zbyt powiązany z mycastle). Ma własny uproszczony `FilesystemContext` korzystający z `useMqtt()` do transportu.
- **Routing z userId**: wszystkie ścieżki admin/user zawierają `:userId` (np. `/admin/:userId/main`, `/user/:userId/projects`). Strony pobierają userId z `useParams()`.
- **Provider tree** (`main.tsx`): MqttProvider → FilesystemProvider → MinisDataSourceProvider → AuthProvider → App
- Moduły:
    - **mqttclient** — re-exports z @mhersztowski/web-client (MqttProvider, useMqtt)
    - **auth** — AuthContext/AuthProvider, useAuth hook. Login via MinisApiService, sesja w sessionStorage. Stan: currentUser (UserPublic), isAdmin, login(), logout()
    - **filesystem** — Minis-specific: models (FileModel, DirModel), nodes (FileNode, DirNode), components (DirComponent, FileComponent, FileJsonComponent), FilesystemContext, MinisDataSourceContext (ładuje moduleDefs/deviceDefs/projectDefs via MQTT do MemoryDataSource)
    - **editor** — Monaco editor (EditorInstance, CommandRegistry, plugins, language services) — kopia z oryginalnego Minis
    - **ardublockly2** — wizualny edytor bloków Arduino (Blockly): ArduBlocklyService, ArduBlocklyComponent, ConfigLoader, WorkspaceControls. Sub-moduły: blocks/ (io, serial, servo, stepper, spi, audio, time, map, variables), boards/ (BoardManager, BoardProfile — profile pinów dla różnych płytek), generator/ (ArduinoGenerator — transpilacja bloków do C++, generatory per kategoria: io, logic, loops, math, text, serial, servo, spi, stepper, audio, time, map, variables, procedures)
    - **serial** — komunikacja z mikrokontrolerami przez Web Serial API: WebSerialService (connect/disconnect, read/write), WebSerialTerminal (komponent xterm.js), EspFlashService (flashowanie firmware przez esptool-js), FlashDialog (UI do flashowania)
    - **iot-emulator** — emulator urządzeń IoT w przeglądarce: EmulatorService (MQTT pub/sub via `mqtt` package, jedno współdzielone połączenie, interwały telemetrii/heartbeat, command handling auto-ack/auto-fail/manual, activity log, localStorage persistence), generatory wartości (constant/random/sine/linear/step), presety urządzeń (Temperature Sensor, Multi-Sensor, Relay Actuator, Battery Device), typy
- Hooks (`src/hooks/`):
    - **useSourceUpload** — reusable hook do uploadu plików źródłowych (ZIP). Enkapsuluje stan uploadu, fileInputRef, trigger i handler. Używany w admin stronach (DevicesDefPage, ModulesDefPage, ProjectDefsPage).
- Serwisy (`src/services/`):
    - **MinisApiService** — singleton (`minisApi`), REST client do MinisHttpServer `/api/*`. Metody: login, CRUD users/deviceDefs/moduleDefs/projectDefs (admin), CRUD devices/projects per user, upload ZIP sources, 13 metod IoT (config, telemetria, komendy, reguły alertów, alerty, statusy urządzeń)
- Strony: /, /login/:userId, /admin/:userId/main, /admin/:userId/users, /admin/:userId/devicesdefs, /admin/:userId/modulesdefs, /admin/:userId/projectdefs, /admin/:userId/filesystem/list, /admin/:userId/filesystem/save, /user/:userId/main, /user/:userId/devices, /user/:userId/projects, /user/:userId/project/:projectId (ProjectPage — Blockly+Monaco split editor z serial terminal i flash), /user/:userId/iot/devices (IotDevicesPage — lista urządzeń IoT z statusem), /user/:userId/iot/device/:deviceId (IotDevicePage — dashboard z metrykami, konfiguracją, historią, komendami, alertami), /user/:userId/iot/alerts (IotAlertsPage — tabs: alerty + reguły CRUD), /user/:userId/iot/emulator (IotEmulatorPage — emulator urządzeń IoT), /user/:userId/editor/monaco/*

### Aplikacja desktop (`app/desktop/`)
- Python, Agent MQTT (paho-mqtt, WebSocket), operacje systemowe Windows
- operations/: system, process, window, clipboard, shell, app, media
- Dokumentacja: docs/desktop.md

### Aplikacja demo-scene-3d (`app/demo-scene-3d/`)
- React + Three.js demo, Vite, depends on core-scene3d, ui-core, ui-components-scene3d

## Directory Structure
```
mycastle/                           # Root monorepo
├── package.json                    # Workspace scripts, pnpm@10.28.2
├── pnpm-workspace.yaml             # packages: [packages/*, app/*]
├── pnpm-lock.yaml
├── tsconfig.base.json              # Shared TS config (ES2022, bundler, react-jsx)
├── tsconfig.json                   # Project references
├── vitest.config.ts                # Root vitest config
├── playwright.config.ts            # E2E test config (auto-start backends, baseURL minis-web)
├── docker-compose.yml              # Coolify deployment (backend + web)
├── .npmrc
│
├── packages/
│   ├── core/                       # @mhersztowski/core (shared models, nodes, mqtt, automate, datasource)
│   │   ├── src/{models,nodes,automate,mqtt,datasource}/
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # Dual ESM+CJS
│   │   └── package.json
│   ├── core-backend/               # @mhersztowski/core-backend (shared backend modules)
│   │   ├── src/{filesystem,httpserver,mqttserver,datasource}/
│   │   ├── src/interfaces.ts       # IAutomateService, IDataSource
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM-only, target node20
│   │   └── package.json
│   ├── web-client/                 # @mhersztowski/web-client (React MQTT+filesystem client)
│   │   ├── src/{mqtt,filesystem,utils}/
│   │   ├── vitest.config.ts        # Unit tests (jsdom env)
│   │   ├── tsup.config.ts          # Dual ESM+CJS, react as external peer
│   │   └── package.json
│   ├── core-scene3d/               # @mhersztowski/core-scene3d
│   │   ├── vitest.config.ts        # Unit tests
│   ├── ui-core/                    # @mhersztowski/ui-core
│   │   ├── vitest.config.ts        # Unit tests (jsdom env, React Testing Library)
│   │   ├── src/test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   └── ui-components-scene3d/      # @mhersztowski/ui-components-scene3d
│
├── app/
│   ├── mycastle-backend/           # Backend Node.js
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point (port from PORT env, default 1894)
│   │   │   ├── App.ts              # App singleton (create/instance/init/shutdown)
│   │   │   └── modules/{ocr,automate,scheduler}/
│   │   ├── Dockerfile              # Multi-stage: build → node:20-slim production
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── mycastle-web/               # Frontend React
│   │   ├── src/
│   │   │   ├── App.ts              # App singleton (create/instance, all services)
│   │   │   ├── AppRoot.tsx         # React root component (providers + routes)
│   │   │   ├── main.tsx            # Entry point (App.create() → render)
│   │   │   ├── modules/{mqttclient,filesystem,uiforms,automate,ai,speech,conversation,shopping,notification}/
│   │   │   ├── pages/
│   │   │   ├── test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   │   │   └── components/{editor,mdeditor,person,project,task,upload}/
│   │   ├── .env.development        # Dev mode URLs (loaded by vite dev)
│   │   ├── .env.production         # Empty — auto-detect (loaded by vite build)
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine (removes .env before build)
│   │   ├── nginx.conf              # SPA + reverse proxy to backend (/mqtt, /upload, /files, /ocr, /webhook)
│   │   ├── vitest.config.ts        # Unit tests (jsdom env, React Testing Library)
│   │   ├── vite.config.ts          # Dev port: 1895
│   │   └── package.json
│   ├── minis-backend/              # Minis Backend Node.js
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point (port 1902)
│   │   │   ├── App.ts              # App singleton (FileSystem+MinisHttpServer+Mqtt+IotService)
│   │   │   ├── MinisHttpServer.ts  # REST API (/api/*) extending HttpUploadServer
│   │   │   ├── swagger.ts          # OpenAPI spec
│   │   │   └── iot/                # IoT service layer
│   │   │       ├── IotDatabase.ts      # SQLite: schema init, WAL, db handle
│   │   │       ├── TelemetryStore.ts   # INSERT/query telemetrii, config CRUD, agregacja
│   │   │       ├── DevicePresence.ts   # Heartbeat tracking, timeout detection
│   │   │       ├── CommandDispatcher.ts # Tworzenie komend, ACK tracking
│   │   │       ├── AlertEngine.ts      # CRUD reguł, ewaluacja, cooldown
│   │   │       ├── IotService.ts       # Orchestrator: MQTT → stores
│   │   │       ├── IotService.test.ts  # 26 testów
│   │   │       └── IotEndpoints.test.ts # 19 testów REST IoT
│   │   ├── .env                    # PORT=1902, ROOT_DIR=../../data-minis
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── minis-web/                  # Minis Frontend React
│   │   ├── src/
│   │   │   ├── main.tsx            # Entry (providers + App)
│   │   │   ├── App.tsx             # Routes (all paths with :userId)
│   │   │   ├── modules/{mqttclient,filesystem,auth,editor,ardublockly2,serial,iot-emulator}/
│   │   │   ├── hooks/useSourceUpload.ts  # Reusable file upload hook
│   │   │   ├── services/MinisApiService.ts  # REST client singleton (w tym 13 metod IoT)
│   │   │   ├── pages/{admin,user,user/iot,filesystem,editor}/
│   │   │   ├── test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   │   │   └── components/Layout.tsx
│   │   ├── vitest.config.ts        # Unit tests (jsdom env, React Testing Library)
│   │   ├── vite.config.ts          # Dev port: 1903, proxy /api → :1902, proxy /mqtt → ws:1902
│   │   └── package.json
│   ├── demo-scene-3d/              # Scene3D demo app
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine
│   │   ├── nginx.conf
│   │   └── package.json
│   └── desktop/                    # Python MQTT agent (Windows)
│       ├── agent.py
│       ├── config.py
│       ├── operations/
│       └── requirements.txt
│
├── tests/
│   └── e2e/                        # Playwright E2E tests
│       ├── fixtures/data-minis/    # Test fixture data (pre-seeded users, devices, projects)
│       ├── global-setup.ts         # Copy fixtures to data-minis-test/
│       ├── global-teardown.ts      # Cleanup test data
│       ├── auth.spec.ts            # Login/navigation tests
│       ├── admin-crud.spec.ts      # Admin CRUD tests
│       ├── user-devices.spec.ts    # User device CRUD tests
│       └── user-projects.spec.ts   # User project CRUD tests
│
├── data/                           # Runtime data (ROOT_DIR for mycastle-backend)
├── data-minis/                     # Runtime data (ROOT_DIR for minis-backend)
├── docs/                           # automate.md, desktop.md, conversation.md, uiforms.md, minis.md, minis-iot-dashboard-plan.md, minis-iot-device-implementation.md
└── scripts/
```

## Development Workflow & Commands
- **Setup:** `pnpm install` (from root)
- **Build all:** `pnpm build`
- **Build specific:** `pnpm build:core`, `pnpm build:core-backend`, `pnpm build:web-client`, `pnpm build:backend`, `pnpm build:web`, `pnpm build:scene3d`, `pnpm build:minis-backend`, `pnpm build:minis-web`
- **Run MyCastle backend:** `pnpm dev:backend` (port 1894, HTTP + MQTT WebSocket at /mqtt)
- **Run MyCastle frontend:** `pnpm dev:web` (port 1895, Vite HMR)
- **Run Minis backend:** `pnpm dev:minis-backend` (port 1902, HTTP + MQTT WebSocket at /mqtt)
- **Run Minis frontend:** `pnpm dev:minis-web` (port 1903, Vite HMR)
- **Run scene3d:** `pnpm dev:scene3d` (requires packages built first)
- **Run desktop agent:** `cd app/desktop && python agent.py`
- **Test (unit):** `pnpm test` (all packages), `pnpm test:watch`, `pnpm test:coverage`
- **Test (e2e):** `pnpm test:e2e` (Playwright — auto-starts minis-backend + minis-web)
- **Typecheck:** `pnpm typecheck`
- **Clean:** `pnpm clean`
- **Docker (MyCastle):** `docker compose build && docker compose up -d`
- **Docker (Scene3D):** `docker build -f app/demo-scene-3d/Dockerfile -t demo-scene-3d .`

**IMPORTANT:** Run all commands from WSL (not Windows cmd). pnpm bin shims are OS-specific.

## Deployment (Coolify)
- `docker-compose.yml` definiuje 2 serwisy: `backend` (port 1894, volume /data) + `web` (nginx port 80, proxy do backend)
- Frontend Dockerfile usuwa .env przed buildem — `urlHelper.ts` auto-detect URLs z `window.location`
- **Dockerfiles** jawnie budują i kopiują zależności monorepo (core-backend, web-client) — multi-stage build z explicit `pnpm build:*` steps per package
- nginx proxy: /mqtt (WebSocket upgrade), /upload, /files/, /ocr, /webhook/ → backend:1894
- W Coolify: Docker Compose resource → przypisz domenę do serwisu `web`
- demo-scene-3d: osobny Dockerfile resource w Coolify

## Code Style & Principles
### General
- **Formatting:** Enforce automated formatting/linting (Prettier)
- **Naming:** camelCase
- **Documentation:** Keep docstrings/comments focused on **"why"**, not **"what"**
- **Modularity:** Functions/components/services should have a single responsibility
- **Imports:** Use `@mhersztowski/core` for shared types. Use `export type` for interface re-exports in ESM barrels.

### ESM Considerations
- Backend: `"type": "module"`, barrel re-exports muszą używać `export type { ... }` dla interfejsów (ESM type erasure)
- Packages: tsup dual build (ESM + CJS)
- Frontend: Vite handles ESM natively

## Testing Guidelines
- **Unit/Integration tests:** Vitest 4 (globals enabled). Każdy package/app ma własny `vitest.config.ts`. Root `vitest.config.ts` agreguje wszystkie workspace projects. Frontend testy (mycastle-web, minis-web, ui-core) używają `jsdom` environment + React Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`). Setup w `src/test-setup.ts`. Wszystkie `tsconfig.json` excludują `**/*.test.ts` / `**/*.test.tsx` z kompilacji.
- **E2E tests:** Playwright. Config w `playwright.config.ts` (root). Testy w `tests/e2e/`. Auto-start `dev:minis-backend` + `dev:minis-web` z health check na Swagger endpoint. Fixtures w `tests/e2e/fixtures/data-minis/` kopiowane do `data-minis-test/` (global setup/teardown).
- **Structure:** Testy collocated przy źródłach (`*.test.ts` / `*.test.tsx` obok implementacji). E2E w `tests/e2e/`.
- **Coverage:** Prioritize critical business logic, API boundaries, and integrations
- **Mocking/Stubs:** Frontend: mockowanie serwisów (np. `minisApi`), `vi.mock()`. Backend: temp directories z beforeEach/afterEach, dynamic port allocation (port 0) dla izolacji. React hooks: `renderHook()` z wrapper providers.
- **Behaviour:** Always write tests before implementation
- **Commands:** `pnpm test` (all unit), `pnpm test:watch`, `pnpm test:coverage` (v8), `pnpm test:e2e` (Playwright). Per-package: `pnpm --filter @mhersztowski/core test`

## Environment & Dependencies
- **Languages:** Node 20, TypeScript 5.9+, Python 3.14 (desktop)
- **Package manager:** pnpm 10.28.2 (workspaces), pip (Python)
- **Build tools:** tsup (packages, backends), Vite 5 (mycastle-web), Vite 6 (minis-web), Vite 7 (scene3d)
- **Testing:** Vitest 4 (unit/integration), Playwright (e2e), @vitest/coverage-v8, React Testing Library (mycastle-web, minis-web, ui-core)
- **Frontend:** React 18, Material UI 5, ReactFlow, Tiptap 3, Monaco Editor. Minis-web additionally: mqtt (v5, raw pub/sub for IoT emulator)
- **Backend:** Aedes (MQTT), dotenv, dayjs, Tesseract.js, Sharp, node-cron. Minis-backend additionally: adm-zip, swagger-ui-dist, better-sqlite3 (IoT data)
- **Desktop:** paho-mqtt, psutil, pyperclip, Pillow, pygetwindow, pycaw, winotify

## Common Gotchas
- **ESM barrels:** Backend barrel `index.ts` files must use `export type { ... }` for TypeScript interfaces. Otherwise ESM runtime throws "does not provide an export named" error.
- **pnpm strict mode:** All dependencies must be listed explicitly in package.json (no hoisting of transitive deps).
- **Aedes ESM import:** `import aedes from 'aedes'` (default export only), then `const { createBroker } = aedes`.
- **WSL vs Windows:** `pnpm install` creates OS-specific bin shims. Run everything from WSL.
- **VITE_* env vars:** Baked at build time. Vite ładuje `.env.development` (dev) / `.env.production` (build) automatycznie. W produkcji Docker .env jest usuwany, URL auto-detect.
- **App singleton (frontend):** Strony/komponenty korzystają z `App.instance.serviceName` zamiast bezpośrednich importów singletonów. Moduły wewnętrznie nadal importują swoje zależności bezpośrednio (nie przez App). `App.create()` wywoływane w `main.tsx` przed renderem React.
- **MQTT:** Use unique client IDs. WebSocket path: `/mqtt`. Shared mode (single port) for deployment.
- **Frontend data reload:** FilesystemContext `dataVersion` counter triggers re-renders on FILE_CHANGED events.
