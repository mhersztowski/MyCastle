# Project: MyCastle

## Overview
pnpm monorepo managing personal information data, with shared packages and multiple deployable applications.

## Architecture
Monorepo z pnpm workspaces. Shared code w `packages/`, aplikacje w `app/`.

### Shared packages
- **@mhersztowski/core** (`packages/core/`) — współdzielone modele, nody, automate models, MQTT types. Dual ESM+CJS build (tsup).
  - `models/` — PersonModel, TaskModel, ProjectModel, EventModel, ShoppingModel, FileModel, DirModel
  - `nodes/` — NodeBase (z UI state: _isSelected, _isExpanded, _isEditing, _isDirty), PersonNode, TaskNode, ProjectNode, EventNode, ShoppingListNode
  - `automate/` — AutomateFlowModel, AutomateNodeModel (+ NODE_RUNTIME_MAP, createNode), AutomateEdgeModel, AutomatePortModel
  - `mqtt/` — PacketType enum, PacketData, FileData, BinaryFileData, DirectoryTree, ResponsePayload, ErrorPayload, FileChangedPayload
- **@mhersztowski/core-scene3d** (`packages/core-scene3d/`) — 3D scene core (SceneGraph, SceneNode, RenderEngine, IO)
- **@mhersztowski/ui-core** (`packages/ui-core/`) — hooks, theme, utils for scene3d UI
- **@mhersztowski/ui-components-scene3d** (`packages/ui-components-scene3d/`) — scene3d UI components (RichEditor, panels, toolbar)

### Aplikacja backend (`app/mycastle-backend/`)
- Node.js, ESM (`"type": "module"`), build z tsup, dev z tsx watch
- Port: 1894 (HTTP + MQTT WebSocket at `/mqtt` — shared mode)
- Składa się z następujących modułów:
    - **filesystem** — wczytuje/zapisuje dane do plików, in-memory cache, EventEmitter (`fileChanged`), atomic writes, per-file locking
    - **mqttserver** — Server MQTT (Aedes), klasa Client, klasy Packet per typ. Obsługuje AUTOMATE_RUN, broadcastuje FILE_CHANGED
      - `packets/` — barrel z `export type` dla interfejsów (ESM compatibility)
    - **httpserver** — HttpUploadServer z CORS. Endpointy: POST /upload, GET /files/, POST /ocr, GET /ocr/status, POST/GET /webhook/{flowId}/{nodeId}
    - **ocr** — Tesseract.js + Sharp preprocessing, PolishReceiptParser, non-blocking init
    - **datasource** — in-memory store (persons, tasks, projects, shoppingLists, calendar), auto-reload z FileSystem events. Importuje modele/nody z @mhersztowski/core
    - **automate** — AutomateService, BackendAutomateEngine (graph traversal, merge nodes), BackendSystemApi, AutomateSandbox
    - **scheduler** — SchedulerService (node-cron), auto-reload z filesystem events

### Aplikacja frontend (`app/mycastle-web/`)
- React 18 + TypeScript, Vite, Material UI
- Dev port: 1895 (Vite HMR)
- Importuje modele/nody z `@mhersztowski/core` (barrel re-exports w `filesystem/models/index.ts` i `filesystem/nodes/index.ts`)
- Moduły:
    - **mqttclient** — MQTT client, MqttContext, AUTOMATE_RUN (timeout 120s), FILE_CHANGED
    - **filesystem** — DirData, FileData, FilesystemService, FilesystemContext (dataVersion counter)
    - **uiforms** — system UI (Godot-like): models, nodes, renderer (21 kontrolek), designer (drag & drop), binding (oneWay/twoWay), services
    - **automate** — graficzny język (NodeRed-like): designer (responsive mobile), engine, registry (NODE_TYPE_METADATA), services. Runtime: client/backend/universal. Merge node, Manual Trigger
    - **notification** — NotificationService, NotificationProvider
    - **ai** — providers (OpenAI, Anthropic, Ollama), tool calling, konfiguracja data/ai_config.json
    - **speech** — TTS/STT/Wake Word providers, SpeechService, AudioRecorder, WakeWordService
    - **conversation** — ConversationEngine z tool calling, ActionRegistry (task/calendar/file/person/project/navigation/automate/shopping actions), scenariusze
    - **shopping** — skanowanie paragonów (AI Vision / OCR / Hybrid), ReceiptScannerService
- Komponenty reużywalne: editor (Monaco), mdeditor (Tiptap + extensions), upload, person/project/task (Label, Picker, ListEditor), ObjectSearch
- Strony: /filesystem/list, /person, /project, /calendar, /todolist, /shopping, /agent, /automate, /designer/automate/:id, /designer/ui/:id, /viewer/md/:path, /viewer/ui/:id, /editor/simple/:path, /settings/ai, /settings/speech, /settings/receipt, /settings/hooks, /objectviewer, /components

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
├── docker-compose.yml              # Coolify deployment (backend + web)
├── .npmrc
│
├── packages/
│   ├── core/                       # @mhersztowski/core (shared models, nodes, mqtt, automate)
│   │   ├── src/{models,nodes,automate,mqtt}/
│   │   ├── tsup.config.ts          # Dual ESM+CJS
│   │   └── package.json
│   ├── core-scene3d/               # @mhersztowski/core-scene3d
│   ├── ui-core/                    # @mhersztowski/ui-core
│   └── ui-components-scene3d/      # @mhersztowski/ui-components-scene3d
│
├── app/
│   ├── mycastle-backend/           # Backend Node.js
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point (port from PORT env, default 1894)
│   │   │   └── modules/{filesystem,mqttserver,httpserver,ocr,datasource,automate,scheduler}/
│   │   ├── Dockerfile              # Multi-stage: build → node:20-slim production
│   │   ├── tsup.config.ts          # ESM, target node20
│   │   └── package.json
│   ├── mycastle-web/               # Frontend React
│   │   ├── src/
│   │   │   ├── modules/{mqttclient,filesystem,uiforms,automate,ai,speech,conversation,shopping,notification}/
│   │   │   ├── pages/
│   │   │   └── components/{editor,mdeditor,person,project,task,upload}/
│   │   ├── Dockerfile              # Multi-stage: build → nginx:alpine (removes .env before build)
│   │   ├── nginx.conf              # SPA + reverse proxy to backend (/mqtt, /upload, /files, /ocr, /webhook)
│   │   ├── vite.config.ts          # Dev port: 1895
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
├── data/                           # Runtime data (ROOT_DIR)
├── docs/                           # automate.md, desktop.md, conversation.md, uiforms.md
└── scripts/
```

## Development Workflow & Commands
- **Setup:** `pnpm install` (from root)
- **Build all:** `pnpm build`
- **Build specific:** `pnpm build:core`, `pnpm build:backend`, `pnpm build:web`, `pnpm build:scene3d`
- **Run backend:** `pnpm dev:backend` (port 1894, HTTP + MQTT WebSocket at /mqtt)
- **Run frontend:** `pnpm dev:web` (port 1895, Vite HMR)
- **Run scene3d:** `pnpm dev:scene3d` (requires packages built first)
- **Run desktop agent:** `cd app/desktop && python agent.py`
- **Typecheck:** `pnpm typecheck`
- **Clean:** `pnpm clean`
- **Docker (MyCastle):** `docker compose build && docker compose up -d`
- **Docker (Scene3D):** `docker build -f app/demo-scene-3d/Dockerfile -t demo-scene-3d .`

**IMPORTANT:** Run all commands from WSL (not Windows cmd). pnpm bin shims are OS-specific.

## Deployment (Coolify)
- `docker-compose.yml` definiuje 2 serwisy: `backend` (port 1894, volume /data) + `web` (nginx port 80, proxy do backend)
- Frontend Dockerfile usuwa .env przed buildem — `urlHelper.ts` auto-detect URLs z `window.location`
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

## Environment & Dependencies
- **Languages:** Node 20, TypeScript 5.9+, Python 3.14 (desktop)
- **Package manager:** pnpm 10.28.2 (workspaces), pip (Python)
- **Build tools:** tsup (packages, backend), Vite 5 (frontend), Vite 7 (scene3d)
- **Frontend:** React 18, Material UI 5, ReactFlow, Tiptap 3, Monaco Editor
- **Backend:** Aedes (MQTT), dotenv, dayjs, Tesseract.js, Sharp, node-cron
- **Desktop:** paho-mqtt, psutil, pyperclip, Pillow, pygetwindow, pycaw, winotify

## Common Gotchas
- **ESM barrels:** Backend barrel `index.ts` files must use `export type { ... }` for TypeScript interfaces. Otherwise ESM runtime throws "does not provide an export named" error.
- **pnpm strict mode:** All dependencies must be listed explicitly in package.json (no hoisting of transitive deps).
- **Aedes ESM import:** `import aedes from 'aedes'` (default export only), then `const { createBroker } = aedes`.
- **WSL vs Windows:** `pnpm install` creates OS-specific bin shims. Run everything from WSL.
- **VITE_* env vars:** Baked at build time. For production Docker, .env is removed so auto-detect kicks in.
- **MQTT:** Use unique client IDs. WebSocket path: `/mqtt`. Shared mode (single port) for deployment.
- **Frontend data reload:** FilesystemContext `dataVersion` counter triggers re-renders on FILE_CHANGED events.
