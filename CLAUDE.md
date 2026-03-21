# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types, datasource, VFS, IoT device building blocks. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel, MinisModuleDefModel, MinisModuleModel, MinisDeviceDefModel (board? field), MinisDeviceModel (isIot field, description?: string, localizationId?: string, **lastBuild?: MinisDeviceBuild**), **MinisDeviceBuild** (platform: string, fqbn?: string, success: boolean, at: number, projectId?: string — zapisywany po każdej kompilacji), MinisLocalizationModel (id, name, type: 'place'|'geo', place?: string, geo?: {lat,lng}|null, device: string), MinisProjectDefModel, MinisProjectModel, UserModel, IotModels (IotDeviceConfig + **extensions?: IotExtensionConfig[]**, **IotExtensionConfig** {type, enabled, options?}, IotEntity, IotEntityType, IotSensorEntity, IotBinarySensorEntity, IotSwitchEntity, IotNumberEntity, IotButtonEntity, IotSelectEntity, TelemetryRecord, TelemetryMetric, TelemetryAggregate, DeviceCommand, AlertRule, Alert, IotDeviceStatus, DeviceShare), AuthModels (AuthTokenPayload, ApiKeyPublic)
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty; metoda `copyBaseStateTo()` do kopiowania UI state przy clone), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode, MinisModuleDefNode, MinisModuleNode, MinisDeviceDefNode, MinisDeviceNode, MinisProjectDefNode, MinisProjectNode, UserNode. Wszystkie nody używają `copyBaseStateTo()` w `clone()` zamiast ręcznego kopiowania pól.
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload. `topics.ts`: Zod-based MQTT topic registry (analogiczny do RPC). MqttTopicDef (pattern, description, direction, payloadSchema, tags), defineMqttTopic(), MqttPayload<T>. mqttTopics registry (telemetry, heartbeat, command, commandAck, status, telemetryLive, alert, sharedTelemetryLive, sharedStatus, **extReq** `minis/{userName}/{deviceName}/ext/{extType}/req` server→device, **extRes** `minis/{userName}/{deviceName}/ext/{extType}/res` device→server), MqttTopicRegistry, MqttTopicName. matchTopic(fullTopic) — dopasowuje topic do wzorca, zwraca def + wyekstrahowane params. Zod schemas = single source of truth for payload validation i type info w MQTT Explorer
  - `datasource/` — IDataSource interface (w tym kolekcje Minis: minisModuleDefs, minisModules, minisDeviceDefs, minisDevices, minisProjectDefs, minisProjects, users), MemoryDataSource (load* methods per kolekcję), CalendarItem, Calendar
  - `rpc/` — Zod-based RPC system (shared types + method registry). `types.ts`: RpcMethodDef (z fieldMeta?: Record<string, FieldMeta>), AutocompleteSource ('users' | 'userDevices'), FieldMeta (autocomplete?, dependsOn?), defineRpcMethod(), RpcResponse/RpcErrorResponse. `methods.ts`: rpcMethods registry (ping, getDeviceStatuses, sendCommand, getLatestTelemetry), RpcMethodRegistry, RpcMethodName types. fieldMeta na metodach definiuje autocomplete sources i zależności między polami (np. deviceName dependsOn userName). Zod schemas = single source of truth for validation, types, and auto-generated Swagger docs.
  - `vfs/` — Virtual File System abstraction (VS Code-inspired). `types.ts`: FileSystemProvider interface (scheme, capabilities, stat, readDirectory, readFile, writeFile?, delete?, rename?, mkdir?, copy?, watch?, onDidChangeFile), FileType enum, FileChangeType enum, FileStat, DirectoryEntry, WriteFileOptions, DeleteOptions, RenameOptions, CopyOptions, isWritable(). `errors.ts`: VfsError, VfsErrorCode. `paths.ts`: VFS path utilities. Implementacje: MemoryFS (in-memory), CompositeFS (mount multiple providers pod różnymi ścieżkami), GitHubFS (GitHub API), BrowserFS (File System Access API), NodeFS (Node.js fs — backend only), RemoteFS (REST proxy do server-side VFS), **MqttFS** (tunneluje operacje VFS przez MQTT request-response; konstruktor: {reqTopic, timeoutMs?}; `handleResponse(response)` wywoływane gdy urządzenie odpowiada; pending Map z UUID correlation IDs; `dispose()` odrzuca wszystkie oczekujące Promises), **WritableGitHubFS** (extends GitHubFS, scheme=`github-writable`; buforuje zmiany lokalnie w `pending: Map<path, Uint8Array|null>` — null = pending delete; `commit(message)` pushuje wszystko jako jeden Git commit przez Trees API; `hasPendingChanges()`, `pendingCount()`, `getPendingEntries()`, `discardPending()`, `getBaseContent(path)` — omija pending buffer). `utils.ts`: encodeText/decodeText (UTF-8 Uint8Array ↔ string).
  - `iot/` — **Device-side IoT building blocks** (framework-agnostic, używane przez urządzenia implementujące rozszerzenia). `device/IotDeviceExtension.ts`: interfejs `{ type: string; handleRequest(payload): void|Promise<void> }`. `device/IotDeviceVfsExtension.ts`: implementacja VFS extension — konstruktor `{ provider: FileSystemProvider, publishFn, resTopic }`, waliduje payload przez Zod, dispatchuje wszystkie operacje VFS (stat/readdir/readfile/writefile/delete/rename/mkdir), base64 encode/decode (btoa/atob — browser-compatible). `device/IotDeviceClient.ts`: framework-agnostic MQTT router — konstruktor `{ topicPrefix, publishFn }`, `addExtension(ext)` / `removeExtension(type)`, `handleMessage(subTopic, rawPayload)` — routuje `ext/{type}/req` wiadomości do zarejestrowanych extensions.
  - `mjd/` — Meta JSON Definition system. `types.ts`: MjdFieldType ('string'|'number'|'boolean'|'date'|'enum'|'array'), MjdViewType ('form'), MjdFieldDef (name, type, tags, label, description, defaultValue, required, options, itemType), MjdViewDef (name, type, tag), MjdDocument (version, tags, fields, views). `helpers.ts`: createMjdDocument(), createMjdField(), createMjdView(), getFieldsForView(). `jsonSchema.ts`: generateJsonSchema(doc) — konwertuje MjdDocument na JSON Schema draft-07 (typy, required, enum, array z itemType).
- **@mhersztowski/web-client** (`packages/web-client/`) — reusable React client for MyCastle backend. Dual ESM+CJS build (tsup). React as peerDependency, monaco-editor as optional peerDependency.
  - `mqtt/` — MqttClient (MQTT over WebSocket, request-response, file ops), MqttContext/MqttProvider, useMqtt hook
  - `filesystem/` — FilesystemService (dir tree, batch file loading, calendar, DataSource), FilesystemContext/FilesystemProvider, useFilesystem hook
  - `filesystem/data/` — DirData, FileData, CalendarItem (extends core), Calendar, DataSource (re-export of MemoryDataSource)
  - `filesystem/components/` — DirComponent, FileComponent, FileJsonComponent, FileMarkdownComponent
  - `utils/` — configureUrls(), getHttpUrl(), getMqttUrl() (auto-detect from window.location, configurable)
  - `vfs/` — VFS UI components. VfsExplorer (tree browser z context menu, drag & drop, inline rename, mount manager), VfsBreadcrumbs, VfsMountManager (UI do montowania providerów: MemoryFS, GitHubFS, WritableGitHubFS, BrowserFS, RemoteFS), **VfsCommitDialog** (props: `provider: WritableGitHubFS, onClose, onCommit` — pokazuje pending changes z diff view, pole commit message, commit button; `DiffView` renderuje unified diff line-by-line), useVfsTree hook, providerRegistry (memoryFsProvider, githubFsProvider, **writableGithubFsProvider**, browserFsProvider, remoteFsProvider, defaultProviderRegistry), **vfsMountPresets** (`VfsMountPreset` {id, name, mountPoint, providerType, config}; `loadPresets()`/`savePreset()`/`deletePreset()`/`generatePresetId()` — persystowane w localStorage `mycastle_vfs_presets`), getFileIcon, useVfsClipboard
  - `monaco/` — Monaco Editor wrapper (wyekstrahowany z minis-web modules/editor). `core/`: EditorInstance (wrapper wokół monaco.editor, create/dispose, setModel, getContent, getState/restoreState, on events), ModelManager (zarządzanie modelami per URI, createModel/getModel/disposeModel), CommandRegistry (KeyMod, KeyCode re-exports), EventEmitter. `language/`: LanguageService, FormattingService, C++ plugin (completion, hover, config). `plugins/`: PluginSystem, przykłady (HighlightLine, WordCount). `state/`: EditorStateManager. `ui/`: ContextMenuService, DecorationManager, StatusBar. `utils/`: types (DocumentUri, EditorId branded types), disposable (DisposableStore), debounce. **MonacoMultiEditor** — VS Code-like component: Activity Bar (Explorer/Search/Extensions) + Sidebar (VFS file browser) + draggable splitter + tabbed multi-editor z Split Editor (wiele grup edytorów side-by-side, flex-grow sizing, draggable group splitters) + Menu Bar (File/Edit) + Status Bar (cursor pos, language, encoding, group info). Otwieranie plików: VFS double-click → readFile → ModelManager.createModel → tab. Shared ModelManager across grup. Ctrl+S save (handleSaveRef pattern dla stabilnego callbacka). monacoWorkers.ts zostaje w consuming app (Vite-specific ?worker imports). `agent/`: **AgentEngine** — `run(prompt, vfsProvider?)`: skanuje VFS (`skills-lock.json`), ładuje skills, wywołuje AI z tool calling; **`abort()`**: przerywa bieżący run przez `AbortController`; **`loadHistory(messages)`**: inicjalizuje kontekst konwersacji; `types.ts`: **`ChatAttachment`** {name, dataUrl, mimeType} (base64 data URL do obrazów), **`ChatSession`** {type:'chat_session', savedAt, messages} (persystacja historii); `AiChatMessage.attachments?: ChatAttachment[]`; `AiProviderConfig.signal?: AbortSignal`.
  - `typedoc/` — TypeDoc JSON viewer: TypeDocViewer component (renders TypeDoc JSON output as interactive documentation)
  - `mjd/` — MJD editor React components. **MjdDefEditor** (props: value: MjdDocument, onChange) — edytor definicji: sekcje Version, Tags (TagManager chips), Fields (tabela z expandable FieldRow: name/label/type/description/required/tags/options/itemType), Views (ViewRow: name/type/tag), Generate (.mjd + JSON Schema do clipboard). **MjdDataEditor** (props: definition, value, onChange) — edytor danych wg schematu MJD: view selector (dropdown wg views), kontrolki per typ (TextField/Switch/Select/datetime-local/ArrayFieldControl). **MjdVfsLoader** (props: provider, mjdPath, dataPath?, height?) — composite: ładuje definition+data z VFS, auto-save 500ms debounce, renderuje MjdDataEditor (gdy dataPath) lub MjdDefEditor.
- **@mhersztowski/core-backend** (`packages/core-backend/`) — współdzielone moduły backendowe wyekstrahowane z mycastle-backend. ESM-only build (tsup).
  - `filesystem/` — FileSystem (in-memory cache, EventEmitter fileChanged, atomic writes, per-file locking, deleteDirectory)
  - `httpserver/` — HttpUploadServer (CORS, POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook). Klasa rozszerzalna: protected server, fileSystem, setCorsHeaders, handleRequest, sendJsonResponse — umożliwia subclassing (np. MinisHttpServer, MycastleHttpServer)
  - `mqttserver/` — MqttServer (Aedes, publishMessage(), onMessage(handler) for custom topic routing, setAuthenticate(callback) for MQTT auth), MqttMessageHandler type, Client, Packet classes per type
  - `auth/` — JwtService (sign/verify JWT, jsonwebtoken), PasswordService (bcrypt hash/verify, isBcrypt detection), ApiKeyService (CRUD kluczy API z prefix `minis_`, SHA-256 hash, per-user, dane w JSON file), checkAuth() middleware (Bearer token: JWT lub API key → AuthTokenPayload | null)
  - `datasource/` — DataSource (in-memory store, auto-reload z FileSystem events)
  - `rpc/` — **RpcRouter**. `RpcRouter`: register/dispatch/getRegisteredMethods. `RpcContext` z `user?: AuthTokenPayload`. Używany przez mycastle-backend.
  - `interfaces.ts` — IAutomateService, IDataSource (dependency inversion — backend-specific modules implementują te interfejsy)
- **@mhersztowski/core-scene3d** (`packages/core-scene3d/`) — 3D scene core (SceneGraph, SceneNode, RenderEngine, IO)
- **@mhersztowski/ui-core** (`packages/ui-core/`) — hooks, theme, utils for scene3d UI
- **@mhersztowski/ui-components-scene3d** (`packages/ui-components-scene3d/`) — scene3d UI components (RichEditor, panels, toolbar)


### Aplikacja backend (`app/mycastle-backend/`)
- Node.js, ESM (`"type": "module"`), build z tsup, dev z tsx watch
- Port: 1894 (HTTP + MQTT WebSocket at `/mqtt` + Terminal WebSocket at `/ws/terminal` — shared mode). Opcjonalnie MQTT na osobnym porcie via `MQTT_PORT`
- **App singleton** (`src/App.ts`): `App.create(config)` → `App.instance.init()` → `App.instance.shutdown()`. Trzyma referencje do wszystkich modułów: fileSystem, ocrService, dataSource, automateService, schedulerService, httpServer, iotService, arduinoService, **upythonService**, _mqttServer (lazy), jwtService, apiKeyService, terminalService. Seeduje domyślnego admina (admin/admin) przy pierwszym uruchomieniu.
- Importuje FileSystem, MqttServer, JwtService, PasswordService, ApiKeyService, DataSource, RpcRouter z `@mhersztowski/core-backend`
- **MQTT auth**: anonymous allowed (web client), lub API key, JWT token, lub username+password
- **MycastleHttpServer** (`src/MycastleHttpServer.ts`): rozszerza HttpUploadServer, dodaje pełne REST API (`/api/*`). JWT auth middleware (checkAuth) na wszystkie endpointy poza publicznymi. Admin routes wymagają `isAdmin`. Generyczny `handleCrud(config: CrudConfig)`. `resolveIotId(userName, deviceName)` — tłumaczy nazwę urządzenia na SN (lookup w Device.json) dla wszystkich handlerów IoT. `resolveMinisConfig(userName, serialNumber)` — czyta Electronics/configuration.json, zwraca WiFi credentials + architectureJson dla danego SN (uwzględnia topologię: wifi-device → wifi-switch).
- **TerminalService** (`src/modules/terminal/TerminalService.ts`): WebSocket PTY (node-pty, xterm-compatible). Ticket-based auth (one-time 30s ticket). Attach do HTTP server na `/ws/terminal`. `createTicket(payload)` — wywoływane z HTTP endpoint po weryfikacji JWT.
- Moduły w `src/modules/`:
    - **ocr** — Tesseract.js + Sharp preprocessing, PolishReceiptParser, non-blocking init
    - **automate** — AutomateService (implementuje IAutomateService), BackendAutomateEngine (graph traversal, merge nodes), BackendSystemApi, AutomateSandbox
    - **scheduler** — SchedulerService (node-cron), auto-reload z filesystem events
    - **iot** — pełna warstwa IoT: IotDatabase (SQLite, WAL), TelemetryStore, DevicePresence, CommandDispatcher, AlertEngine, DeviceShareStore, IotService. **Extensions system**: `IotExtension` interfejs `{ type, handleMessage(subTopic, payload), dispose() }`, `IotExtensionRegistry` (zarządza Map<deviceId, Map<extType, IotExtension>>, `syncFromConfig(config)` tworzy/usuwa extensions, `handleMessage(deviceId, userId, extType, subTopic, payload)` auto-tworzy extensions lazy, `getVfs(deviceId)` typowany accessor, callbacki `onVfsMounted?(deviceId, fs: MqttFS)` / `onVfsUnmounted?(deviceId)`), `extensions/VfsExtension.ts` (type='vfs', tworzy `MqttFS`, `handleMessage('res', payload)` → Zod validate → `fs.handleResponse()`). **IotService** ma pole `extensions: IotExtensionRegistry`; `handleHeartbeat()` wywołuje `extensions.syncFromConfig()`; `handleMqttMessage()` routuje `ext/{extType}/{subTopic}` do `extensions.handleMessage()`. **MycastleHttpServer**: `iotService.extensions.onVfsMounted = (deviceId, fs) => this.vfs.mount('/devices/${deviceId}', fs)` — VFS urządzenia dostępny przez REST API na `/api/vfs/readdir?path=/devices/{deviceId}/`
    - **arduino** — pełna warstwa Arduino: ArduinoCli (+ MinisConfig: serialNumber/wifiSsid/wifiPassword/architectureJson), ArduinoCliLocal, ArduinoCliDocker, **ArduinoCliDockerRun** (`docker run --rm` — brak persistent container, volume mount hostDataDir→containerDataDir, ścieżki tłumaczone przez `toContainer()`), ArduinoProject (compile wstrzykuje MinisIotArchitecture.h z MINIS_DEVICE_SN/MINIS_WIFI_SSID/MINIS_WIFI_PASSWORD/MINIS_IOT_ARCHITECTURE przed kompilacją), ArduinoService. **Instalacja bibliotek**: `libInstall({ name, version?, url? }, configFilePath)` — dla `url` używa `--git-url` (wymaga `library.enable_unsafe_install: true` w configu), dla `name` standardowy manager. `ensureConfig()` dodaje `library.enable_unsafe_install: true` do `custom-config.yaml`. `compile()` instaluje biblioteki z `project.json` do katalogu `{projectDir}/libraries/` (przez `directories.user` w configu). Po git-url instalacji: `readAllLibraryDeps()` skanuje wszystkie `library.properties` w `libraries/` i doinstalowuje brakujące zależności z pola `depends=`. Env: `ARDUINO_CLI_DOCKER_IMAGE` (jeśli ustawione → ArduinoCliDockerRun; image musi mieć arduino-cli z baked-in cores).
    - **upython** — MicroPython service: MicroPythonCli (interface), MicroPythonCliLocal (mpremote connect {port} cp), **MicroPythonCliDocker** (`docker exec` na named container), **MicroPythonCliDockerRun** (`docker run --rm` z `--device` passthrough, volume mount hostDataDir), MicroPythonProject (deploy .py files z src/ + opcjonalnie biblioteki), MicroPythonService (orchestrator, env: `UPYTHON_CLI_LOCAL_PATH` / `UPYTHON_DOCKER_NAME` / `UPYTHON_DOCKER_IMAGE`). **Deploy bibliotek**: `deploy(port, libraries?)` — przed wgraniem kodu pobiera każdą bibliotekę z `lib.url` (raw URL lub `data:` base64) przez `fetch()`, zapisuje do `{projectDir}/libraries/`, dodaje do listy plików do wgrania na urządzenie (`lib.remoteName`).
    - **pygame** — PygameService: `sketchDir(user, projectId, sketchName)`, `webBuildDir(...)`, `build(user, projectId, sketchName, webCode)` — uruchamia pygbag (lokalnie lub przez `docker run --rm` / `docker exec`). Po buildzie wstrzykuje przycisk Back do `index.html`. Env: `PYGAME_DOCKER_IMAGE` / `PYGAME_DOCKER_NAME` / `PYGBAG_PATH`. REST: `GET/PUT /api/users/{user}/project-pygame/{projectId}/sketches/{name}/{file}`, `POST .../build`, `GET .../web-build/index.html`.
    - **rpc** — handlers.ts (registerHandlers z deps: iotService, fileSystem). Importuje RpcRouter z `@mhersztowski/core-backend`
- `src/swagger.ts` — OpenAPI 3.0.3 spec (auto-generated z Zod via buildSwaggerSpec)

### Aplikacja frontend (`app/mycastle-web/`)
- React 18 + TypeScript, Vite 5, Material UI 5, Monaco Editor, Blockly, xterm.js, esptool-js, mqtt — **ujednolicony frontend** łączący MyCastle PIM i Minis w jednej aplikacji
- Dev port: 1895 (Vite HMR), proxy `/api` → `localhost:1894`, `/mqtt` → `ws://localhost:1894`, `/ws/terminal` → `ws://localhost:1894`
- **PWA**: VitePWA plugin (vite-plugin-pwa), precache CSS/HTML/icons, Monaco workers wykluczone z precache, navigateFallback `/index.html`
- **Path aliases**: `@` → `src/`, `@modules` → `src/modules/`, `@components` → `src/components/`, `@pages` → `src/pages/`
- **App singleton** (`src/App.ts`): `App.create()` → `App.instance`. Tworzony w `main.tsx` przed renderem React.
- **AppRoot** (`src/AppRoot.tsx`): unified routing. `RequireAuth` guard (redirectuje do `/` gdy brak currentUser). `AdminOnly` guard (redirectuje do `/user/:userName/main` gdy nie admin lub impersonating). `PageHooksRunner` uruchamia usePageHooks().
- **Provider tree** (`main.tsx`): `DisplayProvider` → `BrowserRouter` → `NotificationProvider` → `AuthProvider` → `MqttProviderWithAuth` (przekazuje JWT token jako mqttPassword) → `FilesystemProvider` → `MinisDataSourceProvider` → `GlobalWindowsProvider` → AppRoot + GlobalApiDocs + GlobalRpcExplorer + GlobalMqttExplorer + GlobalMjdDefEditor + GlobalMjdDataEditor + **GlobalTerminal**
- **DisplayContext** (`components/DisplayContext.tsx`): ThemeMode ('light'|'dark'), DisplaySize ('small'|'medium'|'large'), MUI ThemeProvider, localStorage persistence (`minis-display`)
- Moduły:
    - **mqttclient** — re-exports z @mhersztowski/web-client (MqttClient, MqttContext, useMqtt)
    - **filesystem** — re-exports z @mhersztowski/web-client (FilesystemService, FilesystemContext, DirData, FileData, etc.) + app-specific models/nodes barrels
    - **minis-filesystem** — MinisDataSourceContext (ładuje moduleDefs/deviceDefs/projectDefs via MQTT do MemoryDataSource)
    - **auth** — AuthContext/AuthProvider, useAuth hook. JWT token + sesja w sessionStorage. `setAuthToken()` propaguje token do MinisApiService i RpcClient. Stan: currentUser, token, isAdmin, login(), logout(), impersonating, startImpersonating(), stopImpersonating()
    - **uiforms** — system UI (Godot-like): models, nodes, renderer (21 kontrolek), designer (drag & drop), binding (oneWay/twoWay), services
    - **automate** — graficzny język (NodeRed-like): designer (responsive mobile), engine, registry (NODE_TYPE_METADATA), services. Runtime: client/backend/universal. Merge node, Manual Trigger
    - **notification** — NotificationService, NotificationProvider
    - **ai** — providers (OpenAI, Anthropic, Ollama), tool calling, konfiguracja data/ai_config.json
    - **speech** — TTS/STT/Wake Word providers, SpeechService, AudioRecorder, WakeWordService
    - **conversation** — ConversationEngine z tool calling, ActionRegistry (task/calendar/file/person/project/navigation/automate/shopping actions), scenariusze
    - **shopping** — skanowanie paragonów (AI Vision / OCR / Hybrid), ReceiptScannerService
    - **editor** — tylko `monacoWorkers.ts` (Vite-specific `?worker` imports dla Monaco web workers)
    - **ardublockly2** — wizualny edytor bloków Arduino (Blockly): ArduBlocklyService, ArduBlocklyComponent, boards/ (BoardManager, BoardProfile), generator/ (ArduinoGenerator — C++), blocks/
    - **upythonblockly** — wizualny edytor bloków MicroPython (Blockly): UPythonBlocklyService, UPythonBlocklyComponent, boards/, blocks/ (**blocks/text.ts**: 11 custom bloków Text — `upy_text_count`, `upy_text_index`, `upy_text_replace`, `upy_text_trim`, `upy_text_prompt`, `upy_text_to_str`, `upy_text_ord`, `upy_text_decode`, `upy_text_encode`, `upy_text_format_float`, `upy_text_to_hex`; kolor `#5ba58c`), generator/ (UPythonGenerator + **generator/text.ts**: generatory dla wszystkich custom bloków + `text_changeCase`, `text_isEmpty` → `not len(text)`, `upy_text_prompt` wstrzykuje helper `text_prompt()` przez `addFunction()`, `upy_text_to_hex` generuje f-string z polami ZEROS/PREFIX), repl/ (MpySerialReplService, MpyWebReplService, MpyReplTerminal), upload/ (UploadDialog — przyjmuje prop `libraries?: Array<{url, remoteName}>`, pobiera każdą bibliotekę przez `fetch()` i wgrywa na urządzenie przed uruchomieniem kodu — działa dla Serial i WebREPL)
    - **pygameblockly** — wizualny edytor bloków Pygame (Blockly): `PygameBlocklyService` (init/dispose, `mode: PygameMode` = `'native'|'web'`, onWorkspaceChange, getCode, loadCode, getXml/loadXml), `PygameBlocklyComponent`, `PygameGenerator` (generuje kod Python/Pygame; `mode_` zmienia output dla `'web'` — pygbag-compatible), blocks/ (screen, window, color, rect, draw, draw_adv, image, sound, time, event, events_input, events_keyboard, gamemath), `TOOLBOX` (`toolbox.ts`). `PygameMode` = `'native'` (pygame) lub `'web'` (pygbag WASM). Strony używają split-view: Blockly po lewej + Monaco po prawej, sync dwukierunkowy (code edit ↔ blockly regenerate z potwierdzeniem).
    - **serial** — Web Serial API: WebSerialService, WebSerialTerminal (xterm.js), EspFlashService (esptool-js), FlashDialog (3 tryby: compiled output, custom .bin, **predefined firmware** z `GET /api/admin/firmware/files` — pliki z `data/Minis/Admin/Firmware/`)
    - **iot-emulator** — EmulatorService (MQTT pub/sub via `mqtt` package, interwały telemetrii/heartbeat, command handling, activity log, localStorage persistence), presety urządzeń, generatory wartości
- Serwisy (`src/services/`):
    - **MinisApiService** — singleton (`minisApi`), REST client do `/api/*`. `setAuthToken(token)`. Pełne API: auth, admin CRUD, user devices/projects, IoT, API keys, Arduino, Sketch, README, Localization. Nowe: `getDeviceMinisConfig(userName, deviceName)` (WiFi/SN config), `getIotArchitecture/saveIotArchitecture` (Electronics graph), `listFirmwareFiles/fetchFirmwareFile` (predefined firmware), uPython CRUD (`getUserUPythonProjects`, `createUserUPythonProject`, `deployUPythonProject`). Dodatkowo: `getTerminalTicket()` → `{ ticket }` (do GlobalTerminal).
    - **RpcClient** — singleton (`rpcClient`), type-safe klient RPC. `setAuthToken(token)`. `call<TName>(method, input): Promise<Output>`. Wire format: `POST /api/rpc/{method}`.
- Hooks (`src/hooks/`):
    - **useSourceUpload** — reusable hook do uploadu plików źródłowych (ZIP)
- Komponenty (`src/components/`):
    - **GlobalWindowsContext** — `WindowName`: `'apiDocs' | 'rpcExplorer' | 'mqttExplorer' | 'mjdDefEditor' | 'mjdDataEditor' | 'terminal'`. Layout save/load/clear (localStorage). Zamknięcie okien przy zmianie route.
    - **GlobalTerminal** — xterm.js terminal w GlobalWindow, wielosesyjny (tabs), WebSocket `/ws/terminal` z ticket auth. Ctrl+Shift+C kopiuje zaznaczenie.
    - **GlobalWindow**, **GlobalApiDocs**, **GlobalRpcExplorer**, **GlobalMqttExplorer**, **GlobalMjdDefEditor**, **GlobalMjdDataEditor** — pływające okna
    - **AccountMenu** — hierarchiczne menu (View save/load/clear, Window API Docs/RPC/MQTT/Terminal)
    - **BuildOutputPanel**, **ImpersonationBanner**, **MinimalTopBar**, **MinimalTopBarContext** — komponenty UI
    - **DisplayContext** — ThemeProvider wrapper z trybem ciemnym i rozmiarem czcionki
- Strony:
    - Full-page (bez Layout): `/workspace/md/*` (WorkspaceMdPage), `/editor/simple/*` (SimpleEditorPage), `/editor/md/*` (MdEditorPage), `/viewer/md/*` (MdViewerPage), `/designer/ui/:id?` (UIDesignerPage), `/designer/automate/:id?` (AutomateDesignerPage), `/viewer/ui/:id` (UIViewerPage) — owinięte `MinimalTopBar`, wymaga auth
    - Public: `/` (HomePage), `/login/:userName` (LoginPage)
    - Full-page bez Layout (Minis): `/user/:userName/editor/monaco/*` (MinisMonacoEditorPage), `/user/:userName/project/:projectId` (MinisProjectPage), `/user/:userName/upython-project/:projectId` (MinisUPythonProjectPage — wstrzykuje WiFi credentials jako Python header przed uplodem; ładuje `projectLibraries` z pola `libraries` rekordu projektu i przekazuje do UploadDialog), `/user/:userName/pygame-project/:projectId` (PygameProjectPage — Blockly/split/code view, PygameMode toggle native/web, lista szkiców, build przez `POST .../build`, podgląd web-build w iframe)
    - Layout pages (Minis admin): `/admin/:userName/main`, `/admin/:userName/users`, `/admin/:userName/devicesdefs`, `/admin/:userName/modulesdefs`, `/admin/:userName/projectdefs`
    - Layout pages (Minis user): `/user/:userName/main`, `/user/:userName/localization`, `/user/:userName/electronics/devices`, `/user/:userName/electronics/arduino`, `/user/:userName/electronics/upython`, `/user/:userName/electronics/pygame` (UserPygameProjectsPage — lista projektów Pygame, tworzenie nowych), `/user/:userName/electronics/configuration` (ElectronicsConfigurationPage — ReactFlow IoT network editor: 4 node types wifi-device/wifi-uart-bridge/wifi-switch/uart-device, ConfigPanel z dropdownem urządzeń, WiFi inheritance, drag-and-drop, persistence przez `GET/PUT /api/users/{userName}/electronics/configuration`), `/user/:userName/iot/dashboard`, `/user/:userName/iot/devices`, `/user/:userName/iot/device/:deviceName`, `/user/:userName/iot/alerts`, `/user/:userName/iot/emulator`, `/user/:userName/tools/rpc` (AdminOnly), `/user/:userName/tools/mqtt-explorer` (AdminOnly), `/user/:userName/tools/api-keys` (AdminOnly), `/user/:userName/tools/testvfs` (AdminOnly), `/user/:userName/tools/docs` (AdminOnly)
    - Layout pages (PIM — pod `/user/:userName/pim/`): `/calendar`, `/todolist`, `/person`, `/project`, `/shopping`, `/automate`, `/objectviewer`, `/components`, `/settings/ai`, `/settings/speech`, `/settings/receipt`, `/settings/page-hooks`, `/agent`
- **Wzorzec dostępu do serwisów**: strony i komponenty używają `const { aiService } = App.instance;` zamiast bezpośrednich importów singletonów. React contexty (useMqtt, useFilesystem, useNotification, useAuth) pozostają dla reaktywnego stanu UI.

### Aplikacja client (`app/client/`)
- Python, Agent MQTT (paho-mqtt), operacje systemowe Windows + rozszerzenie VFS
- **config.py**: MQTT_BROKER_PORT=1884 (TCP), MQTT_TRANSPORT='tcp'|'websockets', MQTT_USER/DEVICE → TOPIC_PREFIX `minis/{user}/{device}`, TOPICS: HEARTBEAT/COMMAND_ACK/EXT_VFS_RES/COMMAND/EXT_VFS_REQ, HEARTBEAT_INTERVAL, DATA_DIR
- **agent.py** (`ClientAgent`): subskrybuje COMMAND + EXT_VFS_REQ, heartbeat przez `threading.Timer` (daemon), `_handle_command()` mapuje komendy `{id, name, payload}` na operations + ACK, `_ack_command(cmd_id, status, reason?)`, VfsExtension na DATA_DIR; WebSocket path ustawiane tylko gdy `MQTT_TRANSPORT == "websockets"`
- **extensions/vfs.py** (`VfsExtension`): `handle_request(payload)` dispatch przez `match op:` (stat/readdir/readfile/writefile/delete/rename/mkdir), `_resolve(path)` — ochrona przed directory traversal przez `os.path.realpath` + `startswith(root_dir)`, FileType: FILE=1/DIR=2 (zgodnie z TypeScript enum), `_writefile` respektuje opcje create/overwrite, `_delete` obsługuje recursive przez `shutil.rmtree`, `_respond(req_id, ok, data, error)` publikuje JSON
- **data/**: katalog VFS root (pusty, tworzony automatycznie)
- operations/: system, process, window, clipboard, shell, app, media
- Dawna nazwa: `app/desktop/` (przemianowana)

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
├── playwright.config.ts            # E2E test config (auto-start backends, baseURL mycastle-web)
├── docker-compose.yml              # Coolify deployment (backend + web)
├── docker-compose.cli.yml          # Build CLI tool images (arduino/pico/pygame/android); `docker compose -f docker-compose.cli.yml build`
├── docker/
│   ├── Dockerfile.cli              # Multi-target: arduino / pico / pygame (z pygbag)
│   └── Dockerfile.android          # Android build environment
├── .npmrc
│
├── packages/
│   ├── core/                       # @mhersztowski/core (shared models, nodes, mqtt, automate, datasource, rpc, vfs, mjd, iot)
│   │   ├── src/{models,nodes,automate,mqtt,datasource,rpc,vfs,mjd,iot}/
│   │   │   └── iot/device/         # IotDeviceExtension, IotDeviceVfsExtension, IotDeviceClient
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # Dual ESM+CJS
│   │   └── package.json
│   ├── core-backend/               # @mhersztowski/core-backend (shared backend modules)
│   │   ├── src/{filesystem,httpserver,mqttserver,datasource,auth,rpc}/
│   │   ├── src/auth/               # JwtService, PasswordService, ApiKeyService, checkAuth middleware
│   │   ├── src/rpc/                # RpcRouter, RpcContext
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
│   ├── mycastle-backend/           # Backend Node.js (pełne API — PIM + Minis + IoT + Arduino + Terminal)
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point (port from PORT env, default 1894)
│   │   │   ├── App.ts              # App singleton (create/instance/init/shutdown) — JwtService, ApiKeyService, IotService, ArduinoService, TerminalService, MQTT auth, seed admin
│   │   │   ├── MycastleHttpServer.ts # REST API (/api/*) + JWT auth + RPC dispatch + Swagger, extending HttpUploadServer
│   │   │   ├── swagger.ts          # OpenAPI spec (auto-generated z Zod via buildSwaggerSpec)
│   │   │   └── modules/
│   │   │       ├── ocr/            # OcrService, PolishReceiptParser
│   │   │       ├── automate/       # AutomateService, BackendAutomateEngine, AutomateSandbox
│   │   │       ├── scheduler/      # SchedulerService (node-cron)
│   │   │       ├── iot/            # IotDatabase, TelemetryStore, DevicePresence, CommandDispatcher, AlertEngine, DeviceShareStore, IotService, IotExtension, IotExtensionRegistry, extensions/VfsExtension
│   │   │       ├── arduino/        # ArduinoCli (+ MinisConfig), ArduinoCliLocal, ArduinoCliDocker, ArduinoProject (header injection), ArduinoService
│   │   │       ├── upython/        # MicroPythonCli, MicroPythonCliLocal (mpremote), MicroPythonProject, MicroPythonService
│   │   │       ├── rpc/            # handlers.ts, index.ts (importuje RpcRouter z core-backend)
│   │   │       └── terminal/       # TerminalService (node-pty WebSocket PTY, ticket auth)
│   │   ├── Dockerfile              # Multi-stage: build → node:20-slim production
│   │   ├── vitest.config.ts        # Unit tests
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── mycastle-web/               # Frontend React (unified PIM + Minis, PWA)
│   │   ├── src/
│   │   │   ├── App.ts              # App singleton (create/instance, all services)
│   │   │   ├── AppRoot.tsx         # React root (RequireAuth, AdminOnly, PageHooksRunner, unified routes)
│   │   │   ├── main.tsx            # Entry (App.create() → DisplayProvider → providers → render)
│   │   │   ├── modules/{mqttclient,filesystem,minis-filesystem,auth,uiforms,automate,ai,speech,conversation,shopping,notification,editor,ardublockly2,upythonblockly,serial,iot-emulator}/
│   │   │   ├── services/           # MinisApiService (minisApi singleton), RpcClient (rpcClient singleton)
│   │   │   ├── hooks/              # useSourceUpload
│   │   │   ├── pages/{admin,minis-user,workspace,editor,filesystem,…}/
│   │   │   ├── test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   │   │   └── components/{editor,mdeditor,person,project,task,upload,GlobalWindowsContext,GlobalTerminal,GlobalWindow,GlobalApiDocs,GlobalRpcExplorer,GlobalMqttExplorer,GlobalMjdDefEditor,GlobalMjdDataEditor,DisplayContext,AccountMenu,BuildOutputPanel,ImpersonationBanner,MinimalTopBar}/
│   │   ├── public/                 # Static assets (docs.json for TypeDoc viewer)
│   │   ├── .env.development        # Dev mode URLs (loaded by vite dev)
│   │   ├── .env.production         # Empty — auto-detect (loaded by vite build)
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine (removes .env before build)
│   │   ├── nginx.conf              # SPA + reverse proxy to backend (/mqtt, /ws/terminal, /upload, /files, /ocr, /webhook)
│   │   ├── vitest.config.ts        # Unit tests (jsdom env, React Testing Library)
│   │   ├── vite.config.ts          # Dev port: 1895, VitePWA, path aliases (@, @modules, @components, @pages)
│   │   └── package.json
│   ├── demo-scene-3d/              # Scene3D demo app
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine
│   │   ├── nginx.conf
│   │   └── package.json
│   └── client/                     # Python MQTT agent (Windows) + VFS extension
│       ├── agent.py                # ClientAgent: heartbeat, command routing, VFS
│       ├── config.py               # MQTT config, topics, DATA_DIR
│       ├── extensions/
│       │   ├── __init__.py
│       │   └── vfs.py              # VfsExtension: 7 ops, directory traversal guard
│       ├── data/                   # VFS root directory
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
├── data/                           # Runtime data (ROOT_DIR for mycastle-backend)
├── docs/                           # automate.md, desktop.md, conversation.md, uiforms.md
│   ├── Dockerfile                  # Multi-stage: build all → typedoc → nginx:alpine
│   └── nginx.conf                  # SPA routing for generated docs
├── docs-site/                      # Generated documentation output (gitignored)
└── scripts/
```

## Development Workflow & Commands
- **Setup:** `pnpm install` (from root)
- **Build all:** `pnpm build`
- **Build specific:** `pnpm build:core`, `pnpm build:core-backend`, `pnpm build:web-client`, `pnpm build:backend`, `pnpm build:web`, `pnpm build:scene3d`
- **Run MyCastle backend:** `pnpm dev:backend` (port 1894, HTTP + MQTT WebSocket at /mqtt)
- **Run MyCastle frontend:** `pnpm dev:web` (port 1895, Vite HMR)
- **Run scene3d:** `pnpm dev:scene3d` (requires packages built first)
- **Run client agent:** `app/client/run.sh` (auto-creates `.venv` i instaluje zależności przy pierwszym uruchomieniu)
- **Test (unit):** `pnpm test` (all packages), `pnpm test:watch`, `pnpm test:coverage`
- **Test (e2e):** `pnpm test:e2e` (Playwright — auto-starts mycastle-backend + mycastle-web)
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
- **Unit/Integration tests:** Vitest 4 (globals enabled). Każdy package/app ma własny `vitest.config.ts`. Root `vitest.config.ts` agreguje wszystkie workspace projects. Frontend testy (mycastle-web, ui-core) używają `jsdom` environment + React Testing Library (`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`). Setup w `src/test-setup.ts`. Wszystkie `tsconfig.json` excludują `**/*.test.ts` / `**/*.test.tsx` z kompilacji.
- **E2E tests:** Playwright. Config w `playwright.config.ts` (root). Testy w `tests/e2e/`. Auto-start `dev:backend` + `dev:web` z health check na Swagger endpoint. Fixtures w `tests/e2e/fixtures/data/` kopiowane do `data-test/` (global setup/teardown).
- **Structure:** Testy collocated przy źródłach (`*.test.ts` / `*.test.tsx` obok implementacji). E2E w `tests/e2e/`.
- **Coverage:** Prioritize critical business logic, API boundaries, and integrations
- **Mocking/Stubs:** Frontend: mockowanie serwisów (np. `minisApi`), `vi.mock()`. Backend: temp directories z beforeEach/afterEach, dynamic port allocation (port 0) dla izolacji. React hooks: `renderHook()` z wrapper providers.
- **Behaviour:** Always write tests before implementation
- **Commands:** `pnpm test` (all unit), `pnpm test:watch`, `pnpm test:coverage` (v8), `pnpm test:e2e` (Playwright). Per-package: `pnpm --filter @mhersztowski/core test`

## Environment & Dependencies
- **Languages:** Node 20, TypeScript 5.9+, Python 3.14 (desktop)
- **Package manager:** pnpm 10.28.2 (workspaces), pip (Python)
- **Build tools:** tsup (packages, backends), Vite 5 (mycastle-web), Vite 7 (scene3d)
- **Testing:** Vitest 4 (unit/integration), Playwright (e2e), @vitest/coverage-v8, React Testing Library (mycastle-web, ui-core)
- **Documentation:** TypeDoc 0.28 + typedoc-plugin-markdown (root devDependencies). Config: `typedoc.json` (entryPointStrategy: packages). Output: `docs-site/` (gitignored)
- **Frontend:** React 18, Material UI 5, ReactFlow, Tiptap 3, Monaco Editor
- **Backend:** Aedes (MQTT), dotenv, dayjs, Tesseract.js, Sharp, node-cron. Core-backend additionally: jsonwebtoken, bcrypt
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
