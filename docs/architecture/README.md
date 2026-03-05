# Architektura MyCastle

Dokumentacja architektoniczna monorepo MyCastle. Używamy **C4 Model** jako standard opisu systemu, **Mermaid** do diagramów w Markdown oraz **ADR** do rejestrowania decyzji architektonicznych.

## Nawigacja

### Diagramy (C4 Model)
| Poziom | Plik | Opis |
|--------|------|------|
| L1 – Context | [c4-context.md](diagrams/c4-context.md) | Landscape systemu: użytkownicy, systemy zewnętrzne |
| L2 – Containers | [c4-containers.md](diagrams/c4-containers.md) | Wszystkie aplikacje i pakiety |
| L3 – Components (Minis Backend) | [c4-components-minis-backend.md](diagrams/c4-components-minis-backend.md) | Wewnętrzne moduły minis-backend |
| L3 – Components (Minis Web) | [c4-components-minis-web.md](diagrams/c4-components-minis-web.md) | Moduły minis-web (React) |

### Diagramy przepływu
| Plik | Opis |
|------|------|
| [package-dependencies.md](diagrams/package-dependencies.md) | Graf zależności między pakietami monorepo |
| [mqtt-iot-flow.md](diagrams/mqtt-iot-flow.md) | Pipeline telemetrii IoT przez MQTT |
| [auth-flow.md](diagrams/auth-flow.md) | Przepływ autentykacji JWT + API Key |
| [arduino-compilation-flow.md](diagrams/arduino-compilation-flow.md) | Kompilacja i upload firmware Arduino |

### draw.io
| Plik | Opis |
|------|------|
| [system-overview.drawio](drawio/system-overview.drawio) | Przegląd systemu (C4 L1+L2), otwórz w draw.io lub app.diagrams.net |

### ADR (Architecture Decision Records)
| Nr | Tytuł | Status |
|----|-------|--------|
| [0001](adr/0001-pnpm-monorepo.md) | pnpm Workspaces jako monorepo | Accepted |
| [0002](adr/0002-mqtt-as-transport.md) | MQTT jako primary transport | Accepted |
| [0003](adr/0003-dual-esm-cjs-packages.md) | Dual ESM+CJS build dla pakietów | Accepted |
| [0004](adr/0004-sqlite-iot-storage.md) | SQLite dla telemetrii IoT | Accepted |
| [0005](adr/0005-zod-single-source-of-truth.md) | Zod jako single source of truth | Accepted |
| [0006](adr/0006-app-singleton-pattern.md) | App Singleton Pattern | Accepted |
| [0007](adr/0007-vfs-abstraction.md) | VFS Abstraction Layer | Accepted |
| [0008](adr/0008-jwt-apikey-dual-auth.md) | JWT + API Key dual authentication | Accepted |
| [0009](adr/0009-shared-http-mqtt-port.md) | Shared HTTP + MQTT WebSocket port | Accepted |
| [0010](adr/0010-c4-model-documentation.md) | C4 Model jako standard dokumentacji | Accepted |

## Przegląd systemu

MyCastle to monorepozythorium pnpm składające się z dwóch niezależnych platform:

### MyCastle Platform
Zarządzanie informacjami osobistymi (osoby, zadania, projekty, kalendarz, zakupy, automate, AI).

- **mycastle-backend** – Node.js, port 1894, HTTP + MQTT broker (Aedes)
- **mycastle-web** – React 18 + MUI 5, port 1895 (dev)

### Minis Platform
Platforma IoT do tworzenia i zarządzania urządzeniami (Arduino/ESP32/uPython), telemetria, alerty, zdalne programowanie.

- **minis-backend** – Node.js, port 1902, HTTP REST + MQTT broker + SQLite IoT DB
- **minis-web** – React 18 + MUI 6, port 1903 (dev)

### Pakiety współdzielone
```
@mhersztowski/core            # Modele, Zod, RPC, VFS, MQTT types, MJD
@mhersztowski/core-backend    # FileSystem, HttpServer, MqttServer, Auth
@mhersztowski/web-client      # MQTT client, Filesystem, VFS UI, Monaco, MJD editors
@mhersztowski/core-scene3d    # 3D SceneGraph (Three.js)
@mhersztowski/ui-core         # Hooks, theme, utils
@mhersztowski/ui-components-scene3d  # 3D UI components
```

## Jak renderować diagramy

### Mermaid
- **VS Code:** rozszerzenie _Markdown Preview Enhanced_ lub _Markdown All in One_
- **GitHub/GitLab:** natywne renderowanie w plikach `.md`
- **Online:** [mermaid.live](https://mermaid.live)

### draw.io
- **Desktop:** [draw.io Desktop](https://github.com/jgraph/drawio-desktop/releases)
- **Online:** [app.diagrams.net](https://app.diagrams.net) → File → Open From → Device
- **VS Code:** rozszerzenie _Draw.io Integration_ (hediet.vscode-drawio)

### ADR
Format MADR (Markdown Architectural Decision Records). Template: [adr/README.md](adr/README.md).
