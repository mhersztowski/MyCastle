# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types, datasource, VFS, IoT device building blocks. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel, MinisModuleDefModel, MinisModuleModel, MinisDeviceDefModel (board? field), MinisDeviceModel (isIot field, description?: string, localizationId?: string, **lastBuild?: MinisDeviceBuild**), **MinisDeviceBuild** (platform: string, fqbn?: string, success: boolean, at: number, projectId?: string — zapisywany po każdej kompilacji), MinisLocalizationModel (id, name, type: 'place'|'geo', place?: string, geo?: {lat,lng}|null, device: string), MinisProjectDefModel, **MinisProjectModel** (type, id, name, description, softwarePlatform, moduleId?, boardProfileKey?, **libraries?: MinisProjectLibrary[]**), **MinisProjectLibrary** {name?, version?, url?} — biblioteki deklarowane w projekcie (Arduino/uPython/PicoSDK), UserModel, IotModels (IotDeviceConfig + **extensions?: IotExtensionConfig[]**, **IotExtensionConfig** {type, enabled, options?}, IotEntity, IotEntityType, IotSensorEntity, IotBinarySensorEntity, IotSwitchEntity, IotNumberEntity, IotButtonEntity, IotSelectEntity, TelemetryRecord, TelemetryMetric, TelemetryAggregate, DeviceCommand, AlertRule, Alert, IotDeviceStatus, DeviceShare), AuthModels (AuthTokenPayload, ApiKeyPublic), **SmartDisplayModel** (SmartDisplayViewType: `'clock'|'text'|'metric'|'image'|'random-image'|'weather'`, SmartDisplayView {id, type, label?, text?, subtext?, metricKey?, metricUnit?, metricDevice?, imagePath?, albumShareUrl?, ttsDescription?, weatherLat?, weatherLon?, weatherLocationName?}, SmartDisplayConfig {type:'smart-display-config', cycleDurationMs, views[]}, DEFAULT_SMART_DISPLAY_CONFIG)
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty; metoda `copyBaseStateTo()` do kopiowania UI state przy clone), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode, MinisModuleDefNode, MinisModuleNode, MinisDeviceDefNode, MinisDeviceNode, MinisProjectDefNode, MinisProjectNode, UserNode. Wszystkie nody używają `copyBaseStateTo()` w `clone()` zamiast ręcznego kopiowania pól.
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload. `topics.ts`: Zod-based MQTT topic registry (analogiczny do RPC). MqttTopicDef (pattern, description, direction, payloadSchema, tags), defineMqttTopic(), MqttPayload<T>. mqttTopics registry (telemetry, heartbeat, command, commandAck, status, telemetryLive, alert, sharedTelemetryLive, sharedStatus, **extReq** `minis/{userName}/{deviceName}/ext/{extType}/req` server→device, **extRes** `minis/{userName}/{deviceName}/ext/{extType}/res` device→server), MqttTopicRegistry, MqttTopicName. matchTopic(fullTopic) — dopasowuje topic do wzorca, zwraca def + wyekstrahowane params. Zod schemas = single source of truth for payload validation i type info w MQTT Explorer. **hello payload** zawiera teraz `entities?: IotEntity[]` — urządzenie deklaruje encje przy każdym reconnect; backend persystuje je przez `upsertConfig`
  - `datasource/` — IDataSource interface (w tym kolekcje Minis: minisModuleDefs, minisModules, minisDeviceDefs, minisDevices, minisProjectDefs, minisProjects, users), MemoryDataSource (load* methods per kolekcję), CalendarItem, Calendar
  - `rpc/` — Zod-based RPC system (shared types + method registry). `types.ts`: RpcMethodDef (z fieldMeta?: Record<string, FieldMeta>), AutocompleteSource ('users' | 'userDevices'), FieldMeta (autocomplete?, dependsOn?), defineRpcMethod(), RpcResponse/RpcErrorResponse. `methods.ts`: rpcMethods registry (ping, getDeviceStatuses, sendCommand, getLatestTelemetry), RpcMethodRegistry, RpcMethodName types. fieldMeta na metodach definiuje autocomplete sources i zależności między polami (np. deviceName dependsOn userName). Zod schemas = single source of truth for validation, types, and auto-generated Swagger docs.
  - `vfs/` — Virtual File System abstraction (VS Code-inspired). `types.ts`: FileSystemProvider interface (scheme, capabilities, stat, readDirectory, readFile, writeFile?, delete?, rename?, mkdir?, copy?, watch?, onDidChangeFile), FileType enum, FileChangeType enum, FileStat, DirectoryEntry, WriteFileOptions, DeleteOptions, RenameOptions, CopyOptions, isWritable(). `errors.ts`: VfsError, VfsErrorCode. `paths.ts`: VFS path utilities. Implementacje: MemoryFS (in-memory), CompositeFS (mount multiple providers pod różnymi ścieżkami), GitHubFS (GitHub API), BrowserFS (File System Access API), NodeFS (Node.js fs — backend only), RemoteFS (REST proxy do server-side VFS), **MqttFS** (tunneluje operacje VFS przez MQTT request-response; konstruktor: {reqTopic, timeoutMs?}; `handleResponse(response)` wywoływane gdy urządzenie odpowiada; pending Map z UUID correlation IDs; `dispose()` odrzuca wszystkie oczekujące Promises), **WritableGitHubFS** (extends GitHubFS, scheme=`github-writable`; buforuje zmiany lokalnie w `pending: Map<path, Uint8Array|null>` — null = pending delete; `commit(message)` pushuje wszystko jako jeden Git commit przez Trees API; `hasPendingChanges()`, `pendingCount()`, `getPendingEntries()`, `discardPending()`, `getBaseContent(path)` — omija pending buffer). `utils.ts`: encodeText/decodeText (UTF-8 Uint8Array ↔ string).
  - `iot/` — **Device-side IoT building blocks** (framework-agnostic, używane przez urządzenia implementujące rozszerzenia). `device/IotDeviceExtension.ts`: interfejs `{ type: string; handleRequest(payload): void|Promise<void> }`. `device/IotDeviceVfsExtension.ts`: implementacja VFS extension — konstruktor `{ provider: FileSystemProvider, publishFn, resTopic }`, waliduje payload przez Zod, dispatchuje wszystkie operacje VFS (stat/readdir/readfile/writefile/delete/rename/mkdir), base64 encode/decode (btoa/atob — browser-compatible). `device/IotDeviceClient.ts`: framework-agnostic MQTT router — konstruktor `{ topicPrefix, publishFn }`, `addExtension(ext)` / `removeExtension(type)`, `handleMessage(subTopic, rawPayload)` — routuje `ext/{type}/req` wiadomości do zarejestrowanych extensions.
  - `mjd/` — Meta JSON Definition system. `types.ts`: MjdFieldType ('string'|'number'|'boolean'|'date'|'enum'|'array'), MjdViewType ('form'), MjdFieldDef (name, type, tags, label, description, defaultValue, required, options, itemType), MjdViewDef (name, type, tag), MjdDocument (version, tags, fields, views). `helpers.ts`: createMjdDocument(), createMjdField(), createMjdView(), getFieldsForView(). `jsonSchema.ts`: generateJsonSchema(doc) — konwertuje MjdDocument na JSON Schema draft-07 (typy, required, enum, array z itemType).
  - `browser/` — **Przeglądarkowe moduły vanilla JS** (BEZ TypeScriptu, BEZ builda, BEZ import/export — klasy eksportowane przez `globalThis`). Używane w Plugin Script, komponentach Lit, skryptach automatyzacji, stronach HTML z `<script type="module">`. Każda klasa ma metody instancji ORAZ statyczne odpowiedniki (`Class.foo(self, …)`) — dla autocomplete w edytorze. Podkatalogi:
    - `mycastle/mycastle.js` — bundel PIM: NodeBase + PersonNode/TaskNode/EventNode/ProjectNode + klienty API (ApiClient, ApiPerson, ApiTask, ApiProject, ApiEvent). ApiClient to cienki klient VFS REST (`/api/users/{u}/vfs/...`, nagłówek `Authorization: Bearer`). Metodyka: `list()`, `get(id)`, `create(model)`, `update(id, patch)`, `remove(id)`. ApiEvent per-dzień: `listByDate()`, `add(date, model)`, `remove(date, pred)`. Generowany ze źródeł `mycastle/` przez `_build.mjs`.
    - `qt/qobject.module.js` — rdzeń systemu obiektowego Qt: **Signal** (connect/emit/block/disconnectAll, STATIC-FIRST), **SignalConnection** (uchwyt `disconnect()`), **QObject** (drzewo rodzic-dziecko `_qparent/_qchildren`, `objectName/setObjectName`, `property/setProperty`, `blockSignals`, `destroyed` signal, `findChild/findChildren/traverse/path`, statyczne `QObject.className(o)`, `QObject.inherits(o, cls)`, `QObject.serialize/deserialize` — JSON round-trip). Bez zewnętrznych zależności. Ustawia globale na `globalThis` (bez `export`) — kompatybilny z AsyncFunction/eval.
    - `qt/qt.module.js` — biblioteka widgetów Qt rysowanych na canvasie (Lit `<qt-canvas>`): **typy geometryczne** (QPoint/QPointF, QSize/QSizeF, QRect/QRectF, QMargins, QLine, QPolygon), **kolor** (QColor `fromRgb/fromHsv/fromHsl/fromString/blend/lighter/darker`), **gradienty** (QLinearGradient, QRadialGradient), **czcionki** (QFont, QFontMetrics), **rysowanie** (QPainter: drawRect/RoundedRect/Ellipse/Arc/Pie/Line/Polyline/Polygon/Path/Text/Image; QPen, QBrush, QPainterPath), **enumy Qt** (Qt.AlignCenter, Qt.Horizontal, Qt.Key_*, Qt.DashLine, kursory, kolory statyczne). **Widgety**: QLabel, QFrame, QPushButton/QToolButton, QCheckBox/QRadioButton, QSlider/QScrollBar/QDial, QProgressBar, QSpinBox/QDoubleSpinBox, QLineEdit, QTextEdit, QGroupBox, QComboBox, QListWidget, QStackedWidget/QTabBar/QTabWidget, QScrollArea, QMenu/QAction, QToolTip, **QInkCanvas** (rysunek odręczny + pressure/tilt dla QTabletEvent). **Layouty**: QVBoxLayout, QHBoxLayout, QGridLayout, QFormLayout. **Host**: QtCanvas (`<qt-canvas>`) — pętla rAF, Pointer Events (mysz/pióro/dotyk z bąbelkowaniem), focus, popupy, tooltipy. Dociąga qobject.module.js dynamicznie (dla efektów ubocznych), Lit z CDN lub `globalThis.Lit`.
    - `qt/example.module.js` — demo widgetów (3 zakładki: Widgety/Pióro/Mobile). `qt/automate-example.md` — przykłady użycia w skryptach automatyzacji.
    - `scene3d/scene3d.js` — bundel geometrii 3D: **Vec3** (static-first: add/sub/scale/cross/dot/normalize/lerp/equals), **Box3** (AABB: expandByPoint/union/containsPoint/intersectsBox/center/size), geometrie **BoxGeometry/SphereGeometry/PlaneGeometry/CircleGeometry/CylinderGeometry/ConeGeometry/TorusGeometry** (generują vertices/normals/uvs/indices + `volume()`/`surfaceArea()`/`boundingBox()`), **MeshBuilder** (łączy geometrie), fasada **Geometry** (factory). Generowany ze źródeł `scene3d/` przez `_build.mjs`.
    - `scene3d/_build.mjs` — skrypt budujący bundel: skleja źródłowe pliki JS w jeden plik ze wspólnym nagłówkiem bez import/export.
- **@mhersztowski/web-client** (`packages/web-client/`) — reusable React client for MyCastle backend. Dual ESM+CJS build (tsup). React as peerDependency. **UWAGA:** Monaco editor, VFS UI components, pluginy edytora i workspace przeniesione do `@mhersztowski/texteditor`. web-client skupia się na mqtt, filesystem i utils.
  - `mqtt/` — MqttClient (MQTT over WebSocket, request-response, file ops; **size-aware transport**: MQTT dla <2MB, HTTP dla większych plików; **userBasePath** tenant isolation — `setUserBasePath(path)` prefixuje wszystkie operacje; path normalization Windows↔Unix), MqttContext/MqttProvider, useMqtt hook
  - `filesystem/` — FilesystemService (dir tree, batch file loading, calendar, DataSource), FilesystemContext/FilesystemProvider, useFilesystem hook
  - `filesystem/data/` — DirData, FileData, CalendarItem (extends core), Calendar, DataSource (re-export of MemoryDataSource)
  - `filesystem/components/` — DirComponent, FileComponent, FileJsonComponent, FileMarkdownComponent
  - `utils/` — configureUrls(), getHttpUrl(), getMqttUrl() (auto-detect from window.location, configurable)
  - `typedoc/` — TypeDocViewer component (renders TypeDoc JSON output as interactive documentation)
  - `mjd/` — MJD editor React components. **MjdDefEditor** (props: value: MjdDocument, onChange) — edytor definicji. **MjdDataEditor** (props: definition, value, onChange) — edytor danych wg schematu MJD. **MjdVfsLoader** (props: provider, mjdPath, dataPath?, height?) — composite z auto-save.
- **@mhersztowski/texteditor** (`packages/texteditor/`) — **Monaco multi-editor workspace z pełnym zestawem pluginów** (wyekstrahowany z web-client). Dual ESM+CJS + CSS. Peer deps: React, MUI, Monaco, XTerm, @xyflow/react, blockly.
  - `workspace/` — **`TextEditorWorkspace`** (główny reusable wrapper: MonacoMultiEditor + plugin setup + optional AI agent + optional terminal + optional project actions; props: `provider: FileSystemProvider`, `enableAgent?: boolean`, `enableTerminal?: boolean`, `projectDeps?: ProjectDeps`, `onDialogAction?`, `agentAuthToken?`, `terminalTokenStorageKey?`, `defaultAgentConfig?`, `extraPlugins?`, `agentClaudeMd?`, `terminalServerName?`, `terminalApiKeysUrl?`, `providerRegistry?`, `defaultMountPresets?`); **`SubpathFS`** (VFS adapter — wraps provider, prefixuje wszystkie ścieżki bazową, np. `/users/alice/workspace` → dzięki temu consumer widzi `/` jako root); **`RemoteTerminalConfigDialog`** (dialog API key dla remote terminal — `open`, `currentToken`, `serverName`, `apiKeysUrl?`, `onSave`, `onClose`)
  - `monaco/` — MonacoMultiEditor (VS Code-like: Activity Bar + Sidebar + tabbed editor + Menu Bar + Status Bar), EditorInstance, ModelManager, plugin system (EventBus, PluginRegistry, UIRegistry, PluginCommandRegistry, PluginAPI, defineEditorPlugin()), AgentEngine (run/abort/loadHistory)
  - `vfs/` — VfsExplorer (tree browser z context menu, OS drag-and-drop plików i katalogów), VfsBreadcrumbs, VfsMountManager, VfsCommitDialog, useVfsTree, vfsMountPresets, providerRegistry, VfsProjectContext, VfsExplorerProps (projectDeps, onExecuteAction, onDialogAction, onProjectContext, revealPathsRef)
  - `vfs/project/` — Project (base class: getActions, execute, apiPost, apiGetSSE, deriveSketchName), ArduinoProject, NodeJsProject, PicoSdkProject, PygameProject, UPythonProject, NotesProject, PythonProject, EditorProject; typy: ProjectAction, ProjectDeps, OutputLine, classifyLine()
  - `plugins/` — builtin pluginy: **TypeScriptIntelliSensePlugin**, **PythonIntelliSensePlugin**, **CppIntelliSensePlugin**, **FoldingPlugin**, **MarkdownLspPlugin**, **MarkdownLspServerPlugin**, **MarkdownPreviewPlugin** (sidebar live preview remark→rehype→KaTeX), **MjdEditorPlugin**, **SnippetsPlugin**, **VisualMinisLibPlugin** (ReactFlow Signal-Slot graf dla @mhersztowski/minislib)
  - `workspace/` — **`ArduinoBoardConfigDialog`** (ESP32-S3 board config: USB CDC, Flash, CPU, Partition → custom FQBN)
- **@mhersztowski/web-cpp** (`packages/web-cpp/`) — **Browser-side C++/WASM runtime simulator** dla Emscripten MODULARIZE=1 + ASYNCIFY projektów. Dual ESM+CJS. Peer deps: React 18+, MUI 5+.
  - Eksportuje **`CppWasmRuntime`** (props: `open`, `onClose`, `title`, `buildSseUrl`, `wasmJsUrl`, `token?`) — dialog z: Build WASM (SSE streaming build log), Run (ładuje sketch.js przez `new Function`, inicjalizuje Emscripten module z callbacks: `onSerialOutput/onPinMode/onDigitalWrite/onDigitalRead/onAnalogWrite/onAnalogRead/print/printErr`), Stop, Reset; **pin visualizer** (14 digital + 6 analog pins — toggle digital klikiem, slider analogowy), **serial monitor** (appendSerial z bufferowaniem do `\n`, MAX_SERIAL_LINES=500), **serial input** (push do WASM przez `_arduino_serial_push`); po kliknięciu Run automatycznie przełącza z Build Log na Serial Monitor
- **@mhersztowski/core-backend** (`packages/core-backend/`) — współdzielone moduły backendowe wyekstrahowane z mycastle-backend. ESM-only build (tsup).
  - `filesystem/` — FileSystem (in-memory cache, EventEmitter fileChanged, atomic writes, per-file locking, deleteDirectory)
  - `httpserver/` — HttpUploadServer (CORS, POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook). Klasa rozszerzalna: protected server, fileSystem, setCorsHeaders, handleRequest, sendJsonResponse — umożliwia subclassing (np. MinisHttpServer, MycastleHttpServer). **Fix**: `GET /files/{path}` teraz automatycznie stripuje prefix `data/` z path przed wywołaniem `readBinaryFile` — pozwala klientom przekazywać ścieżki z prefixem `data/public/...`
  - `mqttserver/` — MqttServer (Aedes, publishMessage(), onMessage(handler) for custom topic routing, setAuthenticate(callback) for MQTT auth), MqttMessageHandler type, Client, Packet classes per type
  - `auth/` — JwtService (sign/verify JWT, jsonwebtoken, **domyślne TTL = 7 dni** / 604800s), PasswordService (bcrypt hash/verify, isBcrypt detection), ApiKeyService (CRUD kluczy API z prefix `minis_`, SHA-256 hash, per-user, dane w JSON file), checkAuth() middleware (Bearer token: JWT lub API key → AuthTokenPayload | null)
  - `datasource/` — DataSource (in-memory store, auto-reload z FileSystem events)
  - `rpc/` — **RpcRouter**. `RpcRouter`: register/dispatch/getRegisteredMethods. `RpcContext` z `user?: AuthTokenPayload`. Używany przez mycastle-backend.
  - `interfaces.ts` — IAutomateService, IDataSource (dependency inversion — backend-specific modules implementują te interfejsy)
- **@mhersztowski/devtools** (`packages/devtools/`) — **toolkit kod źródłowy ⇄ UML** (Node.js, ESM-only build tsup). Parsuje **C/C++/Python/JS/TS** do wspólnego IR (`CodeModel`), generuje z niego **projekty UML** w formacie edytora (`*.umlproj.json`), liczy **diff** kolejnych wersji do **historii git-like** projektu, oraz robi round-trip **UML → szkielety kodu**. Ściśle współpracuje z edytorem UML (ten sam format projektu v2).
  - **Parsery (najlepsze biblioteki):** `typescript` Compiler API dla TS/JS (semantyczny, bez natywnych zależności); **`web-tree-sitter` + `tree-sitter-wasms`** (prebuilt gramatyki WASM, bez node-gyp) dla Python/C/C++. Gramatyki ładowane leniwie i odpornie — ścieżka TS działa nawet bez WASM. Detekcja języka po rozszerzeniu (`detectLanguage`).
  - `model/` — **`CodeModel`** (IR: `CodeSymbol` {id, kind `class|interface|enum|struct`, name, file, language, isAbstract, members, extends[], implements[]}, **`CodeMember`** {id, kind `field|method`, name, visibility `public|private|protected|package`, type?, params?, isStatic?, isAbstract?, text}, **`CodeRelation`** {fromId, toId, type `generalization|realization|association|composition|dependency`}). `ids.ts` — **deterministyczne id** (djb2→base36): re-parse daje te same id, więc UML zachowuje tożsamość węzłów (manual layout przeżywa re-sync) a diff dopasowuje składowe między wersjami. `render.ts` — `renderMember()` (struktura→linia UML np. `+ getId(): string`) + `parseMemberText()` (odwrotnie). `resolve.ts` — `resolveRelations()` buduje relacje: extends→generalization, implements→realization, typy pól wskazujące znaną klasę→association; `extractTypeNames()` zdejmuje generyki/tablice/wskaźniki.
  - `parsers/` — `TsParser` (klasy/interfejsy/enumy, modyfikatory widoczności, abstract/static, heritage clauses, parametry konstruktora jako pola), `PythonParser` (klasy, metody, pola z przypisań klasowych i `self.x =` w `__init__`, widoczność wg `_`/`__`, bazy→extends), `CppParser` (C: struct→klasa z polami; C++: class/struct z sekcjami access, polami, metodami, base_clause→extends; domyślna widoczność class=private/struct=public), `treeSitter.ts` (loader WASM: `parseTree`, `isGrammarAvailable`, `collect`), `index.ts` (`buildModel(files[])` → CodeModel z relacjami, `parseSource`).
  - `uml/` — **`umlTypes.ts`** (lustro formatu v2 edytora: UmlProject/UmlDiagram/UmlNode/UmlEdge/UmlMember/UmlHistory). **`generateUml.ts`**: `modelToDiagram()` (z layoutem + zachowaniem pozycji), `generateProject()` (świeży projekt z commitem startowym), `commitProject()` (dokłada commit na bieżącej gałęzi). **`layout.ts`**: `layoutSymbols()` — grid świadomy dziedziczenia (klasy bazowe wyżej), `handlesFor()` dobiera uchwyty krawędzi wg geometrii. **`diffModel.ts`**: `diffDiagrams()` → `ModelChange[]` (`added|removed|modified` × `class|field|method|relation`), `summarizeChanges()` (`+2 ~3 -1`), `describeChanges()`. **`umlToModel.ts`**: `diagramToModel()` — rekonstruuje CodeModel z (ręcznie edytowanego) diagramu dla generacji kodu.
  - `codegen/` — `generateCode(model, language)` → szkielety źródeł: `tsCodegen` (TS klasy/interfejsy/enumy), `pyCodegen` (Python, widoczność przez `_`/`__`, pola w `__init__`), `cppCodegen` (nagłówki C++ z sekcjami widoczności).
  - **`UmlSyncService`** — orkiestrator: `scanDirectory()`/`parseDirectory()` (rekurencyjny skan, ignoruje node_modules/dist/.git itd.), `generateProjectFromDir()` (świeży projekt UML, `linkedPath`=katalog), `updateProjectFromDir()`/`applyModel()` (re-parse → odśwież diagram zachowując layout → diff vs poprzednia wersja → **commit z podsumowaniem zmian** na bieżącej gałęzi), `toSourceFiles()`/`writeSourceFiles()` (UML→kod, domyślnie nie nadpisuje istniejących). **Status:** parsowanie wszystkich 5 języków, generacja UML + layout, diff/historia, codegen TS/Python/C++ — działają (4 testy + weryfikacja WASM). Roadmap: nieniszczące edytowanie kodu in-place (zachowanie ciał/formatowania), merge gałęzi.
  - `git/GitRepoService.ts` — cienki wrapper na CLI `git` (przez `child_process.execFile`) do obsługi katalogów-clone'ów repozytoriów. **Typy**: `RepoJson` {type:'git-repo', version, url, branch?, tag?, remote?, token?, lastSync?} — zawartość pliku `.repo.json`; `GitRef` {branch|null, tag|null, commit}; `GitStatus extends GitRef` {ahead, behind, dirty}; `GitInfo` {isRepo, url, branches, remoteBranches, tags, status}; `GitCommandResult` {ok, stdout, stderr}. **Klasa `GitRepoService`**: `isRepo(dir)` — sprawdza czy katalog ma własny `.git` (nie rodzica); `remoteUrl/setRemoteUrl`; `listBranches/listRemoteBranches/listTags`; `currentRef(dir)` — odporny na UNBORN HEAD (repo bez commitów); `status(dir)` — ahead/behind/dirty; `info(dir)` → `GitInfo`; `checkout(dir, ref, opts)` — dla zdalnego brancha tworzy lokalny tracking; `pull/push` — przez `withToken()` (tymczasowo wstrzykuje token do remote URL, potem przywraca); `cloneInto(dir, url, opts)` — inicjalizuje istniejący katalog (git init + remote + fetch + checkout); `clone(url, dir, opts)` — do nowego katalogu. **Helpery eksportowane**: `parseRepoJson(text): RepoJson`, `stringifyRepoJson(repo): string`.
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
  - `editors/RichEditor/` — pełny edytor 3D: Allotment 3-pane (SceneTree 220px | Viewport | Properties 260px), menu bar (File: Open/Save/Export OBJ+STL+GLTF), toolbar (Move/Rotate/Scale + Grid), SimpleViewer z gizmo, file I/O JSON scene. Integruje teraz **AnimationPanel** i **PrefabsPanel**. `RichEditor` przyjmuje `initialSceneData?: string` — SceneDeserializer.deserialize() przy init. **`fitSceneRef`**: merged ref pattern. **`onSceneChange`**: wywoływany w `bump()` i na mount.
  - `panels/SceneTreePanel/` — drzewo hierarchii (expand/collapse, inline rename dblclick, drag&drop reorder, context menu, visibility toggle)
  - `panels/PropertiesPanel/` — inspector: transform (Vector3Row per axis, X=red/Y=green/Z=blue, **decoupled inputs** — pokazuje wpisywaną wartość podczas edycji, rounded przy blur), material (color picker + opacity + wireframe), light (type readonly, color, intensity), **Geometry Nodes support** (nowy geometry type 'nodes' — procedural geometry editor)
  - `panels/AnimationPanel/` — **timeline editor z keyframing**: playback controls (Play/Pause/Stop, Loop, Recording mode), tracks dla position/rotation/scale/material/light, keyframe drag-drop na timeline, easing types (linear/ease-in/ease-out/ease-in-out/step), long-press context menu (stylus/touch), 36px transparent hit boxes na keyframy. Props: `clip: AnimationClip|null`, `currentTime`, `isPlaying/isRecording/loop`, `sceneGraph?`, `onClipChange`, `onTimeChange`, `onPlayPause/Stop/LoopToggle/RecordToggle`
  - `panels/PrefabsPanel/` — manager prefabów: **`currentProject`** (bieżący projekt — editable: rename/delete), **`otherProjectsPrefabs: ProjectPrefabGroup[]`** (prefaby z innych projektów — read-only); type icons (mesh=cyan/light=yellow/camera=purple/audio=teal/group=blue); Instantiate/Rename/Delete per prefab
  - `toolbar/Toolbar/` — MUI IconButton items + separators
  - `viewers/RichViewer/` — demo viewer z Reset/ZoomIn/ZoomOut/Fullscreen
  - `components/` — Button, Input, Dialog
  - `icons/` — Cube, Sphere, Light, Camera, Folder, Move, Rotate, Scale, Grid icons (MUI wrappers)
- **@mhersztowski/minislib** (`packages/minislib/`) — **Qt-inspired object system** dla TypeScript/Node.js. Dual ESM+CJS build (tsup). Publikowany do **GitHub Packages** (`https://npm.pkg.github.com`). Klasy: `Signal<T>` (type-safe Qt-style sygnały — `connect/emit/blockSignals/disconnectAll`), `Connection` (handle disconnect), `MObject` (base class: parent/child tree, tracked connections, `destroy()`), `MProperty<T>` (observable property z `changed` signal), `MTimer` (interval/singleShot, integracja z MObject lifecycle), `MEventBus` (pub/sub przez topic string, `global()` singleton), `MStateMachine` + `MState` (FSM z guardami i akcjami), `MCommand` / `MFnCommand` / `MCommandStack` (undo/redo), `MListModel<T>` (observable list — rowsInserted/Removed/Moved/dataChanged/modelReset), `MLogger` (kategoryzowany logger z `root()` singletonem). Funkcje utility: `debounce`, `throttle`, `promiseToSignals`, `connectOnce`. **GitHub Packages**: `publishConfig.registry = https://npm.pkg.github.com`, `publishConfig.access = public`, workflow `.github/workflows/publish-minislib.yml` (trigger: tag `minislib-v*`, publikacja przez PAT). Konsumenci zewnętrzni: `.npmrc` z `@mhersztowski:registry=https://npm.pkg.github.com` + `_authToken=${GITHUB_TOKEN}`. W monorepo używaj `"workspace:*"`.
- **@mhersztowski/core-cad** (`packages/core-cad/`) — **CAD 2D/3D core engine** (bez renderingu, bez React, bez Three.js). Dual ESM+CJS build (tsup). Brak zewnętrznych zależności (tylko crypto.randomUUID).
  - `types.ts` — `Point2D`, `Point3D`, `BoundingBox2D`, `EntityType` (`'line'|'circle'|'polyline'|'rect'|'arc'|'ellipse'|'point'|'text'|'image'|'dimension'|'box3d'|'cylinder3d'|'sphere3d'|'freehand'`), `SnapMode` (`'grid'|'endpoint'|'midpoint'|'center'|'nearest'|'intersection'|'perpendicular'|'tangent'`), `LineType` (`'solid'|'dashed'|'dotted'|'dashdot'`), `Units` (`'mm'|'cm'|'m'|'in'`), `ViewMode` (`'2d'|'3d'`)
  - `entity/` — **EntityBase** {id, type, layerId, color (`string|'bylayer'`), lineType, lineWidth, visible, locked, extrudeHeight (0=flat, >0=ekstruzja 3D), boundingBox}; typy: **LineEntity** {x1,y1,x2,y2}, **CircleEntity** {cx,cy,radius}, **PolylineEntity** {points: Point2D[], closed}, **RectEntity** {x,y,width,height}, **ArcEntity** {cx,cy,radius,startAngle,endAngle}, **TextEntity** {x,y,content,fontSize,fontFamily,angle}, **ImageEntity** {x,y,width,height,src (data URL lub URL)}, **FreehandEntity** {points: Point2D[], strokeWidth, smooth}, oraz DimensionEntity i prymitywy 3D (Box3d/Cylinder3d/Sphere3d); **EntityRegistry** (Map<id,Entity>; add/addWithId/remove/update/get/getAll/getByLayer/getByType/getInBoundingBox; update automatycznie przelicza boundingBox przez computeBoundingBox); **computeBoundingBox(entity)** — per typ geometrii (text: szacowany z długości treści × fontSize, freehand: bounds punktów)
  - `layer/` — **Layer** {id, name, color, lineType, lineWidth, visible, locked}; DEFAULT_LAYER id='0'; **LayerSystem** (Map<id,Layer>; add/addWithId/remove/update; getActive/setActive/getActiveId/getAll; toData/fromData; nie można usunąć domyślnej warstwy)
  - `history/` — **HistoryManager** (bounded stack, maxSize=100; **Operation** {type, description, undo(), redo()}; push/undo/redo/canUndo/canRedo/clear; getDescription() → {undoLabel?, redoLabel?})
  - `selection/` — **SelectionManager** (Set of string ids; select(id, multi?)/deselect/toggle/selectAll/clear/getSelected/isSelected/count; **selectInBox(BoundingBox2D)** — pobiera encje z EntityRegistry)
  - `snap/` — **SnapEngine** (configurable Set of SnapMode; gridSize default 10; snap(cursor, entities, pixelToWorld?) → **SnapResult** {point, mode, entityId?}; threshold=12px scaled by pixelToWorld; getEndpoints/getMidpoints/getCenter per entity type)
  - `events/` — **EventBus** (Map of CadEventType → Set of Handler; on/off/emit/clear; zwraca unsubscribe fn); **CadEventType**: `'entity:added|updated|removed'`, `'layer:added|updated|removed'`, `'selection:changed'`, `'history:changed'`, `'project:loaded'`, `'viewmode:changed'`
  - `project/` — **Project** (fasada; tworzy i łączy wszystkie subsystemy; addEntity/removeEntity/updateEntity → przez history; removeSelected(); undo/redo → EventBus emit; setViewMode; toJSON/fromJSON → ProjectData {version, settings, layers, entities}; reset()); **ProjectSettings** {name, units, gridSize, precision}

### Aplikacja backend (`app/mycastle-backend/`)

- Node.js, ESM (`"type": "module"`), build z tsup, dev z tsx watch. **`src/index.ts`**: `dotenv.config({ path: resolve(__dirname, '..', '.env') })` — ładuje .env z root projektu; `__dirname` via `fileURLToPath(import.meta.url)` (wymagane w ESM)
- Port: 1894 (HTTP + MQTT WebSocket at `/mqtt` + Terminal WebSocket at `/ws/terminal` — shared mode). Opcjonalnie MQTT na osobnym porcie via `MQTT_PORT`
- **App singleton** (`src/App.ts`): `App.create(config)` → `App.instance.init()` → `App.instance.shutdown()`. Trzyma referencje do wszystkich modułów: fileSystem, ocrService, dataSource, automateService, schedulerService, httpServer, iotService, arduinoService, **arduinoWasmBuilder** (null gdy brak `ARDUINO_WASM_DOCKER_IMAGE`), **upythonService**, **picoSdkService** (null gdy brak `PICOSDK_DOCKER_IMAGE`), **pluginService** (web), **backendPluginService**, **secretsService**, _mqttServer (lazy), _lspProxyService (lazy), jwtService, apiKeyService, terminalService, **gitService**. Seeduje domyślnego admina (admin/admin) przy pierwszym uruchomieniu. `init()` woła `backendPluginService.loadAllUsers()` po starcie HTTP; `shutdown()` woła `backendPluginService.shutdownAll()`.
- Nowe moduły: **ArduinoWasmBuilder** (`src/modules/arduino-wasm/`) — kompiluje C++ do WASM przez emsdk Docker (`docker run --rm`), SSE streaming output; env: `ARDUINO_WASM_DOCKER_IMAGE`. **SecretsService** — zarządzanie sekretami użytkownika (API keys, credentials) szyfrowane na dysku. **LspProxyService** (lazy) — proxy dla Language Server Protocol (IDE IntelliSense support przez WebSocket).
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
    - **picosdk** — Pico SDK (C/C++) build service: **`PicoSdkBuild`** (uruchamia `docker run --rm` z volume mount; `buildScript()` generuje bash: `rm CMakeCache.txt` → `cmake -DPICO_BOARD= -DPICO_PLATFORM= -DCMAKE_ASM_COMPILER=` → `make -j$(nproc)` → kopiuje `*.uf2` do `output.uf2`; streaming output przez `onData` callback; incremental build dir per `{sketchName}-{boardKey}`), **`PicoSdkService`** (orchestrator; `buildProject(userName, projectId, sketchName, boardKey, onData?)`, `uf2Path(...)` → ścieżka do `output.uf2`), **`boards.ts`** (PICO_BOARDS: `pico`/`pico_w` = RP2040, `pico2`/`pico2_w` = RP2350-arm-s; DEFAULT_PICO_BOARD = `'pico2'`). Env: `PICOSDK_DOCKER_IMAGE`. REST: `POST /api/users/{u}/project-upython/{p}/build-pico` (+ `GET` z SSE streaming output) — przyjmuje `{sketchName, boardKey}`; `GET /api/users/{u}/project-upython/{p}/uf2/{sketchName}?board=` (download UF2).
    - **git** — `GitService` (`src/modules/git/GitService.ts`): backendowa warstwa nad `GitRepoService` z `@mhersztowski/devtools`. Resolwuje ścieżki `.repo.json` względem drive użytkownika (`data/Minis/Users/{userName}/drive/`) z ochroną przed path traversal. Dla pliku `{nazwa}.repo.json` repo klonowane jest do podkatalogu `{nazwa}` (pozwala trzymać kilka repo w jednym katalogu). Operacje: `info(user, relPath)` → `{repo: RepoJson (token zredagowany do '***'), git: GitInfo}`, `save(user, relPath, patch)` — zapisuje URL/remote/branch/token do `.repo.json` (jeśli repo istnieje i URL się zmienił — aktualizuje też remote), `clone`, `pull`, `push`, `checkout`. REST API (auth: właściciel lub admin): `GET /api/users/{u}/git/info?path=<rel .repo.json>`, `POST /api/users/{u}/git/save` {path, url?, remote?, branch?, token?}, `POST .../git/clone` {path}, `POST .../git/pull` {path}, `POST .../git/push` {path}, `POST .../git/checkout` {path, ref, type: 'branch'|'tag'}.
    - **rpc** — handlers.ts (registerHandlers z deps: iotService, fileSystem). Importuje RpcRouter z `@mhersztowski/core-backend`
    - **nodejs** — `handleNodejsRun`: `GET /api/users/{u}/nodejs/run?subpath=&script=` (SSE streaming). Przyjmuje `subpath` relatywny do `data/Minis/Users/{userName}/` i `script` (install/build/dev/start/test). Sprawdza istnienie katalogu (brak → 404, zapobiega mylącemu `spawn ENOENT`). Uruchamia `npm install` / `npm run {script}` przez `spawn('npm', args, { cwd, shell: true })`. Streaming stdout/stderr przez SSE events `output` + `done`. Przerywanie przez `req.on('close', () => proc.kill())`.
    - **plugins** — system pluginów (web + backend).
      - **`PluginService(rootDir)`** (web): ładuje i buduje pluginy web użytkownika z `data/Minis/Users/{userName}/app/web/{pluginId}/`. `PluginManifest` {id, name, version, description?, main, contributes?: {pages?, menuItems?, scripts?}, externals?}. `listPlugins(userName)` — skanuje katalog, czyta każdy `plugin.json`. `buildPlugin(userName, pluginId)` — bundluje entry przez **esbuild** do CJS (`format:'cjs'`, `platform:'browser'`, `loader: {'.ts':'tsx'}`, JSX automatic); `SHIM_EXTERNALS` (react, react-dom, @mhersztowski/web-client, @mui/*, @emotion/*) NIE są bundlowane — dostarcza je require-shim frontendu; cache wg `mtime` pliku entry. REST: `GET /api/users/{u}/plugins` (lista manifestów), `GET /api/users/{u}/plugins/{pluginId}/bundle.js` (zbudowany CJS) — auth: właściciel lub admin.
      - **`BackendPluginService(rootDir)`** + `PluginStorage` + `backendPluginTypes.ts`: ładuje i uruchamia **pluginy backendowe** użytkownika z `data/Minis/Users/{userName}/app/backend/{pluginId}/` (manifest `plugin.json` + entry `.ts`). `loadAllUsers()` skanuje wszystkich userów z `Users.json`; `loadPlugin(user, pluginId)` bundluje entry przez **esbuild** (`format:'esm'`, `platform:'node'`, `target:'node20'`), importuje **in-process przez `data:` URL** (naturalny cache-bust), woła `activate(api)` → opcjonalny `deactivate`. `reloadPlugin()`, `unloadPlugin()`, `shutdownAll()`. **`IBackendPluginAPI`** wstrzykiwane do `activate`: `registerRoute(route)` (`PluginRoute` {method, path, public?, handler}), `storage` (`PluginStorage` — JSON `.storage.json` per plugin, serializowane zapisy; np. refresh tokeny OAuth), `config.get(key)` (czyta `config.json` pluginu → fallback `process.env`), `logger`. **basePath / przyjazne URL-e**: manifest może zadeklarować `basePath` (pojedynczy segment `[A-Za-z0-9_-]+`) — trasy są wtedy serwowane pod **`/api/users/{owner}/{basePath}{route.path}`**. `basePath` domyślnie = id pluginu (nazwa katalogu). Gdy jest pusty/niepoprawny, koliduje z zarezerwowanym segmentem core API (`RESERVED_BASE_PATHS`) lub jest już zajęty przez innego pluginu tego usera → loader cofa się do kolizjoodpornego prefiksu `plugin/{pluginId}`. `MycastleHttpServer.tryBackendPlugin()` dopasowuje `rest` (ścieżkę po `/api/users/{owner}/`) przez `BackendPluginService.matchRoute()` i dispatchuje dwukrotnie — przed auth (tylko trasy `public:true`, np. callback OAuth) i po auth (pozostałe, z kontrolą właściciela); ścieżka nienależąca do żadnego pluginu → `false` (przejmuje routing core). `PluginRequestContext` {req, res, method, query, body, user, ownerUserName, json(), text(), redirect()}. REST zarządzania: `GET /api/users/{u}/backend-plugins` (loaded — z `basePath` i trasami — + available), `POST /api/users/{u}/backend-plugins/{pluginId}/reload`.
- **MycastleHttpServer** — dodatkowe endpointy admin: `POST /api/admin/docs/generate` (uruchamia `pnpm gendocs`, kopiuje `docs-site/docs.json` → `public/docs.json`), `POST /api/admin/screenshots/generate` (uruchamia Playwright → screenshoty PNG, następnie dla każdego PNG wywołuje **Claude Vision API** (`claude-opus-4-5`) z prośbą o identyfikację elementów UI; generuje `public/screenshots/docs.json` z callouts `{n, x, y, label, description}`). Wymaga `ANTHROPIC_API_KEY` w środowisku — bez niego screenshots są generowane ale bez opisu AI.
- `src/swagger.ts` — OpenAPI 3.0.3 spec (auto-generated z Zod via buildSwaggerSpec)

### Aplikacja frontend (`app/mycastle-web/`)
- React 18 + TypeScript, Vite 5, Material UI 5, Monaco Editor, Blockly, xterm.js, esptool-js, mqtt — **ujednolicony frontend** łączący MyCastle PIM i Minis w jednej aplikacji
- Dev port: 1895 (Vite HMR), proxy `/api` → `localhost:1894`, `/mqtt` → `ws://localhost:1894`, `/ws/terminal` → `ws://localhost:1894`
- **PWA**: VitePWA plugin (vite-plugin-pwa), precache CSS/HTML/icons, Monaco workers wykluczone z precache, navigateFallback `/index.html`. **JS bundles: `NetworkFirst`** (zmienione z `StaleWhileRevalidate`) — nowe buildy są pobierane natychmiast zamiast serwowania z cache
- **Path aliases**: `@` → `src/`, `@modules` → `src/modules/`, `@components` → `src/components/`, `@pages` → `src/pages/`
- **App singleton** (`src/App.ts`): `App.create()` → `App.instance`. Tworzony w `main.tsx` przed renderem React.
- **AppRoot** (`src/AppRoot.tsx`): unified routing. `RequireAuth` guard (redirectuje do `/` gdy brak currentUser). `AdminOnly` guard (redirectuje do `/user/:userName/main` gdy nie admin lub impersonating). `PageHooksRunner` uruchamia usePageHooks().
- **Provider tree** (`main.tsx`): `DisplayProvider` → `BrowserRouter` → `NotificationProvider` → `AuthProvider` → **`PluginProvider`** (ładuje pluginy web użytkownika po zalogowaniu) → `MqttProviderWithAuth` (przekazuje JWT token jako mqttPassword) → `FilesystemProvider` → `MinisDataSourceProvider` → `GlobalWindowsProvider` → AppRoot + GlobalApiDocs + GlobalRpcExplorer + GlobalMqttExplorer + GlobalMjdDefEditor + GlobalMjdDataEditor + **GlobalTerminal**
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
    - **web-plugins** — runtime ładowania pluginów użytkownika (`app/web/` na serwerze). `types.ts`: `PluginManifest` {id, name, version, description?, main, contributes?: {scripts?}, externals?}, `IWebPluginAPI` (namespace-y `auth`/`http`/`logger`/`ui.statusbar`/`scripts.register`/**`scripts.registerTemplate`**), `StatusBarItemOptions`, `StatusBarHandle`, **`PluginScriptTemplate`** {id, label, description?, code, mode?} — przykładowy snippet bloku Plugin Script kontrybuowany przez plugin. `PluginLoader.ts`: `loadPlugins(userName, token, isAdmin)` — pobiera manifesty z `GET /api/users/{u}/plugins`, ściąga `bundle.js` (CJS), ewaluuje przez `new Function('require','module','exports', ...)` z **require-shimem** (react, react-dom, react/jsx-runtime, @mhersztowski/web-client, @mui/material, @mui/icons-material + sub-paths, @emotion/react, @emotion/styled — external, nie bundlowane), wywołuje `activate(api)` → opcjonalny `deactivate`; per-plugin śledzi `scriptNames` i `templateKeys` do czyszczenia w `unloadPlugins()`. `PluginRegistry.ts`: `pluginRegistry` singleton — rejestr funkcji skryptowych (`buildContext()` konwertuje klucze `ns.method` na zagnieżdżony obiekt namespace'ów) **oraz szablonów Plugin Script** (`registerTemplate()`/`unregisterTemplates()`/`getTemplates()` → `RegisteredTemplate[]` {pluginId, pluginName, template}). `PluginProvider.tsx`: `PluginProvider`/`usePlugins()` — ładuje pluginy po zalogowaniu, `pluginsVersion` counter (inkrementowany po cyklu ładowania — pozwala blokom auto-run ponownie się uruchomić po załadowaniu pluginów). **Konwencja pluginu**: `templates.ts` eksportuje `PluginScriptTemplate[]`, a `index.tsx` rejestruje je w `activate()` przez `api.scripts.registerTemplate()`.
    - **script-runtime** — wykonywanie skryptów JS w blokach Markdown. `types.ts`: marker-klasy outputu `MarkdownOutput`/`TableOutput`/`ReactiveValue` + helpery `md`/`table`/`reactive` (tag-template / funkcje), `ScriptOutput` (string | MarkdownOutput | TableOutput | ReactiveValue | ReactElement | null), `ScriptContext` (auth, http, md, table, reactive + namespace'y pluginów), `DisplayApi` (imperatywny `text`/`table`/`list`/`json`). `ScriptRuntime.ts`: `buildScriptContext(auth)` — buduje kontekst z `http` (fetch z Bearer) + `...pluginRegistry.buildContext()`; `executeScript(code, ctx, display)` — uruchamia przez `AsyncFunction` (top-level await), destrukturyzuje klucze kontekstu jako zmienne. `OutputRenderer.tsx`: renderuje `ScriptOutput` (Markdown przez ReactMarkdown+GFM, tabele MUI, `ReactiveRenderer` z badge'em LIVE i subskrypcją na żywo, fallback JSON dump).
- Serwisy (`src/services/`):
    - **MinisApiService** — singleton (`minisApi`), REST client do `/api/*`. `setAuthToken(token)`. Pełne API: auth, admin CRUD, user devices/projects, IoT, API keys, Arduino, Sketch, README, Localization. Nowe: `getDeviceMinisConfig(userName, deviceName)` (WiFi/SN config), `getIotArchitecture/saveIotArchitecture` (Electronics graph), `listFirmwareFiles/fetchFirmwareFile` (predefined firmware), uPython CRUD (`getUserUPythonProjects`, `createUserUPythonProject`, `deployUPythonProject`), **`getSmartDisplayConfig(userName, deviceName)`** / **`saveSmartDisplayConfig(userName, deviceName, config)`** (SmartDisplayConfig), **`cloneProjectFromGithub(userName, projectName, repoUrl, sketches, readmePath, libraries?)`** — opcjonalny parametr `libraries?: Array<{name, version, url?}>` propagowany do backendu i zapisywany w Project.json. Dodatkowo: `getTerminalTicket()` → `{ ticket }` (do GlobalTerminal), **`updateProjectLibraries(userName, projectName, libraries)`** (PUT project z polem libraries), **`buildPicoSdkProject(userName, projectName, sketchName, boardKey?)`** → `{success, output, exitCode, uf2Url?}`, **`generateDocs()`** → uruchamia TypeDoc, **`generateScreenshots(opts)`** → uruchamia Playwright + Claude Vision.
    - **RpcClient** — singleton (`rpcClient`), type-safe klient RPC. `setAuthToken(token)`. `call<TName>(method, input): Promise<Output>`. Wire format: `POST /api/rpc/{method}`.
- Hooks (`src/hooks/`):
    - **useSourceUpload** — reusable hook do uploadu plików źródłowych (ZIP)
- Komponenty (`src/components/`):
    - **GlobalWindowsContext** — `WindowName`: `'apiDocs' | 'rpcExplorer' | 'mqttExplorer' | 'mjdDefEditor' | 'mjdDataEditor' | 'terminal' | 'drive' | 'editor' | 'memory'`. Layout save/load/clear (localStorage). Zamknięcie okien przy zmianie route.
    - **GlobalTerminal** — xterm.js terminal w GlobalWindow, wielosesyjny (tabs), WebSocket `/ws/terminal` z ticket auth. Ctrl+Shift+C kopiuje zaznaczenie.
    - **GlobalDrive** — floating window wrapping DrivePage (windowName: 'drive', 1100×700) — Drive dostępny z każdej strony bez utraty stanu. **DrivePage** — gdy użytkownik otwiera plik `*.repo.json` (np. `.repo.json` lub `pubsub.repo.json`), zamiast podglądu JSON otwiera **`GitRepoPanel`** (`pages/drive/GitRepoPanel.tsx`): edytowalne pola URL + token (HTTPS), status bieżącego repo (branch/tag/commit/ahead/behind/dirty), wybór gałęzi i tagu przez `<Select>`, akcje Pull/Push/Clone, output w monospacowym boksie. Ścieżka `.repo.json` przekazywana jako relatywna do drive użytkownika (logika katalogów — `{nazwa}.repo.json` → clone do podkatalogu `{nazwa}` — po stronie backendu).
    - **GlobalEditor** — floating window wrapping UserDataEditorPage (windowName: 'editor', 1400×850) — pełny Monaco workspace jako pływające okno
    - **GlobalMemory** — floating window wrapping MemoryPage (windowName: 'memory', 1000×750)
    - **GlobalWindow**, **GlobalApiDocs**, **GlobalRpcExplorer**, **GlobalMqttExplorer**, **GlobalMjdDefEditor**, **GlobalMjdDataEditor** — pływające okna
    - **AccountMenu** — hierarchiczne menu (View save/load/clear, Window API Docs/RPC/MQTT/Terminal)
    - **BuildOutputPanel**, **ImpersonationBanner**, **MinimalTopBar**, **MinimalTopBarContext** — komponenty UI
    - **DisplayContext** — ThemeProvider wrapper z trybem ciemnym i rozmiarem czcionki
    - **Layout** — dodany tablet drawer (breakpoint `sm`—`lg`): osobny `Drawer variant="temporary"` dla tabletów, trigger po prawej stronie AppBar. Mobile i tablet zamykają drawer po nawigacji. Collapsible nav groups z `openGroups` state.
    - **VfsView** — `ResizeDivider` component: przeciągany separator między panelami (mouse + touch), overlay `position:fixed` podczas drag zapobiega przechwytywaniu eventów przez Monaco/iframe. Persystowany rozmiar paneli przez `useState`.
- Strony:
    - Full-page (bez Layout): `/workspace/md/*` (WorkspaceMdPage), `/editor/simple/*` (SimpleEditorPage), `/editor/md/*` (MdEditorPage), `/viewer/md/*` (MdViewerPage), `/designer/ui/:id?` (UIDesignerPage), `/designer/automate/:id?` (AutomateDesignerPage), `/viewer/ui/:id` (UIViewerPage) — owinięte `MinimalTopBar`, wymaga auth
    - Public: `/` (HomePage), `/login/:userName` (LoginPage), `/watch` (**WatchPage** — publiczne, bez auth; duży okrągły przycisk, publikuje `{pressed:true, at:timestamp}` na MQTT topic `watch` przez `mqttClient.rawPublish()`; przeznaczone dla Galaxy Watch / urządzeń IoT — MQTT łączy się anonimowo)
    - Full-page bez Layout (Minis): `/user/:userName/editor/monaco/*` (MinisMonacoEditorPage), `/user/:userName/project/:projectId` (**MinisProjectPage** — przełączanie widoku Blockly↔Code przez `window.location.href` zamiast `navigate()` — full page reload unika konfliktów pamięci między bundlami Blockly i Monaco), `/user/:userName/upython-project/:projectId` (**UPythonProjectPage** — wstrzykuje WiFi credentials jako Python header przed uplodem; ładuje `projectLibraries` z pola `libraries` rekordu projektu i przekazuje do UploadDialog; `isDirty` state → Save button w kolorze warning/contained gdy są niezapisane zmiany; `loadKey`+`useEffect` — niezawodne wyciszenie dirty podczas ładowania szkicu: `isLoadingSketchRef` pozostaje true przez 100ms po załadowaniu żeby pochłonąć odroczone eventy Blockly; config panel z togglem kategorii Hardware — persystowane w localStorage `upython_hidden_cats`, domyślnie wszystkie ukryte; **Libraries panel**: pole tekstowe `Name@version` lub URL, chips z usuwalnych bibliotek, `Save libraries` button → `updateProjectLibraries()`; `MpyReplTerminal` teraz jako floating panel z `open` prop zamiast warunkowego montowania), `/user/:userName/pygame-project/:projectId` (PygameProjectPage — Blockly/split/code view, PygameMode toggle native/web, lista szkiców, build przez `POST .../build`, podgląd web-build w iframe), `/user/:userName/picosdk-project/:projectId` (**PicoSdkProjectPage** — Monaco-only edytor C/C++/CMake; drzewo plików z expand/collapse dirs + inline delete; wielokrotne szkice (sketches) per projekt; board selector (pico/pico_w/pico2/pico2_w) persystowany w localStorage; `Build` button → SSE streaming build output przez `EventSource` → `GET .../build-pico?sketchName=&boardKey=`; `Download UF2` link po sukcesie; `EditorInstance` z `@mhersztowski/web-client`; `langForFile()` mapuje ext → Monaco language)
    - Layout pages (Minis admin): `/admin/:userName/main`, `/admin/:userName/users`, `/admin/:userName/devicesdefs`, `/admin/:userName/modulesdefs`, `/admin/:userName/projectdefs` (**GithubProjectDefsPage** — auto-fetches DEFAULT_URL on mount przez `useEffect`; `handleFetch` owinięty w `useCallback`)
    - **Layout** — sekcja **Tools** zawiera teraz: UI Docs (wszyscy) + dla adminów: API Keys, Test VFS, **Docs** (Generate Docs button z TypeDoc). Usunięta osobna sekcja "Admin Tools" — elementy admin przeniesione do Tools.
    - **UiDocsPage** (`/user/:userName/tools/ui-docs`) — galeria screenshotów z anotowanymi callouts: numerowane kółka na screenshocie (pozycje x/y w %) + lista opisów po prawej (klikalne, podświetlają kółko). Dane ładowane dynamicznie z `/screenshots/docs.json` (generowany przez AI) — fallback na hardkodowane SCREENSHOTS. Dla adminów: przycisk **"Generate Screenshots"** → dialog (username + password) → backend odpala Playwright (screenshoty) + Claude Vision API (callouts) → zapisuje `docs.json`. Data i info "AI-generated descriptions" w nagłówku po załadowaniu.
    - Layout pages (Minis user): `/user/:userName/main`, `/user/:userName/localization`, `/user/:userName/electronics/welcome` (**ElectronicsWelcomePage** — strona powitalna Electronics: browser projektów z GitHub (`platform-minis/MinisProjects`), grupowanie wg tagów, filtrowanie wg platformy Arduino/uPython/Pygame, sortowanie wg semver; `ReactMarkdown` podgląd README; przycisk "Import" → `cloneProjectFromGithub()` z dialogiem wyboru nazwy i szkicu; `GithubProjectEntry`/`GithubModuleEntry` typy z MinisApiService), `/user/:userName/electronics/devices`, `/user/:userName/electronics/arduino`, `/user/:userName/electronics/upython`, `/user/:userName/electronics/picosdk` (**UserPicoSdkProjectsPage** — lista projektów PicoSDK C/C++, tworzenie nowych, lista szkiców per projekt, ostatni build status), `/user/:userName/electronics/pygame` (UserPygameProjectsPage — lista projektów Pygame, tworzenie nowych), `/user/:userName/electronics/configuration` (ElectronicsConfigurationPage — ReactFlow IoT network editor: 4 node types wifi-device/wifi-uart-bridge/wifi-switch/uart-device, ConfigPanel z dropdownem urządzeń, WiFi inheritance, drag-and-drop, persistence przez `GET/PUT /api/users/{userName}/electronics/configuration`), `/user/:userName/iot/dashboard`, `/user/:userName/iot/devices`, `/user/:userName/iot/device/:deviceName` (IotDevicePage — przycisk "Smart Display" widoczny gdy extension `smart-display`, przycisk **"Virtual Display"** (Monitor icon) widoczny gdy extension `display`), `/user/:userName/iot/smart-display/:deviceName` (**SmartDisplayPage** — konfiguracja widoków Smart Display: typy clock/text/metric/image/random-image/weather, cycleDuration, persystancja przez `GET/PUT /api/users/{u}/devices/{d}/smart-display`), `/user/:userName/iot/virtual-display/:deviceName` (**VirtualDisplayPage** — przeglądarka wirtualnego wyświetlacza: subskrypcja MQTT `minis/{user}/{device}/ext/display/res`, dekodery pixelformat (RGB565/MONO_VLSB/MONO_HLSB/GS4_HMSB/GS8), canvas rendering z `imageRendering:pixelated`, zoom 1–8×, tło black/white/green, licznik FPS), `/user/:userName/iot/alerts`, `/user/:userName/iot/emulator`, `/user/:userName/tools/rpc` (AdminOnly), `/user/:userName/tools/mqtt-explorer` (AdminOnly), `/user/:userName/tools/api-keys` (AdminOnly), `/user/:userName/tools/testvfs` (AdminOnly), `/user/:userName/tools/docs` (AdminOnly)
    - Layout pages (PIM — pod `/user/:userName/pim/`): `/calendar`, `/todolist`, `/person`, `/project`, `/shopping`, `/automate`, `/objectviewer`, `/components`, `/settings/ai`, `/settings/speech`, `/settings/receipt`, `/settings/page-hooks`, `/agent`
    - **Menu „Programming"** (Layout, między Electronics a IoT): pozycja **UML** → `/user/:userName/programming/uml` (full-bleed, lazy-loaded). Ikony: IntegrationInstructions (grupa) + Schema (UML).
- **UmlEditorPage** (`pages/programming/UmlEditorPage.tsx`) — **graficzny edytor UML class-diagram** (ReactFlow `@xyflow/react`). Zapis do `*.umlproj.json` w VFS użytkownika pod `drive/uml/` (widoczne też w Drive). Format **v2**: working-tree (`diagrams`) + git-like **historia** `{commits, branches, head}`.
  - **Elementy diagramu jako osobne, identyfikowalne składowe**: każde pole/metoda to `UmlMember {id, kind: 'field'|'method', text}` z własnym ID (umożliwia śledzenie w historii i edycję pojedynczo). Klasy typu `class|abstract|interface|enum` (kolory + stereotypy «abstract»/«interface»), nazwa, listy pól i metod edytowane wierszami.
  - **Relacje UML** z poprawnymi grotami (własne markery SVG): association, directed, aggregation (pusty romb), composition (pełny romb), generalization (pusty trójkąt), realization (przerywana+trójkąt), dependency (przerywana+strzałka). Połączenia z dowolnej strony klasy (`ConnectionMode.Loose` + 4 uchwyty t/r/b/l). Custom edge `UmlEdge` wylicza markery/dash z `data.relType` przy renderze (małe, forward-compatible pliki).
  - **Projekty z wieloma diagramami** — lewy panel-drzewo: projekty (`*.umlproj.json`) → diagramy; przełączanie, dodawanie, zmiana nazwy, usuwanie. **Powiązania na dwóch poziomach**: projekt ↔ katalog kodu (`linkedPath`, picker katalogów) i klasa ↔ plik źródłowy (`data.linkedFile`, picker plików + podgląd treści). **VfsPickerDialog** (przegląda filesystem użytkownika), **FilePreviewDialog**.
  - **Panel „Powiązane pliki"** (przełączalny, skrajnie po prawej): drzewo katalogów wszystkich `linkedFile` z całego projektu (kompaktowanie ścieżek w stylu VS Code), pliki klikalne → podgląd.
  - **Historia (git-like)**: przycisk **Commit** (dialog z opisem; aktywny gdy są niezacommitowane zmiany — wykrywane przez porównanie snapshotów working-tree vs HEAD), **gałęzie** (Nowa gałąź = rozgałęzienie od HEAD; checkout ładuje stan gałęzi do working-tree), **okno historii** (`HistoryDialog`: lista gałęzi, log commitów bieżącej gałęzi z tagami, przywracanie commita do working-tree). Wskaźnik gałęzi + dirty w toolbarze. Każdy commit = pełny snapshot projektu. `migrateProject()` migruje stare formaty (v1 `attributes[]`/`methods[]`→`members[]`, oraz jednodiagramowy `uml-scene`→v2) i dorabia historię. **Współpracuje z `@mhersztowski/devtools`** — ten sam format projektu v2 (devtools generuje/aktualizuje te pliki z kodu źródłowego).
- **MdEditor** — `BlockActionMenu`: jeden przycisk na blok (pozycje obliczane przez `updateBlockPositions()` — sync ProseMirror node attrs do DOM dla NodeView-based bloków). `SlashCommands` otrzymuje `onCreatePage` callback (ref pattern dla stabilności). `BlockIdExtension` dołączony bezpośrednio w MdEditor. **SlashCommands** — komendy: `Link`, `Page`, `Plugin Script`, dynamiczne `Plugin Script: {label}` z pluginów, **`CAD View`** (wstawia CadViewEmbed block), **`Event`** (otwiera EventDialog). **WorkspaceMdPage** — `handleCreatePage(path)`: tworzy plik przez `writeFile`, inkrementuje `treeVersion`.
- **Nowe extensions MdEditor** (`components/mdeditor/extensions/`):
  - **`CadViewExtension`** — TipTap atom block (`cadViewEmbed`): iframe embed widoku CAD wewnątrz notatki Markdown. Modes: `cad/cad3d/scene3d/electronics`. Attrs: `{mode, url}`. ProjectPickerDialog fetchuje projekty z CAD API i buduje viewer URL `{base}/viewer/{mode}/{vfsPath}`. SettingsDialog dla CAD App URL (localStorage `cad_base_url`, default `http://localhost:1898`). OpenInNew otwiera w nowej karcie.
  - **`EventBlockExtension`** — TipTap atom block (`eventBlock`): karta eventu/spotkania. Attrs: `{eventName, start, end, description, taskId, taskName, projectName}`. Renderuje Paper z EventIcon + datetime + task link + Edit/Delete. `data-start`/`data-end` atrybuty → używane przez TodayNowMarker. Lossless round-trip przez URL-encoded data-* attrs.
  - **`InfoMarkExtension`** — TipTap inline atom (`infoMark`): klikalny token z Popoverem. Attrs: `{text, title, body, bodyPath}`. `bodyPath` (priorytet) → async load z VFS przez useMqtt().readFile → rendered jako ReactMarkdown. Double-click → edycja przez toolbar dialog. Persist: `@[info:{text}:{title}:{bodyPath}]`
  - **`DictationDialog`** — full-screen dialog: górna sekcja TTS (Web Speech API — word-level highlight, click słowa → restart od pozycji, speed slider 0.5–2x, voice picker), dolna sekcja canvas (handwriting: pressure-sensitive stylus/Pencil/S-Pen, pinch-zoom, pan, undo, clear, grid 32px, RDP stroke simplification — NIE użyto Anthropic TTS bo brak word-level timestamps)
  - **`TodayNowMarker`** — live "teraz" overlay w daily journals (plik `{yyyy}/{mm}/{dd}.md`): czerwony gradient bar z czasem. Modes: top/before/inside/between/after relative do eventów. Context labels: "za X min" / "kończy się za X min" itd. Odświeżanie co 30s; czyta `data-start/end` z EventBlock DOM.
  - **`EventDialog`** — dialog inserting/editing eventów: zakładka single (task autocomplete, start/end datetime, description, preview) + zakładka template (bulk-insert z `EventTemplate[]`, baseDate picker, `applyTemplate()` → `ResolvedEvent[]`). `onInsertMany` preferred dla atomowych batch insertions. "Save as template" → EventTemplateManager.
  - **`AutomateScriptExtension`** — rozbudowany: dodano **AutomateIncludeFileDialog** (import nodes z zewnętrznego .json), **AutomateLibraryPickerDialog** (picker gotowych bibliotek węzłów), **AutomateScriptSettingsDialog** (konfiguracja skryptu + pole `scenePath` — ścieżka pliku JSON ze sceną QObject). **QObject scene support**: `qobjectScene.ts` — model sceny (`QObjectScene` {type:'qobject-scene', version:1, roots: QObjectSceneNode[]}, `QObjectSceneNode` {id, className, objectName?, properties: [{key,value}][], children}; czyste operacje: `emptyScene`, `normalizeScene`, `newNode`, `addNode`, `removeNode`, `updateNode`, `findNode`, `cloneNodeFresh`). `qobjectSource.ts` — statyczny (regexowy) parser kodu skryptu: `parseQObjects(code)` → `QObjParse` {classes (nazwy klas dziedziczących po QObject), roots/flat (drzewo/płaski spis instancji z warName/className/parentVar/properties/declStart/declEnd), classProperties (zadeklarowane `static properties` per klasa)}. **`AutomateQObjectPanel`** (lazy) — boczny panel inspektora sceny QObject: drzewko hierarchii (rodzic→dzieci, collapse, zaznaczenie), edytowalna tabela właściwości (objectName + zadeklarowane pola klasy via `QObject.metaProperties` lub `classProperties` z parsera + dodatkowe wolne właściwości), menu kontekstowe (New z podlistą klas, Wytnij/Kopiuj/Wklej/Kopiuj link). **Stop button** — `handleStop()`: przerywa blok przez `stopBlock(blockId)`, cofa zmiany na żywych obiektach sceny przez `restoreScene()`, przywraca dane sceny w panelu do snapshotu JSON zapisanego przy ostatnim Run. Scena wczytywana przy montażu/zmianie `scenePath` przez `readUserJson`, zapisywana przy Save przez `writeUserJson`. `setBlockScene(blockId, roots)` rejestruje korzenie dla `api.scripts.getRoot()` w uruchamianym skrypcie. **AutomateSystemApi** rozszerzony: `api.scripts.getRoot()` — żywy korzeń sceny (instancja klasy z globalThis z ustawionymi właściwościami), `api.scripts.getRoots()` — tablica korzeni, `api.scripts.getSceneData()` — surowe dane sceny (JSON).
- **PluginScriptExtension** (`components/mdeditor/extensions/PluginScriptExtension.tsx`) — `PluginScriptBlock` (TipTap atom node, attrs: blockId/code/mode/label/collapsed). NodeView: header z edytowalną etykietą, toggle Auto/Manual, Run (Ctrl+Enter), edytor Monaco w dialogu, collapse; uruchamia kod przez `executeScript()` z `script-runtime`, renderuje wynik przez `OutputRenderer` (rich return value) + `DisplayOutput` (imperatywne `display.*`). Tryb `auto` → run na mount + ponowny run gdy `pluginsVersion` rośnie (fix race: auto-run przed załadowaniem pluginów). Persystencja w Markdown jako code fence ` ```pscript:blockId:mode:encodedLabel ` (escape/restore w `markdownConverter.ts`).
- **`src/plugins/`** — pluginy dla MonacoMultiEditor. **`TypeScriptIntelliSensePlugin.ts`**: IntelliSense dla TS/JS — parsuje import/require, wyszukuje typy w VFS node_modules, CDN fallback (jsdelivr); rejestruje `.d.ts` jako Monaco models (`monaco.editor.createModel()` — bez restartu workera); wbudowane stuby: Express + **`@mhersztowski/minislib`** (pełne typy Signal/MObject/MProperty/MTimer/MEventBus/MStateMachine/MCommand/MCommandStack/MListModel/MLogger jako ambient `declare module`); `suggest: { showWords: false }` filtruje word-based (abc) completions, `completionItems: true` od startu. **`MarkdownEditorPlugin.tsx`**: otwiera MdEditor (TipTap) jako virtual tab dla aktywnego `.md` pliku; VFS path → MQTT path (strip `/home/`); auto-save 2s debounce; command palette "Markdown: Open Editor". **`MarkdownPreviewPlugin.tsx`**: panel sidebar — live preview (remark→rehype→KaTeX→highlight.js→React), GFM + math, 250ms debounce. **`VisualMinisLibPlugin.tsx`**: wizualny graf Signal-Slot dla `@mhersztowski/minislib` — parsuje aktywny plik TS w poszukiwaniu klas `MObject`, `Signal<T>`, `MProperty<T>`, `MTimer` itd., renderuje je jako węzły ReactFlow (drag z portu signal → port slot tworzy połączenie i patchuje kod źródłowy w Monaco), Properties panel z edytowalnymi parametrami konstruktora, eksport manifestu pluginu. `defineEditorPlugin()`, contributes: toolbar + commandpalette.
- **`ArduinoBoardConfigDialog.tsx`** (`src/components/`) — dialog konfiguracji płytki Arduino ESP32-S3: USB CDC On Boot, Flash Mode, Flash Size, CPU Freq, Debug Level, Partition Scheme. Buduje custom FQBN z wybranych opcji → zapisuje przez `saveProjectJson()` z `onDialogAction` VfsExplorer.
- **`UserDataEditorPage.tsx`** (`src/pages/workspace/`) — strona edytora Monaco ze zintegrowanym systemem projektów. `SubpathFS` wrapper (prefix `/home/{userName}/` do wszystkich VFS ops). Monty: `/home/` (user data via RemoteFS) + `/server/` (admin only). `projectDeps` przekazywane do VfsExplorer → built-in `Project.execute()`. `onDialogAction` deleguje `board-config` do `ArduinoBoardConfigDialog`. Pluginy: MarkdownEditorPlugin + MarkdownPreviewPlugin + TypeScriptIntelliSensePlugin aktywowane na MonacoMultiEditor. `buildWorkspaceClaudeMd()` generuje instrukcje agenta do tworzenia/odkrywania projektów.
- **Markdown editor fixes**: `markdownConverter.ts` — regex `%%BID:xxx%%` akceptuje dowolny format ID (nie tylko UUID); `BlockIdExtension` — split na `STANDARD_BLOCK_TYPES` (addGlobalAttributes) i `CUSTOM_BLOCK_TYPES` (appendTransaction only) żeby naprawić "no id yet" na blokach NodeView; `AutomateScriptExtension` — `data-block-id` na `NodeViewWrapper`.
- **MinisApiService** — odpowiedź 401 dispatches `window.dispatchEvent(new Event('minis:session-expired'))` zamiast hard redirect; **AuthContext** — nasłuchuje `minis:session-expired` i wywołuje `logout()` przez React. Nowe metody **git** (typy `RepoJson`, `GitInfo`, `GitStatus`, `GitRepoStatusResponse`, `GitOpResult` eksportowane z `MinisApiService.ts`): `getGitInfo(user, repoPath)` → `GitRepoStatusResponse`, `gitSaveRepo(user, repoPath, patch)` → `{ok, repo}`, `gitClone/gitPull/gitPush(user, repoPath)` → `GitOpResult`, `gitCheckout(user, repoPath, ref, type)` → `GitOpResult`.
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

- React Native (Expo ~52), WebView wrapper — URL konfigurowalny przez env var
- Pełna aplikacja MyCastle na telefon — back button obsługuje historię WebView
- `jsEngine: "jsc"` (wyłączony Hermes — kompatybilność z ARM64 Docker build)
- **`app.config.js`** (zastąpił `app.json`) — dynamiczny config Expo czytający env vars przy buildzie: `MYCASTLE_SERVER_URL` (domyślnie `http://192.168.0.207:1894`), `MYCASTLE_APP_NAME` (domyślnie `MyCastle`), `MYCASTLE_APP_PACKAGE` (domyślnie `com.mycastle.mobile`), `MYCASTLE_APP_SLUG` (domyślnie `mycastle-mobile`). `App.tsx` czyta URL przez `Constants.expoConfig?.extra?.serverUrl`.
- Build: `docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build.sh`
- **`build-cad.sh`** — wariant builda: WebView wskazujący na aplikację CAD (`MYCASTLE_APP_NAME=MyCastleCAD`, `MYCASTLE_SERVER_URL=https://cad.hersztowski.org`, `MYCASTLE_APP_PACKAGE=com.mycastle.cad`, `MYCASTLE_APP_SLUG=mycastle-cad`) → deleguje do `build.sh`.
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

- Node.js HTTP server, ESM, port **1897** (wewnętrzny — użytkownicy wchodzą przez Vite/1898 w dev, lub bezpośrednio w prod po `vite build`). Serwuje VFS API (`/api/*`) + pliki statyczne z `public/` (SPA fallback na `index.html`). Buduj frontend przez `pnpm build:cad` → trafia do `app/cad-backend/public/`.
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
- **Env vars:** `CAD_DATA_DIR` (domyślnie `app/cad-backend/data/`), `CAD_BACKEND_PORT` (domyślnie 1897 — wewnętrzny), `CAD_CORS_ORIGIN`
- **Deployment:** `app/cad-backend/Dockerfile` (multi-stage: buduje cały stack CAD + frontend → serwuje z `public/`) + `app/cad-backend/docker-compose.yml` — samodzielne wdrożenie CAD (np. `cad.hersztowski.org`)
- **Frontend integracja** (`app/cad-app/`):
  - `src/vfs/cadProjectApi.ts` — cienki fetch client (`listProjects`, `readProject`, `writeProject`, `deleteProject`, `renameProject`, `setCurrentUserId`)
  - `src/components/ProjectBrowser.tsx` — dialog wyboru/zapisu projektów: lista z datą i rozmiarem, inline rename, delete, double-click open; name field w trybie save
  - `src/io/CadExporter.ts:loadProjectFromText()` — mutuje istniejący singleton projekt z JSON stringa (używane przez ProjectBrowser i importJSON)
  - `vite.config.ts` proxy: `/api/*` → `http://localhost:1897` (cad-backend internal)
  - `FileMenu.tsx` — "Open from Server…" / "Save to Server…" otwierają ProjectBrowser

### Aplikacja cad-app (`app/cad-app/`)

- React 18 + TypeScript, Vite 7, MUI 7, Three.js — edytor CAD 2D/3D. Dev port: **1898** (user-facing). Proxy `/api/*` → `http://localhost:1897` (cad-backend). `vite build` wyprowadza do `../cad-backend/public/`. Deps m.in. `three-bvh-csg`, `opencascade.js`.
- Cztery tryby pracy przełączane zakładkami na górze (`AppMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics'`):
  - **CAD** — tryb kreślarski 2D z przełącznikiem widoku 2D (ortho) / 3D (perspektywa + OrbitControls)
  - **CAD 3D** — parametryczny modeler 3D oparty o feature tree i OpenCascade.js (patrz sekcja CAD 3D niżej)
  - **Scene 3D** — pełny edytor Three.js (`RichEditor` z `@mhersztowski/ui-components-scene3d`)
  - **Electronics** — `ComponentLibrary` + `BreadboardCanvas`
- `AiPanel` lazy-loaded (`React.lazy` + `Suspense`), wspólny dla wszystkich zakładek. W trybie CAD nowo dodana encja jest auto-zaznaczana i przełącza prawy panel na Properties (`entity:added` listener).

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
- **FreehandTool** — rysowanie odręczne: zbiera surowe punkty przy przeciąganiu, upraszcza krzywą algorytmem **RDP** (Ramer–Douglas–Peucker, `simplifyEpsilon`), tworzy `FreehandEntity` ({points, strokeWidth, smooth}).
- **TextTool** — klik wstawia `TextEntity` ({content, fontSize, fontFamily, angle}); parametry publiczne na instancji narzędzia.
- **ImageTool** — klik otwiera systemowy file picker, wczytuje obraz jako data URL, tworzy `ImageEntity` wyśrodkowaną na punkcie (wymiary z zachowaniem aspect ratio).

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

- `ToolName` — unia wszystkich narzędzi: `'select'|'line'|'circle'|'arc'|'rect'|'polyline'|'freehand'|'text'|'image'|'move'|'copy'|'rotate'|'offset'|'trim'|'fillet'|'dimension'|'box3d'|'cylinder3d'|'sphere3d'`
- `PreviewGeometry` — `{type: 'line'|'circle'|'arc'|'rect'|'polyline'|'ghost', points, radius?, startAngle?, endAngle?, ghostSegments?}`
- `DimensionLabel` — `{worldX, worldY, text, offsetX?, offsetY?, variant?: 'primary'|'secondary'}` — pozycja w świecie CAD, tekst, przesunięcie w px od projekcji
- `PenInput` — surowe dane wejściowe rysika/dotyku/myszy: `{pointerType: 'mouse'|'pen'|'touch', pressure [0,1], tiltX, tiltY, twist, tangentialPressure}`. `DEFAULT_PEN_INPUT` — wartości domyślne myszy (używane przy akcjach wstrzykiwanych z klawiatury). `ToolContext` rozszerzone o pole `pen: PenInput` (zawsze obecne).

#### Nakładka wymiarów (`src/components/DimensionOverlay.tsx`)

Absolutnie pozycjonowany `<div>` (pointer-events: none) nakładany na canvas. Każdy `DimensionLabel` jest konwertowany przez `renderer.worldToScreen()` i renderowany jako styled div. Primary: niebieski bold; secondary: jaśniejszy. Widoczny tylko w trybie 2D — znika przy przełączeniu na 3D lub zmianie narzędzia.

#### Główny canvas (`src/components/CadCanvas.tsx`)

Inicjalizuje `CadRenderer`, obsługuje: pointer events (snap → dispatch do aktywnego narzędzia), wheel (zoom w 2D; OrbitControls przejmuje w 3D), ResizeObserver. Snap: `getInBoundingBox` na nearby entities → `SnapEngine.snap()` (2D) lub grid snap (3D). Klawiatura: Ctrl+Z/Y, Escape, `:` focus CommandLine. Integracja CommandLine: `injectedPoint` → `tool.onPointerDown`, `injectedAngle` → `rotateTool.rotateByDegrees()` lub `filletTool.radius`. Stan `dimLabels` aktualizowany przy pointerMove i pointerDown — czyszczony przy zmianie narzędzia lub w trybie 3D.

#### Snap (`packages/core-cad/src/snap/SnapEngine.ts`)

Domyślnie aktywne tryby: `grid`, `endpoint`, `midpoint`, `center`, `intersection`. **Intersection snap** — pairwise O(n²) na nearby entities: line-line (`lineLineIntersection`) i line-circle (`lineSegmentCircleIntersections`). Próg: 12px przeliczone przez `pixelToWorld`.

#### Geometria (`packages/core-cad/src/utils/geometry.ts`)

Nowy moduł eksportowany z `@mhersztowski/core-cad`. Funkcje: `lineLineIntersection`, `signedDistPointToLine`, `closestPointOnSegment`, `distPointToSegment`, `lineSegmentCircleIntersections`, `circumscribedCircle`, `normalizeAngle`, `offsetLineCoords`, `dist2d`.

#### UI komponenty

- `src/components/Toolbar.tsx` — lewy pasek narzędzi rysowania: Draw (Select/Line/Circle/Arc/Rect/Polyline/Freehand/Text/Image), 3D (Box/Cylinder/Sphere). Skróty klawiaturowe widoczne w tooltipach.
- `src/components/ActionBar.tsx` — górny poziomy pasek: Transform (Move/Copy/Rotate), Edit (Offset/Trim/Fillet/Dimension), Undo/Redo/Delete.
- `src/components/GripOverlay.tsx` — nakładka uchwytów (grips) dla zaznaczonych encji.
- `src/components/ScaleBar.tsx` — pasek skali w rogu canvasu 2D.
- `src/components/CommandLine.tsx` — dolny pasek wejścia (`:` focus). Parsuje: `x,y`, `@dx,dy`, `<kąt`, liczby, skróty narzędzi.
- `src/components/StatusBar.tsx` — dolny pasek: narzędzie, warstwa, liczba encji, tryb widoku, GridInput.
- `src/components/LayerPanel.tsx` — panel warstw z kolorowymi kropkami, visibility/lock toggle.
- `src/components/PropertiesPanel.tsx` — panel właściwości encji (kolor, lineType, lineWidth, extrudeHeight).
- `src/components/FileMenu.tsx` — menu File: New, **Open from Server…** / **Save to Server…** (otwierają `ServerFileBrowser`), Open JSON (local), Save JSON (local), Export SVG/DXF/OBJ/glTF/glTF Binary. Props: `getSceneData?`, `onSceneData?`.
- `src/components/ServerFileBrowser.tsx` — **nowy** generyczny dialog open/save VFS (zastępuje ProjectBrowser dla głównych projektów). Modes: `open` / `save`. `extension: string`, `companionExtensions?: string[]`. Breadcrumb, Create Folder, Rename, Delete, upload history. localStorage pamiętuje ostatni katalog per `storageKey`.
- `src/components/Scene3DProjectBrowser.tsx` — **nowy** dwupoziomowy browser projektów Scene3D: projects view → files view. Create project/file, rename, delete, double-click open/overwrite.
- `src/components/RepositoryPanel.tsx` — **nowy** przeglądarka zdalnych projektów CAD z GitHub/HTTP. Pobiera `cad-catalog.json` manifest. Projekty w kategoriach (1. tag), search, README, thumb. Templates z armed placement mode (`ActiveTemplate` {projectId, rawBase, mode, …}). Types: `CadProjectEntry`, `TemplateMode = 'cad'|'cad3d'|'scene3d'|'electronics'`.
- `src/components/TemplatesPanel.tsx` — **nowy** collapsible panel z kartami szablonów: Insert + Touch (arm) button. Armed banner gdy `armedTemplateId` set — klik na canvas wstawia template.
- `src/components/FileSystemPanel.tsx` — **nowy** VFS file manager (drag-drop upload/download/delete, breadcrumb, scoped do `rootPath`). Color-coded icons (image/audio/3D model/JSON). Upload progress bars.
- `src/components/AudioPanel.tsx` — **nowy** audio player + recorder. Player: WAV/MP3, seek slider, volume. Recorder: AudioWorklet PCM capture, encode WAV (`encodeWav()`) lub MP3 (`lamejs`). ServerFileBrowser do open/save na VFS.
- `src/components/GeometryNodesEditor.tsx` — **nowy** node-based visual geometry editor (ReactFlow-based). Węzły: box/sphere/cylinder/plane/cone/torus (primitives) + transform/merge/output (operations). Edytowalne parametry numeryczne. Props: `graph: GeoNodeGraph`, `onChange`. Typy z `@mhersztowski/core-scene3d`.
- `src/components/MeshEditModeDialog.tsx` — **nowy** dialog edycji mesh 3D. Select modes: vertex/edge/face. Grab mode (G), axis constraint (X/Y/Z), Shift+click additive. Shortcuts: A (select all), Delete (remove verts+faces), Esc cancel. OrbitControls disabled podczas grab. Props: `initialMesh: EditableMesh|null`, `onApply(bufferData)`, `onClose`.
- `src/components/CodeEditorPanel.tsx` — **nowy** Monaco code editor panel scoped do user VFS: `TextEditorWorkspace` z `@mhersztowski/texteditor` + `RemoteFS` + `SubpathFS('/users/{userId}')`. Bez AI agent, bez terminal.
- `src/components/Scene3DView.tsx` — wrapper Scene 3D. `externalSceneData?`, "Fit to scene", `onSceneDataChange?`. Integruje teraz RepositoryPanel, TemplatesPanel, Scene3DProjectBrowser, AnimationPanel, PrefabsPanel przez RichEditor.
- `src/edit-mode/` — **nowy** system edycji mesh: `types.ts` (`SelectMode = 'vertex'|'edge'|'face'`, `EMVertex`, `EMEdge`, `EMFace`, `EditableMesh`); `meshConverter.ts` (`geometryToEditable(geo)` — merge near-dupl verts epsilon 1e-5, `editableToGeometry(mesh)` — unindexed geometry, `editableToBufferData(mesh)`, `cloneEditableMesh(mesh)`, `evaluateDescriptor(desc)` — quick eval bez R3F: box/sphere/cylinder/plane/cone/torus/custom/procedural)
- `src/editor/monacoWorkers.ts` — **nowy** Monaco worker setup z 3 patchami: debounce jsonDefaults.onDidChange (500ms, zapobiega kill workera), JSON worker languageSettings guard + getProxy() timeout (5s), _VSCODE_FILE_ROOT fix. Suggest widget z-index fix (99999). TS/JS defaults: ES2020, NodeJs, strict:false, JSX.

#### I/O (`src/io/CadExporter.ts`)

`exportJSON`, `importJSON` (z File), **`loadProjectFromText(jsonText, project)`** (mutuje istniejący singleton — używane przez ProjectBrowser), `exportSVG` (Y-flip transform, obsługuje line/circle/arc/rect/polyline), `exportDXF`, `exportOBJ`, `exportGLTF(binary)`.

#### Integracja serwera (`src/vfs/cadProjectApi.ts`)

Cienki fetch client. Stałe: `CAD_EXT = '.cad.json'`, `SCENE_EXT = '.scene.json'`, **`ELEC_EXT = '.elec.json'`**. API: `listProjects(userId?)`, `readProject(name, userId?)`, `writeProject(name, json, userId?)`, `deleteProject`, `renameProject`, `getCurrentUserId()`, **`setCurrentUserId(id)``. Ścieżki VFS: `/users/{userId}/projects/{name}.cad.json`. **`readSceneProject/writeSceneProject`** — plik `.scene.json` towarzyszący. **Scene3D project API**: `listScene3dProjects()`, `listScene3dFiles(project)`, `readScene3dFile(project, file)`, `deleteScene3dFile`, `deleteScene3dProject`, `renameScene3dProject` — ścieżki: `/users/{userId}/scene3d/{project}/{file}`. Low-level helpers: `vfsListDir`, `vfsReadFileBin`, `vfsWriteFileBin`, `vfsDeletePath`, `readFileAt(dir, name, ext)`. `textToBase64`/`base64ToText` dla encoding.

#### Bridge CAD → Scene 3D (`src/bridge/CadToScene.ts`)

`cadProjectToSceneGraph(project)` → `SceneGraph`; `cadProjectToSceneJson(project)` → JSON string dla `RichEditor.initialSceneData`. Mapowanie osi: CAD X→X, CAD Y→Z (top-down), ekstruzja→Y. Konwersja: circle→cylinder, rect→box, line→cienki box, polyline→seria boxów per segment, arc→wireframe cylinder.

#### CAD 3D — parametryczny modeler (`src/cad3d/` + `src/components/cad3d/`)

Modelowanie 3D oparte o **feature tree** (historia parametryczna, jak FreeCAD/Fusion) i jądro **OpenCascade.js** (WASM B-rep).

- **`cad3d/types.ts`** — `FeatureTree` {version, features: Feature[]}. `Feature` to unia: `SketchFeature` (plane `'XY'|'XZ'|'YZ'|'face'`, offset, planeMatrix? dla face, projectData — serializowany `Project.toJSON()`), `ExtrudeFeature`, `PocketFeature`, `HoleFeature` (diameter, depthType, drillPoint, counterType countersink/counterbore…), `GrooveFeature`, `RevolveFeature`, `MirrorFeature`, `ShellFeature`, `LoftFeature`/`LoftCutFeature`, `SweepFeature`/`SweepCutFeature`, `HelixFeature`. Każdy ma {id, type, name, enabled}. Helpery `defaultSketch()`/`defaultExtrude()`/… tworzą feature z domyślnymi parametrami; `makeId()` = `crypto.randomUUID()`.
- **`cad3d/useCad3d.ts`** — hook `useCad3d()` zarządzający feature tree: dodawanie/usuwanie/reorder/toggle/update feature, edycja szkiców (`startEditSketch`/`exitSketch` — serializuje `Project` szkicu do `projectData`), `getSketchProject(id)` (in-memory Map `Project` per szkic, lazy-load z `projectData`). Persystencja w `localStorage` (`cad3d-feature-tree`).
- **`cad3d/evaluate.ts`** — `preloadOcc()` eager-load WASM; renderuje szkice jako wireframe Three.js (natychmiastowy podgląd) i deleguje bryły do OCC.
- **`cad3d/occ/`** — warstwa OpenCascade: `occLoader.ts` (`getOcc()`/`preloadOcc()` — singleton init WASM), `occConvert.ts` (`OccScope` — RAII tracker `.delete()` obiektów OCC; `sketchToWorldTrsf`, `entitiesToWires`, `wiresToFace`, `shapeToGroup` — OCC shape → THREE.Group), `occEvaluate.ts` (`evaluateFeatureTreeOcc(tree)` — iteruje features, buduje bryłę: extrude/revolve/loft/sweep/helix, operacje CSG `csgCut`/`csgFuse` przez `BRepAlgoAPI_Cut`/`Fuse`).
- **`cad3d/subSelect.ts`** — sub-selekcja geometrii: `SubSelectMode` (`'object'|'vertex'|'edge'|'face'`), raycast → `SubHit` (`HitFace`/`HitEdge`/`HitVertex`), `planeFromFace()` — wyprowadza macierz płaszczyzny szkicu z zaznaczonej ściany.
- **Komponenty** (`src/components/Cad3dView.tsx` + `src/components/cad3d/`): **`Cad3dView`** — orkiestracja trybu CAD 3D (feature tree + viewport + panele + edytor szkiców), pasek narzędzi feature'ów, tryb sub-selekcji. **`Cad3dViewport`** — viewport Three.js z gizmo osi (canvas 2D overlay). **`FeatureTreePanel`** — lista feature'ów (ikony per typ, visibility/reorder/delete, edycja szkicu). **`FeaturePropsPanel`** — inspector parametrów wybranego feature'a (pola per typ). **`SceneTreePanel`** — drzewo wynikowej sceny Three.js. **`SketchEditor`** — pełny edytor 2D (Toolbar/ActionBar/CadCanvas/CommandLine/LayerPanel/PropertiesPanel/StatusBar) osadzony do rysowania szkicu na płaszczyźnie, `onExit` zapisuje do feature tree.

#### Routing (`src/main.tsx`)

URL-based routing (bez react-router) — regex na `window.location.pathname`:

- `/viewer/scene/:name` → `SceneViewerPage` — read-only viewer: ładuje `{name}.scene.json`; fallback konwersja z `.cad.json`. `SimpleViewer` z `autoFit` i `cameraPreset="cad"`.
- `/viewer/vr/:name` → `VrViewerPage` — WebXR VR viewer, `VRCameraSetup` normalizuje skalę do 3m.
- `/viewer/cad/{vfsPath}` → **`CadViewerPage`** — read-only CAD 2D: `readFileAt()` → `loadProjectFromText()` → `buildSVGString()` → SVG render.
- `/viewer/cad3d/{vfsPath}` → **`Cad3dViewerPage`** — read-only CAD → Scene3D: `cadProjectToSceneGraph()` → `SimpleViewer`.
- `/viewer/scene3d/{vfsPath}` → **`Scene3dViewerPage`** — read-only Scene3D project file: `readScene3dFile(project, file)` → `SceneDeserializer.deserialize()` → `SimpleViewer`.
- `/viewer/electronics/{vfsPath}` → **`ElectronicsViewerPage`** — read-only Electronics schema: `readFileAt(dir, name, ELEC_EXT)` → `BreadboardCanvas` (read-only mode: `pendingPartId=null`).
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
- `/api/*` proxy → `http://localhost:1897` (cad-backend internal); dev port 1898 (user-facing); `build.outDir` → `../cad-backend/public`

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
├── docker-compose.cli.server.yml   # Override dla server (x86_64) builds: `ARDUINO_ARCH: Linux_64bit`; użycie: `docker compose -f docker-compose.cli.yml -f docker-compose.cli.server.yml build`
├── docker/
│   ├── Dockerfile.cli              # Multi-target: arduino / pico / pygame. Pico stage: oficjalny ARM GNU Toolchain (ARG ARM_TOOLCHAIN_ARCH=aarch64, ARG ARM_TOOLCHAIN_VER=13.3.rel1) pobierany z developer.arm.com → `/opt/arm-toolchain`; Pico SDK 2.1.1 baked-in (`ARG PICO_SDK_TAG=2.1.1`) z symlinkiem `rp2350.cmake → rp2350-arm-s.cmake` (fix SDK 2.x bug); mpremote przez pip. Pygame stage: dodano `ffmpeg` + `black` (wymagane przez pygbag).
│   └── Dockerfile.android          # Android build environment (Ubuntu 24.04, Node 20, JDK 17, Android SDK 34, multiarch amd64+arm64 dla QEMU)
├── .npmrc
│
├── packages/
│   ├── core/                       # @mhersztowski/core (shared models, nodes, mqtt, automate, datasource, rpc, vfs, mjd, iot + browser JS modules)
│   │   ├── src/{models,nodes,automate,mqtt,datasource,rpc,vfs,mjd,iot}/
│   │   │   └── iot/device/         # IotDeviceExtension, IotDeviceVfsExtension, IotDeviceClient
│   │   ├── browser/mycastle/       # mycastle.js — bundel PIM nodes + ApiClient/ApiPerson/ApiTask/ApiProject/ApiEvent (vanilla JS)
│   │   ├── browser/qt/             # qt.module.js (widgety Qt na canvasie), qobject.module.js (Signal/QObject), example.module.js
│   │   └── browser/scene3d/        # scene3d.js — bundel Vec3/Box3/Geometry/MeshBuilder; _build.mjs — skrypt bundlujący
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
│   ├── devtools/                   # @mhersztowski/devtools (code ⇄ UML: parse C/C++/Py/JS/TS → UML project, diff→history, codegen + GitRepoService)
│   │   ├── src/model/              # CodeModel (IR), ids (deterministic), render, resolve (relations)
│   │   ├── src/parsers/            # TsParser (typescript API), PythonParser + CppParser (tree-sitter WASM), treeSitter loader
│   │   ├── src/uml/                # umlTypes (v2 mirror), generateUml, layout, diffModel, umlToModel
│   │   ├── src/codegen/            # tsCodegen, pyCodegen, cppCodegen
│   │   ├── src/git/                # GitRepoService (git CLI wrapper), RepoJson/GitRef/GitStatus/GitInfo types, parseRepoJson/stringifyRepoJson
│   │   ├── src/UmlSyncService.ts   # orchestrator: scan dir → generate/update project + history, UML → source
│   │   ├── src/devtools.test.ts    # TS pipeline tests (parse→UML→diff→codegen)
│   │   ├── tsup.config.ts          # ESM-only, target node20
│   │   └── package.json            # deps: typescript, web-tree-sitter, tree-sitter-wasms
│   ├── web-client/                 # @mhersztowski/web-client (React MQTT+filesystem+utils+mjd client — Monaco/VFS/plugins przeniesione do texteditor)
│   │   ├── src/{mqtt,filesystem,utils,typedoc,mjd}/
│   │   ├── vitest.config.ts        # Unit tests (jsdom env)
│   │   ├── tsup.config.ts          # Dual ESM+CJS, react as external peer
│   │   └── package.json
│   ├── texteditor/                 # @mhersztowski/texteditor (Monaco multi-editor workspace, VFS explorer, plugins)
│   │   ├── src/{monaco,vfs,plugins,workspace}/
│   │   │   ├── workspace/          # TextEditorWorkspace, SubpathFS, RemoteTerminalConfigDialog, ArduinoBoardConfigDialog
│   │   │   ├── vfs/                # VfsExplorer, VfsBreadcrumbs, VfsMountManager, VfsCommitDialog, vfs/project/
│   │   │   ├── monaco/             # MonacoMultiEditor, plugin system (EventBus, UIRegistry, PluginRegistry, PluginAPI)
│   │   │   └── plugins/            # TypeScript/Python/C++ IntelliSense, Markdown LSP/Preview, Folding, MJD, Snippets, VisualMinisLib
│   │   ├── tsconfig.json + tsconfig.build.json
│   │   ├── tsup.config.ts          # Dual ESM+CJS+CSS
│   │   └── package.json
│   ├── web-cpp/                    # @mhersztowski/web-cpp (Browser C++/WASM Emscripten runtime simulator)
│   │   ├── src/CppWasmRuntime.tsx  # CppWasmRuntime component (pin visualizer + serial monitor)
│   │   ├── src/index.ts
│   │   ├── docker/arduino-mock/    # Emscripten Arduino mock (Arduino.h, Arduino.cpp, HardwareSerial.h, WString.h, Wire.h, SPI.h)
│   │   ├── tsup.config.ts          # Dual ESM+CJS
│   │   └── package.json
│   ├── core-scene3d/               # @mhersztowski/core-scene3d
│   │   ├── vitest.config.ts        # Unit tests
│   ├── ui-core/                    # @mhersztowski/ui-core
│   │   ├── vitest.config.ts        # Unit tests (jsdom env, React Testing Library)
│   │   ├── src/test-setup.ts       # Vitest setup (@testing-library/jest-dom)
│   ├── ui-components-scene3d/      # @mhersztowski/ui-components-scene3d (+ AnimationPanel, PrefabsPanel)
│   │   └── src/panels/{AnimationPanel,PrefabsPanel}/
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
│   │   │       ├── git/            # GitService (warstwa nad GitRepoService z devtools, obsługa .repo.json w drive)
│   │   │       ├── rpc/            # handlers.ts, index.ts (importuje RpcRouter z core-backend)
│   │   │       ├── plugins/        # PluginService (web: app/web/, esbuild→CJS), BackendPluginService (app/backend/, esbuild→ESM, data: URL import), PluginStorage, backendPluginTypes
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
│   │   │   ├── modules/{mqttclient,filesystem,minis-filesystem,auth,uiforms,automate,ai,speech,conversation,shopping,notification,editor,ardublockly2,upythonblockly,serial,iot-emulator,web-plugins,script-runtime}/
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
│   ├── cad-backend/                # CAD VFS server + static frontend (port 1897 internal)
│   │   ├── src/index.ts            # HTTP server: VFS REST API (/api/*) + static files from public/, CORS
│   │   ├── data/                   # VFS root: users/{userId}/projects/{name}.cad.json (gitignored)
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── cad-app/                    # CAD 2D/3D editor (port 1897)
│   │   ├── src/
│   │   │   ├── App.tsx             # Tabs: CAD 2D (2D/3D toggle) / Scene 3D; project singleton
│   │   │   ├── main.tsx            # ThemeProvider + ConfigProvider + allotment CSS
│   │   │   ├── bridge/CadToScene.ts # cadProjectToSceneGraph/Json — CAD→Three.js bridge
│   │   │   ├── renderer/           # CadRenderer (ortho+perspective), EntityMeshBuilder
│   │   │   ├── tools/              # 19 narzędzi: Select/Line/Circle/Arc/Rect/Polyline/Freehand/Text/Image/Move/Copy/Rotate/Offset/Trim/Fillet/Dimension/Box3d/Cylinder3d/Sphere3d + entityTransform.ts + types.ts (PenInput)
│   │   │   ├── cad3d/              # Parametryczny modeler 3D: types (FeatureTree), useCad3d hook, evaluate, subSelect, occ/ (OpenCascade.js B-rep)
│   │   │   ├── components/         # CadCanvas, Toolbar, ActionBar, CommandLine, LayerPanel, StatusBar, PropertiesPanel, FileMenu, ProjectBrowser, DimensionOverlay, GripOverlay, ScaleBar, Scene3DView, Cad3dView, cad3d/ (Cad3dViewport, FeatureTreePanel, FeaturePropsPanel, SceneTreePanel, SketchEditor)
│   │   │   ├── io/CadExporter.ts   # exportJSON/SVG/DXF/OBJ/GLTF, importJSON, loadProjectFromText
│   │   │   ├── vfs/cadProjectApi.ts # fetch client dla cad-backend (listProjects/read/write/delete/rename)
│   │   │   └── hooks/useProject.ts # version counter from EventBus
│   │   ├── vite.config.ts          # Port 1898 (user-facing), proxy /api/*→localhost:1897, outDir ../cad-backend/public, alias @→src/
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
- **Build specific:** `pnpm build:core`, `pnpm build:core-backend`, `pnpm build:devtools`, `pnpm build:web-client`, `pnpm build:texteditor`, `pnpm build:web-cpp`, `pnpm build:backend`, `pnpm build:web`, `pnpm build:scene3d`, `pnpm build:core-cad`, `pnpm build:cad`
- **Build CAD stack (w kolejności):** `pnpm build:cadall` = `core-cad` → `ui-core` → `core-scene3d` → `ui-components-scene3d` → `cad-backend` → `cad-app`
- **WAŻNE kolejność buildów:** `texteditor` zależy od `web-client` (eksportuje re-exports); `mycastle-web` zależy od `texteditor` i `web-cpp`
- **Run MyCastle backend:** `pnpm dev:backend` (port 1894, HTTP + MQTT WebSocket at /mqtt)
- **Run MyCastle frontend:** `pnpm dev:web` (port 1895, Vite HMR)
- **Run scene3d:** `pnpm dev:scene3d` (requires packages built first)
- **Run CAD (both):** `pnpm dev:cad` — `http://localhost:1898` (Vite dev server, proxy /api/* → cad-backend wewnętrzny 1897)
- **Run CAD editor only:** `pnpm dev:cad-app` (port 1898 Vite, requires `pnpm build:core-cad` first)
- **Run CAD backend only:** `pnpm dev:cad-backend` (port 1897 internal)
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
