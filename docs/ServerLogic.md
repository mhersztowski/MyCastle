
Mqtt Clients flag \*\*browser\*\*
 - Server (node.js)
 - Desktop (node.js/pyton)
 - Mobile (web)
 - Tv (web)
 - Watch (web)
 - IoT/Embedded (ESP32, Raspberry Pi, Arduino) (Arduino/python)
 - Car (Android Auto / CarPlay)
 - VR/AR (np. Quest, Vision Pro)
 - CLI (klient terminalowy do automatyzacji/skryptów) (Python)
 - Game console (Steam Deck, konsole)


Services
- FileSystem
- Keyboard
- Mouse
- Display
- Notification


Czyli zdarzenia generowane przez interakcję użytkownika z już wyrenderowanym formularzem. To są klasyczne eventy UI, tylko przesyłane przez MQTT:


**Zdarzenia pola:**
{ "type": "focus", "field": "username" }
{ "type": "blur", "field": "username" }
{ "type": "change", "field": "username", "value": "jan" }
{ "type": "input", "field": "username", "value": "ja" }


**Zdarzenia checkbox/radio/toggle:**
{ "type": "check", "field": "remember", "checked": true }
{ "type": "select", "field": "country", "value": "PL" }


**Zdarzenia przycisków:**
{ "type": "click", "field": "submitButton" }
{ "type": "hover", "field": "submitButton" }


**Zdarzenia formularza (całego):**
{ "type": "submit", "formId": "login-form" }
{ "type": "reset", "formId": "login-form" }
{ "type": "validate", "formId": "login-form" }


**Zdarzenia walidacji/błędów:**
{ "type": "error", "field": "email", "message": "Niepoprawny email" }
{ "type": "valid", "field": "email" }


**Zdarzenia klawiatury (przy aktywnym polu):**
{ "type": "keydown", "field": "username", "key": "Enter" }
{ "type": "keyup", "field": "username", "key": "Backspace" }

**Zdarzenia widoczności/cyklu życia:**
{ "type": "mounted", "formId": "login-form" }
{ "type": "unmounted", "formId": "login-form" }
{ "type": "visible", "formId": "login-form" }
{ "type": "hidden", "formId": "login-form" }


**Zdarzenia plików (upload):**
{ "type": "fileSelected", "field": "attachment", "fileName": "doc.pdf", "size": 12345 }
{ "type": "fileUploadProgress", "field": "attachment", "progress": 45 }


To jest właściwie odwzorowanie standardowych eventów DOM (focus, blur, change, input, click, keydown) plus eventy specyficzne dla cyklu życia formularza (mounted, submit, validate). Czy w Twoim systemie formularz żyje po stronie klienta (urządzenia), a eventy są tylko informacją dla serwera/innych klientów? Czy chcesz też zdarzenia idące w drugą stronę (np. serwer każe podświetlić pole z błędem)?


Service

Device

Server


-   Service
    
    -   Cron
        
    -   Log
        
    -   Console
        
    -   VFS
        


Client


-   Service
    
    -   UserInterface
        
        -   Clone QtLibrary
            


-   Device
    
    -   Displays
        


Client identyfikowany jest przez


UserName, Device, clientType, Id


Device: desktop, mobile, watch, tv, car, vr, iot


ClientType: web, native






# JavaScipt Api

Zaimplementowane w `@mhersztowski/server-logic` (`packages/server-logic/src`).

```ts
class IotServer {
    readonly log      : LogService;       // log(msg), recent(), onMessage
    readonly activity : ActivityService;  // record(kind, msg, client?), recent()
    readonly console  : ConsoleService;
    readonly cron     : CronService;
    readonly clients  : ClientRegistry;

    // Sygnaly (minislib Signal)
    readonly onServerMessage  : Signal<[Envelope]>;
    readonly onUiEvent        : Signal<[ClientId, UiEvent]>;
    readonly onServiceMessage : Signal<[ClientId, serviceId, Envelope]>;
    readonly onDeviceMessage  : Signal<[ClientId, deviceId, Envelope]>;

    start(); stop();
    publishToServerOutbox(env); publishToUser(user, env); publishToClient(client, env);
}

// Wstrzykiwany transport (dependency inversion) — host podpina broker.
interface IMqttTransport {
    publish(topic, payload);
    subscribe(handler: (topic, payload) => void);   // handler dostaje WSZYSTKIE wiadomosci
}

class ClientRegistry {
    register(client); unregister(client); touch(client);
    addService(client, entity); removeService(client, id);
    addDevice(client, entity);  removeDevice(client, id);
    list(): ClientPresence[]; byUser(user); prune(maxAgeMs);
    // Signals: changed, clientConnected, clientDisconnected, entitiesChanged
}

interface ClientPresence {
    client: ClientId; connectedAt: number; lastSeen: number;
    services: RegisteredEntity[];
    devices:  RegisteredEntity[];
}

interface Envelope<T = unknown> {
    type: string; from?: string; to?: string; ts?: number; reqId?: string; payload?: T;
}
```

**Identity (zaimplementowane):**
`DeviceKind = server | desktop | mobile | tv | watch | car | vr | iot | cli | game`,
`ClientType = web | native`. Segment topiku: `{device}-{clientType}`.



# MQTT Api


```
Globalne
MqttList<type> crud do type bazujacy na id
```


Topic w mqtt **Servera**
Inbox: /server/Inbox
Outbox: /server/outbox


Topic w mqtt **clienta**
Inbox: /UserName/DeviceClientType/id/inbox

Outbox: /UserName/DeviceClientType/id/outbox

Services: /UserName/DeviceClientType/id/service-list MqttList<services>

Devices: /UserName/DeviceClientType/id/device-list MqttList<devices>

client-> server (na client **outbox** — tozsamosc bierze sie z topiku)

Envelope: `{ type, from?, to?, ts?, reqId?, payload? }`. Payload rejestracji encji:
`{ entity: { id, name?, kind?, capabilities?[] } }`.

  client-login          { client }                → rejestruje clienta
  client-logout         { client }                → wyrejestrowuje
  client-service-new    { entity }                → dodaje service do clienta
  client-service-remove { entity: { id } }        → usuwa service
  client-device-new     { entity }                → dodaje device do clienta
  client-device-remove  { entity: { id } }        → usuwa device
  heartbeat             {}                         → odswieza lastSeen (prune ~60s)

Komendy do encji ida na jej **inbox**, odpowiedzi na **outbox**:
np. `{ type: 'move', payload: { x, y }, reqId }` → `{ type: 'move.ok', reqId, payload }`
albo `{ type: 'error', reqId, payload: { command, message } }`.

**Uwaga:** topiki BEZ wiodacego `/` (wiodacy `/` tworzy pusty poziom MQTT) —
faktyczny format to `server/inbox`, `{user}/{dev}-{ct}/{id}/outbox`, itd.

Topic w mqtt service

Inbox: /UserName/DeviceClientType/id/service/id-service/inbox

Outbox: /UserName/DeviceClientType/id/service/id-service/outbox

Topic w mqtt device

Inbox: /UserName/DeviceClientType/id/device/id-device/inbox

Outbox: /UserName/DeviceClientType/id/device/id-device/outbox


Pakiety:
MqttList
MqttList


Topic w mqtt **usera**
Inbox: /UserName/Inbox
Outbox: /UserName/outbox
Funkcjonalnosc: zarzadzanie **clients**


# Device & Service Model

Bazowe/funkcjonalne klasy zyja w `packages/server-logic/src/devices/` (browser-safe,
bez minislib/Node — eksportowane z `@mhersztowski/server-logic` i `.../web`). Sa
zrodlem prawdy kontraktu (jakie akcje i parametry ma dana encja); UI (strona
Server Logic) tylko je renderuje, a klienty (np. `client_desktop`) je wykonuja.

```ts
abstract class ClientEntity {
    readonly kind: string;              // np. 'virtual-mouse'
    readonly category: 'device' | 'service';
    readonly defaultName: string;
    constructor(id: string, name?: string);
    abstract actions(): ActionDef[];
    capabilities(): string[];           // = actions().map(a => a.name)
    action(name): ActionDef | undefined;
    toRegisteredEntity(): RegisteredEntity;   // wire form dla client-*-new
    handle(action, params): unknown;    // opcjonalny wykonawca (klient/serwer)
}
abstract class Device  extends ClientEntity { category = 'device' }
abstract class Service extends ClientEntity { category = 'service' }

// Schemat akcji — pozwala renderowac panel i zbudowac payload bez hardkodu.
interface ActionDef { name; label?; description?; params?: ParamDef[]; returns?: boolean }
interface ParamDef  { name; type: 'string'|'number'|'boolean'|'enum';
                      label?; optional?; default?; options?; min?; max?; step? }
function defaultPayload(action: ActionDef): Record<string, unknown>;
```

**Wbudowane encje (Devices):** `VirtualMouse` (move/move_rel/click/scroll/press/
release/get_pos/get_size), `VirtualKeyboard` (type_text/key_press/hotkey),
`VirtualDisplay` (show_text/clear/get).
**Wbudowane (Services):** `NotificationService` (notify), `FileSystemService`
(list/read/write/delete).

**Katalog** (`catalog.ts`) — mapowanie `kind` → klasa:

```ts
ENTITY_CLASSES: Record<string, EntityCtor>
createEntity(kind, id, name?): ClientEntity | null
actionsForKind(kind): ActionDef[] | null
categoryForKind(kind): 'device' | 'service' | null
```

Nowa akcja/urzadzenie = jedna klasa + wpis w `ENTITY_CLASSES`; strona Server Logic
(zakladka Devices/Services) podchwytuje je automatycznie przez `actionsForKind`.

### Service Log


```
enum EnumLogKind { Log, Debug, Warning, Error}
interface ILogMessage{
    message : string;
    kind : EnumLogKind;
}

Function log(msg : ILogMessage)
   Run
      Event OnMessage(msg : ILogMessage)
```


# Zrodla (implementacja)

- `packages/server-logic/src/`
  - `IotServer.ts` — brain: services + routing server/user/client/service/device
  - `topics.ts` — helpery topikow + `classifyTopic` (server/user/client/service/device)
  - `messages.ts` — `Envelope`, `UiEvent`, `RegisteredEntity`, `CLIENT_MESSAGE_TYPES`
  - `ClientRegistry.ts` — `ClientPresence` (+ services/devices), add/remove entity
  - `devices/` — `ClientEntity`/`Device`/`Service`, `Virtual*`, services, `catalog.ts`
  - `web.ts` — browser-safe barrel (uzywany przez `mycastle-web`)
- `app/mycastle-web/src/pages/programming/ServerLogicPage.tsx` — UI (m.in. zakladka
  Devices/Services: drzewko client→devices/services + panel akcji z `actionsForKind`)
- `app/client/apps/client_desktop*.py` — natywny klient (Python/PySide6): loguje sie
  jako `{user}/desktop-native/{id}` i rejestruje mysz/klawiature/display jako **devices**
- Drive: `.../drive/backend/server-logic*.ts` — uruchamia `IotServer` jako zewnetrzny
  klient MQTT (musi `subscribe('#')` albo `server/inbox` + `+/outbox` + `+/+/+/outbox`)

