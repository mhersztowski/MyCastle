# @mhersztowski/minislib

Qt-inspired object system for TypeScript/Node.js — signals/slots, observable properties, object tree, state machine, undo/redo, event bus, and more.

## Table of contents

- [Signal](#signal) — type-safe reactive events
- [MObject](#mobject) — base object with parent/child tree and lifecycle
- [Node](#node) — typed scene/tree node on top of MObject
- [MProperty](#mproperty) — observable property
- [MTimer](#mtimer) — drift-compensated timer
- [MEventBus](#meventbus) — anonymous publish/subscribe bus
- [MStateMachine / MState](#mstatemachine--mstate) — finite state machine
- [MCommandStack](#mcommandstack) — undo/redo
- [MListModel](#mlistmodel) — observable list
- [MLogger](#mlogger) — categorized logger
- [MqttConn](#mqttconn) — MQTT connection node
- [MqttSub](#mqttsub) — MQTT subscription node
- [MqttPub](#mqttpub) — MQTT publisher node
- [HttpReq](#httpreq) — HTTP request node
- [Utilities](#utilities) — debounce, throttle, promiseToSignals, connectOnce

---

## Signal

`Signal<T>` is the core reactive primitive. It is type-safe, re-entrant-safe, and resilient.

```ts
import { Signal } from '@mhersztowski/minislib';

const clicked = new Signal<[x: number, y: number]>();

// Connect
const conn = clicked.connect((x, y) => console.log(x, y));

// Emit
clicked.emit(10, 20);   // → 10 20

// Disconnect
conn.disconnect();
```

### Features

| Feature | Description |
|---------|-------------|
| Re-entrancy queue | Recursive `emit()` calls are queued and drained after the outer emit finishes |
| Circuit breaker | A slot that throws 3 consecutive times is auto-disconnected |
| Max-listeners warning | Warns when connection count exceeds 20 (mirrors Node.js EventEmitter) |
| Error isolation | One bad slot never stops the others from running |

### API

```ts
signal.connect(slot, context?)   // returns Connection; auto-disconnects when context is destroyed
signal.emit(...args)             // dispatch synchronously
signal.emitQueued(...args)       // dispatch on microtask queue (after current call stack)
signal.blockSignals(true/false)  // temporarily silence emission
signal.disconnectAll()           // remove all connections
signal.connectionCount           // number of active connections
signal.blocked                   // current block state
```

### Connection

```ts
const conn = signal.connect(slot);
conn.disconnect();    // remove this specific connection
conn.isConnected;     // boolean
```

---

## MObject

Base class for all minislib objects — equivalent to Qt's `QObject`.

```ts
import { MObject } from '@mhersztowski/minislib';

class Engine extends MObject {
  constructor(parent?: MObject) {
    super(parent, 'Engine');
  }

  protected override onDestroy() {
    // custom cleanup
  }
}

const root = new MObject();
const engine = new Engine(root);

engine.objectName;            // 'Engine'
engine.parent;                // root
engine.children;              // [engine] (root's children)
root.findChild('Engine');     // engine
root.destroy();               // destroys root + engine (children first)
```

### Object tree

```ts
const a = new MObject(undefined, 'a');
const b = new MObject(a, 'b');       // b.parent === a
const c = new MObject(a, 'c');

b.setParent(null);                   // detach b from a
b.setParent(c);                      // re-attach b under c

a.findChild('b');                    // null (b is now under c)
a.findChild('c');                    // c
c.findChild('b');                    // b

a.findChildren();                    // all descendants
a.findChildren(n => n.objectName.startsWith('x'));  // filtered
a.root;                              // a (already the root)
```

### Connections

Connections tracked on an `MObject` are automatically disconnected when the object is destroyed.

```ts
const obj = new MObject();
const signal = new Signal<[string]>();

obj.connect(signal, (s) => console.log(s));  // tracked on obj
obj.destroy();  // auto-disconnects
```

### Lifecycle

```ts
const obj = new MObject();
obj.destroyed.connect((o) => console.log('bye', o.objectName));
obj.destroy();        // emits destroyed, disconnects connections, detaches from parent
obj.isDestroyed;      // true
```

### API

| Member | Description |
|--------|-------------|
| `objectName` | Mutable string identifier |
| `parent` | Parent MObject or null |
| `children` | Readonly array of children |
| `root` | Root ancestor |
| `setParent(parent)` | Attach/detach from tree |
| `findChild<T>(name)` | Depth-first search by name |
| `findChildren<T>(predicate?)` | All matching descendants |
| `connect(signal, slot)` | Tracked connection (auto-disconnects on destroy) |
| `destroy()` | Tear down self and all children |
| `isDestroyed` | True after destroy() |
| `destroyed` | Signal emitted once before teardown |
| `onDestroy()` | Override for custom cleanup |

---

## Node

`Node` is a higher-level typed scene/tree node built on top of `MObject`. It adds:

- **UUID** per instance
- **Typed parent/children** — only `Node` descendants are visible
- **Tree-change signals** — `childAdded`, `childRemoved`, `parentChanged`
- **Semantic tree API** — `addNode`, `removeNode`
- **Traversal** — `traverse`, `traversePost`, `findNode`, `findById`
- **Hierarchy helpers** — `ancestors`, `depth`, `isDescendantOf`

```ts
import { Node } from '@mhersztowski/minislib';

const scene = new Node(undefined, 'scene');
const car   = new Node(undefined, 'car');
const wheel = new Node(undefined, 'wheel');

scene.addNode(car);
car.addNode(wheel);

scene.nodes;                 // [car]
car.nodes;                   // [wheel]
wheel.parentNode;            // car
wheel.depth;                 // 2

scene.findById(wheel.id);    // wheel
scene.findNode(n => n.objectName === 'wheel');  // wheel

wheel.ancestors();           // [car, scene]
wheel.isDescendantOf(scene); // true
```

### Signals

```ts
scene.childAdded.connect((child) => console.log('added', child.objectName));
scene.childRemoved.connect((child) => console.log('removed', child.objectName));
car.parentChanged.connect((parent) => console.log('parent →', parent?.objectName));

scene.addNode(car);          // scene.childAdded fires
scene.removeNode(car);       // scene.childRemoved + car.parentChanged fire
```

### Traversal

```ts
// Pre-order (self first)
scene.traverse((node) => console.log(node.objectName));
// → scene, car, wheel

// Post-order (children first)
scene.traversePost((node) => console.log(node.objectName));
// → wheel, car, scene
```

### API

| Member | Description |
|--------|-------------|
| `id` | UUID generated at construction |
| `parentNode` | Parent cast to `Node \| null` |
| `nodes` | Children that are `Node` instances |
| `addNode(child)` | Append child (= `child.setParent(this)`) |
| `removeNode(child)` | Detach child |
| `setParent(parent)` | Override — emits signals; throws if parent is not a Node |
| `traverse(fn)` | Pre-order DFS including self |
| `traversePost(fn)` | Post-order DFS |
| `findNode(predicate)` | First matching descendant |
| `findById(id)` | Find by UUID |
| `ancestors()` | Array from direct parent to root |
| `depth` | Distance from root (root = 0) |
| `isDescendantOf(node)` | True if node is an ancestor |

---

## MProperty

Qt-style observable property. Emits `changed(newValue, oldValue)` on every value change.

```ts
import { MProperty } from '@mhersztowski/minislib';

const width = new MProperty(100);
width.changed.connect((next, prev) => console.log(prev, '→', next));

width.value = 200;   // triggers changed: 100 → 200
width.value = 200;   // no-op (same value, Object.is check)

// Optional validator
const positive = new MProperty(1, (v) => v > 0);
positive.value = -5;  // silently rejected, value stays 1

// Silent set (no signal)
width.setSilent(300);

// Property binding
const height = new MProperty(0);
height.bindTo(width);  // height mirrors width from now on
```

### API

| Member | Description |
|--------|-------------|
| `value` | Get/set current value |
| `changed` | Signal — `(newValue, oldValue)` |
| `setSilent(v)` | Set without emitting |
| `bindTo(source, context?)` | Mirror another property |

---

## MTimer

Drift-compensated timer. Unlike raw `setInterval`, this implementation adjusts each `setTimeout` delay by the measured overrun so the long-term cadence stays accurate.

```ts
import { MTimer } from '@mhersztowski/minislib';

const timer = new MTimer(parent);
timer.timeout.connect(() => tick());
timer.start(1000);       // every 1 s, drift-compensated
timer.stop();

timer.startSingleShot(500);   // fires once after 500 ms

// Convenience static constructors
const t1 = MTimer.create(200, parent);        // running interval
const t2 = MTimer.singleShot(1000, parent);   // running single-shot
```

The timer stops automatically when its parent `MObject` is destroyed.

### API

| Member | Description |
|--------|-------------|
| `start(ms)` | Start repeating timer |
| `startSingleShot(ms)` | Fire once after delay |
| `stop()` | Cancel |
| `restart()` | Restart with last interval |
| `active` | Whether timer is running |
| `intervalMs` | Last configured interval |
| `mode` | `'interval'` or `'singleShot'` |
| `timeout` | Signal — emitted on each tick |
| `MTimer.create(ms, parent?)` | Static: running interval |
| `MTimer.singleShot(ms, parent?)` | Static: running single-shot |

---

## MEventBus

Decoupled publish/subscribe bus. Unlike `Signal` (which requires a direct reference to the emitter), `MEventBus` enables anonymous communication between components that don't know each other.

```ts
import { MEventBus } from '@mhersztowski/minislib';

// Process-wide singleton
const bus = MEventBus.global();

// Subscribe (topic namespacing convention: 'domain:event')
bus.subscribe<{ x: number }>('mouse:moved', (e) => console.log(e.x));

// Subscribe to ALL topics
bus.subscribeAll((topic, payload) => console.log(topic, payload));

// Publish
bus.publish('mouse:moved', { x: 42 });

// Auto-unsubscribe when context is destroyed
bus.subscribe('iot:telemetry', (data) => handle(data), myObject);
```

### API

| Member | Description |
|--------|-------------|
| `publish(topic, payload)` | Send to all subscribers |
| `subscribe(topic, slot, context?)` | Subscribe; returns Connection |
| `subscribeAll(slot, context?)` | Subscribe to every topic |
| `clearTopic(topic)` | Remove all subscribers for topic |
| `clearAll()` | Remove all subscribers |
| `activeTopics` | Topics with at least one subscriber |
| `MEventBus.global()` | Process-wide singleton |
| `MEventBus.resetGlobal()` | Reset singleton (useful in tests) |

---

## MStateMachine / MState

Finite state machine.

```ts
import { MStateMachine } from '@mhersztowski/minislib';

const fsm = new MStateMachine(parent);

// Define states
const idle    = fsm.addState('idle');
const running = fsm.addState('running');
const paused  = fsm.addState('paused');

// State callbacks
idle.onEnter = () => console.log('idle entered');
running.onExit = (to) => console.log('running → ', to.id);

// Transitions
fsm.addTransition({ from: 'idle',    to: 'running', event: 'start' });
fsm.addTransition({ from: 'running', to: 'paused',  event: 'pause' });
fsm.addTransition({ from: 'paused',  to: 'running', event: 'resume' });
fsm.addTransition({ from: 'running', to: 'idle',    event: 'stop' });

// Transition with guard and action
fsm.addTransition({
  from: 'idle', to: 'running', event: 'start',
  guard:  (e) => e.authorized,
  action: (e) => console.log('authorized start', e),
});

// Signals
fsm.stateChanged.connect((next, prev) => console.log(prev?.id, '→', next.id));
fsm.transitionFailed.connect((event, from) => console.warn('no transition:', event, from));

// Run
fsm.start('idle');
fsm.send('start');           // true — transitioned
fsm.send('start');           // false — no transition from running
fsm.is('running');           // true
fsm.currentStateId;          // 'running'
fsm.stop();
```

### MState signals

```ts
idle.entered.connect((from) => { /* from is previous state or null */ });
idle.exited.connect((to)   => { /* to is next state */ });
```

### MStateMachine API

| Member | Description |
|--------|-------------|
| `addState(id \| MState)` | Register a state; returns MState |
| `addTransition(def)` | Register transition `{from, to, event, guard?, action?}` |
| `start(initialStateId)` | Enter initial state |
| `stop()` | Stop the machine |
| `send(event, payload?)` | Dispatch event; returns true if transitioned |
| `is(stateId)` | True if currently in that state |
| `currentState` | Active MState or null |
| `currentStateId` | Active state id or null |
| `state(id)` | Look up MState by id |
| `states` | All registered states |
| `stateChanged` | Signal — `(next, prev)` |
| `transitionFailed` | Signal — `(event, fromId)` |

---

## MCommandStack

Undo/redo command stack — equivalent to Qt's `QUndoStack`.

```ts
import { MCommandStack, MCommand, MFnCommand } from '@mhersztowski/minislib';

const stack = new MCommandStack(parent, { maxSize: 50 });

// Functional command (no subclassing needed)
const cmd = MFnCommand.create(
  'Rename',
  () => { obj.name = 'new'; },
  () => { obj.name = 'old'; },
);

stack.push(cmd);          // executes + records
stack.undo();             // reverts
stack.redo();             // re-executes

stack.canUndo;            // boolean
stack.canRedo;            // boolean
stack.undoDescription;    // 'Rename'
stack.redoDescription;    // 'Rename'
stack.clear();

// React to changes
stack.changed.connect(() => updateMenus());
stack.canUndoChanged.connect((can) => setUndoEnabled(can));
stack.canRedoChanged.connect((can) => setRedoEnabled(can));
```

### Custom command via subclass

```ts
class MoveCommand extends MCommand {
  readonly description = 'Move item';
  constructor(private item: Item, private from: Point, private to: Point) { super(); }
  execute() { this.item.position = this.to; }
  undo()    { this.item.position = this.from; }
  // Optional: merge consecutive moves of the same item
  mergeWith(prev: MCommand) {
    if (prev instanceof MoveCommand && prev.item === this.item) {
      (prev as MoveCommand).to = this.to;
      return true;
    }
    return false;
  }
}
```

### API

| Member | Description |
|--------|-------------|
| `push(cmd)` | Execute and record; clears redo stack |
| `undo()` | Revert last command |
| `redo()` | Re-execute last undone command |
| `clear()` | Empty both stacks |
| `canUndo / canRedo` | Boolean |
| `undoDescription / redoDescription` | Top command description or null |
| `undoStackSize / redoStackSize` | Stack depths |
| `changed` | Signal — emitted after every mutation |
| `canUndoChanged / canRedoChanged` | Signal — `(boolean)` |

---

## MListModel

Observable list — analogous to Qt's `QAbstractListModel`. Views subscribe to structural signals to stay in sync.

```ts
import { MListModel } from '@mhersztowski/minislib';

const items = new MListModel<string>([], parent);

items.rowsInserted.connect((index, count) => rerenderFrom(index));
items.rowsRemoved.connect((index, count)  => removeRows(index, count));
items.dataChanged.connect((index, item)   => updateRow(index, item));
items.modelReset.connect(() => fullRerender());

// Mutations
items.append('a', 'b');       // rowsInserted(0, 2)
items.prepend('z');           // rowsInserted(0, 1)
items.insert(1, 'x');         // rowsInserted(1, 1)
items.set(0, 'Z');            // dataChanged(0, 'Z')
items.remove(0);              // rowsRemoved(0, 1)
items.removeItem('b');        // rowsRemoved(idx, 1)
items.move(0, 2);             // rowsMoved(0, 2, 1)
items.sort();                 // modelReset
items.reset(['a', 'b', 'c']); // modelReset (atomic replace)
items.clear();                // modelReset

// Read
items.get(0);                 // 'a' (throws on out-of-bounds)
items.getOrUndefined(99);     // undefined
items.count;                  // number of items
items.isEmpty;                // boolean
items.indexOf('b');           // index or -1
items.contains('b');          // boolean
items.find(i => i > 'b');     // first match or undefined
items.filter(i => i > 'b');   // filtered array
items.toArray();              // snapshot array

// Iteration
for (const item of items) { ... }
items.forEach((item, idx) => { ... });
items.map((item) => item.toUpperCase());
```

---

## MLogger

Categorized, hierarchical logger. Each logger has a category string (dot-separated by convention). All messages bubble up to the root logger's `logged` signal.

```ts
import { MLogger } from '@mhersztowski/minislib';

const log = new MLogger('iot.sensor', parent, { minLevel: 'info' });

log.debug('ignored');         // below minLevel
log.info('Connected');
log.warn('Battery low', { level: 12 });
log.error('Timeout', new Error('...'));

// Root logger — receives all messages from all loggers
const root = MLogger.root();
root.logged.connect((rec) => {
  // { level, category, message, data, timestamp }
  sendToRemote(rec);
});

// Disable default console output (useful in tests)
MLogger.silenceConsole();

// Reset (tests)
MLogger.resetRoot();
```

### LogRecord shape

```ts
interface LogRecord {
  level:     'debug' | 'info' | 'warn' | 'error';
  category:  string;
  message:   string;
  data?:     unknown;
  timestamp: number;   // Date.now()
}
```

### API

| Member | Description |
|--------|-------------|
| `debug / info / warn / error(msg, data?)` | Log at level |
| `setMinLevel(level)` | Filter below this level |
| `minLevel` | Current minimum level |
| `category` | Category string |
| `logged` | Signal — `(LogRecord)` — this logger only |
| `MLogger.root()` | Singleton aggregator receiving all records |
| `MLogger.silenceConsole()` | Disconnect default console sink |
| `MLogger.resetRoot()` | Destroy and recreate root (tests) |

---

## MqttConn

MQTT connection node. Wraps the `mqtt` package client, exposing `open`/`close` and signals for connection lifecycle events. `MqttSub` and `MqttPub` nodes that are descendants of this node auto-discover it via `ancestors()`.

```ts
import { MqttConn, MqttSub, MqttPub } from '@mhersztowski/minislib';

const conn = new MqttConn('ws://localhost:1894/mqtt', {
  username: 'user',
  password: 'pass',
});

conn.connected.connect(() => console.log('online'));
conn.disconnected.connect((reason) => console.log('offline:', reason));
conn.error.connect((err) => console.error('mqtt error:', err));

conn.open();

// Publish raw message directly (prefer MqttPub for structured use)
conn.publish('home/lights', JSON.stringify({ on: true }));

conn.close();
```

`new MqttConn(url, options?, parent?)` — options: `clientId` (auto-generated), `username`, `password`, `keepalive` (default 60 s).

### MqttConn signals

```ts
conn.connected.connect(() => { /* session established */ });
conn.disconnected.connect((reason: string) => { /* connection closed */ });
conn.error.connect((err: Error) => { /* socket / protocol error */ });
conn.messageArrived.connect((topic: string, payload: string) => { /* any subscribed message */ });
```

### MqttConn API

| Member | Description |
|--------|-------------|
| `open()` | Connect to the broker (reconnects if already open) |
| `close()` | Disconnect immediately |
| `subscribe(topic, qos?)` | Subscribe to a topic; qos 0/1/2, default 0 |
| `unsubscribe(topic)` | Unsubscribe from a topic |
| `publish(topic, payload, opts?)` | Publish a raw string payload |
| `isConnected` | `true` while the broker session is active |
| `url` | Get/set the broker WebSocket URL |

Connection is closed automatically when the node is destroyed.

---

## MqttSub

MQTT subscription node. Attach as a child (direct or indirect) of an `MqttConn` node. Automatically subscribes when the connection is ready and re-subscribes after reconnects.

Supports MQTT wildcards: `+` (single level) and `#` (multi-level suffix).

```ts
import { MqttConn, MqttSub } from '@mhersztowski/minislib';

const conn = new MqttConn('ws://localhost:1894/mqtt');
conn.open();

// Direct child — auto-discovers conn via ancestors()
const tempSub = new MqttSub('sensors/+/temperature', conn);
tempSub.messageReceived.connect((topic, payload) => {
  console.log(topic, JSON.parse(payload));
});

// Nested — still auto-discovers conn
const group = new Node(conn, 'group');
const alertSub = new MqttSub('alerts/#', group);
alertSub.messageReceived.connect((topic, payload) => handleAlert(topic, payload));
```

`new MqttSub(topic, parent?, qos?)` — qos defaults to `0`.

### MqttSub signals

```ts
sub.messageReceived.connect((topic: string, payload: string) => { /* matching message */ });
```

### MqttSub API

| Member | Description |
|--------|-------------|
| `topic` | Get/set the subscription pattern; changing it re-subscribes automatically |
| `qos` | Get/set QoS level (0/1/2) |

The node unsubscribes from the broker when destroyed.

---

## MqttPub

MQTT publisher node. Attach as a child (direct or indirect) of an `MqttConn` node. Call `publish(payload)` to send — objects are JSON-stringified automatically. Emits `error` (does not throw) when the connection is unavailable.

```ts
import { MqttConn, MqttPub } from '@mhersztowski/minislib';

const conn = new MqttConn('ws://localhost:1894/mqtt');
conn.open();

const lightPub = new MqttPub('home/lights/living', conn, { retain: true });
lightPub.published.connect((topic) => console.log('sent to', topic));
lightPub.error.connect((err) => console.error('publish failed:', err));

lightPub.publish({ brightness: 80, color: '#ff8000' }); // object → JSON
lightPub.publish('{"on":false}');                        // raw string
```

`new MqttPub(topic, parent?, opts?)` — opts: `qos` (default 0), `retain` (default false).

### MqttPub signals

```ts
pub.published.connect((topic: string) => { /* sent successfully */ });
pub.error.connect((err: Error) => { /* no connection or publish failure */ });
```

### MqttPub API

| Member | Description |
|--------|-------------|
| `publish(payload)` | Send string or object (auto JSON-serialized) |
| `topic` | Get/set the target topic |
| `qos` | Get/set QoS level (0/1/2) |
| `retain` | Get/set retain flag |

---

## HttpReq

HTTP request node (fetch-based, browser + Node.js 18+). Configure `url`, `method`, `headers`, then call `send()` or one of the shorthand methods. Results arrive both as the returned `Promise` and via signals, integrating naturally with the signal/slot system.

Requests are cancelled automatically when the node is destroyed.

```ts
import { HttpReq } from '@mhersztowski/minislib';

const req = new HttpReq('https://api.example.com/data', parent);
req.headers = { Authorization: 'Bearer mytoken' };

// Signal-based (fire-and-forget)
req.success.connect((res) => console.log(res.json()));
req.error.connect((err) => console.error(err));
req.get();

// Promise-based (async/await)
const res = await req.post({ key: 'value' });
console.log(res.status, res.json());

// finished fires on both success and error
req.finished.connect((res, err) => {
  if (err) handleError(err);
  else handleResponse(res!);
});
```

`new HttpReq(url, parent?)` — `timeoutMs` defaults to 30 000 ms.

### HttpResponse shape

```ts
interface HttpResponse {
  status:     number;
  statusText: string;
  headers:    Record<string, string>;
  body:       string;       // raw response text
  ok:         boolean;      // true when status 200–299
  json<T>():  T;            // parse body as JSON (throws if invalid)
}
```

### HttpReq signals

```ts
req.success.connect((res: HttpResponse) => { /* 200–299 */ });
req.error.connect((err: Error) => { /* network error or non-2xx */ });
req.finished.connect((res: HttpResponse | null, err: Error | null) => { /* always last */ });
```

### HttpReq API

| Member | Description |
|--------|-------------|
| `url` | Target URL (mutable) |
| `method` | HTTP method — `'GET'`/`'POST'`/`'PUT'`/`'PATCH'`/`'DELETE'` (mutable) |
| `headers` | Request headers — `Record<string, string>` (mutable) |
| `timeoutMs` | Abort timeout in ms (default `30_000`) |
| `send(body?)` | Send request; objects are JSON-serialized |
| `get()` | Sets method to `GET` and sends |
| `post(body?)` | Sets method to `POST` and sends |
| `put(body?)` | Sets method to `PUT` and sends |
| `patch(body?)` | Sets method to `PATCH` and sends |
| `delete()` | Sets method to `DELETE` and sends |

`Content-Type` is set automatically: `application/json` for objects, `text/plain` for strings (unless already present in `headers`).

---

## Utilities

### debounce

Returns a debounced function. Auto-cancelled when `context` is destroyed.

```ts
import { debounce } from '@mhersztowski/minislib';

const save = debounce(() => persist(), 300, this);
input.changed.connect(save);
```

### throttle

Leading-edge throttle. Auto-disabled when `context` is destroyed.

```ts
import { throttle } from '@mhersztowski/minislib';

const onMove = throttle((x: number, y: number) => update(x, y), 16, this);
```

### promiseToSignals

Wraps a `Promise` in a signal pair. Signals are suppressed if `context` is destroyed before the promise settles.

```ts
import { promiseToSignals } from '@mhersztowski/minislib';

const { resolved, rejected } = promiseToSignals(fetch('/api/data'), this);
resolved.connect((data) => setData(data));
rejected.connect((err)  => showError(err));
```

### connectOnce

Connects a slot that auto-disconnects after the first emission.

```ts
import { connectOnce } from '@mhersztowski/minislib';

connectOnce(button.clicked, () => {
  console.log('clicked once');
});
```

---

## Installation

### In the monorepo

```json
"dependencies": {
  "@mhersztowski/minislib": "workspace:*"
}
```

### External (GitHub Packages)

```
# .npmrc
@mhersztowski:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```
npm install @mhersztowski/minislib
```

### Publishing (maintainer)

Tag `minislib-vX.Y.Z` — the GitHub Actions workflow in `.github/workflows/publish-minislib.yml` builds and publishes automatically.
