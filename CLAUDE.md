# Project: MyCastle

## Overview
pnpm monorepo zarządzający danymi PIM (osoby, taski, projekty, eventy, shopping, IoT/Minis devices, CAD). Współdzielone pakiety w `packages/`, aplikacje w `app/`.

> **Uwaga:** ten plik trzyma tylko architekturę wysokopoziomową i konwencje. Po szczegóły API (klasy, propsy, pola modeli) używaj `grep`/`Read` na kodzie źródłowym — kod jest źródłem prawdy.

## Architecture

### Shared packages (`packages/`)

Zbudowane przez `tsup` (dual ESM+CJS o ile nie zaznaczono inaczej). Wszystkie pod scope `@mhersztowski/`.

- **core** — współdzielone modele (Person/Task/Project/Event/Shopping/Minis*/User/Iot*/SmartDisplay/Auth), nody (z UI state + `copyBaseStateTo()`), MQTT topic registry (Zod-based, single source of truth), RPC registry (Zod), VFS abstraction (MemoryFS/CompositeFS/GitHubFS/WritableGitHubFS/BrowserFS/NodeFS/RemoteFS/**MqttFS**), automate models, datasource (IDataSource + MemoryDataSource), MJD (Meta JSON Definition), IoT device-side building blocks (IotDeviceExtension/VfsExtension/Client — framework-agnostic).
- **core/browser/** — vanilla JS (no TS, no build, no import/export — eksport przez `globalThis`). Trzy bundle: `mycastle/` (PIM nodes + ApiClient REST), `qt/` (QObject+Signal + widgety Qt na canvasie + przykłady), `scene3d/` (Vec3/Box3/Geometry/MeshBuilder). Używane w Plugin Script, Lit, automatyzacjach, HTML `<script type="module">`.
- **core-backend** (ESM-only) — `FileSystem` (in-memory cache, atomic writes, fileChanged events), `HttpUploadServer` (rozszerzalna baza dla MycastleHttpServer), `MqttServer` (Aedes wrapper z auth+routing), `JwtService` (TTL 7 dni)/`PasswordService` (bcrypt)/`ApiKeyService` (prefix `minis_`, SHA-256), `checkAuth()` middleware, `DataSource`, `RpcRouter`, interfejsy `IAutomateService`/`IDataSource`.
- **server-logic** (ESM-only) — warstwa „server logic" uruchamiana in-process z backendem. `IotServer` (LogService + ActivityService + ConsoleService + CronService + ClientRegistry), MQTT control plane (`server/inbox`·`outbox`, `{user}/...`, `{user}/{device}-{clientType}/{id}/...`), `MqttList<T>`, `Envelope`, `IMqttTransport`. Konwencja: **inbox=do encji, outbox=od encji**.
- **devtools** (ESM-only) — toolkit **kod ⇄ UML**. Parsery: TS Compiler API + web-tree-sitter (Python/C/C++). `CodeModel` (IR z deterministycznym djb2 id), `UmlSyncService` (scan dir → generate/update UML z layoutem, diff→git-like history, codegen TS/Python/C++), `GitRepoService` (CLI git wrapper, obsługa `.repo.json`).
- **web-client** — React klient backendu. `MqttClient` (WS, request-response, **size-aware: MQTT <2MB / HTTP większe**, `setUserBasePath()` tenant isolation, path normalization), `FilesystemService` + Context/Provider, `configureUrls()` (auto-detect z `window.location`), `TypeDocViewer`, MJD edytory React. **Uwaga:** Monaco/VFS UI/pluginy przeniesione do `texteditor`.
- **texteditor** — Monaco multi-editor workspace (peer: React/MUI/Monaco/XTerm/@xyflow/react/blockly). `TextEditorWorkspace` (reusable wrapper z opcjonalnym AI agent + terminal + project actions), `SubpathFS` (prefix VFS), `VfsExplorer`/`VfsMountManager`/`VfsCommitDialog`, `Project` base + 8 typów projektów (Arduino/NodeJs/PicoSdk/Pygame/UPython/Notes/Python/Editor), builtin pluginy (TypeScript/Python/C++ IntelliSense, Markdown LSP/Preview, MJD editor, VisualMinisLib ReactFlow), `ArduinoBoardConfigDialog`.
- **web-cpp** — browser-side C++/WASM runtime simulator dla Emscripten MODULARIZE+ASYNCIFY. `CppWasmRuntime` dialog: build (SSE), run, pin visualizer (14 digital+6 analog), serial monitor.
- **core-scene3d** — 3D scene core (Three.js + @react-three/fiber). `SceneNode`/`SceneGraph`, węzły (MeshNode/LightNode/CameraNode/GroupNode), `RenderEngine`/`RenderLoop`, `SimpleViewer` (R3F + OrbitControls + TransformControls gizmo, `autoFit`, camera presets standard/blender/maya/cad), I/O (GLTF/OBJ/STL), `SceneSerializer`/`Deserializer`.
- **ui-core** — hooks, theme, context (no external deps). `defaultTheme` (dark), `ConfigProvider` (CSS custom properties `--mhersztowski-*`), `useDialog`/`useToast`/`useToggle`, generic `deepMerge`.
- **ui-components-scene3d** — `RichEditor` (3-pane Allotment: SceneTree | Viewport | Properties; menu File, toolbar Move/Rotate/Scale), panels (SceneTree/Properties z decoupled inputs/Animation z keyframing/Prefabs).
- **minislib** — Qt-inspired object system. `Signal<T>`, `MObject` (parent/child tree, tracked connections, `destroy()`), `MProperty<T>`, `MTimer`, `MEventBus`, `MStateMachine`, `MCommand`/`MCommandStack` (undo/redo), `MListModel<T>`, `MLogger`. Publikowany do **GitHub Packages** (workflow trigger: tag `minislib-v*`). W monorepo używaj `workspace:*`.
- **minisc** — kompilator MinisC (C-like → bytecode `.mbc`). Pipeline: lexer→parser→codegen→packer. Runtime to **C++ biblioteka Arduino** (esp32, ~4 KB RAM): stack-based VM wykonujący `.mbc`. Skrypty wgrywane przez MQTT/OTA bez reflashowania. Backend wstrzykuje runtime gdy projekt ma `useMinisC`.
- **core-cad** — CAD 2D/3D core engine (bez renderingu, bez React/Three.js, tylko `crypto.randomUUID`). `EntityRegistry`+typy encji (line/circle/polyline/rect/arc/text/image/freehand/dimension/box3d/cylinder3d/sphere3d), `LayerSystem`, `HistoryManager` (bounded 100), `SelectionManager`, `SnapEngine` (grid/endpoint/midpoint/center/intersection), `EventBus`, `Project` (fasada toJSON/fromJSON).
- **core-cad-viewer** — read-only viewery scen wydzielone z cad-app: `CadViewerPage` (SVG), `Cad3dViewerPage`, `Scene3dViewerPage`, `ElectronicsViewerPage` (lekki SchematicView), `MapViewerPage` (Leaflet), `NotesViewerPage`. Własny minimalny VFS read-client. `setViewerUserId()`.

### Aplikacje (`app/`)

#### mycastle-backend (port **1894**)
Node.js + ESM (`"type": "module"`), tsup build, tsx watch dev. **HTTP + MQTT WebSocket at `/mqtt` + Terminal WebSocket at `/ws/terminal`** w shared mode (jeden port). Opcjonalnie MQTT na osobnym porcie via `MQTT_PORT`.

- `src/App.ts` — **App singleton** trzymający wszystkie moduły. `App.create(config)` → `App.instance.init()` → `App.instance.shutdown()`. Seeduje admina (admin/admin) przy pierwszym uruchomieniu.
- `src/MycastleHttpServer.ts` — rozszerza `HttpUploadServer`, dodaje pełne `/api/*` REST + JWT auth middleware + RPC dispatch + Swagger. Generyczny `handleCrud(config)`. Public endpoints: `GET /api/data-files`, `GET /api/users/{u}/devices/{d}/smart-display`, `GET /api/immich/*` (proxy + retry + 1h cache), `GET /api/weather-image` (Open-Meteo + sharp SVG→PNG + 15min cache).
- **MQTT auth:** anonymous (web client) lub API key lub JWT lub username+password.
- Moduły w `src/modules/`: **ocr** (Tesseract+Sharp+PolishReceiptParser), **automate** (BackendAutomateEngine), **scheduler** (node-cron), **iot** (SQLite WAL + TelemetryStore + DevicePresence + CommandDispatcher + AlertEngine + DeviceShareStore + `IotExtensionRegistry` z VFS/SmartDisplay/Display extensions), **arduino** (CLI local/Docker/DockerRun + `MinisConfig` injection do `.h` + lib install z git-url), **upython** (mpremote local/Docker/DockerRun), **pygame** (pygbag), **picosdk** (RP2040/RP2350 build w Docker), **arduino-wasm** (emsdk Docker → WASM), **git** (`GitService` over `GitRepoService` z drive `.repo.json`), **rpc** (handlers), **nodejs** (SSE `npm install`/`run`), **plugins** (web: esbuild→CJS; backend: esbuild→ESM, in-process import przez `data:` URL, opcjonalny `basePath` dla przyjaznych URL-i), **terminal** (node-pty WebSocket, ticket auth 30s), **secrets** (szyfrowanie na dysku), **lsp-proxy** (lazy).
- IoT: device wysyła hello z `MINIS_DEVICE_SN = deviceName` (wstrzykiwane przy deploy); klucz w MQTT i rejestrach to zawsze **deviceName** (SN tylko do śledzenia buildów).
- **MycastleHttpServer admin:** `POST /api/admin/docs/generate` (`pnpm gendocs` → `public/docs.json`), `POST /api/admin/screenshots/generate` (Playwright + Claude Vision API → `public/screenshots/docs.json` z callouts). Wymaga `ANTHROPIC_API_KEY`.

#### mycastle-web (dev port **1895**)
React 18 + TS, Vite 5, MUI 5, Monaco, Blockly, xterm.js, esptool-js, mqtt. **PWA** (VitePWA, JS bundles `NetworkFirst` — nowe buildy pobierane natychmiast). Proxy w dev: `/api`→1894, `/mqtt`→ws://1894, `/ws/terminal`→ws://1894. Path aliases: `@`/`@modules`/`@components`/`@pages`.

- `src/App.ts` — App singleton (`App.create()` w `main.tsx` przed renderem).
- `src/AppRoot.tsx` — unified routing, `RequireAuth` (auth_redirect w sessionStorage), `AdminOnly`, `PageHooksRunner`.
- **Provider tree** (`main.tsx`): `DisplayProvider` → `BrowserRouter` → `NotificationProvider` → `AuthProvider` → `PluginProvider` → `MqttProviderWithAuth` (JWT jako mqttPassword) → `FilesystemProvider` → `MinisDataSourceProvider` → `GlobalWindowsProvider` → AppRoot + Globals (ApiDocs/RpcExplorer/MqttExplorer/MjdDefEditor/MjdDataEditor/Terminal).
- Moduły: **mqttclient**/**filesystem**/**auth** (JWT w sessionStorage, impersonation, `minis:session-expired` event), **uiforms** (Godot-like designer + 21 kontrolek + binding), **automate** (NodeRed-like designer, runtime client/backend/universal), **notification**, **ai** (OpenAI/Anthropic/Ollama + tool calling), **speech** (TTS/STT/Wake Word), **conversation** (tool calling, ActionRegistry, scenariusze), **shopping** (AI Vision/OCR/Hybrid receipt scanner), **ardublockly2** (Arduino C++ generator), **upythonblockly** (MicroPython generator + REPL + serial/WebREPL upload + libraries), **pygameblockly** (native/web mode dla pygbag), **serial** (Web Serial + esptool-js + predefined firmware), **iot-emulator**, **web-plugins** (CJS bundle ładowany przez `new Function` z require-shimem dla React/MUI/web-client), **script-runtime** (`executeScript()` przez AsyncFunction, `MarkdownOutput`/`TableOutput`/`ReactiveValue` markery).
- Serwisy: `MinisApiService` (singleton `minisApi`, full REST do `/api/*`, dispatches `minis:session-expired` na 401), `RpcClient` (singleton `rpcClient`, type-safe).
- **Wzorzec dostępu:** strony używają `const { aiService } = App.instance;`. React contexty (useMqtt/useFilesystem/useNotification/useAuth) pozostają dla reaktywnego stanu UI.
- **MdEditor** (TipTap): block-level extensions (`CadViewEmbed`, `EventBlock`, `InfoMark` z VFS markdown, `DictationDialog` z TTS+canvas handwriting, `TodayNowMarker` live overlay w daily journals, `AutomateScript` z QObject scene panel), `PluginScript` block (Monaco edit + Auto/Manual run + persistencja w code fence ` ```pscript:blockId:mode:label `).
- **Strony:** full-page (workspace/editor/designer/viewer — owinięte `MinimalTopBar`), public (`/`, `/login/:userName`, **`/watch`** — anonimowe MQTT dla Galaxy Watch), full-page Minis (project pages z Blockly↔Code przez `window.location.href`), Layout pages (admin/user/electronics/iot/programming/PIM). Menu **Programming**: UML edytor (ReactFlow class-diagram, git-like history w v2 `*.umlproj.json` — współpracuje z `@mhersztowski/devtools`), MinisC edytor, ServerLogic (AdminOnly).

#### cad-backend (port **1897** internal) + cad-app (dev port **1898**)
CAD VFS server + edytor. `vite build` w cad-app wyprowadza do `cad-backend/public/`.

- **cad-backend** — VFS REST API (`GET/POST /api/vfs/...`), multi-user `/users/{userId}/projects/{name}.cad.json`. CORS configurable (`CAD_CORS_ORIGIN`). Env: `CAD_DATA_DIR`, `CAD_BACKEND_PORT`, `LDRAW_DIR`. **LDraw parts library** (strona Lego): `GET /api/ldraw/status`, `POST /api/ldraw/install` (jednorazowo pobiera + rozpakowuje official `complete.zip` ~140MB do `<dataDir>/ldraw`, wymaga systemowego `unzip`), `GET /api/ldraw/parts?search=` (katalog: curated common + skan `parts.lst`), `GET /api/ldraw/lib/<path>` (serwuje pliki części dla `LDrawLoader`; 404 na braki, by loader próbował dalej: parts/→p/→models/).
- **cad-app** — React + Three.js. Tryby przełączane zakładkami: **CAD** (2D/3D toggle, ortho/perspective), **CAD 3D** (parametryczny modeler z `FeatureTree` i OpenCascade.js — sketch/extrude/pocket/hole/groove/revolve/mirror/shell/loft/sweep/helix + sub-selekcja vertex/edge/face), **Scene 3D** (`RichEditor`), **Lego** (`LegoView` — designer zestawów Lego na core-scene3d SceneGraph + SimpleViewer; proste cegły box+study **oraz** części **LDraw**: `ldraw.ts` ładuje części przez `LDrawLoader`, wypieka THREE mesh → MeshNode `custom` w tej samej scenie, paleta części + import `.ldr/.mpd/.dat` + export do line-type-1 `.ldr`), **Electronics** (`ComponentLibrary` + `BreadboardCanvas`).
- 19 narzędzi (Select/Line/Circle/Arc/Rect/Polyline/Freehand/Text/Image/Move/Copy/Rotate/Offset/Trim/Fillet/Dimension + Box3d/Cylinder3d/Sphere3d). `ToolContext` ma `pen: PenInput` (pointerType/pressure/tilt). `DimensionOverlay` HTML poza canvasem (worldToScreen). `SnapEngine` z intersection snap.
- **6 viewerów scen** importowanych z `@mhersztowski/core-cad-viewer`. URL-based routing przez regex na `pathname`.
- **UnifiedFileMenu** + `FileOpsContext` — jedno górne menu File wspólne dla wszystkich trybów; każdy tryb rejestruje swoje akcje przez `useRegisterFileOps(mode, ops, deps)` z **stabilnymi triggerami** (inaczej pętla renderów).
- Vite aliases dla react/emotion + `optimizeDeps.exclude` dla workspace paczek (zapobiega wielokrotnym instancjom React).

#### client (Python, Windows) — `app/client/`
MQTT agent (paho-mqtt) + operacje systemowe + **aplikacja Smart Display (pygame)**.

- `agent.py` `ClientAgent` — heartbeat, command routing, VFS extension, encje (`SensorEntity`/`BinarySensorEntity`/`SwitchEntity`/`NumberEntity`/`ButtonEntity`/`SelectEntity` — Python mirror TS hierarchii). **Display contract jest generyczny** — każdy obiekt z `extension_type` attr jest podpinany na `ext/{type}/req`↔`/res` (legacy fallback do `'smart-display'`).
- `apps/smart_display.py` — pygame 800×480 FPS=10. Widoki: clock/text/metric/image/random-image (Immich + Claude Haiku TTS opis przez espeak-ng/espeak/pyttsx3 fallback)/weather (PNG z backendu, 15min cache). Sliding window prefetch (max 2 surfaces). Config reload co 1h lub key 'r'. Tryb: `agent w daemon thread, display.run() blokuje main thread` (pygame wymaga main thread).
- `apps/watchtower*.py` — **Watchtower** (PySide6 Qt): always-on-top transparent click-through overlay nad desktopem + designer w jednej apce. Extension type `virtual-desktop-display`. **Designer mode** (`DesignerWindow`): canvas drag-drop z `Annotation` (box/label/arrow/tooltip), properties panel, lista displayów, File: New/Open/Save JSON, Publish via MQTT. **Overlay mode** (`OverlayWindow`): frameless `WindowStaysOnTopHint | WindowTransparentForInput`, transparent background, paint `VirtualDesktopDisplay` z auto-scale do rozdzielczości ekranu. Tray icon: Open Designer / Toggle Overlay (też F8) / Quit. MQTT ops na `ext/virtual-desktop-display/req`: `update {config}` / `clear` / `get` → response `state {config}` na `/res`. Modele: `Annotation`, `Rect`, `AnnotationStyle`, `VirtualDesktopDisplay`, `WatchtowerConfig` (mirror TS — camelCase na wire). Persystencja: `data/watchtower.json`. Run: `app:watchtower` (Qt wymaga main thread → agent w daemon thread, jak SmartDisplay).
- `apps/client_desktop*.py` — **client_desktop** (PySide6 Qt): samodzielny klient MQTT dla warstwy **server-logic** (`packages/server-logic/src`, patrz `docs/ServerLogic.md`). Jeden klient `{user}/desktop-native/{clientId}` loguje się (`client-login`) i rejestruje trzy wirtualne peryferia jako **devices** przez `client-device-new` (mouse=`vmouse`, keyboard=`vkeyboard`, display=`vdisplay`), każde z toggle enable/disable w UI. Lifecycle na client **outbox**: `client-login`/`client-logout`/`client-device-new`/`client-device-remove`/`heartbeat`. Komendy przychodzą na `{...}/device/{id}/inbox` → `device.handle(type, payload)` → odpowiedź `{type}.ok`/`error` na `{...}/device/{id}/outbox`. `client_desktop_devices.py` — Qt-free logika (mouse/keyboard przez `pynput`, display trzyma stan + callback do UI). `client_desktop_client.py` — `ServerLogicClient` + `ClientSignals` (QObject bridge network→main thread). Tray icon: Show / Quit, close→minimize to tray. Run: `python -m apps.client_desktop` / `run_client_desktop.bat` / `run_client_desktop.sh`. Wymaga działającego `IotServer` (przez `SERVER_LOGIC_AUTOSTART=true` albo skrypt Drive z transportem subskrybującym `#`).
- `extensions/vfs.py` — directory traversal guard przez `os.path.realpath`+`startswith(root_dir)`.
- Run: `app/client/run.sh` (auto venv + deps przy pierwszym uruchomieniu). Win32: osobny venv `.venv-win` (venv jest OS-zależny) — używaj `run_*.bat`.

#### Pozostałe apki
- **mycastle-mobile** / **mycastle-watch** — React Native (Expo) WebView wrappery. `jsEngine: jsc`. `app.config.js` czyta env vars build-time. Build: `docker compose -f docker-compose.cli.yml run --rm {android|watch} /workspace/app/{...}/build.sh`. Patche: `usesCleartextTraffic=true`, Gradle init script suppress Compose Kotlin version check (1.9.25 vs 1.9.24).
- **demo-scene-3d** — Scene3D demo, Vite 7.
- **mycastle-mobile build-cad.sh** — wariant z env `MYCASTLE_SERVER_URL=https://cad.hersztowski.org`.

## Development Workflow & Commands

- **Setup:** `pnpm install` (z roota)
- **Build all:** `pnpm build`
- **Build specific:** `pnpm build:core`, `build:core-backend`, `build:minisc`, `build:devtools`, `build:web-client`, `build:texteditor`, `build:web-cpp`, `build:backend`, `build:web`, `build:scene3d`, `build:core-cad`, `build:cad-viewer`, `build:cad`
- **Build CAD stack (kolejność):** `pnpm build:cad-all` = core → core-cad → ui-core → core-scene3d → cad-viewer → ui-scene3d → texteditor → cad-backend → cad
- **Build MyCastle (kolejność):** `pnpm build:mycastle` = core → core-backend → **minisc** → devtools → texteditor → web-client → web-cpp → backend → web. `dev:backend` buduje `minisc` przed startem (backend importuje z `dist`).
- **WAŻNA kolejność:** `texteditor` zależy od `web-client` (re-exports); `mycastle-web` zależy od `texteditor` i `web-cpp`.
- **Dev:** `pnpm dev:backend` (1894), `pnpm dev:web` (1895), `pnpm dev:scene3d`, `pnpm dev:cad` (1898 — proxy /api/* → 1897), `pnpm dev:cad-app`, `pnpm dev:cad-backend`
- **Client agent:** `app/client/run.sh`
- **Test:** `pnpm test` (Vitest unit, wszystkie packages), `pnpm test:watch`, `pnpm test:coverage`, `pnpm test:e2e` (Playwright — auto-start backend+web)
- **Typecheck:** `pnpm typecheck`. **Clean:** `pnpm clean`.
- **Docs:** `pnpm gendocs` (JSON+HTML+Markdown), `pnpm gendocs:html`, `pnpm gendocs:md`
- **Sync:** `pnpm sync:push [--force]` (local→server, wyklucza `iot.db` + Arduino build/libs), `pnpm sync:pull`, `pnpm sync:db-push` (SQLite via `.backup` + scp), `pnpm sync:db-pull`
- **APK:** `docker compose -f docker-compose.cli.yml run --rm {android|watch} /workspace/app/{...}/build.sh`
- **Docker (MyCastle):** `docker compose build && docker compose up -d`

**IMPORTANT:** Wszystko z WSL (nie Windows cmd). pnpm bin shims są OS-specific.

## Deployment (Coolify)
- `docker-compose.yml` — 2 serwisy: `backend` (1894, volume `/data`) + `web` (nginx :80, proxy do backend).
- Frontend Dockerfile **usuwa `.env` przed buildem** — `urlHelper.ts` auto-detect z `window.location`.
- nginx proxy: `/mqtt` (WebSocket upgrade), `/upload`, `/files/`, `/ocr`, `/webhook/` → backend:1894.
- W Coolify: Docker Compose resource → przypisz domenę do serwisu `web`. `demo-scene-3d` osobny resource.

## Code Style & Principles
- **Formatting:** Prettier automated
- **Naming:** camelCase
- **Documentation:** docstrings/comments focused on **"why"**, not "what"
- **Modularity:** single responsibility
- **Imports:** `@mhersztowski/core` dla shared types. Używaj `export type` dla interface re-exports w ESM barrels.

### ESM Considerations
- Backend: `"type": "module"`, barrel re-exports muszą używać `export type { ... }` dla interfejsów (ESM type erasure — inaczej "does not provide an export named").
- Packages: tsup dual build (ESM + CJS).
- Frontend: Vite handles ESM natively.

## Testing Guidelines
- **Unit/Integration:** Vitest 4 (globals enabled). Każdy package/app ma własny `vitest.config.ts`. Root agreguje wszystkie. Frontend (mycastle-web, ui-core) używa `jsdom` + React Testing Library. Setup w `src/test-setup.ts`. `tsconfig.json` excludują `*.test.ts(x)`.
- **E2E:** Playwright. Config w `playwright.config.ts` (root). Testy w `tests/e2e/`. Auto-start backend+web z health check na Swagger. Fixtures kopiowane do `data-test/` w global setup/teardown.
- **Mocking:** Frontend mockuje serwisy (`vi.mock()`). Backend używa temp dirs + dynamic port (port 0). React hooks: `renderHook()` z wrapper providers.
- **Behaviour:** zawsze pisz testy przed implementacją.
- **Commands:** `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`, `pnpm test:e2e`. Per-package: `pnpm --filter @mhersztowski/core test`.

## Environment & Dependencies
- **Languages:** Node 20, TypeScript 5.9+, Python 3.14 (client)
- **Package manager:** pnpm 10.28.2 (workspaces), pip
- **Build:** tsup (packages/backends), Vite 5 (mycastle-web), Vite 7 (scene3d, cad-app)
- **Testing:** Vitest 4, Playwright, @vitest/coverage-v8, React Testing Library
- **Docs:** TypeDoc 0.28 + typedoc-plugin-markdown. Config `typedoc.json` (entryPointStrategy: packages). Output: `docs-site/` (gitignored).
- **Frontend:** React 18, MUI 5, ReactFlow, Tiptap 3, Monaco
- **Backend:** Aedes, dotenv, dayjs, Tesseract.js, Sharp, node-cron. Core-backend dodatkowo: jsonwebtoken, bcrypt.
- **Client:** paho-mqtt, pygame, psutil, pyperclip, Pillow, pygetwindow, pycaw, winotify, anthropic, pyttsx3

## Architecture Documentation
- `docs/architecture/` — punkt wejścia: `README.md`. Używamy **C4 Model + Mermaid + ADR (MADR)**.
- `docs/architecture/adr/` — 10 ADR (monorepo, MQTT, ESM/CJS, SQLite, Zod, App Singleton, VFS, auth, shared port, C4)
- `docs/architecture/diagrams/` — Mermaid (C4 L1–L3, package deps, MQTT/auth/Arduino flow)
- `docs/architecture/drawio/system-overview.drawio` — diagram draw.io (VS Code Draw.io Integration)
- Narzędzia (instalacja przez `docs/architecture/install-tools.sh`): adr-tools (`adr new 'Tytuł'`), log4brains (`log4brains preview`), VS Code Mermaid/Draw.io extensions.

## Common Gotchas
- **ESM barrels:** Backend `index.ts` musi używać `export type { ... }` dla TS interfaces (ESM type erasure → "does not provide an export named").
- **pnpm strict mode:** wszystkie deps explicit w `package.json` (no hoisting transitive deps).
- **Aedes ESM:** `import aedes from 'aedes'` (default only), then `const { createBroker } = aedes`.
- **WSL vs Windows:** `pnpm install` tworzy OS-specific bin shims. Wszystko z WSL.
- **VITE_* env vars:** baked at build time. Vite ładuje `.env.development`/`.env.production` automatycznie. W produkcji Docker `.env` jest usuwany, URL auto-detect.
- **App singleton (frontend):** używaj `App.instance.serviceName` zamiast bezpośrednich importów. `App.create()` w `main.tsx` przed renderem.
- **MQTT:** unikalne client IDs. WebSocket path `/mqtt`. Shared mode (single port) w deployment.
- **FilesystemContext:** `dataVersion` counter triggers re-renders na FILE_CHANGED events.
- **IoT device key:** zawsze **deviceName** (w MQTT topics, rejestrach backendu, API). SN tylko do śledzenia buildów.
- **MqttClient size-aware:** <2MB przez MQTT, większe przez HTTP. `setUserBasePath(path)` izoluje tenanta.
- **CAD `useRegisterFileOps` w cad-app:** `register`/`unregister` muszą być stabilnymi triggerami z `useCallback([])` — zależność od obiektu `ctx` powoduje pętlę renderów (bump version → nowy ctx → nowy render).
- **Vite cad-app aliases:** react/emotion + `optimizeDeps.exclude` workspace paczek — zapobiega wielokrotnym instancjom React z `node_modules`.
