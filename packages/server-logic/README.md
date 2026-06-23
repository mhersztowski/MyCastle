# @mhersztowski/server-logic

Server-side "logic" layer for MyCastle, derived from [`docs/ServerLogic.md`](../../docs/ServerLogic.md).
Runs **in-process with `mycastle-backend`** and drives the server's MQTT control plane.

ESM-only (tsup, Node 20). Depends only on `@mhersztowski/minislib` (Signal/MObject). The MQTT
broker is **not** a dependency — the host adapts its publish/subscribe to `IMqttTransport`.

## What it provides

- **`IotServer`** — the server brain. Owns services and routes MQTT traffic.
  - `log: LogService` — `EnumLogKind`, `ILogMessage`, `log()/debug/info/warning/error`, `onMessage` signal, ring buffer.
  - `activity: ActivityService` — bounded activity feed (`record`, `recent`, `onActivity`).
  - `console: ConsoleService` — stdout/stderr + mirrors into the log.
  - `cron: CronService` — `every(name, ms, fn)` natively; `schedule(name, expr, fn)` with an injected `ICronScheduler`.
  - `clients: ClientRegistry` — presence of `(userName, device, clientType, id)` clients.
  - signals: `onServerMessage`, `onUiEvent`.
- **Topics** (no leading slash): `server/inbox`·`server/outbox`, `{user}/inbox`·`{user}/outbox`,
  `{user}/{device}-{clientType}/{id}/inbox`·`/outbox`. `classifyTopic()` parses any topic.
- **`MqttList<T>`** — observable CRUD collection, optionally mirrored over MQTT (`bind`).
- **Messages** — `Envelope` + the DOM-like `UiEvent` vocabulary (focus/blur/change/click/submit/…).
- **`IMqttTransport`** + **`InMemoryTransport`** (tests / standalone).

`inbox` = messages **to** an entity (server writes); `outbox` = messages **from** an entity (server reads).

## Wiring (in `mycastle-backend` App)

```ts
import { IotServer, type IMqttTransport } from '@mhersztowski/server-logic';

const transport: IMqttTransport = {
  publish: (topic, payload) => mqttServer.publishMessage(topic, payload),
  subscribe: (handler) => mqttServer.onMessage(handler),
};

const serverLogic = new IotServer({
  transport,
  staleClientMs: 60_000,
  cronScheduler: { schedule: (expr, fn) => nodeCron.schedule(expr, fn) }, // optional
});
serverLogic.start();
// …on shutdown: serverLogic.stop();
```

## Build

`pnpm build:server-logic` (also built by `build:mycastle` and `dev:backend`, before the backend).
