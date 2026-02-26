# IoT Device Implementation Guide

Dokumentacja dla osob implementujacych firmware urzadzen IoT (ESP32, ESP8266, itp.) ktore lacza sie z platforma Minis.

---

## 1. Architektura polaczenia

Urzadzenie IoT komunikuje sie z backendem Minis wylacznie przez **MQTT over WebSocket**.

```
┌──────────────┐    MQTT over WebSocket    ┌────────────────────────┐
│  Urzadzenie  │ ◄──────────────────────►  │  minis-backend         │
│  IoT (ESP32) │    ws://{host}:1902/mqtt  │  (Aedes MQTT broker)   │
└──────────────┘                           └────────────────────────┘
```

**Parametry polaczenia:**
- **Protokol:** MQTT 3.1.1 over WebSocket
- **URL:** `ws://{host}:1902/mqtt`
- **Port:** 1902 (domyslny, moze byc inny w deploymencie)
- **Sciezka WebSocket:** `/mqtt`
- **QoS:** 1 (zalecany dla telemetrii i komend)
- **Client ID:** unikalne dla kazdego urzadzenia, np. `minis-{deviceId}`
- **Brak autoryzacji MQTT** — broker akceptuje polaczenia bez credentials (autoryzacja na poziomie API)

> **Uwaga:** Broker uzywa Aedes (Node.js). Urzadzenie musi obslugiwac MQTT over WebSocket — nie raw TCP MQTT. Wiekszposc bibliotek ESP32 (np. PubSubClient z WiFiClient) wspiera tylko raw TCP. Nalezy uzyc biblioteki obslugujacej WebSocket transport, np. **ArduinoWebsockets** + MQTT adapter lub **esp_mqtt** z ESP-IDF (wspiera WebSocket).

---

## 2. MQTT Topic Schema

Wszystkie topici IoT maja prefix `minis/` i format:

```
minis/{userId}/{deviceId}/{typ}
```

Gdzie:
- `{userId}` — ID uzytkownika wlasciciela urzadzenia (z systemu Minis)
- `{deviceId}` — ID urzadzenia (z systemu Minis, np. `dev-iot1`)
- `{typ}` — typ wiadomosci

### 2.1. Topici publikowane przez urzadzenie (device → backend)

| Topic | Kierunek | Opis |
|---|---|---|
| `minis/{userId}/{deviceId}/telemetry` | device → backend | Odczyty czujnikow |
| `minis/{userId}/{deviceId}/heartbeat` | device → backend | Sygnalizacja zycia |
| `minis/{userId}/{deviceId}/command/ack` | device → backend | Potwierdzenie wykonania komendy |

### 2.2. Topici subskrybowane przez urzadzenie (backend → device)

| Topic | Kierunek | Opis |
|---|---|---|
| `minis/{userId}/{deviceId}/command` | backend → device | Komendy do wykonania |

### 2.3. Topici publikowane przez backend (do frontendu)

Te topici sa generowane przez backend — urzadzenie ich **nie** publikuje ani nie subskrybuje:

| Topic | Opis |
|---|---|
| `minis/{userId}/{deviceId}/status` | Zmiana statusu ONLINE/OFFLINE |
| `minis/{userId}/{deviceId}/telemetry/live` | Republished telemetria (live feed) |
| `minis/{userId}/{deviceId}/alert` | Wyzwolony alert |

---

## 3. Formaty wiadomosci (payloady JSON)

### 3.1. Telemetria

**Topic:** `minis/{userId}/{deviceId}/telemetry`
**Kierunek:** device → backend
**Czestotliwosc:** co kilka-kilkanascie sekund (zalezne od konfiguracji, np. co 10s)

```json
{
  "metrics": [
    { "key": "temperature", "value": 23.5, "unit": "°C" },
    { "key": "humidity", "value": 61.2, "unit": "%" },
    { "key": "pressure", "value": 1013.25, "unit": "hPa" }
  ],
  "timestamp": 1740500000000,
  "rssi": -42,
  "battery": 3.7
}
```

**Pola:**

| Pole | Typ | Wymagane | Opis |
|---|---|---|---|
| `metrics` | array | **tak** | Lista odczytow czujnikow |
| `metrics[].key` | string | **tak** | Klucz metryki (np. `"temperature"`, `"humidity"`) |
| `metrics[].value` | number \| boolean \| string | **tak** | Wartosc odczytu |
| `metrics[].unit` | string | nie | Jednostka (np. `"°C"`, `"%"`) |
| `timestamp` | number | nie | Epoch ms. Jezeli brak — backend uzyje czasu odbioru |
| `rssi` | number | nie | Sila sygnalu WiFi (dBm) |
| `battery` | number | nie | Napiecie baterii (V) |

**Zachowanie backendu po odebraniu telemetrii:**
1. Zapis do SQLite (`telemetry` table)
2. Aktualizacja presence (urzadzenie uznane za ONLINE)
3. Ewaluacja regul alertow — jezeli metryka przekracza warunki, alert jest generowany
4. Republish na `minis/{userId}/{deviceId}/telemetry/live` (do frontendu)

> **Wskazowka:** Telemetria jednoczesnie sluzy jako heartbeat — kazdy odczyt telemetrii odswierza presence. Jezeli urzadzenie wysyla telemetrie czesciej niz heartbeat interval, osobny heartbeat nie jest konieczny.

### 3.2. Heartbeat

**Topic:** `minis/{userId}/{deviceId}/heartbeat`
**Kierunek:** device → backend
**Czestotliwosc:** co `heartbeatIntervalSec` sekund (domyslnie 60s, konfigurowalne per urzadzenie)

```json
{
  "uptime": 3600,
  "rssi": -42,
  "battery": 3.7
}
```

**Pola:**

| Pole | Typ | Wymagane | Opis |
|---|---|---|---|
| `uptime` | number | nie | Czas dzialania urzadzenia (sekundy) |
| `rssi` | number | nie | Sila sygnalu WiFi (dBm) |
| `battery` | number | nie | Napiecie baterii (V) |

Heartbeat sluzy wylacznie do utrzymania statusu ONLINE. Payload moze byc pusty (`{}`).

**Logika OFFLINE detection:**
- Backend oczekuje heartbeat co `heartbeatIntervalSec` sekund
- Jezeli nie otrzyma heartbeat przez `heartbeatIntervalSec × 2.5`, urzadzenie jest oznaczane jako OFFLINE
- Przyklad: heartbeat co 60s → timeout po 150s bez wiadomosci

### 3.3. Komendy (odbior)

**Topic:** `minis/{userId}/{deviceId}/command`
**Kierunek:** backend → device
**Kiedy:** Gdy uzytkownik wysle komende przez dashboard lub REST API

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "set_relay",
  "payload": {
    "pin": 5,
    "state": true
  }
}
```

**Pola:**

| Pole | Typ | Opis |
|---|---|---|
| `id` | string | UUID komendy (do ACK) |
| `name` | string | Nazwa komendy (definiowana przez programiste) |
| `payload` | object | Parametry komendy (dowolny JSON) |

**Urzadzenie powinno:**
1. Zasubskrybowac `minis/{userId}/{deviceId}/command` po polaczeniu
2. Parsowac JSON
3. Wykonac akcje odpowiadajaca `name`
4. Wyslac ACK (patrz 3.4)

### 3.4. Command ACK (potwierdzenie)

**Topic:** `minis/{userId}/{deviceId}/command/ack`
**Kierunek:** device → backend
**Kiedy:** Po odebraniu i przetworzeniu komendy

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "EXECUTED"
}
```

Lub w przypadku bledu:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "FAILED",
  "reason": "Pin 5 not available"
}
```

**Pola:**

| Pole | Typ | Wymagane | Opis |
|---|---|---|---|
| `id` | string | **tak** | UUID komendy (z odebranej wiadomosci) |
| `status` | string | **tak** | `"EXECUTED"` lub `"FAILED"` |
| `reason` | string | nie | Przyczyna bledu (tylko przy FAILED) |

**Dozwolone statusy:** `PENDING`, `SENT`, `ACKNOWLEDGED`, `FAILED`, `TIMEOUT`
- `ACKNOWLEDGED` — urzadzenie odebralo komende (opcjonalny etap posredni)
- `EXECUTED` — urzadzenie wyknoalo komende
- `FAILED` — blad wykonania

---

## 4. Typowy cykl zycia urzadzenia

```
1. Boot / WiFi connect
2. MQTT connect → ws://{host}:1902/mqtt
3. Subscribe → minis/{userId}/{deviceId}/command
4. Loop:
   a. Odczytaj czujniki
   b. Publish telemetria → minis/{userId}/{deviceId}/telemetry
   c. (opcjonalnie) Publish heartbeat → minis/{userId}/{deviceId}/heartbeat
   d. Sprawdz komendy (callback MQTT)
   e. Sleep / delay
```

### Przykladowy pseudokod (Arduino/ESP32)

```cpp
#include <WiFi.h>
#include <ArduinoJson.h>
// + biblioteka MQTT z WebSocket transport

const char* WIFI_SSID = "...";
const char* WIFI_PASS = "...";
const char* MQTT_HOST = "192.168.1.100";
const int   MQTT_PORT = 1902;
const char* USER_ID   = "user1";
const char* DEVICE_ID = "dev-iot1";

// Topici
String topicTelemetry;
String topicHeartbeat;
String topicCommand;
String topicCommandAck;

void setup() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  // ...wait for connection...

  topicTelemetry  = String("minis/") + USER_ID + "/" + DEVICE_ID + "/telemetry";
  topicHeartbeat  = String("minis/") + USER_ID + "/" + DEVICE_ID + "/heartbeat";
  topicCommand    = String("minis/") + USER_ID + "/" + DEVICE_ID + "/command";
  topicCommandAck = String("minis/") + USER_ID + "/" + DEVICE_ID + "/command/ack";

  mqttConnect();
  mqttSubscribe(topicCommand);
}

void loop() {
  mqttLoop();

  // Odczyt czujnikow
  float temp = readTemperature();
  float hum  = readHumidity();

  // Publish telemetria
  JsonDocument doc;
  JsonArray metrics = doc["metrics"].to<JsonArray>();

  JsonObject m1 = metrics.add<JsonObject>();
  m1["key"]   = "temperature";
  m1["value"] = temp;
  m1["unit"]  = "°C";

  JsonObject m2 = metrics.add<JsonObject>();
  m2["key"]   = "humidity";
  m2["value"] = hum;
  m2["unit"]  = "%";

  doc["rssi"] = WiFi.RSSI();

  String payload;
  serializeJson(doc, payload);
  mqttPublish(topicTelemetry, payload);

  delay(10000); // co 10 sekund
}

// Callback MQTT — odbior komend
void onMessage(String topic, String payload) {
  if (topic == topicCommand) {
    JsonDocument doc;
    deserializeJson(doc, payload);

    String cmdId   = doc["id"].as<String>();
    String cmdName = doc["name"].as<String>();

    bool success = executeCommand(cmdName, doc["payload"]);

    // ACK
    JsonDocument ack;
    ack["id"]     = cmdId;
    ack["status"] = success ? "EXECUTED" : "FAILED";
    if (!success) ack["reason"] = "Unknown command: " + cmdName;

    String ackPayload;
    serializeJson(ack, ackPayload);
    mqttPublish(topicCommandAck, ackPayload);
  }
}
```

---

## 5. Konfiguracja urzadzenia w systemie Minis

Aby urzadzenie IoT dzialalo w systemie, musi byc zarejestrowane:

### 5.1. Rejestracja urzadzenia

1. Utworz urzadzenie w panelu Minis (strona Devices) z `isIot: true`
2. Zapisz `deviceId` i `userId` — beda potrzebne w firmware

### 5.2. Konfiguracja IoT (opcjonalna)

Przez REST API lub dashboard mozna ustawic konfiguracje:

```
PUT /api/users/{userId}/devices/{deviceId}/iot-config
```

```json
{
  "topicPrefix": "minis/user1/dev-iot1",
  "heartbeatIntervalSec": 60,
  "capabilities": [
    { "type": "sensor", "metricKey": "temperature", "unit": "°C", "label": "Temperature" },
    { "type": "sensor", "metricKey": "humidity", "unit": "%", "label": "Humidity" },
    { "type": "actuator", "commandName": "set_relay", "label": "Relay", "payloadSchema": {} }
  ]
}
```

**Capabilities** informuja dashboard jakie metryki i komendy sa dostepne:
- `sensor` — metryka odczytywana z urzadzenia (wyswietlana na wykresach)
- `actuator` — komenda wysylana do urzadzenia (przycisk w dashboard)

Jezeli konfiguracja nie jest ustawiona, urzadzenie nadal moze wysylac telemetrie — dashboard wyswietli surowe metryki.

---

## 6. REST API — reference dla narzedzi diagnostycznych

Pelna dokumentacja API dostepna w Swagger: `http://{host}:1902/api/docs`

### Przydatne endpointy

| Metoda | Endpoint | Opis |
|---|---|---|
| GET | `/api/users/{userId}/iot/devices` | Lista urzadzen IoT ze statusem |
| GET | `/api/users/{userId}/devices/{deviceId}/iot-config` | Konfiguracja urzadzenia |
| PUT | `/api/users/{userId}/devices/{deviceId}/iot-config` | Ustaw konfiguracje |
| GET | `/api/users/{userId}/devices/{deviceId}/telemetry/latest` | Ostatni odczyt |
| GET | `/api/users/{userId}/devices/{deviceId}/telemetry?from=&to=&limit=` | Historia telemetrii |
| POST | `/api/users/{userId}/devices/{deviceId}/commands` | Wyslij komende |
| GET | `/api/users/{userId}/devices/{deviceId}/commands?limit=` | Historia komend |

### Przyklad: wyslanie komendy przez curl

```bash
curl -X POST http://localhost:1902/api/users/user1/devices/dev-iot1/commands \
  -H 'Content-Type: application/json' \
  -d '{"name": "set_relay", "payload": {"pin": 5, "state": true}}'
```

### Przyklad: sprawdzenie statusu urzadzenia

```bash
curl http://localhost:1902/api/users/user1/iot/devices
```

Odpowiedz:
```json
{
  "items": [
    { "deviceId": "dev-iot1", "status": "ONLINE", "lastSeenAt": 1740500000000 }
  ]
}
```

---

## 7. Testowanie urzadzenia

### 7.1. Symulacja urzadzenia z mosquitto_pub

Mozna testowac bez fizycznego urzadzenia uzywajac klienta MQTT:

```bash
# Publish telemetrii
mosquitto_pub -h localhost -p 1902 \
  -t "minis/user1/dev-iot1/telemetry" \
  -m '{"metrics":[{"key":"temperature","value":23.5,"unit":"°C"}]}'

# Publish heartbeat
mosquitto_pub -h localhost -p 1902 \
  -t "minis/user1/dev-iot1/heartbeat" \
  -m '{}'
```

> **Uwaga:** mosquitto_pub uzywa raw TCP MQTT. Broker Minis akceptuje wylacznie MQTT over WebSocket (na `/mqtt`). Do testowania uzyj narzedzia obslugujacego WebSocket, np. **MQTTX** (desktop app) lub skrypt Node.js z `mqtt` pakietem:

```javascript
import mqtt from 'mqtt';

const client = mqtt.connect('ws://localhost:1902/mqtt');

client.on('connect', () => {
  console.log('Connected');

  // Publish telemetria
  client.publish('minis/user1/dev-iot1/telemetry', JSON.stringify({
    metrics: [
      { key: 'temperature', value: 23.5, unit: '°C' },
      { key: 'humidity', value: 61.2, unit: '%' },
    ],
  }));

  // Subscribe na komendy
  client.subscribe('minis/user1/dev-iot1/command');
});

client.on('message', (topic, message) => {
  console.log(`${topic}: ${message.toString()}`);
});
```

### 7.2. Weryfikacja w dashboard

1. Otworz `http://localhost:1903` (minis-web)
2. Zaloguj sie
3. Przejdz do IoT Devices → kliknij urzadzenie
4. Dashboard powinien pokazywac:
   - Status ONLINE/OFFLINE
   - Ostatnie metryki
   - Historie telemetrii
   - Mozliwosc wysylania komend

---

## 8. Dobre praktyki

1. **Unikalne Client ID** — uzywaj `minis-{deviceId}` jako MQTT client ID. Dwa polaczenia z tym samym client ID spowoduja rozlaczenie pierwszego.

2. **Reconnect** — implementuj automatyczne reconnect z exponential backoff (np. 1s, 2s, 4s, 8s, max 30s).

3. **Timestamp** — jezeli urzadzenie ma RTC/NTP, dolacz `timestamp` w telemetrii. W przeciwnym razie backend uzyje czasu odbioru.

4. **Metryki klucze** — uzywaj stalych, opisowych kluczy: `temperature`, `humidity`, `pressure`, `light`, `motion`, `relay_state`. Unikaj polskich znakow i spacji.

5. **Czestotliwosc telemetrii** — dostosuj do zastosowania:
   - Czujniki srodowiskowe: co 10-60s
   - Monitoring energii: co 1-5s
   - Alarm/motion: event-driven (publish tylko przy zmianie)

6. **Heartbeat interval** — domyslnie 60s. Dla urzadzen na baterii mozna zwiekszyc (np. 300s). Timeout = interval × 2.5.

7. **Payload size** — utrzymuj payloady ponizej 1KB. Broker Aedes ma domyslny limit pakietu.

8. **QoS 1** — uzywaj QoS 1 dla telemetrii i komend (at least once delivery). QoS 0 moze tracic wiadomosci, QoS 2 jest zbyt kosztowny.

9. **Command ACK** — zawsze potwierdzaj komendy (nawet jezeli nie mozesz ich wykonac — wtedy FAILED z reason).

10. **Graceful disconnect** — przed sleep/restart wyslij ostatni heartbeat i rozlacz MQTT czysto (DISCONNECT packet).

---

## 9. Troubleshooting

| Problem | Przyczyna | Rozwiazanie |
|---|---|---|
| Urzadzenie nie laczy sie z MQTT | Bledny URL/port lub brak WebSocket | Sprawdz czy uzywasz `ws://` i sciezki `/mqtt` |
| Status OFFLINE mimo dzialania | Heartbeat nie dochodzi | Sprawdz topic format, QoS, i czy broker jest uruchomiony |
| Komendy nie dochodza | Brak subskrypcji | Sprawdz czy urzadzenie subskrybuje `minis/{userId}/{deviceId}/command` |
| Telemetria nie pojawia sie w dashboard | Bledny format JSON | Waliduj JSON payload, sprawdz czy `metrics` jest tablica |
| Alert nie wyzwala sie | Brak reguly lub cooldown | Sprawdz reguly alertow w dashboard (zakladka Rules) |
| Duplikaty telemetrii | QoS 1 retransmisja | Normalne zachowanie — backend zapisuje kazdy otrzymany rekord |
