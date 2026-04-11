# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types, datasource, VFS, IoT device building blocks. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel, MinisModuleDefModel, MinisModuleModel, MinisDeviceDefModel (board? field), MinisDeviceModel (isIot field, description?: string, localizationId?: string, **lastBuild?: MinisDeviceBuild**), **MinisDeviceBuild** (platform: string, fqbn?: string, success: boolean, at: number, projectId?: string — zapisywany po każdej kompilacji), MinisLocalizationModel (id, name, type: 'place'|'geo', place?: string, geo?: {lat,lng}|null, device: string), MinisProjectDefModel, MinisProjectModel, UserModel, IotModels (IotDeviceConfig + **extensions?: IotExtensionConfig[]**, **IotExtensionConfig** {type, enabled, options?}, IotEntity, IotEntityType, IotSensorEntity, IotBinarySensorEntity, IotSwitchEntity, IotNumberEntity, IotButtonEntity, IotSelectEntity, TelemetryRecord, TelemetryMetric, TelemetryAggregate, DeviceCommand, AlertRule, Alert, IotDeviceStatus, DeviceShare), AuthModels (AuthTokenPayload, ApiKeyPublic), **SmartDisplayModel** (SmartDisplayViewType: `'clock'|'text'|'metric'|'image'|'random-image'|'weather'`, SmartDisplayView {id, type, label?, text?, subtext?, metricKey?, metricUnit?, metricDevice?, imagePath?, albumShareUrl?, ttsDescription?, weatherLat?, weatherLon?, weatherLocationName?}, SmartDisplayConfig {type:'smart-display-config', cycleDurationMs, views[]}, DEFAULT_SMART_DISPLAY_CONFIG)
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty; metoda `copyBaseStateTo()` do kopiowania UI state przy clone), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode, MinisModuleDefNode, MinisModuleNode, MinisDeviceDefNode, MinisDeviceNode, MinisProjectDefNode, MinisProjectNode, UserNode. Wszystkie nody używają `copyBaseStateTo()` w `clone()` zamiast ręcznego kopiowania pól.
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload. `topics.ts`: Zod-based MQTT topic registry (analogiczny do RPC). MqttTopicDef (pattern, description, direction, payloadSchema, tags), defineMqttTopic(), MqttPayload<T>. mqttTopics registry (telemetry, heartbeat, command, commandAck, status, telemetryLive, alert, sharedTelemetryLive, sharedStatus, **extReq** `minis/{userName}/{deviceName}/ext/{extType}/req` server→device, **extRes** `minis/{userName}/{deviceName}/ext/{extType}/res` device→server), MqttTopicRegistry, MqttTopicName. matchTopic(fullTopic) — dopasowuje topic do wzorca, zwraca def + wyekstrahowane params. Zod schemas = single source of truth for payload validation i type info w MQTT Explorer. **hello payload** zawiera teraz `entities?: IotEntity[]` — urządzenie deklaruje encje przy każdym reconnect; backend persystuje je przez `upsertConfig`
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
  - `httpserver/` — HttpUploadServer (CORS, POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook). Klasa rozszerzalna: protected server, fileSystem, setCorsHeaders, handleRequest, sendJsonResponse — umożliwia subclassing (np. MinisHttpServer, MycastleHttpServer). **Fix**: `GET /files/{path}` teraz automatycznie stripuje prefix `data/` z path przed wywołaniem `readBinaryFile` — pozwala klientom przekazywać ścieżki z prefixem `data/public/...`
  - `mqttserver/` — MqttServer (Aedes, publishMessage(), onMessage(handler) for custom topic routing, setAuthenticate(callback) for MQTT auth), MqttMessageHandler type, Client, Packet classes per type
  - `auth/` — JwtService (sign/verify JWT, jsonwebtoken, **domyślne TTL = 7 dni** / 604800s), PasswordService (bcrypt hash/verify, isBcrypt detection), ApiKeyService (CRUD kluczy API z prefix `minis_`, SHA-256 hash, per-user, dane w JSON file), checkAuth() middleware (Bearer token: JWT lub API key → AuthTokenPayload | null)
  - `datasource/` — DataSource (in-memory store, auto-reload z FileSystem events)
  - `rpc/` — **RpcRouter**. `RpcRouter`: register/dispatch/getRegisteredMethods. `RpcContext` z `user?: AuthTokenPayload`. Używany przez mycastle-backend.
  - `interfaces.ts` — IAutomateService, IDataSource (dependency inversion — backend-specific modules implementują te interfejsy)
- **@mhersztowski/core-scene3d** (`packages/core-scene3d/`) — 3D scene core. Dual ESM+CJS build (tsup). Deps: three, @react-three/fiber, ui-core.
  - `scene/` — `SceneNode` (base: id UUID, name, type, visible, position/rotation/scale [number,number,number], parent/children, addChild/removeChild/findById/traverse, setPosition/Rotation/Scale, getLocalMatrix/WorldMatrix, lookAt, toData/fromData), `SceneGraph` (root GroupNode, addNode/removeNode/findNode, onChange: debounced microtask callback, toData/fromData)
  - `nodes/` — `MeshNode` (geometry: GeometryDescriptor {type: GeometryType, params?, bufferData?, fileName?}, material: MaterialDescriptor {color, opacity, wireframe}; GeometryType: `'box'|'sphere'|'cylinder'|'plane'|'cone'|'torus'|'custom'`; setMaterialColor/Opacity/Wireframe, setGeometry, cylinder params: {radiusTop, radiusBottom, height, radialSegments}, box params: {width, height, depth}), `LightNode` (lightType: `'ambient'|'directional'|'point'|'spot'`, color, intensity), `CameraNode` (fov, near, far), `GroupNode` (container)
  - `rendering/` — `RenderEngine` (WebGL, sync from SceneGraph, mesh/light creation, resize, dispose), `RenderLoop` (requestAnimationFrame + callbacks)
  - `components/` — `SimpleViewer` (React, @react-three/fiber Canvas + OrbitControls + TransformControls gizmo; props: sceneGraph, selectedNodeId, transformMode, showGrid, cameraPreset, onObjectClick, **`autoFit?: boolean`** — dopasowuje kamerę do wszystkich meshów przy montowaniu/zmianie sceny (jeden frame delay przez `requestAnimationFrame`), **`fitSceneRef?: MutableRefObject<(() => void) | null>`** — imperatywny trigger fit z zewnątrz), `CAMERA_PRESETS` (standard/blender/maya/cad); **FitCameraEffect** — wewnętrzny komponent R3F (`useThree()`): oblicza Box3 wszystkich Mesh-ów, przesuwa kamerę wzdłuż bieżącego kierunku patrzenia, aktualizuje `OrbitControls.target`
  - `io/` — `GLTFImporter/Exporter`, `OBJExporter`, `STLExporter`, `GeometryLoader` (parseOBJText, parseSTLBuffer, parseGLTFBuffer → BufferGeometryData {positions, normals?, indices?}), `SceneBuilder` (SceneGraph → THREE.Scene)
  - `serialization/` — `SceneSerializer.serialize(graph): string` (JSON), `SceneDeserializer.deserialize(json): SceneGraph`
- **@mhersztowski/ui-core** (`packages/ui-core/`) — hooks, theme, context. Dual ESM+CJS. No external deps (only React peer).
  - `types/` — 230+ lines: ThemeColors/Spacing/Typography/Shadows/BorderRadius/ThemeConfig, ButtonProps, InputProps, DialogProps, SceneTreePanelProps, PropertiesPanelProps, ToolbarProps, SelectedNodeData (id, name, type, visible, transform{position/rotation/scale}, material?, light?), TransformMode (`'translate'|'rotate'|'scale'`), CameraPresetName, **RichEditorProps** {className?, style?, `initialSceneData?: string` — serialized SceneGraph JSON do pre-populate sceny przy mount, `fitSceneRef?: MutableRefObject<(() => void) | null>` — imperatywny trigger fit kamery z zewnątrz, `onSceneChange?: (json: string) => void` — wywoływany przy każdej zmianie sceny i przy montowaniu z aktualnym JSON-em sceny}
  - `theme/` — `defaultTheme` (dark: primary #4fc3f7, bg #1a1a1a, surface #252526), `themeToCustomProperties()`
  - `context/` — `ConfigProvider` (injects CSS custom properties `--mhersztowski-*`), `useConfig()`, `useTheme()`, `useDefaults()`
  - `hooks/` — `useDialog()` {isOpen, open, close, toggle}, `useToast()` {toasts, addToast, removeToast, clearAll}, `useToggle()`
  - `utils/` — generic `deepMerge(target, source)` utility
- **@mhersztowski/ui-components-scene3d** (`packages/ui-components-scene3d/`) — scene3d UI components. Dual ESM+CJS + CSS. Deps: core-scene3d, ui-core, MUI 7, allotment.
  - `editors/RichEditor/` — pełny edytor 3D: Allotment 3-pane (SceneTree 220px | Viewport | Properties 260px), menu bar (File: Open/Save/Export OBJ+STL+GLTF), toolbar (Move/Rotate/Scale + Grid), SimpleViewer z gizmo, file I/O JSON scene, settings (camera preset). `RichEditor` przyjmuje `initialSceneData?: string` — gdy podany, SceneDeserializer.deserialize() przy inicjalizacji zamiast domyślnej sceny. `key` prop wymusza remount z nowymi danymi. **`fitSceneRef`**: merged ref pattern (getter/setter) propagujący do externalFitRef przekazanego z zewnątrz. **`onSceneChange`**: wywoływany w `bump()` (przy każdej zmianie sceny przez `sceneGraph.onChange`) oraz na mount przez `useEffect([], [])` — dostarcza aktualny JSON do rodzica bez pollingu.
  - `panels/SceneTreePanel/` — drzewo hierarchii (expand/collapse, inline rename dblclick, drag&drop reorder, context menu: rename/cut/copy/duplicate/delete/paste/add submenu, visibility toggle)
  - `panels/PropertiesPanel/` — inspector: transform (Vector3Row per axis, X=red/Y=green/Z=blue), material (color picker + opacity + wireframe), light (type readonly, color, intensity)
  - `toolbar/Toolbar/` — MUI IconButton items + separators
  - `viewers/RichViewer/` — demo viewer z Reset/ZoomIn/ZoomOut/Fullscreen
  - `components/` — Button, Input, Dialog
  - `icons/` — Cube, Sphere, Light, Camera, Folder, Move, Rotate, Scale, Grid icons (MUI wrappers)
- **@mhersztowski/core-cad** (`packages/core-cad/`) — **CAD 2D/3D core engine** (bez renderingu, bez React, bez Three.js). Dual ESM+CJS build (tsup). Brak zewnętrznych zależności (tylko crypto.randomUUID).
  - `types.ts` — `Point2D`, `Point3D`, `BoundingBox2D`, `EntityType` (`'line'|'circle'|'polyline'|'rect'|'arc'`), `SnapMode` (`'grid'|'endpoint'|'midpoint'|'center'|'nearest'|'intersection'|'perpendicular'|'tangent'`), `LineType` (`'solid'|'dashed'|'dotted'|'dashdot'`), `Units` (`'mm'|'cm'|'m'|'in'`), `ViewMode` (`'2d'|'3d'`)
  - `entity/` — **EntityBase** {id, type, layerId, color (`string|'bylayer'`), lineType, lineWidth, visible, locked, extrudeHeight (0=flat, >0=ekstruzja 3D), boundingBox}; typy: **LineEntity** {x1,y1,x2,y2}, **CircleEntity** {cx,cy,radius}, **PolylineEntity** {points: Point2D[], closed}, **RectEntity** {x,y,width,height}, **ArcEntity** {cx,cy,radius,startAngle,endAngle}; **EntityRegistry** (Map<id,Entity>; add/addWithId/remove/update/get/getAll/getByLayer/getByType/getInBoundingBox; update automatycznie przelicza boundingBox przez computeBoundingBox); **computeBoundingBox(entity)** — per typ geometrii
  - `layer/` — **Layer** {id, name, color, lineType, lineWidth, visible, locked}; DEFAULT_LAYER id='0'; **LayerSystem** (Map<id,Layer>; add/addWithId/remove/update; getActive/setActive/getActiveId/getAll; toData/fromData; nie można usunąć domyślnej warstwy)
  - `history/` — **HistoryManager** (bounded stack, maxSize=100; **Operation** {type, description, undo(), redo()}; push/undo/redo/canUndo/canRedo/clear; getDescription() → {undoLabel?, redoLabel?})
  - `selection/` — **SelectionManager** (Set of string ids; select(id, multi?)/deselect/toggle/selectAll/clear/getSelected/isSelected/count; **selectInBox(BoundingBox2D)** — pobiera encje z EntityRegistry)
  - `snap/` — **SnapEngine** (configurable Set of SnapMode; gridSize default 10; snap(cursor, entities, pixelToWorld?) → **SnapResult** {point, mode, entityId?}; threshold=12px scaled by pixelToWorld; getEndpoints/getMidpoints/getCenter per entity type)
  - `events/` — **EventBus** (Map of CadEventType → Set of Handler; on/off/emit/clear; zwraca unsubscribe fn); **CadEventType**: `'entity:added|updated|removed'`, `'layer:added|updated|removed'`, `'selection:changed'`, `'history:changed'`, `'project:loaded'`, `'viewmode:changed'`
  - `project/` — **Project** (fasada; tworzy i łączy wszystkie subsystemy; addEntity/removeEntity/updateEntity → przez history; removeSelected(); undo/redo → EventBus emit; setViewMode; toJSON/fromJSON → ProjectData {version, settings, layers, entities}; reset()); **ProjectSettings** {name, units, gridSize, precision}

### Aplikacja backend (`app/mycastle-backend/`)

- Node.js, ESM (`"type": "module"`), build z tsup, dev z tsx watch. **`src/index.ts`**: `dotenv.config({ path: resolve(__dirname, '..', '.env') })` — ładuje .env z root projektu; `__dirname` via `fileURLToPath(import.meta.url)` (wymagane w ESM)
- Port: 1894 (HTTP + MQTT WebSocket at `/mqtt` + Terminal WebSocket at `/ws/terminal` — shared mode). Opcjonalnie MQTT na osobnym porcie via `MQTT_PORT`
- **App singleton** (`src/App.ts`): `App.create(config)` → `App.instance.init()` → `App.instance.shutdown()`. Trzyma referencje do wszystkich modułów: fileSystem, ocrService, dataSource, automateService, schedulerService, httpServer, iotService, arduinoService, **upythonService**, _mqttServer (lazy), jwtService, apiKeyService, terminalService. Seeduje domyślnego admina (admin/admin) przy pierwszym uruchomieniu.
- Importuje FileSystem, MqttServer, JwtService, PasswordService, ApiKeyService, DataSource, RpcRouter z `@mhersztowski/core-backend`
- **MQTT auth**: anonymous allowed (web client), lub API key, JWT token, lub username+password
- **MycastleHttpServer** (`src/MycastleHttpServer.ts`): rozszerza HttpUploadServer, dodaje pełne REST API (`/api/*`). JWT auth middleware (checkAuth) na wszystkie endpointy poza publicznymi. Admin routes wymagają `isAdmin`. Generyczny `handleCrud(config: CrudConfig)`. `resolveMinisConfig(userName, deviceName)` — czyta Electronics/configuration.json, zwraca `MinisConfig` (deviceName, serialNumber, wifiSsid, wifiPassword, architectureJson) dla danego deviceName (uwzględnia topologię: wifi-device → wifi-switch). **WAŻNE: wszędzie używamy deviceName jako identyfikatora urządzenia — w MQTT topics, rejestrach backendu, API. SN jest tylko do wewnętrznego śledzenia buildów.** Publiczne endpointy (bez auth): `GET /api/data-files` (lista obrazów z `public/public/`, zwraca `{files: string[]}` z prefixem `data/`), `GET /api/users/{u}/devices/{d}/smart-display` (config Smart Display dla urządzenia — pobierany przez Python client), `GET /api/immich/*` (proxy do serwera Immich: login, albums, thumbnail, `album-image?shareUrl=` — losowy thumbnail z shared album, cache assetów 1h w `immichAlbumCache`, retry 3x dla 5xx, header `X-Immich-Description` z URLencoded opisem assetu), `POST /api/immich/download` (download asset → local storage), `GET /api/weather-image?lat=&lon=&w=&h=&locationName=` (pobiera prognozę z Open-Meteo — darmowe API bez klucza, renderuje kartę pogodową SVG→PNG via `sharp`, cache 15min w `weatherCache`). Prywatna metoda `buildWeatherSvg(w, h, params)` — generuje SVG z: nazwą lokalizacji, dużą temperaturą, ikoną+opisem warunków, feels like/wiatr/wilgotność, 4-dniową prognozą.
- **TerminalService** (`src/modules/terminal/TerminalService.ts`): WebSocket PTY (node-pty, xterm-compatible). Ticket-based auth (one-time 30s ticket). Attach do HTTP server na `/ws/terminal`. `createTicket(payload)` — wywoływane z HTTP endpoint po weryfikacji JWT.
- **IoT hello + entities**: `handleHello()` w `IotService` teraz persystuje encje przez `upsertConfig()` — urządzenie deklaruje entities w hello payload, backend zapisuje je do SQLite (były tylko in-memory). IoT endpoints wydzielone do prywatnych metod `handleIotTelemetry()` i `handleIotCommands()` dla czytelności.
- Moduły w `src/modules/`:
    - **ocr** — Tesseract.js + Sharp preprocessing, PolishReceiptParser, non-blocking init
    - **automate** — AutomateService (implementuje IAutomateService), BackendAutomateEngine (graph traversal, merge nodes), BackendSystemApi, AutomateSandbox
    - **scheduler** — SchedulerService (node-cron), auto-reload z filesystem events
    - **iot** — pełna warstwa IoT: IotDatabase (SQLite, WAL, **migration: kolumna `extensions TEXT NOT NULL DEFAULT '[]'` dodawana przez `ALTER TABLE ... ADD COLUMN` — migration-safe, idempotentne**), TelemetryStore, DevicePresence, CommandDispatcher, AlertEngine, DeviceShareStore, IotService. **Extensions system**: `IotExtension` interfejs `{ type, handleMessage(subTopic, payload), dispose() }`, `IotExtensionRegistry` (zarządza Map<deviceName, Map<extType, IotExtension>>, `syncFromConfig(config)` tworzy/usuwa extensions, `handleMessage(deviceName, userId, extType, subTopic, payload)` auto-tworzy extensions lazy, `getVfs(deviceName)` / `getSmartDisplay(deviceName)` / **`getDisplay(deviceName)`** typowane accessory, callbacki `onVfsMounted?(deviceName, fs: MqttFS)` / `onVfsUnmounted?(deviceName)`), `extensions/VfsExtension.ts` (type='vfs', tworzy `MqttFS`, `handleMessage('res', payload)` → Zod validate → `fs.handleResponse()`), **`extensions/SmartDisplayExtension.ts`** (type='smart-display', obsługuje konfigurację Smart Display — `update`/`clear` ops), **`extensions/DisplayExtension.ts`** (type='display', odbiera klatki wideo z urządzenia przez MQTT `ext/display/res`; `lastFrame: DisplayFrame|null` — ostatnia klatka; emituje event `'frame'`; `DisplayFrame` {op:'frame', n, w, h, fmt, data:base64}; `getConfig()` — request-response; `handleMessage('res', payload)` obsługuje zarówno niezamówione frame-pushe (op:'frame') jak i ack-i; pending Map z UUID correlation IDs + timeout 10s). **IotService** ma pole `extensions: IotExtensionRegistry`; `handleHeartbeat()` wywołuje `extensions.syncFromConfig()`; `handleMqttMessage()` routuje `ext/{extType}/{subTopic}` do `extensions.handleMessage()` — klucz to zawsze **deviceName** (nie SN). Device wysyła hello z `MINIS_DEVICE_SN = deviceName` (wstrzykiwane przy deploy), więc MQTT topic zawiera deviceName: `minis/{user}/{deviceName}/hello`. **MycastleHttpServer**: `iotService.extensions.onVfsMounted = (deviceName, fs) => this.vfs.mount('/devices/${deviceName}', fs)` — VFS urządzenia dostępny przez REST API na `/api/vfs/readdir?path=/devices/{deviceName}/`
    - **arduino** — pełna warstwa Arduino: ArduinoCli (+ MinisConfig: **deviceName**/serialNumber/wifiSsid/wifiPassword/architectureJson — `deviceName` używany w `#define MINIS_DEVICE_SN`, serialNumber tylko do śledzenia buildów), ArduinoCliLocal, ArduinoCliDocker, **ArduinoCliDockerRun** (`docker run --rm` — brak persistent container, volume mount hostDataDir→containerDataDir, ścieżki tłumaczone przez `toContainer()`), ArduinoProject (compile wstrzykuje MinisConfig.h z `#define MINIS_DEVICE_SN "{deviceName}"` / MINIS_WIFI_SSID / MINIS_WIFI_PASSWORD / MINIS_CONFIG przed kompilacją), ArduinoService. **Instalacja bibliotek**: `libInstall({ name, version?, url? }, configFilePath)` — dla `url` używa `--git-url` (wymaga `library.enable_unsafe_install: true` w configu), dla `name` standardowy manager. `ensureConfig()` dodaje `library.enable_unsafe_install: true` do `custom-config.yaml`. `compile()` instaluje biblioteki z `project.json` do katalogu `{projectDir}/libraries/` (przez `directories.user` w configu). Po git-url instalacji: `readAllLibraryDeps()` skanuje wszystkie `library.properties` w `libraries/` i doinstalowuje brakujące zależności z pola `depends=`. Env: `ARDUINO_CLI_DOCKER_IMAGE` (jeśli ustawione → ArduinoCliDockerRun; image musi mieć arduino-cli z baked-in cores).
    - **upython** — MicroPython service: MicroPythonCli (interface), MicroPythonCliLocal (mpremote connect {port} cp), **MicroPythonCliDocker** (`docker exec` na named container), **MicroPythonCliDockerRun** (`docker run --rm` z `--device` passthrough, volume mount hostDataDir), MicroPythonProject (deploy .py files z src/ + opcjonalnie biblioteki), MicroPythonService (orchestrator, env: `UPYTHON_CLI_LOCAL_PATH` / `UPYTHON_DOCKER_NAME` / `UPYTHON_DOCKER_IMAGE`). **Deploy bibliotek**: `deploy(port, libraries?)` — przed wgraniem kodu pobiera każdą bibliotekę z `lib.url` (raw URL lub `data:` base64) przez `fetch()`, zapisuje do `{projectDir}/libraries/`, dodaje do listy plików do wgrania na urządzenie (`lib.remoteName`).
    - **pygame** — PygameService: `sketchDir(user, projectId, sketchName)`, `webBuildDir(...)`, `build(user, projectId, sketchName, webCode)` — uruchamia pygbag (lokalnie lub przez `docker run --rm` / `docker exec`). Po buildzie wstrzykuje przycisk Back do `index.html`. Env: `PYGAME_DOCKER_IMAGE` / `PYGAME_DOCKER_NAME` / `PYGBAG_PATH`. REST: `GET/PUT /api/users/{user}/project-pygame/{projectId}/sketches/{name}/{file}`, `POST .../build`, `GET .../web-build/index.html`.
    - **rpc** — handlers.ts (registerHandlers z deps: iotService, fileSystem). Importuje RpcRouter z `@mhersztowski/core-backend`
- `src/swagger.ts` — OpenAPI 3.0.3 spec (auto-generated z Zod via buildSwaggerSpec)

### Aplikacja frontend (`app/mycastle-web/`)
- React 18 + TypeScript, Vite 5, Material UI 5, Monaco Editor, Blockly, xterm.js, esptool-js, mqtt — **ujednolicony frontend** łączący MyCastle PIM i Minis w jednej aplikacji
- Dev port: 1895 (Vite HMR), proxy `/api` → `localhost:1894`, `/mqtt` → `ws://localhost:1894`, `/ws/terminal` → `ws://localhost:1894`
- **PWA**: VitePWA plugin (vite-plugin-pwa), precache CSS/HTML/icons, Monaco workers wykluczone z precache, navigateFallback `/index.html`. **JS bundles: `NetworkFirst`** (zmienione z `StaleWhileRevalidate`) — nowe buildy są pobierane natychmiast zamiast serwowania z cache
- **Path aliases**: `@` → `src/`, `@modules` → `src/modules/`, `@components` → `src/components/`, `@pages` → `src/pages/`
- **App singleton** (`src/App.ts`): `App.create()` → `App.instance`. Tworzony w `main.tsx` przed renderem React.
- **AppRoot** (`src/AppRoot.tsx`): unified routing. `RequireAuth` guard (redirectuje do `/` gdy brak currentUser). `AdminOnly` guard (redirectuje do `/user/:userName/main` gdy nie admin lub impersonating). `PageHooksRunner` uruchamia usePageHooks().
- **Provider tree** (`main.tsx`): `DisplayProvider` → `BrowserRouter` → `NotificationProvider` → `AuthProvider` → `MqttProviderWithAuth` (przekazuje JWT token jako mqttPassword) → `FilesystemProvider` → `MinisDataSourceProvider` → `GlobalWindowsProvider` → AppRoot + GlobalApiDocs + GlobalRpcExplorer + GlobalMqttExplorer + GlobalMjdDefEditor + GlobalMjdDataEditor + **GlobalTerminal**
- **DisplayContext** (`components/DisplayContext.tsx`): ThemeMode ('light'|'dark'), DisplaySize ('small'|'medium'|'large'), MUI ThemeProvider, localStorage persistence (`minis-display`)
- Moduły:
    - **mqttclient** — re-exports z @mhersztowski/web-client (MqttClient, MqttContext, useMqtt)
    - **filesystem** — re-exports z @mhersztowski/web-client (FilesystemService, FilesystemContext, DirData, FileData, etc.) + app-specific models/nodes barrels
    - **minis-filesystem** — MinisDataSourceContext (ładuje moduleDefs/deviceDefs/projectDefs via MQTT do MemoryDataSource)
    - **auth** — AuthContext/AuthProvider, useAuth hook. JWT token + sesja w sessionStorage. `setAuthToken()` propaguje token do MinisApiService i RpcClient. Stan: currentUser, token, isAdmin, login(), logout(), impersonating, startImpersonating(), stopImpersonating(). **Auth redirect**: `RequireAuth` przy braku auth zapisuje `location.pathname+search` do `sessionStorage('auth_redirect')` → po zalogowaniu `LoginPage` odczytuje i przekierowuje tam zamiast do `/user/:userName/main`. Używane przez `/watch` i inne deep-link routes.
    - **uiforms** — system UI (Godot-like): models, nodes, renderer (21 kontrolek), designer (drag & drop), binding (oneWay/twoWay), services
    - **automate** — graficzny język (NodeRed-like): designer (responsive mobile), engine, registry (NODE_TYPE_METADATA), services. Runtime: client/backend/universal. Merge node, Manual Trigger
    - **notification** — NotificationService, NotificationProvider
    - **ai** — providers (OpenAI, Anthropic, Ollama), tool calling, konfiguracja data/ai_config.json
    - **speech** — TTS/STT/Wake Word providers, SpeechService, AudioRecorder, WakeWordService
    - **conversation** — ConversationEngine z tool calling, ActionRegistry (task/calendar/file/person/project/navigation/automate/shopping actions), scenariusze
    - **shopping** — skanowanie paragonów (AI Vision / OCR / Hybrid), ReceiptScannerService
    - **editor** — tylko `monacoWorkers.ts` (Vite-specific `?worker` imports dla Monaco web workers)
    - **ardublockly2** — wizualny edytor bloków Arduino (Blockly): ArduBlocklyService, ArduBlocklyComponent, boards/ (BoardManager, BoardProfile), generator/ (ArduinoGenerator — C++), blocks/
    - **upythonblockly** — wizualny edytor bloków MicroPython (Blockly): UPythonBlocklyService (+ `updateToolboxVisibility(hidden: ReadonlySet<string>)`), UPythonBlocklyComponent, boards/, blocks/ (**blocks/text.ts**: 11 custom bloków Text — `upy_text_count`, `upy_text_index`, `upy_text_replace`, `upy_text_trim`, `upy_text_prompt`, `upy_text_to_str`, `upy_text_ord`, `upy_text_decode`, `upy_text_encode`, `upy_text_format_float`, `upy_text_to_hex`; kolor `#5ba58c`), generator/ (UPythonGenerator + **generator/text.ts**: generatory dla wszystkich custom bloków + `text_changeCase`, `text_isEmpty` → `not len(text)`, `upy_text_prompt` wstrzykuje helper `text_prompt()` przez `addFunction()`, `upy_text_to_hex` generuje f-string z polami ZEROS/PREFIX), repl/ (MpySerialReplService, MpyWebReplService, MpyReplTerminal), upload/ (UploadDialog — przyjmuje prop `libraries?: Array<{url, remoteName}>`, pobiera każdą bibliotekę przez `fetch()` i wgrywa na urządzenie przed uruchomieniem kodu — działa dla Serial i WebREPL; **warning Alert** widoczny gdy `uploadMode='run'` i są biblioteki — biblioteki zawsze zapisywane na filesystem nawet w trybie Run). **Toolbox** (`toolbox.ts`): 3 sekcje `expanded:true` — **System** (Events, Button, PinButton, UI Color, RGB, IR, Time), **Hardware** (Pin, ADC, PWM, Timer, UART/Print, I2C, SPI, I2S, SDCard, CAN, WatchDog, RTC, WiFi, Speaker, User Display), **Language** (Logic, Loops, Control, Bits, Math, Type, Lists, Tuples, Bytes, Bytearray, JSON, Map, Text, Variables, Functions). Eksporty: `HARDWARE_CATEGORY_NAMES` (15 nazw kategorii Hardware), `buildToolbox(hidden: ReadonlySet<string>)` — filtruje kategorie Hardware wg zestawu ukrytych nazw
    - **pygameblockly** — wizualny edytor bloków Pygame (Blockly): `PygameBlocklyService` (init/dispose, `mode: PygameMode` = `'native'|'web'`, onWorkspaceChange, getCode, loadCode, getXml/loadXml), `PygameBlocklyComponent`, `PygameGenerator` (generuje kod Python/Pygame; `mode_` zmienia output dla `'web'` — pygbag-compatible), blocks/ (screen, window, color, rect, draw, draw_adv, image, sound, time, event, events_input, events_keyboard, gamemath), `TOOLBOX` (`toolbox.ts`). `PygameMode` = `'native'` (pygame) lub `'web'` (pygbag WASM). Strony używają split-view: Blockly po lewej + Monaco po prawej, sync dwukierunkowy (code edit ↔ blockly regenerate z potwierdzeniem).
    - **serial** — Web Serial API: WebSerialService, WebSerialTerminal (xterm.js), EspFlashService (esptool-js), FlashDialog (3 tryby: compiled output, custom .bin, **predefined firmware** z `GET /api/admin/firmware/files` — pliki z `data/Minis/Admin/Firmware/`)
    - **iot-emulator** — EmulatorService (MQTT pub/sub via `mqtt` package, interwały telemetrii/heartbeat, command handling, activity log, localStorage persistence), presety urządzeń, generatory wartości
- Serwisy (`src/services/`):
    - **MinisApiService** — singleton (`minisApi`), REST client do `/api/*`. `setAuthToken(token)`. Pełne API: auth, admin CRUD, user devices/projects, IoT, API keys, Arduino, Sketch, README, Localization. Nowe: `getDeviceMinisConfig(userName, deviceName)` (WiFi/SN config), `getIotArchitecture/saveIotArchitecture` (Electronics graph), `listFirmwareFiles/fetchFirmwareFile` (predefined firmware), uPython CRUD (`getUserUPythonProjects`, `createUserUPythonProject`, `deployUPythonProject`), **`getSmartDisplayConfig(userName, deviceName)`** / **`saveSmartDisplayConfig(userName, deviceName, config)`** (SmartDisplayConfig), **`cloneProjectFromGithub(userName, projectName, repoUrl, sketches, readmePath, libraries?)`** — opcjonalny parametr `libraries?: Array<{name, version, url?}>` propagowany do backendu i zapisywany w Project.json. Dodatkowo: `getTerminalTicket()` → `{ ticket }` (do GlobalTerminal).
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
    - **Layout** — dodany tablet drawer (breakpoint `sm`—`lg`): osobny `Drawer variant="temporary"` dla tabletów, trigger po prawej stronie AppBar. Mobile i tablet zamykają drawer po nawigacji. Collapsible nav groups z `openGroups` state.
    - **VfsView** — `ResizeDivider` component: przeciągany separator między panelami (mouse + touch), overlay `position:fixed` podczas drag zapobiega przechwytywaniu eventów przez Monaco/iframe. Persystowany rozmiar paneli przez `useState`.
- Strony:
    - Full-page (bez Layout): `/workspace/md/*` (WorkspaceMdPage), `/editor/simple/*` (SimpleEditorPage), `/editor/md/*` (MdEditorPage), `/viewer/md/*` (MdViewerPage), `/designer/ui/:id?` (UIDesignerPage), `/designer/automate/:id?` (AutomateDesignerPage), `/viewer/ui/:id` (UIViewerPage) — owinięte `MinimalTopBar`, wymaga auth
    - Public: `/` (HomePage), `/login/:userName` (LoginPage), `/watch` (**WatchPage** — publiczne, bez auth; duży okrągły przycisk, publikuje `{pressed:true, at:timestamp}` na MQTT topic `watch` przez `mqttClient.rawPublish()`; przeznaczone dla Galaxy Watch / urządzeń IoT — MQTT łączy się anonimowo)
    - Full-page bez Layout (Minis): `/user/:userName/editor/monaco/*` (MinisMonacoEditorPage), `/user/:userName/project/:projectId` (**MinisProjectPage** — przełączanie widoku Blockly↔Code przez `window.location.href` zamiast `navigate()` — full page reload unika konfliktów pamięci między bundlami Blockly i Monaco), `/user/:userName/upython-project/:projectId` (**UPythonProjectPage** — wstrzykuje WiFi credentials jako Python header przed uplodem; ładuje `projectLibraries` z pola `libraries` rekordu projektu i przekazuje do UploadDialog; `isDirty` state → Save button w kolorze warning/contained gdy są niezapisane zmiany; `loadKey`+`useEffect` — niezawodne wyciszenie dirty podczas ładowania szkicu: `isLoadingSketchRef` pozostaje true przez 100ms po załadowaniu żeby pochłonąć odroczone eventy Blockly; config panel z togglem kategorii Hardware — persystowane w localStorage `upython_hidden_cats`, domyślnie wszystkie ukryte), `/user/:userName/pygame-project/:projectId` (PygameProjectPage — Blockly/split/code view, PygameMode toggle native/web, lista szkiców, build przez `POST .../build`, podgląd web-build w iframe)
    - Layout pages (Minis admin): `/admin/:userName/main`, `/admin/:userName/users`, `/admin/:userName/devicesdefs`, `/admin/:userName/modulesdefs`, `/admin/:userName/projectdefs` (**GithubProjectDefsPage** — auto-fetches DEFAULT_URL on mount przez `useEffect`; `handleFetch` owinięty w `useCallback`)
    - Layout pages (Minis user): `/user/:userName/main`, `/user/:userName/localization`, `/user/:userName/electronics/devices`, `/user/:userName/electronics/arduino`, `/user/:userName/electronics/upython`, `/user/:userName/electronics/pygame` (UserPygameProjectsPage — lista projektów Pygame, tworzenie nowych), `/user/:userName/electronics/configuration` (ElectronicsConfigurationPage — ReactFlow IoT network editor: 4 node types wifi-device/wifi-uart-bridge/wifi-switch/uart-device, ConfigPanel z dropdownem urządzeń, WiFi inheritance, drag-and-drop, persistence przez `GET/PUT /api/users/{userName}/electronics/configuration`), `/user/:userName/iot/dashboard`, `/user/:userName/iot/devices`, `/user/:userName/iot/device/:deviceName` (IotDevicePage — przycisk "Smart Display" widoczny gdy extension `smart-display`, przycisk **"Virtual Display"** (Monitor icon) widoczny gdy extension `display`), `/user/:userName/iot/smart-display/:deviceName` (**SmartDisplayPage** — konfiguracja widoków Smart Display: typy clock/text/metric/image/random-image/weather, cycleDuration, persystancja przez `GET/PUT /api/users/{u}/devices/{d}/smart-display`), `/user/:userName/iot/virtual-display/:deviceName` (**VirtualDisplayPage** — przeglądarka wirtualnego wyświetlacza: subskrypcja MQTT `minis/{user}/{device}/ext/display/res`, dekodery pixelformat (RGB565/MONO_VLSB/MONO_HLSB/GS4_HMSB/GS8), canvas rendering z `imageRendering:pixelated`, zoom 1–8×, tło black/white/green, licznik FPS), `/user/:userName/iot/alerts`, `/user/:userName/iot/emulator`, `/user/:userName/tools/rpc` (AdminOnly), `/user/:userName/tools/mqtt-explorer` (AdminOnly), `/user/:userName/tools/api-keys` (AdminOnly), `/user/:userName/tools/testvfs` (AdminOnly), `/user/:userName/tools/docs` (AdminOnly)
    - Layout pages (PIM — pod `/user/:userName/pim/`): `/calendar`, `/todolist`, `/person`, `/project`, `/shopping`, `/automate`, `/objectviewer`, `/components`, `/settings/ai`, `/settings/speech`, `/settings/receipt`, `/settings/page-hooks`, `/agent`
- **MdEditor** — `BlockActionMenu`: jeden przycisk na blok (pozycje obliczane przez `updateBlockPositions()` — sync ProseMirror node attrs do DOM dla NodeView-based bloków). `SlashCommands` otrzymuje `onCreatePage` callback (ref pattern dla stabilności). `BlockIdExtension` dołączony bezpośrednio w MdEditor. **SlashCommands** — nowe komendy: `Link` (prompt URL + tekst, wstawia link), `Page` (prompt ścieżka, tworzy plik .md + wstawia link); scrollowalna lista z keyboard nav (auto-scroll do zaznaczonego elementu). **WorkspaceMdPage** — `handleCreatePage(path)`: tworzy plik przez `writeFile`, inkrementuje `treeVersion` do odświeżenia drzewa; lista plików pokazuje folder jako secondary text.
- **Markdown editor fixes**: `markdownConverter.ts` — regex `%%BID:xxx%%` akceptuje dowolny format ID (nie tylko UUID); `BlockIdExtension` — split na `STANDARD_BLOCK_TYPES` (addGlobalAttributes) i `CUSTOM_BLOCK_TYPES` (appendTransaction only) żeby naprawić "no id yet" na blokach NodeView; `AutomateScriptExtension` — `data-block-id` na `NodeViewWrapper`.
- **MinisApiService** — odpowiedź 401 dispatches `window.dispatchEvent(new Event('minis:session-expired'))` zamiast hard redirect; **AuthContext** — nasłuchuje `minis:session-expired` i wywołuje `logout()` przez React.
- **IoT pages** — kolumny ukryte na `xs` (`display: { xs: 'none', sm: 'table-cell' }`), status devices pokazuje last-seen timestamp.
- **Wzorzec dostępu do serwisów**: strony i komponenty używają `const { aiService } = App.instance;` zamiast bezpośrednich importów singletonów. React contexty (useMqtt, useFilesystem, useNotification, useAuth) pozostają dla reaktywnego stanu UI.

### Aplikacja client (`app/client/`)

- Python, Agent MQTT (paho-mqtt), operacje systemowe Windows + rozszerzenie VFS + **aplikacja Smart Display (pygame)**
- **config.py**: MQTT_BROKER_PORT=1884 (TCP), MQTT_TRANSPORT='tcp'|'websockets', MQTT_USER/DEVICE → TOPIC_PREFIX `minis/{user}/{device}`, TOPICS: HEARTBEAT/COMMAND_ACK/EXT_VFS_RES/COMMAND/EXT_VFS_REQ/**EXT_SMART_DISPLAY_REQ**/**EXT_SMART_DISPLAY_RES**, HEARTBEAT_INTERVAL, DATA_DIR, `API_BASE_URL` (default `http://{MQTT_BROKER_HOST}:1894`), `SMART_DISPLAY_CONFIG_RELOAD_INTERVAL` (default 3600s), `ANTHROPIC_API_KEY` (dla TTS opisu obrazu)
- **agent.py** (`ClientAgent`): przyjmuje opcjonalny `display` (SmartDisplay), subskrybuje COMMAND + EXT_VFS_REQ + EXT_VKBD_REQ + EXT_VMOUSE_REQ + EXT_SMART_DISPLAY_REQ (gdy display != None), heartbeat przez `threading.Timer` (daemon), `_handle_command()` mapuje komendy `{id, name, payload}` na operations + ACK, `_ack_command(cmd_id, status, reason?)`, `_send_hello()` dołącza `smart-display` extension gdy display aktywny, VfsExtension na DATA_DIR. **Tryb Smart Display**: `main()` akceptuje argument `app:smart-display` — pygame wymaga main thread → agent uruchamiany w daemon thread, `display.run()` blokuje main thread, `stop()` poprawiony: guard przed double-call (`running == False`), `loop.close()` w try/except; WebSocket path ustawiane tylko gdy `MQTT_TRANSPORT == "websockets"`
- **apps/smart_display.py** (`SmartDisplay`): pygame aplikacja 800×480 FPS=10, wyświetla widoki z konfiguracji Smart Display. **Widoki**: `clock` (zegar + data), `text` (zegar + główny tekst + subtext), `metric` (zegar + telemetria z REST API), `image` (statyczny obraz z `/files/`), `random-image` (losowe zdjęcie z Immich shared album przez `/api/immich/album-image`), `weather` (karta pogodowa PNG z `/api/weather-image`). **Sliding window dla random-image**: `_rnd_surf` (current) + `_rnd_next` (prefetch) — max 2 surfaces w pamięci, `_advance_random_image()` swap + kick next fetch. **TTS dla random-image**: `_spoken_text(raw)` — Claude Haiku przepisuje opis na naturalną mowę; `_tts_to_wav(text)` — próbuje `espeak-ng` → `espeak` (subprocess) → `pyttsx3` fallback, szczegółowe logowanie każdego kroku; cooldown 1h per view_id (`_rnd_tts_played_at`); `_pending_audio` konsumowany w main loop przez `pygame.mixer.music.load/play`. **Zawiera**: `_load_contain_surface()` (PIL EXIF transpose + letterbox na czarnym tle + BMP→pygame roundtrip), `_check_espeak()` (wykrywa dostępny binary przy starcie). **Mixer**: `pygame.mixer.init()` w `run()` z try/except i logowaniem. **Weather view**: `_maybe_fetch_weather()` / `_do_fetch_weather()` — pobiera PNG z backendu co 15 min (WEATHER_REFRESH_INTERVAL=900), przechowuje jako pygame.Surface per view_id. **Config reload**: każde urządzenie co SMART_DISPLAY_CONFIG_RELOAD_INTERVAL (1h) lub 'r' key.
- **apps/smart_display_models.py**: Python mirror SmartDisplayConfig/SmartDisplayView z `from_dict()`, pola: id, type, label, text, subtext, metricKey, metricUnit, metricDevice, imagePath, albumShareUrl, ttsDescription, weatherLat, weatherLon, weatherLocationName
- **extensions/vfs.py** (`VfsExtension`): `handle_request(payload)` dispatch przez `match op:` (stat/readdir/readfile/writefile/delete/rename/mkdir), `_resolve(path)` — ochrona przed directory traversal przez `os.path.realpath` + `startswith(root_dir)`, FileType: FILE=1/DIR=2 (zgodnie z TypeScript enum), `_writefile` respektuje opcje create/overwrite, `_delete` obsługuje recursive przez `shutil.rmtree`, `_respond(req_id, ok, data, error)` publikuje JSON
- **data/**: katalog VFS root (pusty, tworzony automatycznie)
- operations/: system, process, window, clipboard, shell, app, media
- **requirements.txt**: paho-mqtt, **pygame>=2.5.0**, psutil, pyperclip, Pillow, pygetwindow, pycaw, comtypes, python-dotenv, **anthropic>=0.40.0**, **pyttsx3>=2.90**, winotify
- **entities/** (`app/client/entities/__init__.py`): Python mirror TypeScript IotEntity hierarchy. Klasy: `IotEntity` (base, `to_dict()`, `handle_command()`), `SensorEntity` (unit), `BinarySensorEntity` (on/off_label), `SwitchEntity` (callback bool), `NumberEntity` (min/max/step/unit, callback float), `ButtonEntity` (callback void), `SelectEntity` (options list, callback str). Rejestracja: `agent.add_entity(entity)` przed `start()` — encje dołączane do hello payload i auto-dispatchowane gdy nadchodzi command z pasującym id.
- `ClientAgent.send_telemetry(metrics)` — publikuje odczyty sensorów na topic TELEMETRY; `metrics`: lista `(key, value)` lub `(key, value, unit)` tupli.
- Dawna nazwa: `app/desktop/` (przemianowana)

### Aplikacja mycastle-mobile (`app/mycastle-mobile/`)
- React Native (Expo ~52), WebView wrapper na `http://192.168.0.207:1894`
- Pełna aplikacja MyCastle na telefon — back button obsługuje historię WebView
- `jsEngine: "jsc"` (wyłączony Hermes — kompatybilność z ARM64 Docker build)
- Build: `docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build.sh`
- APK: `app/mycastle-mobile/android/app/build/outputs/apk/release/app-release.apk`
- **Kluczowe patche w build.sh**: AndroidManifest `usesCleartextTraffic=true` (HTTP na lokalnej sieci), Gradle init script suppress Compose Kotlin version check (expo-modules-core 2.2.3 wymaga Kotlin 1.9.25, generowany projekt ma 1.9.24)

### Aplikacja mycastle-watch (`app/mycastle-watch/`)
- React Native (Expo ~52), WebView wrapper na `http://192.168.0.207:1894/watch`
- Przeznaczona dla Samsung Galaxy Watch 7 (Wear OS) — instalacja przez Wear Installer 2 lub ADB WiFi
- Build: `docker compose -f docker-compose.cli.yml run --rm watch /workspace/app/mycastle-watch/build.sh`
- APK: `app/mycastle-watch/android/app/build/outputs/apk/release/app-release.apk`
- Te same patche co mycastle-mobile (cleartext + Compose Kotlin suppression)

### Aplikacja demo-scene-3d (`app/demo-scene-3d/`)
- React + Three.js demo, Vite, depends on core-scene3d, ui-core, ui-components-scene3d

### Aplikacja cad-backend (`app/cad-backend/`)

- Node.js HTTP server, ESM, port **1898**. Dev: `pnpm dev:cad-backend`. Używa `NodeFS` z `@mhersztowski/core` jako backend magazynu plików.
- **VFS REST API** — implementuje dokładnie te endpointy których oczekuje `RemoteFS` z `@mhersztowski/core`:
  - `GET /api/vfs/capabilities` → `{readonly, watch}`
  - `GET /api/vfs/stat?path=` → `FileStat`
  - `GET /api/vfs/readdir?path=` → `{entries: DirectoryEntry[]}`
  - `GET /api/vfs/readFile?path=` → `{data: base64}`
  - `POST /api/vfs/writeFile?path=` body `{data: base64, options?}` — tworzy katalogi nadrzędne automatycznie
  - `POST /api/vfs/delete?path=`, `/rename`, `/mkdir`, `/copy`
- **Struktura ścieżek (multi-user):** `/users/{userId}/projects/{name}.cad.json`
  - `userId` domyślnie `'default'` — gotowe na przyszłą autentykację (wywołaj `setCurrentUserId()` z auth contextu)
  - Każdy użytkownik ma izolowaną przestrzeń projektów
- **CORS:** domyślnie `*` dla deweloperki; produkcja — `CAD_CORS_ORIGIN` env var
- **Env vars:** `CAD_DATA_DIR` (domyślnie `app/cad-backend/data/`), `CAD_BACKEND_PORT` (1898), `CAD_CORS_ORIGIN`
- **Frontend integracja** (`app/cad-app/`):
  - `src/vfs/cadProjectApi.ts` — cienki fetch client (`listProjects`, `readProject`, `writeProject`, `deleteProject`, `renameProject`, `setCurrentUserId`)
  - `src/components/ProjectBrowser.tsx` — dialog wyboru/zapisu projektów: lista z datą i rozmiarem, inline rename, delete, double-click open; name field w trybie save
  - `src/io/CadExporter.ts:loadProjectFromText()` — mutuje istniejący singleton projekt z JSON stringa (używane przez ProjectBrowser i importJSON)
  - `vite.config.ts` proxy: `/api/vfs` → `http://localhost:1898`
  - `FileMenu.tsx` — "Open from Server…" / "Save to Server…" otwierają ProjectBrowser

### Aplikacja cad-app (`app/cad-app/`)

- React 18 + TypeScript, Vite 7, MUI 7, Three.js — edytor CAD 2D/3D. Dev port: 1897. Wymaga `pnpm dev:cad-backend` (port 1898) dla funkcji serwera.
- Dwa tryby pracy przełączane zakładkami na górze:
  - **CAD 2D/3D** — tryb kreślarski z przełącznikiem widoku 2D (ortho) / 3D (perspektywa + OrbitControls)
  - **Scene 3D** — pełny edytor Three.js (`RichEditor` z `@mhersztowski/ui-components-scene3d`)

#### Renderer

- `src/renderer/CadRenderer.ts` — Three.js renderer (orthographic camera w 2D, perspective + OrbitControls w 3D). Pan 2D: środkowy/prawy klik. Zoom: kółko myszy (zoom-at-cursor). Metody: `screenToWorld(sx,sy)`, `worldToScreen(wx,wy)` (do nakładania HTML overlays), `screenToWorldPlane(sx,sy)` (raycasting na płaszczyznę XY w 3D), `pickEntity(sx,sy)` (raycast 2D, threshold 8px), `pickEntity3d(sx,sy)` (THREE.Raycaster dla 3D meshów), `setViewMode('2d'|'3d')` / `getViewMode()`, `syncAll()`, `setPreview(geometry)` (żółty podgląd), `showSnapMarker(point)` (zielony krzyżyk), `zoomAt(sx,sy,factor)`, `pan(dx,dy)`.
- `src/renderer/EntityMeshBuilder.ts` — buduje `THREE.Line` per typ encji (2D: BufferGeometry; 3D: ExtrudeGeometry gdy `extrudeHeight > 0`). Kolor: bylayer → kolor z Layer, inaczej własny kolor. Zaznaczenie: `#4fc3f7`. Preview: `#ffcc00`. Circle/Arc: 64 segmenty. `buildPreviewObject(type, points, radius?, ghostSegments?, options?)` — obsługuje typy: `line`, `circle`, `arc` (startAngle/endAngle), `rect`, `polyline`, `ghost` (fioletowe segmenty podglądu transformacji).

#### Narzędzia (`src/tools/`)

Interfejs `Tool`: `getPreview() → PreviewGeometry|null`, `getDimensionLabels?() → DimensionLabel[]`, `onPointerDown/Move/Up`, `onKeyDown`, `reset()`.

**Rysowanie 2D:**

- **LineTool** — klik A → klik B → commit + chain (nowa linia startuje od końca poprzedniej); Esc anuluje; Enter potwierdza. Dimension: długość przy środku, kąt przy kursorze.
- **CircleTool** — center → edge; Dimension: R: przy kursorze.
- **ArcTool** — 3 kliki: center → start (definiuje radius) → end (sweep CCW); Dimension: R: + kąt zakresu.
- **RectTool** — corner A → corner B; Dimension: W: poniżej, H: po prawej.
- **PolylineTool** — sekwencja punktów; Enter → open polyline; 'c' → closed; Dimension: długość segmentu przy środku + Σ łączna przy kursorze.

**Edycja 2D:**

- **SelectTool** — klik + Shift multi-select; drag: selectInBox; Delete usuwa zaznaczenie; działa w 2D i 3D (pickEntity3d).
- **MoveTool** — wymaga zaznaczenia; klik base → klik dest; ghost preview; Dimension: Δx/Δy + D: dystans.
- **CopyTool** — jak MoveTool, ale tworzy kopie zamiast przesuwać oryginały.
- **RotateTool** — klik center → ruch myszy → klik commit; `rotateByDegrees(deg, ctx)` dla CommandLine; Dimension: ∠ stopnie przy centrum.
- **OffsetTool** — klik entity (line/circle) → kursor definiuje stronę/dystans → klik commit; Dimension: D: odległość; `pickNearestEntity` helper (reużywany przez TrimTool, FilletTool).
- **TrimTool** — klik boundary (line/circle) → klik segment do ucięcia; obsługuje line-vs-line i line-vs-circle; wiele segmentów (split na 2 linie); Enter reset.
- **FilletTool** — klik pierwsza linia → klik druga linia; `radius=0` → sharp corner (utnij do intersection); `radius>0` → tangent arc (pół-kąt formuła, wstaw łuk); `filletTool.radius` jest publiczne — CommandLine wstrzykuje wartość przez `injectedAngle`.
- **DimensionTool** — wstawia encje wymiarowe (linear dimension między dwoma punktami).

**Narzędzia 3D:**

- **Box3dTool**, **Cylinder3dTool**, **Sphere3dTool** — klik placuje prymityw 3D na siatce XY z `extrudeHeight > 0`; podgląd podczas ruchu myszy.

#### `src/tools/types.ts`

- `ToolName` — unia wszystkich narzędzi: `'select'|'line'|'circle'|'arc'|'rect'|'polyline'|'move'|'copy'|'rotate'|'offset'|'trim'|'fillet'|'dimension'|'box3d'|'cylinder3d'|'sphere3d'`
- `PreviewGeometry` — `{type: 'line'|'circle'|'arc'|'rect'|'polyline'|'ghost', points, radius?, startAngle?, endAngle?, ghostSegments?}`
- `DimensionLabel` — `{worldX, worldY, text, offsetX?, offsetY?, variant?: 'primary'|'secondary'}` — pozycja w świecie CAD, tekst, przesunięcie w px od projekcji

#### Nakładka wymiarów (`src/components/DimensionOverlay.tsx`)

Absolutnie pozycjonowany `<div>` (pointer-events: none) nakładany na canvas. Każdy `DimensionLabel` jest konwertowany przez `renderer.worldToScreen()` i renderowany jako styled div. Primary: niebieski bold; secondary: jaśniejszy. Widoczny tylko w trybie 2D — znika przy przełączeniu na 3D lub zmianie narzędzia.

#### Główny canvas (`src/components/CadCanvas.tsx`)

Inicjalizuje `CadRenderer`, obsługuje: pointer events (snap → dispatch do aktywnego narzędzia), wheel (zoom w 2D; OrbitControls przejmuje w 3D), ResizeObserver. Snap: `getInBoundingBox` na nearby entities → `SnapEngine.snap()` (2D) lub grid snap (3D). Klawiatura: Ctrl+Z/Y, Escape, `:` focus CommandLine. Integracja CommandLine: `injectedPoint` → `tool.onPointerDown`, `injectedAngle` → `rotateTool.rotateByDegrees()` lub `filletTool.radius`. Stan `dimLabels` aktualizowany przy pointerMove i pointerDown — czyszczony przy zmianie narzędzia lub w trybie 3D.

#### Snap (`packages/core-cad/src/snap/SnapEngine.ts`)

Domyślnie aktywne tryby: `grid`, `endpoint`, `midpoint`, `center`, `intersection`. **Intersection snap** — pairwise O(n²) na nearby entities: line-line (`lineLineIntersection`) i line-circle (`lineSegmentCircleIntersections`). Próg: 12px przeliczone przez `pixelToWorld`.

#### Geometria (`packages/core-cad/src/utils/geometry.ts`)

Nowy moduł eksportowany z `@mhersztowski/core-cad`. Funkcje: `lineLineIntersection`, `signedDistPointToLine`, `closestPointOnSegment`, `distPointToSegment`, `lineSegmentCircleIntersections`, `circumscribedCircle`, `normalizeAngle`, `offsetLineCoords`, `dist2d`.

#### UI komponenty

- `src/components/Toolbar.tsx` — lewy pasek: Draw (Select/Line/Circle/Arc/Rect/Polyline), Edit (Move/Copy/Rotate/Offset/Trim/Fillet/Dimension), 3D (Box/Cylinder/Sphere), Undo/Redo/Delete. Skróty klawiaturowe widoczne w tooltipach.
- `src/components/CommandLine.tsx` — dolny pasek wejścia (`:` focus, Esc blur). Parsuje: współrzędne `x,y` / `@dx,dy` (relative) / `<kąt` (kąt), liczby (np. promień filletu), skróty narzędzi (`l`=line, `c`=circle, `a`=arc, `o`=offset, `tr`=trim, `f`=fillet…). Wyświetla prompt per aktywne narzędzie.
- `src/components/StatusBar.tsx` — dolny pasek: aktywne narzędzie + hint, aktywna warstwa, liczba encji/zaznaczonych, tryb widoku.
- `src/components/LayerPanel.tsx` — prawy panel warstw: lista z kolorowymi kropkami, visibility/lock toggle, aktywna warstwa, dodawanie nowej.
- `src/components/PropertiesPanel.tsx` — panel właściwości zaznaczonych encji (kolor, lineType, lineWidth, extrudeHeight).
- `src/components/FileMenu.tsx` — menu File: New, **Open from Server…** / **Save to Server…** (otwierają `ProjectBrowser`), Open JSON (local), Save JSON (local), Export SVG/DXF/OBJ/glTF/glTF Binary. Props: `getSceneData?: () => string | null` (zwraca bieżący JSON sceny), `onSceneData?: (json: string) => void` (ładuje scenę po otwarciu projektu z serwera).
- `src/components/ProjectBrowser.tsx` — dialog wyboru projektów serwerowych. Tryby: `open` / `save`. Przy **save**: zapisuje `.cad.json` + opcjonalnie `{name}.scene.json` gdy `getSceneData()` zwraca dane. Przy **open**: ładuje `.cad.json` + próbuje załadować `{name}.scene.json` (wywołuje `onSceneData`, non-fatal gdy brak). Per wiersz: przyciski **Scene Viewer** (ViewInArIcon, `window.open('/viewer/scene/...')`) i **VR Viewer** (VrpanoIcon, `window.open('/viewer/vr/...')`). Inline rename, delete z potwierdzeniem, sortowanie newest-first.
- `src/components/Scene3DView.tsx` — wrapper Scene 3D. Przycisk "Import from CAD (N entities)" → cadProjectToSceneJson → remount RichEditor. Prop **`externalSceneData?: string`** — gdy zmienia się (AI agent pisze `/scene.json`), remountuje RichEditor z nowym JSON-em. Przycisk **"Fit to scene"** — imperatywnie wywołuje `fitSceneRef.current()`. Prop **`onSceneDataChange?: (json: string) => void`** — przekazywany jako `onSceneChange` do RichEditor, czyli wywoływany przy każdej zmianie sceny (manualne edycje, import, AI) — App.tsx zapamiętuje bieżący JSON w `savedSceneJson` state.

#### I/O (`src/io/CadExporter.ts`)

`exportJSON`, `importJSON` (z File), **`loadProjectFromText(jsonText, project)`** (mutuje istniejący singleton — używane przez ProjectBrowser), `exportSVG` (Y-flip transform, obsługuje line/circle/arc/rect/polyline), `exportDXF`, `exportOBJ`, `exportGLTF(binary)`.

#### Integracja serwera (`src/vfs/cadProjectApi.ts`)

Cienki fetch client bez dodatkowych zależności. API: `listProjects(userId?)`, `readProject(name, userId?)`, `writeProject(name, json, userId?)`, `deleteProject`, `renameProject`, `getCurrentUserId()`, **`setCurrentUserId(id)`** — hook na przyszłą autentykację. Ścieżki VFS CAD: `/users/{userId}/projects/{name}.cad.json`. **`readSceneProject(name, userId?)`** / **`writeSceneProject(name, json, userId?)`** — plik towarzyszący z danymi Scene3D: `/users/{userId}/projects/{name}.scene.json`; zapisywany obok `.cad.json` gdy scena 3D była edytowana; ładowany przy otwieraniu projektu (rzuca gdy nieistniejący — caller obsługuje).

#### Bridge CAD → Scene 3D (`src/bridge/CadToScene.ts`)

`cadProjectToSceneGraph(project)` → `SceneGraph`; `cadProjectToSceneJson(project)` → JSON string dla `RichEditor.initialSceneData`. Mapowanie osi: CAD X→X, CAD Y→Z (top-down), ekstruzja→Y. Konwersja: circle→cylinder, rect→box, line→cienki box, polyline→seria boxów per segment, arc→wireframe cylinder.

#### Routing (`src/main.tsx`)

URL-based routing (bez react-router) — regex na `window.location.pathname`:

- `/viewer/scene/:name` → `SceneViewerPage` — pełnoekranowy read-only viewer Three.js: próbuje załadować `{name}.scene.json` (`SceneDeserializer.deserialize`); fallback do konwersji z `.cad.json` przez `cadProjectToSceneGraph`. `SimpleViewer` z `autoFit` i `cameraPreset="cad"`.
- `/viewer/vr/:name` → `VrViewerPage` — WebXR VR viewer: R3F Canvas z `gl.xr.enabled = true`, `VRButton` z Three.js examples, `VrCameraSetup` normalizuje skalę sceny do 3m (VR_TARGET_SIZE) dla room-scale VR.
- `/` → `App` (główna aplikacja)

#### `App.tsx` — stan aplikacji

- `aiSceneData` — JSON sceny z AI agenta (przez `AiPanel.onSceneData`) → przekazywany do `Scene3DView.externalSceneData`
- `savedSceneJson` — bieżący JSON sceny (aktualizowany przez `Scene3DView.onSceneDataChange` przy każdej zmianie) → przekazywany do `FileMenu.getSceneData`
- `cadViewMode` (`'2d'|'3d'`) — przełącznik widoku w zakładce CAD
- `aiOpen` — widoczność panelu AI (wspólny dla wszystkich zakładek)
- Zakładki: **CAD** (2D/3D toggle, Toolbar, CadCanvas, Layers/Props panel, AiPanel), **Scene 3D** (Scene3DView + AiPanel z `onSceneData`), **Electronics** (ComponentLibrary + BreadboardCanvas + AiPanel)

#### Vite config (`vite.config.ts`)

- React aliases (`react`, `react-dom`, `@emotion/*`) — zapobiegają wielokrotnym instancjom React z workspace paczek
- `optimizeDeps.exclude` dla wszystkich lokalnych workspace paczek (`@mhersztowski/ui-core`, `@mhersztowski/ui-components-scene3d`, `@mhersztowski/core-scene3d`, `@mhersztowski/core-cad`) — Vite nie cachuje pre-bundled versions, zawsze ładuje świeże `dist/`
- `/api/vfs` proxy → `http://localhost:1898` (cad-backend)

#### Skróty globalne

Ctrl+Z/Y undo/redo; Delete usuwa zaznaczenie; Escape anuluje narzędzie; `:` otwiera CommandLine; skróty narzędzi: S/L/C/A/R/P/M/O/TR/F.

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
├── docker-compose.cli.yml          # Build CLI tool images (arduino/pico/pygame/android/watch); services: android, watch (używają tego samego mycastle-android:local image)
├── docker/
│   ├── Dockerfile.cli              # Multi-target: arduino / pico / pygame (z pygbag)
│   └── Dockerfile.android          # Android build environment (Ubuntu 24.04, Node 20, JDK 17, Android SDK 34, multiarch amd64+arm64 dla QEMU)
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
│   ├── ui-components-scene3d/      # @mhersztowski/ui-components-scene3d
│   └── core-cad/                   # @mhersztowski/core-cad (CAD 2D/3D engine, no rendering)
│       ├── src/{types,events,entity,layer,history,selection,snap,project,utils}/
│       ├── tsconfig.json + tsconfig.build.json
│       ├── tsup.config.ts          # Dual ESM+CJS, tsconfig.build.json
│       └── package.json
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
│   ├── mycastle-mobile/            # React Native WebView app (telefon) → http://192.168.0.207:1894
│   │   ├── App.tsx                 # WebView + back button handler
│   │   ├── app.json                # Expo config (jsEngine:jsc, usesCleartextTraffic)
│   │   ├── build.sh                # Build APK w Docker (cleartext patch, Kotlin compat)
│   │   └── package.json
│   ├── mycastle-watch/             # React Native WebView app (zegarek) → http://192.168.0.207:1894/watch
│   │   ├── App.tsx                 # WebView + back button handler
│   │   ├── app.json                # Expo config
│   │   ├── build.sh                # Build APK w Docker
│   │   └── package.json
│   ├── demo-scene-3d/              # Scene3D demo app
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine
│   │   ├── nginx.conf
│   │   └── package.json
│   ├── cad-backend/                # CAD VFS server (port 1898)
│   │   ├── src/index.ts            # HTTP server: VFS REST API (/api/vfs/*), NodeFS storage, CORS
│   │   ├── data/                   # VFS root: users/{userId}/projects/{name}.cad.json (gitignored)
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── cad-app/                    # CAD 2D/3D editor (port 1897)
│   │   ├── src/
│   │   │   ├── App.tsx             # Tabs: CAD 2D (2D/3D toggle) / Scene 3D; project singleton
│   │   │   ├── main.tsx            # ThemeProvider + ConfigProvider + allotment CSS
│   │   │   ├── bridge/CadToScene.ts # cadProjectToSceneGraph/Json — CAD→Three.js bridge
│   │   │   ├── renderer/           # CadRenderer (ortho+perspective), EntityMeshBuilder
│   │   │   ├── tools/              # 16 narzędzi: Select/Line/Circle/Arc/Rect/Polyline/Move/Copy/Rotate/Offset/Trim/Fillet/Dimension/Box3d/Cylinder3d/Sphere3d + entityTransform.ts + types.ts
│   │   │   ├── components/         # CadCanvas, Toolbar, CommandLine, LayerPanel, StatusBar, PropertiesPanel, FileMenu, ProjectBrowser, DimensionOverlay, Scene3DView
│   │   │   ├── io/CadExporter.ts   # exportJSON/SVG/DXF/OBJ/GLTF, importJSON, loadProjectFromText
│   │   │   ├── vfs/cadProjectApi.ts # fetch client dla cad-backend (listProjects/read/write/delete/rename)
│   │   │   └── hooks/useProject.ts # version counter from EventBus
│   │   ├── vite.config.ts          # Port 1897, proxy /api/vfs→localhost:1898, alias @→src/
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
- **Build specific:** `pnpm build:core`, `pnpm build:core-backend`, `pnpm build:web-client`, `pnpm build:backend`, `pnpm build:web`, `pnpm build:scene3d`, `pnpm build:core-cad`, `pnpm build:cad`
- **Build CAD stack (w kolejności):** `pnpm build:cadall` = `core-cad` → `ui-core` → `core-scene3d` → `ui-components-scene3d` → `cad-backend` → `cad-app`
- **Run MyCastle backend:** `pnpm dev:backend` (port 1894, HTTP + MQTT WebSocket at /mqtt)
- **Run MyCastle frontend:** `pnpm dev:web` (port 1895, Vite HMR)
- **Run scene3d:** `pnpm dev:scene3d` (requires packages built first)
- **Run CAD editor:** `pnpm dev:cad` (port 1897, requires `pnpm build:core-cad` first)
- **Run CAD backend:** `pnpm dev:cad-backend` (port 1898, VFS server for project storage)
- **Run client agent:** `app/client/run.sh` (auto-creates `.venv` i instaluje zależności przy pierwszym uruchomieniu)
- **Test (unit):** `pnpm test` (all packages), `pnpm test:watch`, `pnpm test:coverage`
- **Test (e2e):** `pnpm test:e2e` (Playwright — auto-starts mycastle-backend + mycastle-web)
- **Typecheck:** `pnpm typecheck`
- **Clean:** `pnpm clean`
- **Generate docs:** `pnpm gendocs` (JSON+HTML+Markdown), `pnpm gendocs:html`, `pnpm gendocs:md`
- **Sync data (files):** `pnpm sync:push [--force]` (local→server, wyklucza iot.db + Arduino build/libs), `pnpm sync:pull [--force]` (server→local)
- **Sync data (SQLite):** `pnpm sync:db-push` (local iot.db → server via sqlite3 .backup + scp), `pnpm sync:db-pull` (server iot.db → local)
- **Build APK (mobile):** `docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build.sh`
- **Build APK (watch):** `docker compose -f docker-compose.cli.yml run --rm watch /workspace/app/mycastle-watch/build.sh`
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
