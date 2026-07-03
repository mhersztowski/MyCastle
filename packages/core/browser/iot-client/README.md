# IoT Client — budowanie urządzeń IoT MyCastle (device side)

Vanilla-JS, static-first zestaw klas do tworzenia **urządzeń MyCastle** po stronie
device: urządzenie ogłasza się (`hello`), wysyła `heartbeat` + `telemetry`, odbiera
komendy i requesty rozszerzeń — wszystko po MQTT wg kontraktu z
`@mhersztowski/core` (`mqtt/topics.ts`, single source of truth).

Zbudowane **na bazie `qt/qobject.module.js`**: klasy dziedziczą po `QObject`
(drzewo, cykl życia, `destroy()`), a zdarzenia to `Signal`. Jak cały `core/browser`,
moduł nie ma `import`/`export` — eksportuje klasy przez globalny namespace, więc
działa w Plugin Script, automatyzacjach edytora, Drive sandboxie i `<script type="module">`.

## Klasy

| Klasa | Rola |
|-------|------|
| `IotDevice` | Urządzenie: spina encje + rozszerzenia, transport, hello/heartbeat/telemetrię, routing komend/requestów |
| `IotEntity` | Baza encji + fabryki `IotEntity.sensor/binarySensor/switch/number/button/select(...)` |
| `IotSensorEntity` | Read-only liczbowy/tekstowy (`unit`), `report(value)` |
| `IotBinarySensorEntity` | Read-only bool (`onLabel`/`offLabel`), `report(bool)` |
| `IotSwitchEntity` | Toggle on/off — sygnał `commanded(bool)`, `turnOn/turnOff/toggle()` |
| `IotNumberEntity` | Liczba z `min`/`max`/`step`/`unit` — sygnał `commanded(number)` (auto-clamp) |
| `IotButtonEntity` | Momentalny wyzwalacz — sygnał `pressed()` |
| `IotSelectEntity` | Wybór z listy `options` — sygnał `commanded(string)` (waliduje) |
| `IotExtension` | Rozszerzenie request-response na `ext/{type}/req·res`; mapa operacji `ops` |
| `IotTopics` | Budowanie topiców (`IotTopics.hello(user, device)` itd.) |

Wszystkie klasy są **static-first** — logika żyje w metodach `static`
(`IotDevice.sendHello(dev)`, `IotEntity.toHello(e)`, …), a metody instancji to
cienkie delegaty. Po wpisaniu `IotDevice.` edytor podpowiada całe API.

## Transport

`IotDevice` nie zna MQTT bezpośrednio — dostaje `transport` z API dokładnie takim
jak globalny `client` w sandboxie **Drive**:

```js
transport.publish(topic, payloadString)                // string
transport.subscribe(topic, (msg, topic) => {})         // msg: obiekt lub string; zwraca unsubscribe()
transport.userName                                     // opcjonalnie (fallback dla userName)
```

Dzięki temu w Drive wystarczy `new IotDevice({ transport: client, deviceName })`.
W innym kontekście podłącz dowolny obiekt spełniający ten kontrakt (np. adapter na
`mqtt` z npm).

## Szybki start (Drive → ▶ „Uruchom w przeglądarce")

```js
const dev = new IotDevice({ transport: client, deviceName: 'wirtualka-1' });

const temp = dev.addEntity(IotEntity.sensor('temp', 'Temperatura', { unit: '°C' }));
const pump = dev.addEntity(IotEntity.switch('pump', 'Pompa'));
pump.commanded.connect((on) => console.log('Pompa →', on));

dev.addExtension(IotExtension.define('counter', {
  inc: (a, ext) => ({ value: 1 }),
}));

dev.start();          // subskrybuje command + ext/*/req, wysyła hello, startuje timery
temp.report(23.5);    // reaktywna telemetria — publikuje od razu
```

Pełny, działający przykład: **`iot-client.example.js`**.

### Własny transport MQTT do backendu

`iot-client.example.js` używa globalnego `client` z sandboxa Drive. Jeśli chcesz
połączyć się z brokerem MyCastle **samodzielnie** (zwykła strona `<script type="module">`,
WebEmbed albo Node), zobacz **`iot-client-backend.example.js`** — definiuje klasę
`BackendMqttTransport` (nad `mqtt.js`), która:

- pobiera URL brokera z `window.location` (`${ws|wss}://{host}/mqtt`) lub z configu,
- łączy się jako `web` + **JWT** zalogowanego użytkownika (auto z `localStorage['minis_current_user']`),
- routuje wiadomości po topicu (z obsługą wildcardów `+`/`#`) i ref-liczy subskrypcje,
- spełnia kontrakt transportu (`publish` / `subscribe` / `userName`), więc podłączasz
  ją przez `new IotDevice({ transport, deviceName })`.

```js
const transport = new BackendMqttTransport({ deviceName: 'moje-urzadzenie' });
await transport.connect();
const dev = new IotDevice({ transport, deviceName: 'moje-urzadzenie' });
// …addEntity / addExtension…
dev.start();
```

## Kontrakt MQTT (prefiks `minis/{user}/{device}`)

| topic | kierunek | payload |
|-------|----------|---------|
| `hello` | device→server | `{uptime, extensions[], entities[], platform}` |
| `heartbeat` | device→server | `{uptime}` |
| `telemetry` | device→server | `{metrics:[{key,value,unit?}], timestamp}` |
| `command` | server→device | `{id, name, payload}` |
| `command/ack` | device→server | `{id, status:'ACKNOWLEDGED'\|'FAILED', reason?}` |
| `ext/{type}/req` | server→device | `{id, op, path?, newPath?, data?, options?}` |
| `ext/{type}/res` | device→server | `{id, ok, data?, error?{code,message?}}` |

Konwencja routingu komend: `command.name` = **id encji**. `IotDevice` sam
dopasowuje encję, woła `handleCommand(payload)` i odsyła `command/ack`.

## Cykl życia

- `dev.start()` — subskrybuje `command` + `ext/{type}/req` dla każdego rozszerzenia,
  wysyła `hello`, uruchamia heartbeat (`heartbeatSec`, domyślnie 30 s) i telemetrię
  (`telemetrySec`, domyślnie 15 s; `0` = tylko reaktywnie).
- `dev.stop()` — odsubskrybowuje wszystko i zatrzymuje timery.
- `dev.destroy()` (z `QObject`) — woła `stop()` i niszczy poddrzewo encji/rozszerzeń.

Zmiana stanu encji (`setState`/`report`/`turnOn`/…) emituje `stateChanged` i
**natychmiast** publikuje pojedynczą metrykę telemetryczną (gdy urządzenie działa).
