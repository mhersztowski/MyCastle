# Minis IoT — implementacja urządzenia (MQTT API)

Dokument opisuje **protokół MQTT**, który musi zaimplementować urządzenie IoT, żeby
współpracować z backendem MyCastle (moduł `iot`) i być sterowalne ze strony
[`IotDevicePage`](../app/mycastle-web/src/pages/minis-user/iot/IotDevicePage.tsx).

Pokrywa:

- cykl życia urządzenia (`hello` / `heartbeat` / `telemetry` / `command`),
- **automatyczną rejestrację urządzeń** (urządzenie samo się ogłasza, backend je zapisuje),
- generyczny protokół **rozszerzeń** (`ext/{type}/req` ↔ `ext/{type}/res`),
- konkretne rozszerzenia: **VFS**, **virtual keyboard (vkbd)**, **virtual mouse (vmouse)**,
  **virtual display (display)** oraz pokrewny **smart-display**.

Źródło prawdy (zweryfikowane w kodzie): [`packages/core/src/mqtt/topics.ts`](../packages/core/src/mqtt/topics.ts)
(rejestr topików Zod), [`packages/core/src/iot/device/`](../packages/core/src/iot/device/) (klocki device-side),
[`app/client/`](../app/client/) (referencyjny klient Python, paho-mqtt),
[`app/mycastle-backend/src/modules/iot/`](../app/mycastle-backend/src/modules/iot/) (strona serwera).

---

## 1. Architektura w skrócie

```text
   Urządzenie (ESP32 / Python / dowolne)
        │  MQTT pub/sub
        ▼
   Broker MQTT (Aedes, wbudowany w mycastle-backend)
        │
        ▼
   IotService  ──►  IotExtensionRegistry  ──►  VfsExtension / VkbdExtension / VmouseExtension / DisplayExtension / ...
        │                                          │
        │ status / telemetry/live                  │ (VFS) MqttFS mount → /api/vfs/devices/{device}
        ▼                                          ▼
   Frontend (IotDevicePage, VirtualDisplayPage, edytor VFS)
```

- **Broker**: backend MyCastle (Aedes). Klient web łączy się przez WebSocket `ws://<host>:1894/mqtt`;
  urządzenia natywne łączą się przez **TCP MQTT** na skonfigurowanym porcie (referencyjny klient Python
  używa `MQTT_BROKER_PORT = 1884`, `MQTT_TRANSPORT = 'tcp' | 'websockets'`). Backend nasłuchuje MQTT-WS na
  porcie HTTP 1894 (`/mqtt`), opcjonalnie osobny port TCP przez `MQTT_PORT`.
- **Autoryzacja MQTT**: **anonimowa** jest dozwolona (klient web), opcjonalnie `username+password`,
  klucz API albo token JWT jako hasło.
- **Identyfikator urządzenia**: w całym systemie kluczem jest **`deviceName`** (a nie numer seryjny) —
  w topikach MQTT, rejestrach backendu i REST API. Urządzenie przy deploy dostaje `MINIS_DEVICE_SN = deviceName`,
  więc topic `hello` zawiera `deviceName`.

---

## 2. Konwencja topików

Wszystkie topiki mają prefiks (bez wiodącego `/`):

```text
minis/{userName}/{deviceName}/...
```

Rejestr topików (z walidacją Zod) jest w [`topics.ts`](../packages/core/src/mqtt/topics.ts).
`matchTopic(fullTopic)` dopasowuje dowolny topic do wzorca i zwraca wyekstrahowane parametry
(`userName`, `deviceName`, a dla rozszerzeń także `extType`).

| Topic | Wzorzec | Kierunek |
|---|---|---|
| `hello` | `minis/{userName}/{deviceName}/hello` | device → server |
| `heartbeat` | `minis/{userName}/{deviceName}/heartbeat` | device → server |
| `telemetry` | `minis/{userName}/{deviceName}/telemetry` | device → server |
| `command` | `minis/{userName}/{deviceName}/command` | server → device |
| `commandAck` | `minis/{userName}/{deviceName}/command/ack` | device → server |
| `status` | `minis/{userName}/{deviceName}/status` | server → client (broadcast) |
| `telemetryLive` | `minis/{userName}/{deviceName}/telemetry/live` | server → client |
| `alert` | `minis/{userName}/{deviceName}/alert` | server → client |
| `extReq` | `minis/{userName}/{deviceName}/ext/{extType}/req` | server → device |
| `extRes` | `minis/{userName}/{deviceName}/ext/{extType}/res` | device → server |
| `twinDesired` | `minis/{userName}/{deviceName}/twin/desired` | server → device |
| `twinReported` | `minis/{userName}/{deviceName}/twin/reported` | device → server |

**Konwencja**: urządzenie **publikuje** na `hello/heartbeat/telemetry/command/ack/ext/.../res`,
a **subskrybuje** `command` oraz `ext/{type}/req` dla każdego rozszerzenia, które implementuje.
Topiki `status`, `telemetry/live`, `alert` generuje backend dla frontendu — urządzenie ich nie dotyka.

---

## 3. Cykl życia urządzenia

### 3.1 `hello` — ogłoszenie urządzenia (device → server)

Publikowane przy każdym (re)połączeniu. To **jedyny krok potrzebny do rejestracji** — patrz §4.

Topic: `minis/{userName}/{deviceName}/hello`

```jsonc
{
  "uptime": 7200000,                       // ms, opcjonalne
  "extensions": [                          // które rozszerzenia urządzenie implementuje
    { "type": "vfs",     "enabled": true },
    { "type": "vkbd",    "enabled": true },
    { "type": "vmouse",  "enabled": true },
    { "type": "display",  "enabled": true }
  ],
  "entities": [                            // encje (sensory/przełączniki/...) — opcjonalne
    { "id": "temp",  "type": "sensor", "name": "Temperature", "unit": "°C", "deviceClass": "temperature" },
    { "id": "power", "type": "switch", "name": "Main Power", "icon": "mdi:power" },
    { "id": "brightness", "type": "number", "name": "Brightness", "min": 0, "max": 100, "step": 1 },
    { "id": "mode",  "type": "select", "name": "Mode", "options": ["auto", "manual"] }
  ]
}
```

Typy encji: `sensor` (`unit`), `binary_sensor` (`onLabel`/`offLabel`), `switch`, `number`
(`min`/`max`/`step`/`unit`), `button`, `select` (`options`).

> Aplikacje (instancje web/mobile/desktop), w odróżnieniu od urządzeń, wysyłają `hello` z polami
> `platform`/`sessionId`/`label`/`userAgent` — backend traktuje je jako sesje, nie urządzenia.

### 3.2 `heartbeat` — keep-alive (device → server)

Topic: `minis/{userName}/{deviceName}/heartbeat`. Interwał: zalecane co `heartbeatIntervalSec`
(domyślnie serwer zakłada 60 s). Urządzenie jest oznaczane **OFFLINE**, gdy brak heartbeatu przez
`heartbeatIntervalSec * 2.5` (mnożnik w `DevicePresence`).

```jsonc
{ "uptime": 3600000, "rssi": -55, "battery": 92 }   // wszystkie pola opcjonalne; payload może być {}
```

### 3.3 `telemetry` — odczyty sensorów (device → server)

Topic: `minis/{userName}/{deviceName}/telemetry`

```jsonc
{
  "metrics": [
    { "key": "temperature", "value": 22.5, "unit": "°C" },
    { "key": "humidity",    "value": 65,   "unit": "%"  }
  ],
  "timestamp": 1717076640000,   // opcjonalne; brak → czas odbioru
  "rssi": -65, "battery": 87    // opcjonalne
}
```

`value` może być `number | boolean | string`. Po odbiorze backend: zapisuje do SQLite, odświeża presence
(ONLINE), ewaluuje reguły alertów i **republikuje** telemetrię na `telemetry/live` (oraz do użytkowników
z dostępem współdzielonym). Telemetria sama w sobie odświeża presence — częsta telemetria zastępuje heartbeat.

### 3.4 `command` / `command/ack` — sterowanie (server → device / device → server)

Serwer wysyła na `minis/{userName}/{deviceName}/command`:

```jsonc
{ "id": "cmd_123", "name": "set_brightness", "payload": { "value": 75 } }
```

Urządzenie **musi** potwierdzić na `minis/{userName}/{deviceName}/command/ack`. Status walidowany Zod —
dozwolone wartości to **`ACKNOWLEDGED`** lub **`FAILED`**:

```jsonc
{ "id": "cmd_123", "status": "ACKNOWLEDGED" }
// lub
{ "id": "cmd_123", "status": "FAILED", "reason": "device busy" }
```

Komendy encji (przełączenie `switch`, ustawienie `number`/`select`) przychodzą tą samą drogą —
`name` = id encji lub nazwa komendy, `payload` zależny od typu.

---

## 4. Automatyczna rejestracja urządzeń

**Urządzenia nie trzeba dodawać ręcznie.** Wystarczy, że opublikuje `hello`. Przepływ
(implementacja: [`IotService.handleHello()`](../app/mycastle-backend/src/modules/iot/IotService.ts)):

1. **Routing** — `IotService.handleMqttMessage()` parsuje topic `minis/{userName}/{deviceName}/hello`
   (klucz = `deviceName` = `parts[2]`) i woła `handleHello(userId, deviceName, payload)`.
2. **Wczytanie istniejącej konfiguracji** — `telemetry.getConfig(deviceName)` z SQLite (jeśli już była).
3. **Scalenie** — jeśli `hello` zawiera `extensions` lub `entities`, są scalane z istniejącą konfiguracją
   (zachowując `createdAt`, `topicPrefix`, `heartbeatIntervalSec`, `capabilities`).
4. **Zapis do bazy** — `telemetry.upsertConfig(merged)` zapisuje rekord w tabeli `iot_device_config`
   (kolumny `entities` i `extensions` to JSON; dodane migracją `ALTER TABLE ... ADD COLUMN`, idempotentnie).
5. **Synchronizacja rozszerzeń** — `extensions.syncFromConfig(merged)`: dla każdego wpisu w `extensions[]`
   o `enabled: true` tworzy serwerowy obiekt rozszerzenia (jeśli jeszcze nie istnieje), `enabled: false`
   → usuwa. Dla `vfs` w tym momencie odpala się `onVfsMounted` (patrz §5.1).
6. **Obecność** — `presence.recordHeartbeat(...)` oznacza urządzenie jako **ONLINE** i emituje
   `statusChange` (republikowany na `status`).
7. **Twin** — jeśli istnieje pożądany stan (desired twin), serwer wypycha go na `twin/desired`.

Od tej chwili urządzenie jest widoczne na liście IoT, a `IotDevicePage` pokazuje przyciski rozszerzeń
zależnie od zadeklarowanych `extensions[]`.

> **Heartbeat też synchronizuje rozszerzenia** — `handleHeartbeat()` woła `extensions.syncFromConfig(config)`,
> więc serwerowe rozszerzenia są odtwarzane także po restarcie backendu, gdy tylko przyjdzie heartbeat.
>
> **Lazy-create** — jeśli przyjdzie wiadomość `ext/{type}/...` dla nieznanego jeszcze rozszerzenia,
> `IotExtensionRegistry.handleMessage()` tworzy je „na żądanie" (dla znanych typów: `vfs`, `vkbd`,
> `vmouse`, `display`, `smart-display`).

---

## 5. Generyczny protokół rozszerzeń

Każde rozszerzenie ma typ `extType` i parę topików:

```text
server → device :  minis/{userName}/{deviceName}/ext/{extType}/req
device → server :  minis/{userName}/{deviceName}/ext/{extType}/res
```

**Koperta żądania** (`extReq`, server → device):

```jsonc
{
  "id": "req_001",          // correlation id — odsyłany w odpowiedzi
  "op": "stat",             // nazwa operacji
  "path": "/config.json",   // opcjonalne argumenty zależne od op:
  "newPath": "...",         //   (rename)
  "data": "base64...",      //   (writefile)
  "options": { }            //   create / overwrite / recursive / ...
}
```

**Koperta odpowiedzi** (`extRes`, device → server):

```jsonc
{
  "id": "req_001",          // ten sam correlation id
  "ok": true,
  "data": { },              // wynik (kształt zależy od op) — gdy ok
  "error": { "code": "ENOENT", "message": "not found" }  // gdy !ok
}
```

Strona serwera (poza VFS) działa w trybie **request-response z timeoutem 10 s** i mapą `pending`
po `id`. Urządzenie po prostu: subskrybuje `ext/{type}/req`, wykonuje `op`, publikuje `ext/{type}/res`
z tym samym `id`.

Device-side w TS można złożyć z gotowych klocków:
[`IotDeviceClient`](../packages/core/src/iot/device/IotDeviceClient.ts) (router `ext/{type}/req` → rozszerzenie,
`handleMessage(subTopic, rawPayload)`) + [`IotDeviceExtension`](../packages/core/src/iot/device/IotDeviceExtension.ts)
(interfejs `{ type, handleRequest(payload) }`).

---

## 5.1 VFS (`extType = "vfs"`)

Tunneluje wirtualny system plików urządzenia przez MQTT. Tu **serwer jest klientem** (czyta/pisze pliki),
a urządzenie odpowiada. Po stronie serwera `VfsExtension` tworzy
[`MqttFS`](../packages/core/src/vfs/) (request-response z UUID, timeout 15 s), a `MycastleHttpServer`
montuje go w CompositeFS pod `/devices/{deviceName}` — dzięki czemu pliki urządzenia są dostępne przez REST:

```text
/api/vfs/readdir?path=/devices/{deviceName}/...
```

oraz przez user-scoped endpoint, którego używa `IotDevicePage` (RemoteFS):

```text
/api/users/{userName}/devices/{deviceName}/vfs/{op}
```

**Operacje** (`op`), żądanie → odpowiedź `data`:

| `op` | Argumenty żądania | `data` w odpowiedzi |
|---|---|---|
| `stat` | `path` | `{ type, size, ctime, mtime }` |
| `readdir` | `path` | `{ entries: [{ name, type }] }` |
| `readfile` | `path` | `{ data: "<base64>" }` |
| `writefile` | `path`, `data` (base64), `options: { create?, overwrite? }` | `{}` |
| `delete` | `path`, `options: { recursive? }` | `{}` |
| `rename` | `path`, `newPath`, `options: { overwrite? }` | `{}` |
| `mkdir` | `path` | `{}` |

`type` (FileType): **1 = plik**, **2 = katalog** (enum `FileType` w core).
Treść plików **zawsze** przesyłana jako base64 w polu `data`.

```jsonc
// → ext/vfs/req
{ "id": "r1", "op": "readfile", "path": "/config/settings.json" }
// ← ext/vfs/res
{ "id": "r1", "ok": true, "data": { "data": "eyJrZXkiOiJ2YWx1ZSJ9" } }
```

Błędy zwracaj z `error.code` zgodnym z `VfsErrorCode` (`FileNotFound`, `NoPermissions`, `FileExists`, …).
Referencja: [`app/client/extensions/vfs.py`](../app/client/extensions/vfs.py),
[`IotDeviceVfsExtension`](../packages/core/src/iot/device/IotDeviceVfsExtension.ts).

---

## 5.2 Virtual Keyboard (`extType = "vkbd"`)

Serwer wysyła `ext/vkbd/req`, urządzenie wykonuje wpis z klawiatury i odsyła `ext/vkbd/res`.
Frontend (`IotDevicePage` → dialog **Keyboard**) wywołuje to przez REST
`POST /api/users/{u}/devices/{d}/ext/vkbd` → backend (`VirtualKeyboardExtension.sendRequest`) publikuje na MQTT.

**Operacje**:

| `op` | Argumenty |
|---|---|
| `key_press` | `{ key, modifiers?: string[] }` |
| `key_down` | `{ key }` |
| `key_up` | `{ key }` |
| `type_text` | `{ text }` |
| `hotkey` | `{ keys: string[] }` |

```jsonc
// → ext/vkbd/req
{ "id": "k1", "op": "hotkey", "keys": ["ctrl", "c"] }
// ← ext/vkbd/res
{ "id": "k1", "ok": true, "data": {} }
```

Nazwy klawiszy: litery/cyfry, `enter`, `tab`, `esc`, `space`, `backspace`, `delete`,
`up`/`down`/`left`/`right`, `home`/`end`, `pageup`/`pagedown`, `f1`–`f12`, modyfikatory
`ctrl`/`alt`/`shift`/`win`. Referencja: [`app/client/extensions/virtual_keyboard.py`](../app/client/extensions/virtual_keyboard.py).

---

## 5.3 Virtual Mouse (`extType = "vmouse"`)

Analogicznie do vkbd (`ext/vmouse/req` ↔ `ext/vmouse/res`; REST `POST .../ext/vmouse`).

**Operacje**:

| `op` | Argumenty | Zwraca `data` |
|---|---|---|
| `move` | `{ x, y }` | `{}` |
| `move_rel` | `{ dx, dy }` | `{}` |
| `click` | `{ button?: 'left'\|'right'\|'middle', x?, y? }` | `{}` |
| `double_click` | `{ button?, x?, y? }` | `{}` |
| `press` / `release` | `{ button? }` | `{}` |
| `scroll` | `{ dy, dx?, x?, y? }` | `{}` |
| `drag` | `{ x1, y1, x2, y2, button? }` | `{}` |
| `get_pos` | `{}` | `{ x, y }` |
| `get_size` | `{}` | `{ width, height }` |

```jsonc
// → ext/vmouse/req
{ "id": "m1", "op": "get_size" }
// ← ext/vmouse/res
{ "id": "m1", "ok": true, "data": { "width": 1920, "height": 1080 } }
```

Referencja: [`app/client/extensions/virtual_mouse.py`](../app/client/extensions/virtual_mouse.py).

---

## 5.4 Virtual Display (`extType = "display"`)

**Tak, to istnieje** — to „wirtualny wyświetlacz": urządzenie **wypycha klatki obrazu** (np. ze swojego
ekranu OLED/TFT), a frontend [`VirtualDisplayPage`](../app/mycastle-web/src/pages/minis-user/iot/VirtualDisplayPage.tsx)
renderuje je na canvasie. Różni się od §5.5 (`smart-display`), które tylko konfiguruje treść.

Charakterystyczne: oprócz zwykłego request-response (`get_config`), urządzenie publikuje na
`ext/display/res` **niezamówione** ramki z `op: "frame"`. Backend (`DisplayExtension`) trzyma `lastFrame`
i emituje event `frame`; frontend subskrybuje topic surowo przez MQTT (`mqttClient.rawSubscribe`):

```text
minis/{userName}/{deviceName}/ext/display/res
```

**Format ramki** (device → `ext/display/res`):

```jsonc
{
  "op": "frame",
  "n": 200,            // numer klatki
  "w": 128, "h": 64,   // wymiary w pikselach
  "fmt": "MONO_VLSB",  // format pikseli
  "data": "<base64>"   // surowe bajty bufora ramki, base64
}
```

Obsługiwane formaty pikseli (dekodery we frontendzie): `RGB565`, `MONO_VLSB`, `MONO_HLSB`,
`GS4_HMSB`, `GS8`. Frontend renderuje z `imageRendering: pixelated`, zoom 1–8×, licznik FPS.

**Request-response** (serwer może odpytać urządzenie):

```jsonc
// → ext/display/req
{ "id": "d1", "op": "get_config" }
// ← ext/display/res  (zwykła koperta extRes, NIE op:"frame")
{ "id": "d1", "ok": true, "data": { /* konfiguracja wyświetlacza */ } }
```

Urządzenie rozróżnia więc dwa rodzaje wiadomości na `ext/display/res`:
ramki (`op:"frame"`, bez `id`) i odpowiedzi na żądania (koperta `{ id, ok, data }`).

---

## 5.5 Smart Display (`extType = "smart-display"`) — dla porównania

To **nie** jest strumień ramek, tylko konfiguracja treści wyświetlacza (zegar/tekst/metryka/obraz/pogoda).
Serwer wysyła `update`/`clear`; urządzenie (aplikacja pygame,
[`app/client/apps/smart_display.py`](../app/client/apps/smart_display.py)) renderuje widoki samodzielnie.
`IotDevicePage` pokazuje wtedy przycisk „Smart Display" (strona konfiguracji widoków), a config jest też
pobierany przez REST `GET/PUT .../smart-display`.

```jsonc
// → ext/smart-display/req
{ "id": "s1", "op": "update", "data": { "metricKey": "temp", "metricValue": 22.5 } }
// ← ext/smart-display/res
{ "id": "s1", "ok": true }
```

---

## 6. Co pokazuje IotDevicePage (mapowanie rozszerzeń → UI)

[`IotDevicePage`](../app/mycastle-web/src/pages/minis-user/iot/IotDevicePage.tsx) renderuje przyciski
**warunkowo**, na podstawie `config.extensions[].type`:

| Warunek (`extensions[].type`) | UI | Akcja |
|---|---|---|
| `smart-display` | przycisk **Smart Display** | nawigacja `/user/{u}/iot/smart-display/{d}` |
| `display` | przycisk **Virtual Display** | nawigacja `/user/{u}/iot/virtual-display/{d}` (subskrypcja MQTT ramek) |
| `vfs` | przycisk **Editor** | edytor plików (RemoteFS → `/api/users/{u}/devices/{d}/vfs/...`) |
| `vkbd` | przycisk **Keyboard** | dialog → `POST .../ext/vkbd` (disabled gdy offline) |
| `vmouse` | przycisk **Mouse** | dialog → `POST .../ext/vmouse` (disabled gdy offline) |

Pozostałe sekcje strony: encje (`EntityWidget`), telemetria (karty + sparkline), komendy + ACK, alerty,
device twin. Dane ładowane przez `MinisApiService` z odświeżaniem co ~10 s; telemetria/status na żywo
przez MQTT.

Ścieżka „frontend → urządzenie" dla vkbd/vmouse (HTTP → backend → MQTT):

```text
IotDevicePage  ──HTTP POST /ext/{type}──►  MycastleHttpServer.handleVirtualInputExt
   └─ minisApi.extRequest(u, d, type, { op, ...params })
                                          └─ ext.sendRequest(op, params)  ──MQTT pub──►  ext/{type}/req
                                          ◄──MQTT (ext/{type}/res, 10 s timeout)──  urządzenie
```

---

## 7. Minimalny checklist implementacji urządzenia

1. Połącz się z brokerem MQTT (TCP na skonfigurowanym porcie lub WS `/mqtt` na 1894); **unikalne `clientId`**
   (np. `minis-{deviceName}`). Zaimplementuj reconnect z backoffem.
2. Opublikuj **`hello`** z `extensions[]` (i opcjonalnie `entities[]`) — to rejestruje urządzenie (§4).
3. Wysyłaj **`heartbeat`** cyklicznie (≤ `heartbeatIntervalSec`), inaczej zostaniesz OFFLINE.
4. Wysyłaj **`telemetry`** z odczytami sensorów (jeśli są). `key` bez spacji/polskich znaków; QoS 1.
5. Subskrybuj **`command`** → wykonuj i odsyłaj **`command/ack`** (`ACKNOWLEDGED` / `FAILED`) z tym samym `id`.
6. Dla każdego zadeklarowanego rozszerzenia subskrybuj **`ext/{type}/req`** i odpowiadaj na
   **`ext/{type}/res`** kopertą `{ id, ok, data?, error? }`:
   - `vfs` — operacje plikowe (base64),
   - `vkbd` / `vmouse` — input,
   - `display` — odpowiadaj na `get_config` **oraz** wypychaj ramki `{ op:"frame", n, w, h, fmt, data }`,
   - `smart-display` — obsłuż `update` / `clear`.
7. Po reconnect publikuj `hello` ponownie (deklaracja encji/rozszerzeń jest idempotentna — backend scala).

Referencyjna, kompletna implementacja device-side: [`app/client/`](../app/client/) (Python, paho-mqtt).
Framework-agnostyczne klocki TypeScript: [`packages/core/src/iot/device/`](../packages/core/src/iot/device/).

---

## 8. Szybkie testowanie z poziomu Node.js (MQTT-WS)

```javascript
import mqtt from 'mqtt';
const U = 'user1', D = 'dev-iot1', P = `minis/${U}/${D}`;
const client = mqtt.connect('ws://localhost:1894/mqtt', { clientId: `minis-${D}` });

client.on('connect', () => {
  // 1) rejestracja: hello z rozszerzeniami
  client.publish(`${P}/hello`, JSON.stringify({
    extensions: [{ type: 'vfs', enabled: true }, { type: 'vmouse', enabled: true }],
    entities: [{ id: 'temp', type: 'sensor', name: 'Temperature', unit: '°C' }],
  }));
  // 2) telemetria + heartbeat
  client.publish(`${P}/telemetry`, JSON.stringify({ metrics: [{ key: 'temperature', value: 23.5, unit: '°C' }] }));
  client.publish(`${P}/heartbeat`, JSON.stringify({}));
  // 3) odbiór komend i żądań rozszerzeń
  client.subscribe([`${P}/command`, `${P}/ext/+/req`]);
});

client.on('message', (topic, msg) => {
  const data = JSON.parse(msg.toString());
  if (topic.endsWith('/command')) {
    client.publish(`${P}/command/ack`, JSON.stringify({ id: data.id, status: 'ACKNOWLEDGED' }));
  } else if (topic.endsWith('/ext/vmouse/req') && data.op === 'get_size') {
    client.publish(`${P}/ext/vmouse/res`, JSON.stringify({ id: data.id, ok: true, data: { width: 1920, height: 1080 } }));
  }
});
```

> Urządzenia natywne (ESP32) zwykle używają **TCP MQTT** (port `1884` w referencyjnym kliencie),
> a nie WebSocket — wybór transportu konfiguruje się po stronie firmware/klienta.
