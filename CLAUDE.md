# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types, datasource, VFS. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel, MinisModuleDefModel, MinisModuleModel, MinisDeviceDefModel (board? field), MinisDeviceModel (isIot field, description?: string, localizationId?: string), MinisLocalizationModel (id, name, type: 'place'|'geo', place?: string, geo?: {lat,lng}|null, device: string), MinisProjectDefModel, MinisProjectModel, UserModel, IotModels (IotDeviceConfig, IotEntity, IotEntityType, IotSensorEntity, IotBinarySensorEntity, IotSwitchEntity, IotNumberEntity, IotButtonEntity, IotSelectEntity, TelemetryRecord, TelemetryMetric, TelemetryAggregate, DeviceCommand, AlertRule, Alert, IotDeviceStatus, DeviceShare), AuthModels (AuthTokenPayload, ApiKeyPublic)
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty; metoda `copyBaseStateTo()` do kopiowania UI state przy clone), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode, MinisModuleDefNode, MinisModuleNode, MinisDeviceDefNode, MinisDeviceNode, MinisProjectDefNode, MinisProjectNode, UserNode. Wszystkie nody używają `copyBaseStateTo()` w `clone()` zamiast ręcznego kopiowania pól.
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload. `topics.ts`: Zod-based MQTT topic registry (analogiczny do RPC). MqttTopicDef (pattern, description, direction, payloadSchema, tags), defineMqttTopic(), MqttPayload<T>. mqttTopics registry (telemetry, heartbeat, command, commandAck, status, telemetryLive, alert, sharedTelemetryLive, sharedStatus), MqttTopicRegistry, MqttTopicName. matchTopic(fullTopic) — dopasowuje topic do wzorca, zwraca def + wyekstrahowane params. Zod schemas = single source of truth for payload validation i type info w MQTT Explorer
  - `datasource/` — IDataSource interface (w tym kolekcje Minis: minisModuleDefs, minisModules, minisDeviceDefs, minisDevices, minisProjectDefs, minisProjects, users), MemoryDataSource (load* methods per kolekcję), CalendarItem, Calendar
  - `rpc/` — Zod-based RPC system (shared types + method registry). `types.ts`: RpcMethodDef (z fieldMeta?: Record<string, FieldMeta>), AutocompleteSource ('users' | 'userDevices'), FieldMeta (autocomplete?, dependsOn?), defineRpcMethod(), RpcResponse/RpcErrorResponse. `methods.ts`: rpcMethods registry (ping, getDeviceStatuses, sendCommand, getLatestTelemetry), RpcMethodRegistry, RpcMethodName types. fieldMeta na metodach definiuje autocomplete sources i zależności między polami (np. deviceName dependsOn userName). Zod schemas = single source of truth for validation, types, and auto-generated Swagger docs.
  - `vfs/` — Virtual File System abstraction (VS Code-inspired). `types.ts`: FileSystemProvider interface (scheme, capabilities, stat, readDirectory, readFile, writeFile?, delete?, rename?, mkdir?, copy?, watch?, onDidChangeFile), FileType enum, FileChangeType enum, FileStat, DirectoryEntry, WriteFileOptions, DeleteOptions, RenameOptions, CopyOptions, isWritable(). `errors.ts`: VfsError, VfsErrorCode. `paths.ts`: VFS path utilities. Implementacje: MemoryFS (in-memory), CompositeFS (mount multiple providers pod różnymi ścieżkami), GitHubFS (GitHub API), BrowserFS (File System Access API), NodeFS (Node.js fs — backend only), RemoteFS (REST proxy do server-side VFS). `utils.ts`: encodeText/decodeText (UTF-8 Uint8Array ↔ string).
  - `mjd/` — Meta JSON Definition system. `types.ts`: MjdFieldType ('string'|'number'|'boolean'|'date'|'enum'|'array'), MjdViewType ('form'), MjdFieldDef (name, type, tags, label, description, defaultValue, required, options, itemType), MjdViewDef (name, type, tag), MjdDocument (version, tags, fields, views). `helpers.ts`: createMjdDocument(), createMjdField(), createMjdView(), getFieldsForView(). `jsonSchema.ts`: generateJsonSchema(doc) — konwertuje MjdDocument na JSON Schema draft-07 (typy, required, enum, array z itemType).
- **@mhersztowski/web-client** (`packages/web-client/`) — reusable React client for MyCastle backend. Dual ESM+CJS build (tsup). React as peerDependency, monaco-editor as optional peerDependency.
  - `mqtt/` — MqttClient (MQTT over WebSocket, request-response, file ops), MqttContext/MqttProvider, useMqtt hook
  - `filesystem/` — FilesystemService (dir tree, batch file loading, calendar, DataSource), FilesystemContext/FilesystemProvider, useFilesystem hook
  - `filesystem/data/` — DirData, FileData, CalendarItem (extends core), Calendar, DataSource (re-export of MemoryDataSource)
  - `filesystem/components/` — DirComponent, FileComponent, FileJsonComponent, FileMarkdownComponent
  - `utils/` — configureUrls(), getHttpUrl(), getMqttUrl() (auto-detect from window.location, configurable)
  - `vfs/` — VFS UI components. VfsExplorer (tree browser z context menu, drag & drop, inline rename, mount manager), VfsBreadcrumbs, VfsMountManager (UI do montowania providerów: MemoryFS, GitHubFS, BrowserFS, RemoteFS), useVfsTree hook, providerRegistry (memoryFsProvider, githubFsProvider, browserFsProvider, remoteFsProvider, defaultProviderRegistry), getFileIcon, useVfsClipboard
  - `monaco/` — Monaco Editor wrapper (wyekstrahowany z minis-web modules/editor). `core/`: EditorInstance (wrapper wokół monaco.editor, create/dispose, setModel, getContent, getState/restoreState, on events), ModelManager (zarządzanie modelami per URI, createModel/getModel/disposeModel), CommandRegistry (KeyMod, KeyCode re-exports), EventEmitter. `language/`: LanguageService, FormattingService, C++ plugin (completion, hover, config). `plugins/`: PluginSystem, przykłady (HighlightLine, WordCount). `state/`: EditorStateManager. `ui/`: ContextMenuService, DecorationManager, StatusBar. `utils/`: types (DocumentUri, EditorId branded types), disposable (DisposableStore), debounce. **MonacoMultiEditor** — VS Code-like component: Activity Bar (Explorer/Search/Extensions) + Sidebar (VFS file browser) + draggable splitter + tabbed multi-editor z Split Editor (wiele grup edytorów side-by-side, flex-grow sizing, draggable group splitters) + Menu Bar (File/Edit) + Status Bar (cursor pos, language, encoding, group info). Otwieranie plików: VFS double-click → readFile → ModelManager.createModel → tab. Shared ModelManager across grup. Ctrl+S save (handleSaveRef pattern dla stabilnego callbacka). monacoWorkers.ts zostaje w consuming app (Vite-specific ?worker imports).
  - `typedoc/` — TypeDoc JSON viewer: TypeDocViewer component (renders TypeDoc JSON output as interactive documentation)
  - `mjd/` — MJD editor React components. **MjdDefEditor** (props: value: MjdDocument, onChange) — edytor definicji: sekcje Version, Tags (TagManager chips), Fields (tabela z expandable FieldRow: name/label/type/description/required/tags/options/itemType), Views (ViewRow: name/type/tag), Generate (.mjd + JSON Schema do clipboard). **MjdDataEditor** (props: definition, value, onChange) — edytor danych wg schematu MJD: view selector (dropdown wg views), kontrolki per typ (TextField/Switch/Select/datetime-local/ArrayFieldControl). **MjdVfsLoader** (props: provider, mjdPath, dataPath?, height?) — composite: ładuje definition+data z VFS, auto-save 500ms debounce, renderuje MjdDataEditor (gdy dataPath) lub MjdDefEditor.
- **@mhersztowski/core-backend** (`packages/core-backend/`) — współdzielone moduły backendowe wyekstrahowane z mycastle-backend. ESM-only build (tsup).
  - `filesystem/` — FileSystem (in-memory cache, EventEmitter fileChanged, atomic writes, per-file locking, deleteDirectory)
  - `httpserver/` — HttpUploadServer (CORS, POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook). Klasa rozszerzalna: protected server, fileSystem, setCorsHeaders, handleRequest, sendJsonResponse — umożliwia subclassing (np. MinisHttpServer)
  - `mqttserver/` — MqttServer (Aedes, publishMessage(), onMessage(handler) for custom topic routing, setAuthenticate(callback) for MQTT auth), MqttMessageHandler type, Client, Packet classes per type
  - `auth/` — JwtService (sign/verify JWT, jsonwebtoken), PasswordService (bcrypt hash/verify, isBcrypt detection), ApiKeyService (CRUD kluczy API z prefix `minis_`, SHA-256 hash, per-user, dane w JSON file), checkAuth() middleware (Bearer token: JWT lub API key → AuthTokenPayload | null)
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
- **App singleton** (`src/App.ts`): FileSystem + MinisHttpServer + MqttServer + IotService + JwtService + ApiKeyService + ArduinoService. `shutdown()` gracefully zamyka IoT service + HTTP server + MQTT. IotService wired via `MqttServer.onMessage()` / `MqttServer.publishMessage()`. MQTT auth via `MqttServer.setAuthenticate()` (API key / JWT / username+password).
- Importuje FileSystem, MqttServer, JwtService, PasswordService, ApiKeyService z `@mhersztowski/core-backend`
- **MinisHttpServer** (`src/MinisHttpServer.ts`): rozszerza HttpUploadServer, dodaje REST API (`/api/*`). JWT auth middleware (checkAuth) na wszystkie endpointy poza publicznymi (`/auth/login`, `/auth/users`, `/docs*`). Admin routes wymagają `isAdmin`. Wewnętrznie używa generycznego `handleCrud(config: CrudConfig)` do obsługi CRUD — eliminuje duplikację kodu między endpointami. CrudConfig.lookupKey: admin CRUD używa `'id'`, user devices/projects używają `'name'`. Walidacja nazw: `[a-zA-Z0-9_-]`, unikalność (400/409). Hasła hashowane bcrypt (auto-migracja plaintext przy logowaniu).
    - `/api/auth/login` — logowanie po name+password, zwraca `{ token, user }` (JWT + UserPublic)
    - `/api/auth/users` — publiczna lista użytkowników (bez haseł)
    - `/api/admin/{users,devicedefs,moduledefs,projectdefs}` — CRUD (GET list, POST create, PUT update, DELETE). Dane trzymane w JSON files (`Minis/Admin/*.json`)
    - `/api/admin/{resource}/:id/sources` — upload ZIP z plikami źródłowymi (adm-zip, smart prefix stripping, max 50MB)
    - `/api/users/:userName/{devices,projects}` — CRUD per user (dane w `Minis/Users/:userName/*.json`), lookup po nazwie urządzenia/projektu
    - `/api/users/:userName/devices/:deviceName/iot-config` — GET/PUT konfiguracja IoT urządzenia
    - `/api/users/:userName/devices/:deviceName/telemetry` — GET historia (from/to/limit), GET latest
    - `/api/users/:userName/devices/:deviceName/commands` — POST wysyłanie, GET lista (limit)
    - `/api/users/:userName/alert-rules` — GET/POST/PUT/DELETE reguły alertów
    - `/api/users/:userName/alerts` — GET lista, PATCH acknowledge/resolve
    - `/api/users/:userName/iot/devices` — GET statusy wszystkich urządzeń IoT
    - `/api/users/:userName/devices/:deviceName/shares` — GET/POST/DELETE udostępnienia urządzenia
    - `/api/users/:userName/shared-devices` — GET urządzenia udostępnione temu użytkownikowi
    - `/api/users/:userName/my-shares` — GET udostępnienia dokonane przez tego użytkownika
    - `/api/users/:userName/api-keys` — GET/POST/DELETE zarządzanie kluczami API (per-user, admin może wszystkimi)
    - `/api/arduino/boards` — GET lista dostępnych płytek (arduino-cli board listall)
    - `/api/arduino/ports` — GET lista portów COM
    - `/api/users/:userName/projects/:projectName/compile` — POST kompilacja (`{ sketchName, fqbn }`)
    - `/api/users/:userName/projects/:projectName/upload` — POST upload firmware (`{ sketchName, fqbn, port }`)
    - `/api/users/:userName/projects/:projectName/output[/:fileName]` — GET lista / pobranie skompilowanych plików
    - `/api/users/:userName/projects/:projectName/sketches[/:sketchName/:fileName]` — GET lista / GET odczyt / PUT zapis plików sketchy
    - `/api/users/:userName/projects/:projectName/readme` — GET/PUT plik README.md projektu (przechowywany w `Minis/Users/:userName/Projects/:projectId/README.md`)
    - `/api/users/:userName/localizations[/:id]` — CRUD lokalizacji per user (dane w `Minis/Users/:userName/Localizations.json`). MinisLocalizationModel: id, name, type ('place'|'geo'), place?, geo? ({lat,lng}), device (deviceId)
    - `/api/ai/search` — POST proxy do OpenAI / Anthropic API (CORS bypass). Body: `{ model: 'openai'|'anthropic', apiKey, systemPrompt, userPrompt }`. Zwraca `{ result: string }`. OpenAI: gpt-4o-mini, Anthropic: claude-haiku-4-5-20251001
    - `/api/vfs/{operation}?path=` — admin-only VFS REST endpoints (capabilities, stat, readdir, readFile, writeFile, delete, rename, mkdir, copy). Server-side CompositeFS z NodeFS mounted at /data. Base64-encoded file content. VfsError → proper HTTP status codes (404/409/400/403/503)
    - `/api/rpc/{methodName}` — POST, generyczny RPC dispatch (Zod validation, auto-Swagger, `user` w context)
    - `/api/docs` — Swagger UI (z Authorize dla Bearer token)
    - `/api/docs/swagger.json` — OpenAPI 3.0.3 spec (`src/swagger.ts`, auto-generated z Zod schemas via `buildSwaggerSpec()` + `zod-to-json-schema`). Property schemas wzbogacone o `x-autocomplete` i `x-depends-on` z fieldMeta. Security scheme bearerAuth (JWT/API key)
- **RPC System** (`src/rpc/`): RpcRouter (register/dispatch/getRegisteredMethods), handlers.ts (registerHandlers z deps: iotService, fileSystem). Metody RPC: ping, getDeviceStatuses, sendCommand, getLatestTelemetry. Dodawanie nowej metody: 1) schema w core/rpc/methods.ts, 2) handler w handlers.ts, 3) call z frontendu via rpcClient — Swagger auto-update.
- **Arduino Service Layer** (`src/arduino/`): ArduinoCli (interfejs), ArduinoCliLocal (child_process.execFile, env `ARDUINO_CLI_LOCAL_PATH`), ArduinoCliDocker (docker exec, env `ARDUINO_CLI_DOCKER_NAME`), ArduinoProject (zarządzanie ścieżkami: sketches/libraries/output/build/custom-config.yaml, orchestracja compile/upload), ArduinoService (orchestrator: tworzy Local/Docker na podstawie env, `isAvailable` getter, compile/upload/listBoards/listPorts)
- **IoT Service Layer** (`src/iot/`): IotDatabase (SQLite, better-sqlite3, WAL mode), TelemetryStore (INSERT/query, config CRUD, agregacja), DevicePresence (heartbeat tracking, timeout detection), CommandDispatcher (tworzenie komend, ACK tracking), AlertEngine (reguły CRUD, ewaluacja po telemetrii, cooldown), DeviceShareStore (CRUD udostępnień, prepared statements), IotService (orchestrator — parsuje MQTT topics `minis/{userName}/{deviceName}/{type}`, koordynuje stores, forwarding telemetrii/statusu do shared users)
- **MQTT Integration**: IotService subskrybuje `minis/` topics. Waliduje payloady Zodem (safeParse z `mqttTopics` registry). Przetwarza: telemetry → validate + insert + presence + alert eval + republish + forward do shared users, heartbeat → validate + presence, command/ack → validate + update status. Publikuje: status, telemetry/live, alert. Forwarding do shared users: `minis/{targetUser}/shared/{owner}/{device}/telemetry/live`, `minis/{targetUser}/shared/{owner}/{device}/status`
- Dependencje: adm-zip, swagger-ui-dist, better-sqlite3, zod, zod-to-json-schema
- Dane platformy w `data/` (ROOT_DIR=../../data, JSON files), dane IoT w `data/iot.db` (SQLite)

### Aplikacja frontend Minis (`app/minis-web/`)
- opis w docs/minis.md
- React 18 + TypeScript, Vite 6, Material UI 6, Monaco Editor, Blockly 12, xterm.js, esptool-js, mqtt
- Dev port: 1903 (Vite HMR), proxy `/api` → `localhost:1902`, proxy `/mqtt` → `ws://localhost:1902` (WebSocket)
- Importuje typy z `@mhersztowski/core`, transport MQTT z `@mhersztowski/web-client` (re-exported w `modules/mqttclient/`)
- **Nie używa** web-client's `FilesystemProvider` (zbyt powiązany z mycastle). Ma własny uproszczony `FilesystemContext` korzystający z `useMqtt()` do transportu.
- **Routing z userName**: wszystkie ścieżki admin/user zawierają `:userName` (np. `/admin/:userName/main`, `/user/:userName/electronics/devices`). IoT device page: `:deviceName`. Strony pobierają userName z `useParams()`. Identyfikacja po nazwie (nie UUID) — nazwy muszą być unikalne i URL-safe `[a-zA-Z0-9_-]`.
- **Sidebar nawigacja**: Layout z MUI Drawer, flat items + collapsible tree groups (Electronics, IoT, Tools) z `Collapse`/`ExpandLess`/`ExpandMore`. Generyczny `openGroups` state.
- **Provider tree** (`main.tsx`): MqttProvider → FilesystemProvider → MinisDataSourceProvider → AuthProvider → GlobalWindowsProvider → App + GlobalApiDocs + GlobalRpcExplorer + GlobalMqttExplorer + GlobalMjdDefEditor + GlobalMjdDataEditor
- Moduły:
    - **mqttclient** — re-exports z @mhersztowski/web-client (MqttProvider, useMqtt)
    - **auth** — AuthContext/AuthProvider, useAuth hook. JWT token + sesja w sessionStorage (format `{ user, token }`). `setAuthToken()` propaguje token do MinisApiService i RpcClient. Stan: currentUser, token, isAdmin, login(), logout(), impersonating, startImpersonating(), stopImpersonating(). Impersonacja: admin może przeglądać widok innego usera (efemeryczny stan, nie persystowany)
    - **filesystem** — Minis-specific: models (FileModel, DirModel), nodes (FileNode, DirNode), components (DirComponent, FileComponent, FileJsonComponent), FilesystemContext, MinisDataSourceContext (ładuje moduleDefs/deviceDefs/projectDefs via MQTT do MemoryDataSource)
    - **editor** — tylko `monacoWorkers.ts` (Vite-specific `?worker` imports dla Monaco web workers). Reszta edytora wyekstrahowana do `@mhersztowski/web-client/monaco`
    - **ardublockly2** — wizualny edytor bloków Arduino (Blockly): ArduBlocklyService, ArduBlocklyComponent, ConfigLoader, WorkspaceControls. Sub-moduły: blocks/ (io, serial, servo, stepper, spi, audio, time, map, variables), boards/ (BoardManager, BoardProfile z compilerFlag/flashConfig — profile pinów dla różnych płytek: ESP8266 Huzzah/Wemos D1, ESP32 DevKitC, Arduino Uno/Nano/Mega/Leonardo, socToBoardKey mapping SoC→board), generator/ (ArduinoGenerator — transpilacja bloków do C++, generatory per kategoria: io, logic, loops, math, text, serial, servo, spi, stepper, audio, time, map, variables, procedures)
    - **upythonblockly** — wizualny edytor bloków MicroPython (Blockly): UPythonBlocklyService (generateCode(), serializeToXml(), loadFromXml(), changeBoard(), onWorkspaceChange()), UPythonBlocklyComponent. Sub-moduły: boards/ (UPythonBoardManager, UPythonBoardProfile — profile pinów dla: esp32_generic, esp32s3_generic, esp8266_wemos_d1, rp2040_pico, m5stack_core, m5stack_atom; socToUPythonBoardKey mapping SoC→board), blocks/ (pin, adc, pwm, time, uart, i2c, wifi, bits, control, event, math, typeconv, timer), generator/ (UPythonGenerator extends Blockly.CodeGenerator — imports_/inits_/userFunctions_ dicts, finish() generuje while True: loop; generatory per kategoria: pin, adc, pwm, time, uart, i2c, wifi, bits, control, event, timer, typeconv, logic, loops, math, text, variables, procedures), toolbox.ts (JSON toolbox z kategoriami Logic/Loops/Math/Text/Variables/Functions/Pin/ADC/PWM/Time/UART/I2C/WiFi), repl/ (MpySerialReplService — Web Serial API raw REPL Ctrl+A mode; MpyWebReplService — WebSocket WebREPL z auth, execCode, saveToFile, putFile — protokół binarny PUT wg specyfikacji WebREPL: 82-bajtowy header 'WA'+type+flags+offset+size+fname, odpowiedź 8-bajtowa 'WB'+type+result; MpyReplTerminal — React xterm.js terminal z Serial/WebREPL tabs i Run button; backendRef pattern eliminuje stale closure w onData; po connect Serial wysyła Ctrl+C Ctrl+B \r\n dla świeżego prompta; po WebREPL connect wysyła \r\n; Ctrl+Shift+C kopiuje zaznaczenie), upload/ (UploadDialog — MUI Dialog z Serial/WebREPL tabs, Run only / Save as main.py radio, log output)
    - **serial** — komunikacja z mikrokontrolerami przez Web Serial API: WebSerialService (connect/disconnect, read/write), WebSerialTerminal (komponent xterm.js z Ctrl+Shift+C do kopiowania zaznaczenia), EspFlashService (flashowanie firmware przez esptool-js), FlashDialog (UI do flashowania, opcjonalne `initialFiles` z pre-loaded firmware z kompilacji)
    - **iot-emulator** — emulator urządzeń IoT w przeglądarce: EmulatorService (MQTT pub/sub via `mqtt` package, jedno współdzielone połączenie, interwały telemetrii/heartbeat, command handling auto-ack/auto-fail/manual, entity command handling set_state/set_value/set_option/press z natychmiastowym republish telemetrii, activity log, localStorage persistence), generatory wartości (constant/random/sine/linear/step), presety urządzeń (Temperature Sensor, Multi-Sensor, Relay Actuator, Battery Device, Smart Thermostat, Smart Plug), typy
- Hooks (`src/hooks/`):
    - **useSourceUpload** — reusable hook do uploadu plików źródłowych (ZIP). Enkapsuluje stan uploadu, fileInputRef, trigger i handler. Używany w admin stronach (DevicesDefPage, ModulesDefPage, ProjectDefsPage).
- Serwisy (`src/services/`):
    - **MinisApiService** — singleton (`minisApi`), REST client do MinisHttpServer `/api/*`. `setAuthToken(token)` — Bearer token na requestach. Metody: login, getPublicUsers, CRUD users/deviceDefs/moduleDefs/projectDefs (admin), CRUD devices/projects per user, upload ZIP sources, 17 metod IoT, 3 metody API Keys, Arduino API (getArduinoBoards/Ports, compileProject, uploadFirmware, getProjectOutput, fetchOutputBinary), Sketch API (listSketches, readSketchFile, writeSketchFile), README API (readProjectReadme, writeProjectReadme), Localization API (getLocalizations, createLocalization, updateLocalization, deleteLocalization)
    - **RpcClient** — singleton (`rpcClient`), type-safe klient RPC. `setAuthToken(token)` — Bearer token. `call<TName>(method, input): Promise<Output>` — pełny type inference z RpcMethodRegistry (IDE autocomplete na nazwy metod, input i output). Wire format: `POST /api/rpc/{method}` z JSON body.
- **AdminOnly guard** (`App.tsx`): route guard sprawdzający `isAdmin && !impersonating`, redirectuje do `/user/:userName/main`
- **ImpersonationBanner** (`components/ImpersonationBanner.tsx`): fixed żółty pasek na górze z "Viewing as: {name}" + Stop. Layout offsetuje AppBar/Drawer/content gdy aktywny
- **GlobalMjdDefEditor** (`components/GlobalMjdDefEditor.tsx`): pływające okno do edycji plików definicji MJD (`.mjd`). Używa RemoteFS (`/api/vfs`). Load/Save/Save As via VfsFileDialog. Przy zapisie generuje jednocześnie `.mjd` i `.json` (JSON Schema). `openWithParams('mjdDefEditor', { mjdPath })`.
- **GlobalMjdDataEditor** (`components/GlobalMjdDataEditor.tsx`): pływające okno do edycji danych wg schematu MJD. Ładuje definicję z `.mjd`, dane z `.data.json` (auto-derive path). Init z defaultValues gdy plik danych nie istnieje. `openWithParams('mjdDataEditor', { mjdPath, dataPath })`.
- **GlobalWindowsContext** (`components/GlobalWindowsContext.tsx`): WindowName rozszerzone o `'mjdDefEditor' | 'mjdDataEditor'`. MjdDefEditorParams `{ mjdPath }`, MjdDataEditorParams `{ mjdPath, dataPath }`.
- `softwarePlatform` w `MinisProjectDefModel`: `'Arduino'` (filtrowane na UserProjectsPage) | `'uPython'` (filtrowane na UserUPythonProjectsPage) | brak/pusty (traktowane jako Arduino dla kompatybilności wstecznej)
- Strony: /, /login/:userName, /admin/:userName/main, /admin/:userName/users (z przyciskiem Impersonate), /admin/:userName/devicesdefs, /admin/:userName/modulesdefs, /admin/:userName/projectdefs, /admin/:userName/filesystem/list, /admin/:userName/filesystem/save, /user/:userName/main, /user/:userName/localization (LocalizationPage — tabela lokalizacji z filtrami name/place + type dropdown, Group by Place checkbox, AI Search accordion z OpenAI/Anthropic proxy, opis urządzenia jako Markdown popover, `react-markdown` + `remark-breaks`), /user/:userName/electronics/devices (UserDevicesPage — lista urządzeń z slide-out Drawer edycji po kliknięciu wiersza; auto-generowanie nazwy jako DefName-SN; pola: name/sn/description(markdown)/isAssembled/isIot), /user/:userName/electronics/arduino (UserProjectsPage — projekty Arduino/Blockly, filtruje po softwarePlatform==='Arduino'||brak), /user/:userName/electronics/upython (UserUPythonProjectsPage — projekty uPython, filtruje po softwarePlatform==='uPython'), /user/:userName/project/:projectId (ProjectPage — Blockly+Monaco split editor z serial terminal, server-side compile i flash z pre-loaded firmware; README panel boczny z podglądem Markdown + edycją inline), /user/:userName/upython-project/:projectId (UPythonProjectPage — Blockly+Monaco Python split editor, MpyReplTerminal panel, UploadDialog do uruchamiania/zapisywania kodu na urządzeniu via Serial REPL lub WebREPL; README panel boczny), /user/:userName/iot/dashboard (IotDashboardPage — entity-aware karty urządzeń: EntityWidgets z sparkline SVG, kontrolki switch/slider/select/button, fallback na capabilities, auto-refresh 10s + quick refresh po komendzie), /user/:userName/iot/devices (IotDevicesPage — lista urządzeń IoT z statusem), /user/:userName/iot/device/:deviceName (IotDevicePage — entity widgets sekcja, metryki ze sparkline, konfiguracja, historia telemetrii, komendy, alerty), /user/:userName/iot/alerts (IotAlertsPage — tabs: alerty + reguły CRUD), /user/:userName/iot/emulator (IotEmulatorPage — emulator urządzeń IoT), /user/:userName/tools/rpc (AdminOnly — RpcExplorerPage — auto-generowane formularze z Swagger/Zod schemas, smart autocomplete z x-autocomplete/x-depends-on metadata, Execute + response, Node-RED export NR Local/NR Remote), /user/:userName/tools/mqtt-explorer (AdminOnly — MqttExplorerPage — hierarchiczny topic tree z real-time messages, detail panel z type info z mqttTopics registry + Zod validation, publish form z topic autocomplete z registry + QoS/retain, wildcard subscriptions, Node-RED flow export via WebSocket ws://172.17.0.1:1902/mqtt / wss://minis.hersztowski.org/mqtt, throttled rendering via requestAnimationFrame), /user/:userName/tools/api-keys (AdminOnly — ApiKeysPage — CRUD kluczy API), /user/:userName/tools/testvfs (AdminOnly — TestVfsPage — VFS Explorer test page z CompositeFS/RemoteFS, file preview, manual ops, event log), /user/:userName/tools/docs (AdminOnly — DocsPage — TypeDoc API documentation viewer), /user/:userName/editor/monaco/* (MonacoMultiEditor z VFS Explorer + split editor)

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
│   ├── core/                       # @mhersztowski/core (shared models, nodes, mqtt, automate, datasource, rpc, vfs, mjd)
│   │   ├── src/{models,nodes,automate,mqtt,datasource,rpc,vfs,mjd}/
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # Dual ESM+CJS
│   │   └── package.json
│   ├── core-backend/               # @mhersztowski/core-backend (shared backend modules)
│   │   ├── src/{filesystem,httpserver,mqttserver,datasource,auth}/
│   │   ├── src/auth/               # JwtService, PasswordService, ApiKeyService, checkAuth middleware
│   │   ├── src/interfaces.ts       # IAutomateService, IDataSource
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM-only, target node20
│   │   └── package.json
│   ├── web-client/                 # @mhersztowski/web-client (React MQTT+filesystem+VFS+Monaco+MJD client)
│   │   ├── src/{mqtt,filesystem,utils,vfs,monaco,typedoc,mjd}/
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
│   │   │   ├── App.ts              # App singleton (FileSystem+MinisHttpServer+Mqtt+IotService+JwtService+ApiKeyService+ArduinoService)
│   │   │   ├── MinisHttpServer.ts  # REST API (/api/*) + JWT auth middleware + RPC dispatch + Arduino/Sketch endpoints, extending HttpUploadServer
│   │   │   ├── swagger.ts          # OpenAPI spec (auto-generated z Zod via buildSwaggerSpec)
│   │   │   ├── arduino/            # Arduino CLI integration
│   │   │   │   ├── ArduinoCli.ts       # Interface + types (BoardInfo, CompileResult, etc.)
│   │   │   │   ├── ArduinoCliLocal.ts  # Local execution (child_process.execFile)
│   │   │   │   ├── ArduinoCliDocker.ts # Docker execution (docker exec)
│   │   │   │   ├── ArduinoProject.ts   # Project path management + compile/upload orchestration
│   │   │   │   ├── ArduinoProject.test.ts  # Unit tests (7 tests, mock ArduinoCli)
│   │   │   │   ├── ArduinoService.ts   # Orchestrator (creates Local/Docker based on env)
│   │   │   │   ├── ArduinoEndpoints.test.ts # Integration tests (22 tests, MockArduinoCli + JWT auth)
│   │   │   │   └── index.ts            # Barrel export
│   │   │   ├── rpc/                # RPC system
│   │   │   │   ├── RpcRouter.ts        # Register/dispatch/getRegisteredMethods
│   │   │   │   ├── handlers.ts         # Handler implementations (ping, IoT methods)
│   │   │   │   ├── RpcRouter.test.ts   # Unit tests
│   │   │   │   └── RpcEndpoints.test.ts # Integration tests
│   │   │   └── iot/                # IoT service layer
│   │   │       ├── IotDatabase.ts      # SQLite: schema init, WAL, db handle
│   │   │       ├── TelemetryStore.ts   # INSERT/query telemetrii, config CRUD, agregacja
│   │   │       ├── DevicePresence.ts   # Heartbeat tracking, timeout detection
│   │   │       ├── CommandDispatcher.ts # Tworzenie komend, ACK tracking
│   │   │       ├── AlertEngine.ts      # CRUD reguł, ewaluacja, cooldown
│   │   │       ├── DeviceShareStore.ts # CRUD udostępnień urządzeń
│   │   │       ├── IotService.ts       # Orchestrator: MQTT → stores, share forwarding
│   │   │       ├── IotService.test.ts  # 26 testów
│   │   │       └── IotEndpoints.test.ts # 19 testów REST IoT
│   │   ├── .env                    # PORT=1902, ROOT_DIR=../../data
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── minis-web/                  # Minis Frontend React
│   │   ├── src/
│   │   │   ├── main.tsx            # Entry (providers + GlobalWindows + App)
│   │   │   ├── App.tsx             # Routes (all paths with :userName/:deviceName), AdminOnly guard
│   │   │   ├── modules/{mqttclient,filesystem,auth,editor(monacoWorkers only),ardublockly2,upythonblockly,serial,iot-emulator}/
│   │   │   ├── hooks/useSourceUpload.ts  # Reusable file upload hook
│   │   │   ├── services/MinisApiService.ts  # REST client singleton (IoT + API Keys + Arduino + Sketch API)
│   │   │   ├── services/RpcClient.ts       # Type-safe RPC client singleton (call z autocomplete, setAuthToken)
│   │   │   ├── pages/{admin,user,user/iot,user/tools,filesystem,editor}/
│   │   │   ├── test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   │   │   ├── components/Layout.tsx        # Drawer + AppBar + AccountMenu + ImpersonationBanner
│   │   │   ├── components/AccountMenu.tsx   # Hierarchical menu (View save/load/clear, Window API Docs/RPC/MQTT)
│   │   │   ├── components/GlobalWindowsContext.tsx  # Floating windows state (Map<WindowName, 'open'|'minimized'>)
│   │   │   ├── components/GlobalWindow.tsx  # Draggable/resizable floating window component
│   │   │   ├── components/Global{ApiDocs,RpcExplorer,MqttExplorer}.tsx  # Lazy-loaded pages in GlobalWindow
│   │   │   ├── components/BuildOutputPanel.tsx  # Draggable build output panel (monospace, status colors)
│   │   │   └── components/ImpersonationBanner.tsx  # Fixed banner for admin impersonation
│   │   ├── public/docs.json         # TypeDoc JSON output (for DocsPage viewer)
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
│       ├── fixtures/data/          # Test fixture data (pre-seeded users, devices, projects)
│       ├── global-setup.ts         # Copy fixtures to data-test/
│       ├── global-teardown.ts      # Cleanup test data
│       ├── auth.spec.ts            # Login/navigation tests
│       ├── admin-crud.spec.ts      # Admin CRUD tests
│       ├── user-devices.spec.ts    # User device CRUD tests
│       └── user-projects.spec.ts   # User project CRUD tests
│
├── typedoc.json                    # TypeDoc config (entryPointStrategy: packages, all packages + apps)
├── data/                           # Runtime data (ROOT_DIR for both mycastle-backend and minis-backend)
├── docs/                           # automate.md, desktop.md, conversation.md, uiforms.md, minis.md, minis-iot-dashboard-plan.md, minis-iot-device-implementation.md
│   ├── Dockerfile                  # Multi-stage: build all → typedoc → nginx:alpine
│   └── nginx.conf                  # SPA routing for generated docs
├── docs-site/                      # Generated documentation output (gitignored)
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
- **Generate docs:** `pnpm gendocs` (JSON+HTML+Markdown), `pnpm gendocs:html`, `pnpm gendocs:md`
- **Sync data (files):** `pnpm sync:push [--force]` (local→server, wyklucza iot.db + Arduino build/libs), `pnpm sync:pull [--force]` (server→local)
- **Sync data (SQLite):** `pnpm sync:db-push` (local iot.db → server via sqlite3 .backup + scp), `pnpm sync:db-pull` (server iot.db → local)
- **Docker (MyCastle):** `docker compose build && docker compose up -d`
- **Docker (Scene3D):** `docker build -f app/demo-scene-3d/Dockerfile -t demo-scene-3d .`
- **Docker (Docs):** `docker build -f docs/Dockerfile -t mycastle-docs .`

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
- **E2E tests:** Playwright. Config w `playwright.config.ts` (root). Testy w `tests/e2e/`. Auto-start `dev:minis-backend` + `dev:minis-web` z health check na Swagger endpoint. Fixtures w `tests/e2e/fixtures/data/` kopiowane do `data-test/` (global setup/teardown).
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
- **Documentation:** TypeDoc 0.28 + typedoc-plugin-markdown (root devDependencies). Config: `typedoc.json` (entryPointStrategy: packages). Output: `docs-site/` (gitignored)
- **Frontend:** React 18, Material UI 5, ReactFlow, Tiptap 3, Monaco Editor. Minis-web additionally: mqtt (v5, raw pub/sub for IoT emulator)
- **Backend:** Aedes (MQTT), dotenv, dayjs, Tesseract.js, Sharp, node-cron. Core-backend additionally: jsonwebtoken, bcrypt. Minis-backend additionally: adm-zip, swagger-ui-dist, better-sqlite3 (IoT data)
- **Desktop:** paho-mqtt, psutil, pyperclip, Pillow, pygetwindow, pycaw, winotify

## Architecture Documentation

Dokumentacja architektoniczna projektu znajduje się w `docs/architecture/`. Używamy **C4 Model** + **Mermaid** + **ADR (MADR)** jako standardów.

### Struktura

- `docs/architecture/README.md` — punkt wejścia, nawigacja po całej dokumentacji
- `docs/architecture/adr/` — Architecture Decision Records (10 decyzji: monorepo, MQTT, ESM/CJS, SQLite, Zod, App Singleton, VFS, auth, shared port, C4 model)
- `docs/architecture/diagrams/` — diagramy Mermaid (C4 L1–L3, package deps, MQTT flow, auth flow, Arduino flow)
- `docs/architecture/drawio/system-overview.drawio` — diagram draw.io (C4 L1+L2), otwórz w VS Code z rozszerzeniem Draw.io Integration

### Narzędzia (zainstalowane przez `docs/architecture/install-tools.sh`)

- **adr-tools** (brew) — `adr new 'Tytuł'` tworzy nowy ADR w odpowiednim katalogu
- **log4brains** (pnpm global) — `log4brains preview` otwiera web UI z listą ADR
- **VS Code extensions** — Mermaid preview (`bierner.markdown-mermaid`), Draw.io (`hediet.vscode-drawio`), Markdown tools

### Renderowanie diagramów

- Mermaid: otwórz `.md` w VS Code → `Ctrl+Shift+V` (natywne renderowanie, bez dodatkowych narzędzi)
- Draw.io: otwórz `.drawio` w VS Code (rozszerzenie `hediet.vscode-drawio`) lub na app.diagrams.net
- GitHub/GitLab renderuje bloki ` ```mermaid ``` ` natywnie

### Dodawanie nowego ADR

```bash
cd /root/projektu && adr new 'Tytuł nowej decyzji architektonicznej'
# Dodaj do tabeli w docs/architecture/adr/README.md
```

### Konfiguracja

- `.adr-dir` — wskazuje katalog ADR (`docs/architecture/adr`) dla adr-tools
- `.log4brains.yml` — konfiguracja log4brains (projekt, timezone, ścieżka ADR)

## Common Gotchas
- **ESM barrels:** Backend barrel `index.ts` files must use `export type { ... }` for TypeScript interfaces. Otherwise ESM runtime throws "does not provide an export named" error.
- **pnpm strict mode:** All dependencies must be listed explicitly in package.json (no hoisting of transitive deps).
- **Aedes ESM import:** `import aedes from 'aedes'` (default export only), then `const { createBroker } = aedes`.
- **WSL vs Windows:** `pnpm install` creates OS-specific bin shims. Run everything from WSL.
- **VITE_* env vars:** Baked at build time. Vite ładuje `.env.development` (dev) / `.env.production` (build) automatycznie. W produkcji Docker .env jest usuwany, URL auto-detect.
- **App singleton (frontend):** Strony/komponenty korzystają z `App.instance.serviceName` zamiast bezpośrednich importów singletonów. Moduły wewnętrznie nadal importują swoje zależności bezpośrednio (nie przez App). `App.create()` wywoływane w `main.tsx` przed renderem React.
- **MQTT:** Use unique client IDs. WebSocket path: `/mqtt`. Shared mode (single port) for deployment.
- **Frontend data reload:** FilesystemContext `dataVersion` counter triggers re-renders on FILE_CHANGED events.
