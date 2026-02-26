# Minis — Platforma DIY dla dzieci

Minis jest platformą wspierającą tworzenie projektów DIY, na początku skierowaną dla dzieci. Dziecko z bazy dostępnych projektów wybiera sobie ten, nad którym chciałoby pracować. Następnie dziecko ma możliwość pracy nad następującymi procesami: składanie urządzenia, edytowanie gotowego projektu programu (Blockly / Arduino C++) i wgrywanie go na mikrokontroler.

---

## Modele danych (pakiet @mhersztowski/core)

MinisDeviceDef — definicja urządzenia (admin)
- name
- modules — lista MinisModuleDefId

MinisDevice — instancja urządzenia (per user)
- MinisDeviceDefId
- isAssembled
- isIot
- sn — serial number

MinisModuleDef — definicja modułu (admin)
- name — np. Esp32devkitC
- soc — np. Esp32 (jeśli != "" to isProgrammable = true)
- isProgrammable

MinisModule — instancja modułu
- MinisModuleDefId
- sn

MinisProjectDef — definicja projektu (admin)
- name
- version
- DeviceDefId
- ModuleDefId
- softwarePlatform (Arduino)
- blocklyDef
- Pliki .blockly/.ino (uploadowane jako ZIP)

MinisProject — instancja projektu (per user)
- name
- ProjectDefId
- Kopia plików .blockly/.ino (kopiowana z ProjectDef przy tworzeniu)

UserModel — użytkownik
- name, password, isAdmin, roles[]

Na podstawie modeli zdefiniowane są Nody w pakiecie core (MinisDeviceDefNode, MinisDeviceNode, MinisModuleDefNode, MinisModuleNode, MinisProjectDefNode, MinisProjectNode, UserNode) — rozszerzają modele o UI state i metody clone().

### Modele IoT (packages/core/src/models/IotModels.ts)

- **IotDeviceConfig** — konfiguracja urządzenia IoT: topicPrefix, heartbeatIntervalSec, capabilities (sensor/actuator)
- **TelemetryRecord** / **TelemetryMetric** — rekord telemetryczny z metrykami (key, value, unit)
- **TelemetryAggregate** — agregat min/max/avg per okres
- **DeviceCommand** — komenda z lifecycle (PENDING → SENT → ACKNOWLEDGED/FAILED/TIMEOUT)
- **AlertRule** — reguła alertu (metric, condition, severity, cooldown)
- **Alert** — instancja alertu (OPEN → ACKNOWLEDGED → RESOLVED)
- **IotDeviceStatus** — 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
- **DeviceShare** — udostępnienie urządzenia (ownerUserId, deviceId, targetUserId, createdAt)

---

## Filesystem (data-minis/)

```
data-minis/
├── iot.db                               # SQLite — dane IoT (telemetria, komendy, alerty, config)
└── Minis/
    ├── Admin/
    │   ├── Users.json                  # { type, items: [{ id, name, password, isAdmin, roles }] }
    │   ├── DeviceDefList.json          # { type, deviceDefs: [...] }
    │   ├── ModuleDefList.json          # { type, moduleDefs: [...] }
    │   ├── ProjectDefList.json         # { type, projectDefs: [...] }
    │   ├── HowTo/
    │   │   └── ConnectEsp32.md
    │   ├── DeviceDefs/
    │   │   └── {deviceDefId}/          # pliki źródłowe definicji urządzenia
    │   ├── ModuleDefs/
    │   │   └── {moduleDefId}/          # pliki źródłowe definicji modułu
    │   └── ProjectsDefs/
    │       └── {projectDefId}/         # pliki źródłowe definicji projektu
    │           └── examples/
    │               └── sketch1/
    │                   ├── sketch1.ino
    │                   └── sketch1.blockly
    └── Users/
        └── {userName}/
            ├── Device.json             # { type, devices: [...] }
            ├── Project.json            # { type, projects: [...] }
            └── Projects/
                └── {projectId}/        # kopia plików z ProjectDef
                    └── examples/
                        └── sketch1/
                            ├── sketch1.ino
                            └── sketch1.blockly
```

---

## minis-backend (app/minis-backend/)

Node.js, ESM, port 1902 (HTTP + MQTT WebSocket at `/mqtt`).

**Architektura:** App singleton → FileSystem + MinisHttpServer (extends HttpUploadServer) + MqttServer + IotService. Dane platformy w JSON files (FileSystem), dane IoT w SQLite (iot.db). FileSystem events broadcastowane przez MQTT.

### Zaimplementowane REST API (/api/*)

**Autentykacja:**
- `POST /api/auth/login` — logowanie (name + password), zwraca UserPublic (bez hasła)

**Identyfikacja po nazwie:** Użytkownicy i urządzenia identyfikowane przez nazwę (nie UUID) w HTTP routes, MQTT topics i UI. Nazwy muszą spełniać pattern `[a-zA-Z0-9_-]` i być unikalne (user globalnie, device per user). CrudConfig.lookupKey: admin CRUD używa `'id'`, user devices/projects używają `'name'`.

**Admin CRUD** (generyczny handleCrud pattern):
- `GET/POST /api/admin/users` — lista / tworzenie użytkownika (auto-ID, tworzenie katalogu usera, walidacja nazwy)
- `PUT/DELETE /api/admin/users/{id}` — edycja / usunięcie
- `GET/POST /api/admin/devicedefs` — lista / tworzenie definicji urządzenia
- `PUT/DELETE /api/admin/devicedefs/{id}` — edycja / usunięcie (+ kasowanie źródeł)
- `GET/POST /api/admin/moduledefs` — lista / tworzenie definicji modułu
- `PUT/DELETE /api/admin/moduledefs/{id}` — edycja / usunięcie (+ kasowanie źródeł)
- `GET/POST /api/admin/projectdefs` — lista / tworzenie definicji projektu
- `PUT/DELETE /api/admin/projectdefs/{id}` — edycja / usunięcie (+ kasowanie źródeł)

**Upload źródeł:**
- `POST /api/admin/{resource}/{id}/sources` — upload ZIP z plikami (max 50MB), smart prefix stripping

**User CRUD** (per user, dane w Users/{userName}/, lookup po nazwie urządzenia/projektu):
- `GET/POST /api/users/{userName}/devices` — lista / tworzenie urządzenia (walidacja nazwy, unikalność)
- `PUT/DELETE /api/users/{userName}/devices/{deviceName}` — edycja / usunięcie
- `GET/POST /api/users/{userName}/projects` — lista / tworzenie projektu (kopiuje źródła z ProjectDef)
- `PUT/DELETE /api/users/{userName}/projects/{projectName}` — edycja / usunięcie (+ kasowanie źródeł)

**IoT API** (per user/device, dane w SQLite):
- `GET/PUT /api/users/{userName}/devices/{deviceName}/iot-config` — konfiguracja IoT urządzenia
- `GET /api/users/{userName}/devices/{deviceName}/telemetry?from=&to=&limit=` — historia telemetrii
- `GET /api/users/{userName}/devices/{deviceName}/telemetry/latest` — ostatni odczyt
- `POST/GET /api/users/{userName}/devices/{deviceName}/commands` — wysyłanie / lista komend
- `GET/POST /api/users/{userName}/alert-rules` — lista / tworzenie reguł alertów
- `PUT/DELETE /api/users/{userName}/alert-rules/{id}` — edycja / usunięcie reguły
- `GET /api/users/{userName}/alerts` — lista alertów
- `PATCH /api/users/{userName}/alerts/{id}` — acknowledge / resolve alertu
- `GET /api/users/{userName}/iot/devices` — statusy wszystkich urządzeń IoT
- `GET/POST /api/users/{userName}/devices/{deviceName}/shares` — lista / tworzenie udostępnień urządzenia
- `DELETE /api/users/{userName}/devices/{deviceName}/shares/{shareId}` — cofnięcie udostępnienia
- `GET /api/users/{userName}/shared-devices` — urządzenia udostępnione temu użytkownikowi
- `GET /api/users/{userName}/my-shares` — udostępnienia dokonane przez tego użytkownika

**Swagger:**
- `GET /api/docs` — Swagger UI
- `GET /api/docs/swagger.json` — OpenAPI 3.0.3 spec

### IoT Service Layer (src/iot/)

- **IotDatabase** — SQLite (better-sqlite3), WAL mode, schema init, 5 tabel
- **TelemetryStore** — INSERT/query telemetrii, config CRUD, agregacja min/max/avg
- **DevicePresence** — heartbeat tracking, timeout detection (heartbeatInterval × 2.5), EventEmitter statusChange
- **CommandDispatcher** — tworzenie komend (PENDING → SENT), update statusu po ACK
- **AlertEngine** — CRUD reguł, ewaluacja po każdej telemetrii, cooldown, acknowledge/resolve
- **DeviceShareStore** — CRUD udostępnień urządzeń (prepared statements: create, delete, getSharesForDevice, getSharesByOwner, getSharesForTarget)
- **IotService** — orchestrator: parsuje MQTT topics (`minis/{userName}/{deviceName}/{type}`), koordynuje stores, broadcast zmian statusu/alertów, forwarding telemetrii/statusu do shared users

### MQTT Integration

IotService subskrybuje topics `minis/` przez MqttServer.onMessage(). Przetwarza:
- `telemetry` → insert + presence update + alert evaluation + republish to `telemetry/live`
- `heartbeat` → presence update
- `command/ack` → update command status

Publikuje (przez MqttServer.publishMessage()):
- `status` — zmiana ONLINE/OFFLINE
- `telemetry/live` — republished telemetria dla frontendu
- `alert` — triggered alerty

### Device Sharing

Użytkownicy mogą udostępniać swoje urządzenia IoT innym użytkownikom (read-only: telemetria + status).

**Model:** `DeviceShare` — tabela `device_share` w SQLite (UNIQUE na device_id + target_user_id)
**Store:** `DeviceShareStore` — CRUD z prepared statements (create, delete, getSharesForDevice, getSharesByOwner, getSharesForTarget)

**REST API:**
- `GET /api/users/{userName}/devices/{deviceName}/shares` — lista udostępnień urządzenia
- `POST /api/users/{userName}/devices/{deviceName}/shares` — udostępnienie (`{ targetUserId }` — nazwa docelowego użytkownika)
- `DELETE /api/users/{userName}/devices/{deviceName}/shares/{shareId}` — cofnięcie udostępnienia
- `GET /api/users/{userName}/shared-devices` — urządzenia udostępnione TEMU użytkownikowi
- `GET /api/users/{userName}/my-shares` — udostępnienia dokonane przez tego użytkownika

**Uwaga:** Pola `ownerUserId`, `targetUserId`, `deviceId` w modelu DeviceShare przechowują **nazwy** (nie UUID), dzięki czemu queries `getSharesForTarget(userName)` i `getSharesByOwner(userName)` działają z name-based routing.

**MQTT forwarding:** Po każdej telemetrii/zmianie statusu IotService republishuje dane do shared users:
- `minis/{targetUserName}/shared/{ownerUserName}/{deviceName}/telemetry/live`
- `minis/{targetUserName}/shared/{ownerUserName}/{deviceName}/status`

**Frontend:** Przycisk Share na UserDevicesPage (dialog z chipami użytkowników + select). IoT Dashboard wyświetla udostępnione urządzenia z chipem "Shared by {owner}" i niebieską krawędzią.

### Czego jeszcze nie ma:
- Middleware autoryzacji (endpointy są publiczne — wystarczy znać URL)
- Logika składania urządzenia (assembly workflow)
- Kompilacja/deployment projektów na urządzenie
- Wymuszanie ról admin/user na poziomie API

---

## minis-web (app/minis-web/)

React 18 + TypeScript, Vite 6, Material UI 6, port 1903 (proxy /api → :1902, /mqtt → ws:1902).

**Provider tree:** MqttProvider → FilesystemProvider → MinisDataSourceProvider → AuthProvider → App

### Zaimplementowane strony i routing

**Identyfikacja po nazwie:** Routing używa `:userName` i `:deviceName` (nie UUID). Nazwy URL-safe `[a-zA-Z0-9_-]`.

**Publiczne:**
- `/` — HomePage: lista użytkowników jako karty, klik → login
- `/login/:userName` — LoginPage: formularz hasła, nawigacja do admin/user wg roli

**Admin** (`/admin/:userName/*`, Layout z drawer menu):
- `/admin/:userName/main` — AdminDashboardPage: karty nawigacyjne (Users, DeviceDefs, ModuleDefs, ProjectDefs, File Browser)
- `/admin/:userName/users` — UsersPage: tabela CRUD (name, isAdmin, roles), dialogi add/edit
- `/admin/:userName/devicesdefs` — DevicesDefPage: tabela CRUD + upload źródeł ZIP, selektor modułów
- `/admin/:userName/modulesdefs` — ModulesDefPage: tabela CRUD + upload źródeł, auto isProgrammable z SoC
- `/admin/:userName/projectdefs` — ProjectDefsPage: tabela CRUD + upload źródeł, dynamic module filtering po device
- `/admin/:userName/filesystem/list` — FilesystemListPage: dualny przeglądarka plików (drzewo + podgląd)
- `/admin/:userName/filesystem/save` — FilesystemSavePage

**User** (`/user/:userName/*`, Layout z drawer menu):
- `/user/:userName/main` — UserDashboardPage: karty (Add Assembled Device, Assemble Device, Open Device Project)
- `/user/:userName/devices` — UserDevicesPage: tabela urządzeń, dialogi Add/Assemble, Share (dialog z chipami użytkowników), sekcja "Shared with me"
- `/user/:userName/projects` — UserProjectsPage: karty projektów, dialog Add (z wyborem ProjectDef)
- `/user/:userName/project/:projectId` — ProjectPage: Blockly + Monaco split editor z serial terminal i flash

**IoT** (`/user/:userName/iot/*`, Layout z drawer menu):
- `/user/:userName/iot/dashboard` — IotDashboardPage: karty urządzeń (metryki, aktuatory, status) + udostępnione urządzenia (chip "Shared by {owner}", niebieska krawędź), auto-refresh 10s
- `/user/:userName/iot/devices` — IotDevicesPage: lista urządzeń z isIot=true, status (ONLINE/OFFLINE), nawigacja do dashboardu, sekcja "Shared"
- `/user/:userName/iot/device/:deviceName` — IotDevicePage: dashboard z metrykami (karty), konfiguracją, historią telemetrii, komendami (send dialog), alertami (ACK)
- `/user/:userName/iot/alerts` — IotAlertsPage: tabs — alerty (ACK/Resolve) + reguły alertów (CRUD dialog)
- `/user/:userName/iot/emulator` — IotEmulatorPage: emulator urządzeń IoT (konfiguracja, start/stop, activity log)

**Editor:**
- `/user/:userName/editor/monaco/*` — MonacoEditorPage: samodzielny edytor Monaco

### Kluczowe moduły

- **auth** — AuthContext/AuthProvider, sesja w sessionStorage, login/logout
- **filesystem** — FilesystemContext (MQTT), MinisDataSourceContext (ładuje admin JSONy), modele/nody/komponenty
- **editor** — Monaco editor z pluginami, C++ language support, komendami
- **ardublockly2** — Blockly wizualny edytor Arduino: bloki (io, serial, servo, stepper, spi, audio, time, map, variables), profile płytek (ESP8266, ESP32, Arduino Uno...), generator Blockly → C++
- **serial** — Web Serial API (WebSerialService), terminal xterm.js (WebSerialTerminal), flashowanie firmware (EspFlashService + FlashDialog)
- **mqttclient** — re-export z @mhersztowski/web-client
- **iot-emulator** — EmulatorService (MQTT pub/sub, generatory wartości, interwały telemetrii/heartbeat, command handling), typy, presety urządzeń, persistence w localStorage

### Serwisy
- **MinisApiService** (`minisApi` singleton) — REST client do wszystkich endpointów backendu. Parametry user-scoped metod: `userName`/`deviceName` (nazwy, nie UUID). 17 metod IoT: config, telemetria, komendy, reguły alertów, alerty, statusy urządzeń, udostępnianie (getDeviceShares, createDeviceShare, deleteDeviceShare, getSharedDevices, getMyShares)

### Hooki
- **useSourceUpload** — reusable hook do uploadu ZIP źródeł (stan, fileInputRef, trigger, handler)
- **useAuth** — dostęp do stanu autentykacji
- **useFilesystem** — dostęp do stanu filesystem (MQTT)
- **useMinisDataSource** — dostęp do MemoryDataSource z admin danymi

### UI
- Interfejs w języku angielskim
- Layout z Drawer (persistent na sm+, temporary na xs) + AppBar z menu konta (logout, switch admin/user)
- Menu user: Main, Devices, Projects, IoT Devices, IoT Alerts, IoT Emulator
- Strony korzystają z REST API (MinisApiService), nie bezpośrednio z MQTT (wyjątek: filesystem, ProjectPage sketch load/save, IoT Emulator)

---

## Testy

**Backend (Vitest):**
- MinisHttpServer.test.ts — auth, admin CRUD (users, deviceDefs, moduleDefs, projectDefs), user CRUD (devices, projects), error handling (22 testy)
- IotService.test.ts — telemetria, heartbeat, komendy, alerty, presence, lifecycle (26 testów)
- IotEndpoints.test.ts — wszystkie REST endpointy IoT + device sharing (19+ testów)

**Frontend (Vitest + jsdom + React Testing Library):**
- LoginPage.test.tsx — render, nawigacja, error handling
- UsersPage.test.tsx — ładowanie tabeli, add dialog
- MinisApiService.test.ts — wszystkie endpointy, parsowanie, błędy, upload ZIP
- AuthContext.test.tsx — stan, sessionStorage, login/logout
- useSourceUpload.test.ts — flow uploadu, błędy
- generators.test.ts — generatory wartości: constant, random, sine, linear, step (20 testów)
- EmulatorService.test.ts — CRUD konfiguracji, localStorage, device lifecycle, command handling, activity log, event system (23 testy)

**E2E (Playwright):** auth, admin CRUD, user devices, user projects. Fixtures w tests/e2e/fixtures/data-minis/.

---

## Dokumentacja dodatkowa

- **docs/minis-iot-dashboard-plan.md** — architektura i plan IoT Dashboard
- **docs/minis-iot-device-implementation.md** — dokumentacja dla implementujących firmware IoT (MQTT topics, payloady, lifecycle, pseudokod, testowanie)
