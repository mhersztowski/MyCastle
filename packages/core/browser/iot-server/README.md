# IoT Server — browser pub/sub examples

Example scripts for talking to the backend **`@mhersztowski/server-logic`** `IotServer`
over MQTT, using MyCastle's **built-in** browser MQTT client.

## How to run

These are meant for the **Drive** right-panel sandbox:

1. Put a `.js` (or `.ts`) file in your Drive (e.g. copy `iot-server.example.js`).
2. Open it — the Monaco editor shows in the right panel.
3. Click ▶ **"Uruchom w przeglądarce"**.

The sandbox injects two globals into the script:

| global    | what it is |
|-----------|------------|
| `client`  | MQTT over the built-in connection (see API below) + `client.userName` |
| `console` | `console.*` redirected into the right-panel console |

The code runs in an `AsyncFunction`, so **top-level `await`** works. `.ts` files are
transpiled by Monaco's TypeScript worker before running.

## `client` API

```js
client.userName                          // current user name (string)
client.publish(topic, payload)           // payload: string | object (object → JSON)
client.subscribe(topic, (message, topic) => { ... })
                                         // message: parsed JSON when possible, else string
                                         // returns an unsubscribe() function
```

Subscriptions stay **live after the run** (so a pub/sub script keeps receiving) until:
- you click ⏹ **Stop** in the console header,
- you re-run the script, or
- you close the right panel / switch files.

## Server-logic topics (control plane)

| topic           | direction | notes |
|-----------------|-----------|-------|
| `server/inbox`  | you → server | commands: `ping`, `log`, `log.list`, `activity.list`, `clients.list` |
| `server/outbox` | server → you | `pong`, `server.ready`, `log.entry`, `activity.entry`, `clients.snapshot`/`clients.changed`, `log.snapshot`, `activity.snapshot` |

Convention: **inbox** = messages *to* an entity, **outbox** = messages *from* an entity.
The same scheme applies to users (`{user}/inbox|outbox`) and clients
(`{user}/{device}-{clientType}/{id}/inbox|outbox`).

See `iot-server.example.js` for a working ping / clients / log / activity demo.
