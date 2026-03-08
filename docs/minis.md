# Minis — Platforma DIY dla dzieci

Minis jest platformą wspierającą tworzenie projektów DIY, na początku skierowaną dla dzieci. Dziecko z bazy dostępnych projektów wybiera sobie ten, nad którym chciałoby pracować. Następnie dziecko ma możliwość pracy nad następującymi procesami: składanie urządzenia, edytowanie gotowego projektu programu (Blockly / Arduino C++) i wgrywanie go na mikrokontroler.

---

## Modele danych (pakiet @mhersztowski/core)

MinisDeviceDef — definicja urządzenia (admin)
- name
- modules — lista MinisModuleDefId
- board? — opcjonalna nazwa płytki

MinisDevice — instancja urządzenia (per user)
- id
- MinisDeviceDefId
- isAssembled
- isIot
- sn — serial number
- description - string - markdown string
- localization : string localizationId

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

MinisLocalization

- id — localizationId (UUID)
- name — string — nazwa lokalizacji
- type — string : "place" | "geo" — typ lokalizacji
- place — null | string — nazwa miejsca, np. "electronics"
- geo — null | { lat: number, lng: number } — współrzędne GPS
- device — string — deviceId (powiązane urządzenie)

UserModel — użytkownik
- name, password, isAdmin, roles[]

Na podstawie modeli zdefiniowane są Nody w pakiecie core (MinisDeviceDefNode, MinisDeviceNode, MinisModuleDefNode, MinisModuleNode, MinisProjectDefNode, MinisProjectNode, UserNode) — rozszerzają modele o UI state i metody clone().

### Modele IoT (packages/core/src/models/IotModels.ts)

- **IotDeviceConfig** — konfiguracja urządzenia IoT: topicPrefix, heartbeatIntervalSec, capabilities (sensor/actuator), entities? (IotEntity[])
- **IotEntity** — entity Home Assistant-style (discriminated union po type):
  - `sensor` — pomiar numeryczny (unit, deviceClass), dashboard: wartość + sparkline SVG
  - `binary_sensor` — stan boolean (onLabel/offLabel, deviceClass), dashboard: kropka statusu + etykieta
  - `switch` — włącznik on/off, dashboard: MUI Switch toggle, komenda `set_state`
  - `number` — wartość regulowana (min, max, step, unit), dashboard: MUI Slider, komenda `set_value`
  - `button` — akcja jednorazowa, dashboard: przycisk, komenda `press`
  - `select` — wybór z listy (options[]), dashboard: MUI Select dropdown, komenda `set_option`
- **IotEntityBase** — wspólne pola: id (= klucz metryki telemetrycznej), type, name, icon?, deviceClass?
- **TelemetryRecord** / **TelemetryMetric** — rekord telemetryczny z metrykami (key, value, unit)
- **TelemetryAggregate** — agregat min/max/avg per okres
- **DeviceCommand** — komenda z lifecycle (PENDING → SENT → ACKNOWLEDGED/FAILED/TIMEOUT)
- **AlertRule** — reguła alertu (metric, condition, severity, cooldown)
- **Alert** — instancja alertu (OPEN → ACKNOWLEDGED → RESOLVED)
- **IotDeviceStatus** — 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
- **DeviceShare** — udostępnienie urządzenia (ownerUserId, deviceId, targetUserId, createdAt)

---

## Filesystem (data/)

```
data/
├── iot.db                               # SQLite — dane IoT (telemetria, komendy, alerty, config)
└── Minis/
    ├── Admin/
    │   ├── Users.json                  # { type, items: [{ id, name, password (bcrypt), isAdmin, roles }] }
    │   ├── ApiKeys.json                # { keys: [{ id, prefix, hashedKey, userName, userId, isAdmin, roles, name, createdAt, lastUsedAt }] }
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
            ├── Localizations.json      # { type, items: [MinisLocalizationModel] }
            └── Projects/
                └── {projectId}/        # kopia plików z ProjectDef
                    ├── README.md           # opis projektu w Markdown (opcjonalny)
                    ├── custom-config.yaml  # arduino-cli config (directories.user → project path)
                    ├── sketches/
                    │   └── sketch1/
                    │       ├── sketch1.ino
                    │       └── sketch1.blockly
                    ├── libraries/          # zainstalowane biblioteki Arduino
                    ├── output/             # pliki wynikowe kompilacji (.bin, .elf)
                    └── build/              # pliki pośrednie kompilacji (czyszczone po build)
```

---

## minis-backend (app/minis-backend/)

Node.js, ESM, port 1902 (HTTP + MQTT WebSocket at `/mqtt`).

**Architektura:** App singleton → FileSystem + MinisHttpServer (extends HttpUploadServer) + MqttServer + IotService + JwtService + ApiKeyService + ArduinoService. Dane platformy w JSON files (FileSystem), dane IoT w SQLite (iot.db). FileSystem events broadcastowane przez MQTT.

### Autentykacja i autoryzacja

**JWT + bcrypt:** Login zwraca JWT token (`{ token, user }`). Hasła hashowane bcrypt (auto-migracja plaintext → bcrypt przy logowaniu). Token przesyłany w header `Authorization: Bearer <token>`. Serwisy auth wyekstrahowane do `@mhersztowski/core-backend/auth/`:
- **JwtService** — sign/verify JWT (jsonwebtoken)
- **PasswordService** — bcrypt hash/verify, isBcrypt detection
- **ApiKeyService** — CRUD kluczy API (prefix `minis_`, SHA-256 hash, per-user), dane w `Minis/Admin/ApiKeys.json`
- **checkAuth()** — middleware: weryfikuje Bearer token (JWT lub API key), zwraca `AuthTokenPayload | null`

**Autoryzacja REST API:**
- Endpointy publiczne: `/auth/login`, `/auth/users`, `/docs*`
- Wszystkie inne wymagają tokena (401 Unauthorized)
- Endpointy `/admin/*` wymagają `isAdmin` (403 Forbidden)
- API Keys: user może zarządzać tylko swoimi kluczami (admin może wszystkimi)

**Autentykacja MQTT:** `MqttServer.setAuthenticate()` — akceptuje API key (prefix check), JWT token (w polu password), lub username+password (weryfikacja z Users.json). Ustawiane w `App.init()`.

### Zaimplementowane REST API (/api/*)

**Autentykacja (publiczne):**
- `POST /api/auth/login` — logowanie (name + password), zwraca `{ token, user }` (JWT + UserPublic)
- `GET /api/auth/users` — publiczna lista użytkowników (id, name, isAdmin — bez haseł)

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

**API Keys:**
- `GET /api/users/{userName}/api-keys` — lista kluczy API użytkownika
- `POST /api/users/{userName}/api-keys` — tworzenie klucza (`{ name }`) → `{ key: ApiKeyPublic, rawKey: string }` (rawKey widoczny tylko raz)
- `DELETE /api/users/{userName}/api-keys/{keyId}` — usunięcie klucza

**Arduino API:**
- `GET /api/arduino/boards` — lista dostępnych płytek (arduino-cli board listall)
- `GET /api/arduino/ports` — lista otwartych portów COM
- `POST /api/users/{userName}/projects/{projectName}/compile` — kompilacja sketcha (`{ sketchName, fqbn }`)
- `POST /api/users/{userName}/projects/{projectName}/upload` — upload firmware na urządzenie (`{ sketchName, fqbn, port }`)
- `GET /api/users/{userName}/projects/{projectName}/output[/{fileName}]` — lista / pobranie skompilowanych plików (binary)

**Sketch Files API:**
- `GET /api/users/{userName}/projects/{projectName}/sketches` — lista katalogów sketchy
- `GET /api/users/{userName}/projects/{projectName}/sketches/{sketchName}/{fileName}` — odczyt pliku sketcha
- `PUT /api/users/{userName}/projects/{projectName}/sketches/{sketchName}/{fileName}` — zapis pliku sketcha (`{ content }`)

**README API:**

- `GET /api/users/{userName}/projects/{projectName}/readme` — odczyt README.md projektu (`{ content }` lub 404)
- `PUT /api/users/{userName}/projects/{projectName}/readme` — zapis README.md (`{ content }`)

**Localizations API:**

- `GET /api/users/{userName}/localizations` — lista lokalizacji (`{ items: MinisLocalizationModel[] }`)
- `POST /api/users/{userName}/localizations` — tworzenie lokalizacji (auto-UUID)
- `PUT /api/users/{userName}/localizations/{id}` — aktualizacja lokalizacji
- `DELETE /api/users/{userName}/localizations/{id}` — usunięcie lokalizacji

**AI Search Proxy:**

- `POST /api/ai/search` — proxy do OpenAI lub Anthropic API (omija CORS blokadę przeglądarki). Body: `{ model: 'openai'|'anthropic', apiKey: string, systemPrompt: string, userPrompt: string }`. Zwraca `{ result: string }`. OpenAI: gpt-4o-mini; Anthropic: claude-haiku-4-5-20251001

**RPC API:**
- `POST /api/rpc/{methodName}` — generyczny RPC dispatch (Zod validation, auto-Swagger, `user` w context). Metody: ping, getDeviceStatuses, sendCommand, getLatestTelemetry. Dodawanie nowej metody: 1) schema w core/rpc/methods.ts, 2) handler w minis-backend/src/rpc/handlers.ts, 3) Swagger auto-update. fieldMeta na metodach → OpenAPI extensions `x-autocomplete`/`x-depends-on` w property schemas

**VFS API (admin-only):**
- `GET /api/vfs/capabilities` — zwraca capabilities (readonly, watch)
- `GET /api/vfs/stat?path=` — stat pliku/katalogu
- `GET /api/vfs/readdir?path=` — lista wpisów katalogu
- `GET /api/vfs/readFile?path=` — odczyt pliku (base64-encoded `{ data }`)
- `POST /api/vfs/writeFile?path=` — zapis pliku (`{ data: base64, options?: WriteFileOptions }`)
- `POST /api/vfs/delete?path=` — usunięcie (`{ options?: DeleteOptions }`)
- `POST /api/vfs/rename` — zmiana nazwy (`{ oldPath, newPath, options? }`)
- `POST /api/vfs/mkdir?path=` — tworzenie katalogu
- `POST /api/vfs/copy` — kopiowanie (`{ source, destination, options? }`)
- Server-side: CompositeFS z NodeFS mounted at `/data` (ROOT_DIR). VfsError → HTTP status codes (404/409/400/403/503). RemoteFS (client) proxies te endpointy przez REST.

**Swagger:**
- `GET /api/docs` — Swagger UI (z przyciskiem Authorize dla Bearer token)
- `GET /api/docs/swagger.json` — OpenAPI 3.0.3 spec (auto-generated z Zod via `buildSwaggerSpec()` + `zod-to-json-schema`, wzbogacone o `x-autocomplete`/`x-depends-on` z fieldMeta, security scheme bearerAuth)

### Arduino Service Layer (src/arduino/)

- **ArduinoCli** — interfejs: `listBoards()`, `compile(options)`, `listPorts()`, `upload(options)`
- **ArduinoCliLocal** — implementacja lokalna: `child_process.execFile` z promisify, ścieżka z `ARDUINO_CLI_LOCAL_PATH`
- **ArduinoCliDocker** — implementacja Docker: `docker exec {container} arduino-cli ...`, container z `ARDUINO_CLI_DOCKER_NAME`
- **ArduinoProject** — zarządzanie ścieżkami projektu i orchestracja: `ensureConfig()` (tworzy custom-config.yaml z `directories.user`), `ensureDirs()` (mkdir output/build/libraries), `compile()` → ensureConfig → ensureDirs → cli.compile → cleanBuildDir, `upload()` → cli.upload
- **ArduinoService** — orchestrator: tworzy ArduinoCliLocal lub ArduinoCliDocker na podstawie env, `isAvailable` getter, `compile(userName, projectId, sketchName, fqbn)`, `upload(...)`, `listBoards()`, `listPorts()`
- **Env vars:** `ARDUINO_CLI_LOCAL_PATH` (ścieżka do binarki), `ARDUINO_CLI_DOCKER_NAME` (nazwa kontenera Docker)

### IoT Service Layer (src/iot/)

- **IotDatabase** — SQLite (better-sqlite3), WAL mode, schema init, 6 tabel (iot_device_config z kolumną entities TEXT, telemetry, device_command, alert_rule, alert, device_share)
- **TelemetryStore** — INSERT/query telemetrii, config CRUD (z entities JSON), agregacja min/max/avg
- **DevicePresence** — heartbeat tracking, timeout detection (heartbeatInterval × 2.5), EventEmitter statusChange
- **CommandDispatcher** — tworzenie komend (PENDING → SENT), update statusu po ACK
- **AlertEngine** — CRUD reguł, ewaluacja po każdej telemetrii, cooldown, acknowledge/resolve
- **DeviceShareStore** — CRUD udostępnień urządzeń (prepared statements: create, delete, getSharesForDevice, getSharesByOwner, getSharesForTarget)
- **IotService** — orchestrator: parsuje MQTT topics (`minis/{userName}/{deviceName}/{type}`), koordynuje stores, broadcast zmian statusu/alertów, forwarding telemetrii/statusu do shared users

### MQTT Integration

IotService subskrybuje topics `minis/` przez MqttServer.onMessage(). Waliduje payloady Zodem (safeParse z `mqttTopics` registry — single source of truth). Przetwarza:
- `telemetry` → Zod validate → insert + presence update + alert evaluation + republish to `telemetry/live`
- `heartbeat` → Zod validate → presence update
- `command/ack` → Zod validate → update command status

Publikuje (przez MqttServer.publishMessage()):
- `status` — zmiana ONLINE/OFFLINE
- `telemetry/live` — republished telemetria dla frontendu
- `alert` — triggered alerty

### Typed MQTT Topic Registry (packages/core/src/mqtt/topics.ts)

Analogiczny do RPC registry — Zod schemas jako single source of truth dla walidacji, typów i dokumentacji. Używany przez IotService (backend walidacja) i MQTT Explorer (frontend type info).

- **MqttTopicDef** — pattern (np. `minis/{userName}/{deviceName}/telemetry`), description, direction (`device→server` | `server→device` | `server→client` | `server→shared`), payloadSchema (Zod), tags
- **mqttTopics** registry — 9 definicji: telemetry, heartbeat, command, commandAck, status, telemetryLive, alert, sharedTelemetryLive, sharedStatus
- **matchTopic(fullTopic)** — dopasowuje konkretny topic do wzorców, zwraca `{ name, def, params }` z wyekstrahowanymi parametrami
- **MqttPayload<T>** — helper type do inferowania typu payloadu z definicji

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

### Entity System (Home Assistant-inspired)

Urządzenia IoT mogą definiować **entities** — typowane encje opisujące co urządzenie raportuje i czym można sterować. Entity `id` odpowiada kluczowi metryki telemetrycznej (`TelemetryMetric.key`). Entities przechowywane w kolumnie `entities TEXT` tabeli `iot_device_config` jako JSON.

**Typy entity:** sensor, binary_sensor, switch, number, button, select.

**Komendy entity:** Kontrolowalne entity używają istniejącego systemu komend ze standardowymi nazwami:
- `set_state` — switch (payload: `{ entity_id, state: boolean }`)
- `set_value` — number (payload: `{ entity_id, value: number }`)
- `set_option` — select (payload: `{ entity_id, option: string }`)
- `press` — button (payload: `{ entity_id }`)

**Frontend widgety** (`EntityWidgets.tsx`): SensorWidget (wartość + SVG sparkline z ostatnich 20 rekordów), BinarySensorWidget (kropka statusu + etykieta on/off), SwitchWidget (MUI Switch toggle), NumberWidget (MUI Slider z debounce 500ms), ButtonWidget (MUI Button), SelectWidget (MUI Select dropdown). Wspólny komponent `EntityWidget` renderuje odpowiedni widget na podstawie `entity.type`.

**Backward compatibility:** `IotDeviceConfig.capabilities` pozostaje — gdy `entities` jest zdefiniowane, dashboard/device page renderuje entity widgets; w przeciwnym razie fallback na capability-based rendering.

**Emulator:** Wszystkie 6 presetów definiuje entities. Po odebraniu komendy entity emulator aktualizuje generator metryki i natychmiast wysyła zaktualizowaną telemetrię (bez czekania na regularny interwał).

### Czego jeszcze nie ma:
- Logika składania urządzenia (assembly workflow)

---

## minis-web (app/minis-web/)

React 18 + TypeScript, Vite 6, Material UI 6, port 1903 (proxy /api → :1902, /mqtt → ws:1902).

**Provider tree:** MqttProvider → FilesystemProvider → MinisDataSourceProvider → AuthProvider → GlobalWindowsProvider → App + GlobalApiDocs + GlobalRpcExplorer + GlobalMqttExplorer

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

**User** (`/user/:userName/*`, Layout z drawer menu — collapsible tree groups):
- `/user/:userName/main` — UserDashboardPage: karty (Add Assembled Device, Assemble Device, Open Device Project)
- `/user/:userName/localization` — LocalizationPage: tabela lokalizacji z filtrowaniem (name/place text + type dropdown), Group by Place checkbox (grupuje wiersze w sekcje po wartości `place`), AI Search accordion (model selector OpenAI/Anthropic, API key w localStorage, prompt textarea → POST /api/ai/search → filtruje po zwróconych IDs), opis urządzenia jako Markdown popover (ikona ⓘ → Popover z react-markdown + remark-breaks)

**Electronics** (`/user/:userName/electronics/*`, collapsible group w sidebar):

- `/user/:userName/electronics/devices` — UserDevicesPage: tabela urządzeń, dialogi Add/Assemble (auto-generowanie nazwy jako `DefName-SN`), Share (dialog z chipami użytkowników), sekcja "Shared with me". Kliknięcie wiersza → slide-out Drawer (prawa strona, 400px) z edycją: name (disabled), sn, description (markdown, multiline), isAssembled switch, isIot switch
- `/user/:userName/electronics/arduino` — UserProjectsPage: karty projektów Arduino/Blockly, dialog Add (z wyborem ProjectDef)
- `/user/:userName/project/:projectId` — ProjectPage: Blockly + Monaco split editor z serial terminal, server-side kompilacja i flash. Board auto-detected z ProjectDef → ModuleDef → soc. Sketche ładowane/zapisywane przez REST API (nie MQTT). README panel boczny (przycisk README w AppBar) — podgląd Markdown + edycja inline + save. Compile button w bottom status bar → save & compile via REST → output panel (monospace, success/error border). Flash button → pobiera skompilowany .bin z REST → FlashDialog z pre-loaded files. AccountMenu w AppBar (zamiast board selector)

**IoT** (`/user/:userName/iot/*`, collapsible group w sidebar):
- `/user/:userName/iot/dashboard` — IotDashboardPage: entity-aware karty urządzeń (EntityWidgets ze sparkline SVG, kontrolki switch/slider/select/button, komenda → quick refresh 2s), fallback na capabilities gdy brak entities, udostępnione urządzenia (chip "Shared by {owner}", niebieska krawędź), auto-refresh 10s
- `/user/:userName/iot/devices` — IotDevicesPage: lista urządzeń z isIot=true, status (ONLINE/OFFLINE) po device.name, nawigacja do dashboardu, sekcja "Shared"
- `/user/:userName/iot/device/:deviceName` — IotDevicePage: sekcja entity widgets (kontrolki + sparkline), metryki ze sparkline SVG, konfiguracja (z liczbą entities), historia telemetrii, komendy (send dialog), alerty (ACK)
- `/user/:userName/iot/alerts` — IotAlertsPage: tabs — alerty (ACK/Resolve) + reguły alertów (CRUD dialog)
- `/user/:userName/iot/emulator` — IotEmulatorPage: emulator urządzeń IoT (konfiguracja, start/stop, activity log)

**Tools** (`/user/:userName/tools/*`, collapsible group w sidebar, **admin-only** — `AdminOnly` guard + sidebar hidden when impersonating):
- `/user/:userName/tools/rpc` — RpcExplorerPage: interaktywny explorer metod RPC
    - Pobiera listę metod z /api/docs/swagger.json (filtruje `/rpc/*` paths)
    - 2-kolumnowy layout: lista metod pogrupowanych po tagach (System, IoT) + formularz wybranej metody
    - Auto-generowane pola z JSON schema: TextField, Select (enum), Switch (boolean), multiline JSON (object), number
    - Smart autocomplete: pola z `x-autocomplete` pobierają dane z API (users, userDevices), `x-depends-on` tworzy kaskadowe zależności (np. deviceName wymaga wybrania userName)
    - Live JSON preview aktualnego request body
    - Przycisk "Execute" → kolorowany response (zielony sukces, czerwony błąd)
    - Password manager protection (data-bwignore, data-1p-ignore, data-lpignore na polach)
    - Node-RED export: dwa buttony (NR Local / NR Remote) — kopiuje flow JSON (inject + http-request + debug) do schowka
- `/user/:userName/tools/mqtt-explorer` — MqttExplorerPage: przeglądarka MQTT w stylu aplikacji MQTT Explorer
    - Topic tree: hierarchiczne drzewko z real-time messages, message count per node, expand/collapse, filtr
    - Detail panel: topic info, payload JSON pretty-print, QoS/retained/timestamp, type info z topic registry (nazwa, kierunek, tagi, walidacja Zod, wyekstrahowane parametry)
    - Publish: Autocomplete z podpowiedziami topic patterns z `mqttTopics` registry (wzorzec + kierunek + opis), QoS, retain
    - Subscriptions: wildcard patterns (#, +), dodawanie/usuwanie subskrypcji
    - Node-RED export: dwa buttony (NR Local `ws://172.17.0.1:1902/mqtt`, NR Remote `wss://minis.hersztowski.org/mqtt`) — kopiuje flow JSON do schowka (Import → Clipboard w Node-RED). Broker via WebSocket (Minis używa shared HTTP+MQTT na jednym porcie). Topic detail: mqtt-in + debug. Publish: inject + mqtt-out. Opcjonalnie credentials (API key) w polu
    - Performance: `requestAnimationFrame` throttle, mutable Map tree z version counter, limit 10k topics
- `/user/:userName/tools/api-keys` — ApiKeysPage: zarządzanie kluczami API (tworzenie, kopiowanie, usuwanie). Klucz widoczny tylko raz po utworzeniu.
- `/user/:userName/tools/testvfs` — TestVfsPage: testowa strona VFS Explorer z CompositeFS/RemoteFS (server mounted at /server), podgląd plików, manual operations (create file/folder), event log
- `/user/:userName/tools/docs` — DocsPage: TypeDoc API documentation viewer (TypeDocViewer z @mhersztowski/web-client)

**Editor:**
- `/user/:userName/editor/monaco/*` — MonacoEditorPage: MonacoMultiEditor z `@mhersztowski/web-client`. VS Code-like UI: Activity Bar (Explorer/Search/Extensions) + Sidebar (VFS file browser po RemoteFS/CompositeFS) + tabbed multi-editor z Split Editor (grupy edytorów side-by-side) + Menu Bar (File/Edit) + Status Bar. Pliki ładowane z serwera przez VFS REST API (`/api/vfs`). Ctrl+S save bezpośrednio przez VFS writeFile.

### Kluczowe moduły

- **auth** — AuthContext/AuthProvider, JWT token + sesja w sessionStorage (format `{ user, token }`), login/logout, impersonacja (admin → user view). `setAuthToken()` propaguje token do MinisApiService i RpcClient
- **filesystem** — FilesystemContext (MQTT), MinisDataSourceContext (ładuje admin JSONy), modele/nody/komponenty
- **editor** — tylko `monacoWorkers.ts` (Vite-specific `?worker` imports). Reszta edytora (EditorInstance, ModelManager, plugins, language services) wyekstrahowana do `@mhersztowski/web-client/monaco`. MonacoMultiEditor — gotowy komponent VS Code-like z VFS + split editor
- **ardublockly2** — Blockly wizualny edytor Arduino: bloki (io, serial, servo, stepper, spi, audio, time, map, variables), profile płytek (ESP8266 Huzzah/Wemos D1, ESP32 DevKitC, Arduino Uno/Nano/Mega/Leonardo), generator Blockly → C++. BoardProfile zawiera `compilerFlag` (FQBN) i `flashConfig` (filePattern + offset, null = flash nie wspierane). `socToBoardKey` mapuje SoC (z ModuleDef) na klucz board profile
- **serial** — Web Serial API (WebSerialService), terminal xterm.js (WebSerialTerminal), flashowanie firmware (EspFlashService + FlashDialog z opcjonalnymi `initialFiles` do pre-loaded firmware z kompilacji)
- **mqttclient** — re-export z @mhersztowski/web-client
- **iot-emulator** — EmulatorService (MQTT pub/sub, generatory wartości, interwały telemetrii/heartbeat, command handling z entity commands: set_state/set_value/set_option/press + natychmiastowy republish telemetrii), typy (EmulatedDeviceConfig z entities?), presety urządzeń (6: Temperature Sensor, Multi-Sensor, Relay Actuator, Battery Device, Smart Thermostat, Smart Plug — każdy z entities), persistence w localStorage

### Serwisy

- **MinisApiService** (`minisApi` singleton) — REST client do wszystkich endpointów backendu. `setAuthToken(token)` ustawia Bearer token na wszystkich requestach. Parametry user-scoped metod: `userName`/`deviceName` (nazwy, nie UUID). 17 metod IoT + 3 metody API Keys + getPublicUsers + Arduino API (getArduinoBoards, getArduinoPorts, compileProject, uploadFirmware, getProjectOutput, fetchOutputBinary) + Sketch API (listSketches, readSketchFile, writeSketchFile) + README API (readProjectReadme → null gdy brak, writeProjectReadme) + Localization API (getLocalizations, createLocalization, updateLocalization, deleteLocalization)

### Hooki
- **useSourceUpload** — reusable hook do uploadu ZIP źródeł (stan, fileInputRef, trigger, handler)
- **useAuth** — dostęp do stanu autentykacji (currentUser, token, isAdmin, login, logout, impersonating, startImpersonating, stopImpersonating)
- **useFilesystem** — dostęp do stanu filesystem (MQTT)
- **useMinisDataSource** — dostęp do MemoryDataSource z admin danymi

### UI
- Interfejs w języku angielskim
- Layout z Drawer (persistent na sm+, temporary na xs) + AppBar z AccountMenu (hierarchiczne podmenu)
- **AccountMenu** (`components/AccountMenu.tsx`): hierarchiczne menu w AppBar — Switch to Admin/User, View (Save/Load/Clear layout), Window (API Docs/RPC Explorer/MQTT Explorer), Logout
- **GlobalWindows** (`components/GlobalWindowsContext.tsx`): system dragowalnych, resizable okien floating. `WindowName`: apiDocs, rpcExplorer, mqttExplorer. Stan: `Map<WindowName, 'open' | 'minimized'>`. Minimize → mały pasek na dole ekranu. Zamykane automatycznie przy zmianie strony. Layout persistence w localStorage (save/load/clear). Auto-close okien poza viewport. Z-index < 1300 (poniżej MUI popper/modal)
- **GlobalWindow** (`components/GlobalWindow.tsx`): draggable, resizable floating window z title bar (minimize/maximize/close), resize handle, rejestracja konfiguracji dla save/load
- **GlobalApiDocs/GlobalRpcExplorer/GlobalMqttExplorer**: lazy-loaded strony w GlobalWindow, dostępne z AccountMenu → Window
- **BuildOutputPanel** (`components/BuildOutputPanel.tsx`): draggable floating panel z build output (monospace, auto-scroll, status color border: green/red/gray, clear button, close button)
- Menu sidebar: Main, Electronics (Devices, Arduino), IoT (Dashboard, Devices, Alerts, Emulator), Tools (RPC Explorer, MQTT Explorer, API Keys, Test VFS, API Docs — admin-only)
- **Impersonacja:** Admin może "wejść" w widok innego użytkownika z UsersPage (przycisk Impersonate). Stan efemeryczny (nie persystowany). Żółty banner `ImpersonationBanner` na górze z przyciskiem Stop. Layout przesuwa AppBar/Drawer/content gdy banner aktywny. Tools ukryte podczas impersonacji
- **AdminOnly guard** (`App.tsx`): komponent route guard — sprawdza `isAdmin && !impersonating`, redirectuje do `/user/:userName/main`
- Strony korzystają z REST API (MinisApiService), nie bezpośrednio z MQTT (wyjątek: filesystem, IoT Emulator)

---

## Testy

**Backend (Vitest):**
- MinisHttpServer.test.ts — auth, admin CRUD (users, deviceDefs, moduleDefs, projectDefs), user CRUD (devices, projects), error handling (22 testy)
- IotService.test.ts — telemetria, heartbeat, komendy, alerty, presence, lifecycle (26 testów)
- IotEndpoints.test.ts — wszystkie REST endpointy IoT + device sharing + entity config roundtrip (21+ testów)
- ArduinoProject.test.ts — ścieżki, ensureConfig, ensureDirs, compile orchestration, upload (7 testów, mock ArduinoCli)
- ArduinoEndpoints.test.ts — REST endpoints Arduino + Sketch: boards, ports, compile (success/400/404), upload (success/400), output list/download/path traversal, sketch CRUD (22 testy, MockArduinoCli + JwtService auth)

**Frontend (Vitest + jsdom + React Testing Library):**
- LoginPage.test.tsx — render, nawigacja, error handling
- UsersPage.test.tsx — ładowanie tabeli, add dialog (wrapper: MemoryRouter + mocked useAuth)
- MinisApiService.test.ts — wszystkie endpointy, parsowanie, błędy, upload ZIP, Arduino API (boards/ports/compile/upload/output/fetchBinary), Sketch API (list/read/write)
- AuthContext.test.tsx — stan, sessionStorage, login/logout, impersonacja (start/stop/guard/clear on logout)
- useSourceUpload.test.ts — flow uploadu, błędy
- generators.test.ts — generatory wartości: constant, random, sine, linear, step (20 testów)
- EmulatorService.test.ts — CRUD konfiguracji, localStorage, device lifecycle, command handling, activity log, event system (23 testy)

**E2E (Playwright):** auth, admin CRUD, user devices, user projects. Fixtures w tests/e2e/fixtures/data/.

---

## TypeDoc API Documentation

Monorepo korzysta z TypeDoc do generowania dokumentacji API ze źródeł TypeScript.

- **Konfiguracja:** `typedoc.json` (root) — `entryPointStrategy: packages`, entry points: wszystkie packages/ i app/ projekty
- **Pluginy:** `typedoc-plugin-markdown` — generacja w formacie Markdown
- **Wyjścia:** HTML (`docs-site/html`), Markdown (`docs-site/markdown`), JSON (`docs-site/docs.json`)
- **Komendy:** `pnpm gendocs` (domyślne wyjścia), `pnpm gendocs:html`, `pnpm gendocs:md`
- **Frontend viewer:** DocsPage (`/user/:userName/tools/docs`) ładuje `docs.json` z `public/` i renderuje przez TypeDocViewer z `@mhersztowski/web-client/typedoc`
- **Docker:** `docs/Dockerfile` — multi-stage build: pnpm install → build all packages → typedoc → nginx:alpine. `docs/nginx.conf` — SPA routing + asset cache
- **Per-app typedoc.json:** Każdy app/ ma opcjonalny `typedoc.json` z nadpisanymi entry points

---

## Dokumentacja dodatkowa

- **docs/minis-iot-dashboard-plan.md** — architektura i plan IoT Dashboard
- **docs/minis-iot-device-implementation.md** — dokumentacja dla implementujących firmware IoT (MQTT topics, payloady, lifecycle, pseudokod, testowanie)
