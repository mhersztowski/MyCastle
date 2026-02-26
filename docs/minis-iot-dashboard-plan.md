# IoT Device Dashboard — Projekt Minis

> Rozszerzenie platformy Minis o monitorowanie i sterowanie urządzeniami IoT w czasie rzeczywistym.

**Status: Zaimplementowane** — Fazy 1-4 ukończone, emulator urządzeń dodany.

---

## 1. ARCHITEKTURA

```
┌────────────────────────────────────────────────────────────────┐
│              URZĄDZENIA IoT (ESP32) / EMULATOR                   │
│           MQTT publish (telemetria, heartbeat, command/ack)      │
│           MQTT subscribe (komendy)                               │
└──────────────────────┬───────────────────────────────────────────┘
                       │ MQTT (ws://host:1902/mqtt)
                       ▼
┌────────────────────────────────────────────────────────────────┐
│                    minis-backend (port 1902)                     │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│  │  MqttServer  │  │ MinisHttpServer  │  │   FileSystem     │ │
│  │  (Aedes)     │  │ (raw HTTP)       │  │ (JSON persistence│ │
│  │              │  │ /api/*           │  │  + event emitter)│ │
│  └──────┬───────┘  └──────┬───────────┘  └──────────────────┘ │
│         │                  │                                    │
│         ▼                  ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              IoT Service Layer                          │   │
│  │  ┌───────────────┐ ┌────────────────┐ ┌──────────────┐ │   │
│  │  │ TelemetryStore│ │ DevicePresence │ │ AlertEngine  │ │   │
│  │  │ (SQLite       │ │ (heartbeat     │ │ (reguły,     │ │   │
│  │  │  better-sq3)  │ │  ONLINE/OFF)   │ │  ewaluacja)  │ │   │
│  │  ├───────────────┤ └────────────────┘ └──────────────┘ │   │
│  │  │ CommandDisp.  │                                      │   │
│  │  │ (MQTT cmd +   │            IotDatabase               │   │
│  │  │  ACK tracking)│            (SQLite WAL)              │   │
│  │  └───────────────┘                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │ MQTT broadcast (status, telemetry/live, alert)        │
└─────────┼──────────────────────────────────────────────────────┘
          │ MQTT + REST (/api/users/{userId}/devices/...)
          ▼
┌────────────────────────────────────────────────────────────────┐
│                    minis-web (port 1903)                         │
│   /user/:userId/iot/devices      — lista IoT urządzeń          │
│   /user/:userId/iot/device/:id   — dashboard urządzenia        │
│   /user/:userId/iot/alerts       — alerty i reguły             │
│   /user/:userId/iot/emulator     — emulator urządzeń           │
└────────────────────────────────────────────────────────────────┘
```

### Decyzje architektoniczne

1. **MQTT (Aedes + web-client)** — istniejący broker do real-time push, bez Socket.IO
2. **SQLite (better-sqlite3)** — persistence IoT w `data-minis/iot.db`. Synchroniczne API, WAL mode. Reszta danych w JSON files
3. **Raw HTTP** — nowe endpointy w MinisHttpServer, bez Express/Fastify
4. **MinisDevice.isIot** — istniejące pole filtruje urządzenia IoT
5. **MQTT topic schema** — `minis/{userId}/{deviceId}/{type}` (telemetry, heartbeat, command, command/ack, status, telemetry/live, alert)

---

## 2. TYPY DANYCH (packages/core/src/models/IotModels.ts)

```typescript
// Konfiguracja urządzenia
interface IotDeviceConfig {
  deviceId: string;
  userId: string;
  topicPrefix: string;
  heartbeatIntervalSec: number;
  capabilities: IotCapability[];
  createdAt: number;
  updatedAt: number;
}

type IotCapability =
  | { type: 'sensor'; metricKey: string; unit: string; label: string }
  | { type: 'actuator'; commandName: string; payloadSchema: Record<string, unknown>; label: string };

// Telemetria
interface TelemetryRecord {
  id?: number;
  deviceId: string;
  userId: string;
  timestamp: number;
  metrics: TelemetryMetric[];
  rssi?: number;
  battery?: number;
}

interface TelemetryMetric {
  key: string;
  value: number | boolean | string;
  unit?: string;
}

// Komendy
type CommandStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED' | 'TIMEOUT';

interface DeviceCommand {
  id: string;
  deviceId: string;
  name: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  createdAt: number;
  resolvedAt?: number;
  failureReason?: string;
}

// Alerty
type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

interface AlertRule {
  id: string;
  userId: string;
  deviceId?: string;
  metricKey: string;
  conditionOp: '>' | '<' | '>=' | '<=' | '==' | '!=';
  conditionValue: number;
  severity: AlertSeverity;
  cooldownMinutes: number;
  isActive: boolean;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface Alert {
  id: string;
  ruleId: string;
  deviceId: string;
  userId: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  triggeredAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  metricSnapshot?: TelemetryMetric;
}

type IotDeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
```

---

## 3. MQTT TOPIC SCHEMA

```
# Urządzenie → Backend
minis/{userId}/{deviceId}/telemetry       { metrics: [{ key, value, unit }], timestamp?, rssi?, battery? }
minis/{userId}/{deviceId}/heartbeat       { uptime?, rssi?, battery? }
minis/{userId}/{deviceId}/command/ack     { id, status, reason? }

# Backend → Urządzenie
minis/{userId}/{deviceId}/command         { id, name, payload }

# Backend → Frontend (republished)
minis/{userId}/{deviceId}/status          { status: 'ONLINE'|'OFFLINE', lastSeenAt }
minis/{userId}/{deviceId}/telemetry/live  (republished telemetry)
minis/{userId}/{deviceId}/alert           (triggered alert object)
```

---

## 4. REST API

```
GET    /api/users/{userId}/devices/{deviceId}/iot-config
PUT    /api/users/{userId}/devices/{deviceId}/iot-config

GET    /api/users/{userId}/devices/{deviceId}/telemetry?from=&to=&limit=
GET    /api/users/{userId}/devices/{deviceId}/telemetry/latest

POST   /api/users/{userId}/devices/{deviceId}/commands      { name, payload }
GET    /api/users/{userId}/devices/{deviceId}/commands?limit=

GET    /api/users/{userId}/alerts?limit=
PATCH  /api/users/{userId}/alerts/{id}                       { status: 'ACKNOWLEDGED'|'RESOLVED' }

GET    /api/users/{userId}/alert-rules
POST   /api/users/{userId}/alert-rules
PUT    /api/users/{userId}/alert-rules/{id}
DELETE /api/users/{userId}/alert-rules/{id}

GET    /api/users/{userId}/iot/devices                       → [{ deviceId, status, lastSeenAt }]
```

---

## 5. PERSISTENCE (SQLite)

Plik: `data-minis/iot.db`. WAL mode, synchronous=NORMAL.

Tabele: `iot_device_config`, `telemetry`, `device_command`, `alert_rule`, `alert`.

Indeksy na `device_id`, `timestamp`, `user_id`, `status` dla szybkich zapytań.

Retencja: `TelemetryStore.cleanup(olderThanMs)` — do wywołania scheduled/ręcznie.

---

## 6. STRUKTURA PLIKÓW

### Backend (app/minis-backend/src/)

```
src/
├── App.ts                     # Integracja IotService (init, shutdown, MQTT wiring)
├── MinisHttpServer.ts         # REST endpointy IoT (routing przed generic devices/projects)
├── swagger.ts                 # OpenAPI spec z IoT schemas i paths
└── iot/
    ├── IotDatabase.ts         # SQLite: schema init, WAL, raw db handle
    ├── TelemetryStore.ts      # INSERT/query telemetrii, config CRUD, agregacja
    ├── DevicePresence.ts      # Heartbeat tracking, timeout detection (interval×2.5)
    ├── CommandDispatcher.ts   # Tworzenie komend, update status, persistence
    ├── AlertEngine.ts         # CRUD reguł, ewaluacja po telemetrii, cooldown
    ├── IotService.ts          # Orchestrator: MQTT → stores, presence, alerts, broadcast
    ├── IotService.test.ts     # 26 testów: telemetria, heartbeat, komendy, alerty, presence
    └── IotEndpoints.test.ts   # 19 testów: wszystkie REST endpointy IoT
```

### Frontend — IoT Pages (app/minis-web/src/pages/user/iot/)

```
iot/
├── IotDevicesPage.tsx         # Lista urządzeń IoT z statusem (filtr isIot)
├── IotDevicePage.tsx          # Dashboard: metryki, config, historia, komendy, alerty
├── IotAlertsPage.tsx          # Tabs: alerty (ACK/Resolve) + reguły (CRUD)
├── IotEmulatorPage.tsx        # Emulator urządzeń IoT
└── components/
    ├── EmulatedDeviceCard.tsx  # Karta emulowanego urządzenia (status, metryki, kontrolki)
    ├── EditDeviceDialog.tsx    # Dialog tworzenia/edycji emulowanego urządzenia
    ├── MetricConfigEditor.tsx  # Edytor metryk z generatorem wartości
    ├── GeneratorConfigForm.tsx # Formularz parametrów generatora (constant/random/sine/linear/step)
    ├── ActivityLog.tsx         # Log aktywności MQTT (sent/received, expandable JSON)
    └── PendingCommandsList.tsx # Kolejka komend do ręcznego ACK/FAIL
```

### Frontend — Emulator Module (app/minis-web/src/modules/iot-emulator/)

```
iot-emulator/
├── types.ts                   # EmulatedDeviceConfig, ValueGenerator, ActivityLogEntry itp.
├── generators.ts              # Generatory wartości: constant, random, sine, linear, step
├── generators.test.ts         # 20 testów generatorów
├── presets.ts                 # Szablony urządzeń (Temperature Sensor, Multi-Sensor, itp.)
├── EmulatorService.ts         # Serwis: MQTT connection, interwały, komendy, localStorage
├── EmulatorService.test.ts    # 23 testy: CRUD, persistence, lifecycle, komendy, eventy
└── index.ts                   # Barrel exports
```

---

## 7. IoT EMULATOR

Emulator urządzeń IoT działający w przeglądarce — tworzy wirtualne urządzenia komunikujące się z backendem przez MQTT identycznie jak rzeczywiste urządzenia.

### Funkcjonalność

- **Tworzenie emulowanych urządzeń** z konfigurowalnymi metrykami i generatorami wartości
- **Generatory wartości:** constant, random (min/max/decimals), sine (min/max/period/phase), linear (start/end/duration/repeat), step (values/interval)
- **Szablony urządzeń:** Temperature Sensor, Multi-Sensor, Relay Actuator, Battery Device
- **Telemetria i heartbeat:** automatyczne wysyłanie w konfigurowalnych interwałach
- **Obsługa komend:** auto-ack, auto-fail lub manual ACK/FAIL z kolejką
- **Activity log:** real-time log wysłanych/odebranych wiadomości z expandable JSON
- **Wiele urządzeń równocześnie** na jednym współdzielonym połączeniu MQTT
- **Persistence:** konfiguracje w localStorage (urządzenia startują zatrzymane po odświeżeniu)

### MQTT Connection

Emulator używa pakietu `mqtt` (v5.15.0) bezpośrednio — niezależnie od filesystem MqttClient. Jedno współdzielone połączenie dla wszystkich emulowanych urządzeń. Broker URL z `getMqttUrl()` (auto-detect) lub manual override.

---

## 8. DOKUMENTACJA URZĄDZEŃ

Pełna dokumentacja dla implementujących firmware IoT: `docs/minis-iot-device-implementation.md`

Zawiera: architekturę połączeń, MQTT topics, formaty payloadów, lifecycle urządzenia, pseudokod, REST API reference, testowanie, best practices.
