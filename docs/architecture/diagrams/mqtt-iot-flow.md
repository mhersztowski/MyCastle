# MQTT IoT Data Flow

Przepływ danych telemetrii od urządzenia IoT przez backend do frontendu.

## Pipeline telemetrii

```mermaid
sequenceDiagram
    participant IoT as IoT Device<br/>(ESP32)
    participant Broker as MqttServer<br/>(Aedes)
    participant IotSvc as IotService
    participant TelStore as TelemetryStore<br/>(SQLite)
    participant Presence as DevicePresence
    participant AlertEng as AlertEngine
    participant ShareStore as DeviceShareStore
    participant Web as minis-web<br/>(Frontend)
    participant SharedUser as Shared User<br/>Frontend

    IoT->>Broker: PUBLISH minis/{user}/{device}/telemetry<br/>{"entities": {...}, "timestamp": ...}
    Broker->>IotSvc: onMessage(topic, payload)

    IotSvc->>IotSvc: matchTopic(topic) → extract user, device
    IotSvc->>IotSvc: mqttTopics.telemetry.payloadSchema.safeParse(payload)

    alt Payload valid
        IotSvc->>TelStore: insert(user, device, entities, timestamp)
        IotSvc->>Presence: updateHeartbeat(user, device)
        IotSvc->>AlertEng: evaluate(user, device, entities)

        alt Alert triggered
            AlertEng->>Broker: PUBLISH minis/{user}/{device}/alert<br/>{"ruleId", "message", "severity"}
            Broker->>Web: alert notification
        end

        IotSvc->>Broker: PUBLISH minis/{user}/{device}/status<br/>{"online": true, "lastSeen": ...}
        IotSvc->>Broker: PUBLISH minis/{user}/{device}/telemetry/live<br/>(same payload — real-time UI update)
        Broker->>Web: live telemetry update

        IotSvc->>ShareStore: getSharesForDevice(user, device)

        loop For each shared user
            IotSvc->>Broker: PUBLISH minis/{sharedUser}/shared/{owner}/{device}/telemetry/live
            IotSvc->>Broker: PUBLISH minis/{sharedUser}/shared/{owner}/{device}/status
            Broker->>SharedUser: forwarded telemetry/status
        end
    else Payload invalid
        IotSvc->>IotSvc: log validation error (no publish)
    end
```

## Przepływ komendy

```mermaid
sequenceDiagram
    participant Web as minis-web
    participant API as MinisHttpServer
    participant CmdDisp as CommandDispatcher<br/>(SQLite)
    participant Broker as MqttServer
    participant IoT as IoT Device

    Web->>API: POST /api/users/{user}/devices/{device}/commands<br/>{"type": "set_state", "entityId": "relay_1", "value": true}
    API->>CmdDisp: createCommand(user, device, type, payload)
    CmdDisp->>CmdDisp: INSERT commands (status: "pending")
    API->>Broker: PUBLISH minis/{user}/{device}/command<br/>{"commandId", "type", "entityId", "value"}
    Broker->>IoT: command received

    alt ACK from device
        IoT->>Broker: PUBLISH minis/{user}/{device}/command/ack<br/>{"commandId"}
        Broker->>API: onMessage
        API->>CmdDisp: ackCommand(commandId) → status: "ack"
    else FAIL from device
        IoT->>Broker: PUBLISH minis/{user}/{device}/command/fail<br/>{"commandId", "reason"}
        Broker->>API: onMessage
        API->>CmdDisp: failCommand(commandId) → status: "fail"
    else Timeout (no response)
        Note over CmdDisp: Status remains "pending"<br/>frontend shows timeout
    end
```

## Heartbeat i Presence

```mermaid
sequenceDiagram
    participant IoT as IoT Device
    participant Broker as MqttServer
    participant IotSvc as IotService
    participant Presence as DevicePresence
    participant Timer as Timeout Timer

    loop Every 30s (firmware)
        IoT->>Broker: PUBLISH minis/{user}/{device}/heartbeat<br/>{"timestamp", "freeHeap", "uptime"}
        Broker->>IotSvc: onMessage
        IotSvc->>Presence: updateHeartbeat(user, device, timestamp)
        Presence->>Presence: reset 90s timeout timer
    end

    Note over Timer: After 90s without heartbeat
    Timer->>Presence: timeout!
    Presence->>IotSvc: emit 'statusChange' (online → offline)
    IotSvc->>Broker: PUBLISH minis/{user}/{device}/status<br/>{"online": false, "lastSeen": ...}
```

## Topic Schema

| Topic Pattern | Kierunek | Payload |
|---------------|----------|---------|
| `minis/{user}/{device}/telemetry` | IoT → Backend | `{entities: {...}, timestamp}` |
| `minis/{user}/{device}/telemetry/live` | Backend → Frontend | same (re-publish) |
| `minis/{user}/{device}/heartbeat` | IoT → Backend | `{timestamp, freeHeap, uptime}` |
| `minis/{user}/{device}/status` | Backend → Frontend | `{online, lastSeen}` |
| `minis/{user}/{device}/command` | Backend → IoT | `{commandId, type, entityId, value}` |
| `minis/{user}/{device}/command/ack` | IoT → Backend | `{commandId}` |
| `minis/{user}/{device}/command/fail` | IoT → Backend | `{commandId, reason}` |
| `minis/{user}/{device}/alert` | Backend → Frontend | `{ruleId, message, severity}` |
| `minis/{target}/shared/{owner}/{device}/telemetry/live` | Backend → SharedUser | forwarded telemetry |
| `minis/{target}/shared/{owner}/{device}/status` | Backend → SharedUser | forwarded status |
