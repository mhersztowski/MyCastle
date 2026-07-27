/**
 * iot-client.module.js — samodzielny, przeglądarkowy zestaw klas do budowania
 * **urządzeń IoT MyCastle** (strona device): urządzenie ogłasza się (hello),
 * wysyła heartbeat + telemetrię, odbiera komendy i requesty rozszerzeń, a wszystko
 * to po MQTT wg kontraktu z `@mhersztowski/core` (`mqtt/topics.ts`).
 *
 * Założenia projektowe (jak w `qobject.module.js`):
 *  • Vanilla JS, BEZ `import`/`export` — eksport zbiorczy przez globalny namespace
 *    na końcu pliku. Dzięki temu plik działa też w runtime skryptów edytora
 *    (AsyncFunction/eval), gdzie `import`/`export` są błędem składni.
 *  • STATIC-FIRST — cała logika żyje w metodach `static`; metody instancji to
 *    cienkie delegaty. Całe API jest wywoływalne wprost na klasie
 *    (`IotDevice.sendHello(dev)`, `IotEntity.toHello(e)`, …) → bogate podpowiedzi
 *    po wpisaniu `IotDevice.` w edytorze.
 *  • Zbudowane NA BAZIE `qobject.module.js` — klasy dziedziczą po `QObject`
 *    (drzewo rodzic-dziecko, cykl życia, `destroy()`), a zdarzenia to `Signal`.
 *    Rdzeń jest odczytywany z globalnego namespace (dociągany dynamicznie gdy
 *    nie został jeszcze załadowany).
 *
 * ── Kontrakt MQTT (device ⇄ server), prefiks `minis/{user}/{device}` ─────────────
 *   hello        (device→server)  {uptime, extensions[], entities[], platform}
 *   heartbeat    (device→server)  {uptime}
 *   telemetry    (device→server)  {metrics:[{key,value,unit?}], timestamp}
 *   command      (server→device)  {id, name, payload}
 *   command/ack  (device→server)  {id, status:'ACKNOWLEDGED'|'FAILED', reason?}
 *   ext/{t}/req  (server→device)  {id, op, path?, newPath?, data?, options?}
 *   ext/{t}/res  (device→server)  {id, ok, data?, error?{code,message?}}
 *   Konwencja pól encji jest zgodna z Zod-owym `hello` w core (single source of truth).
 *
 * ── Transport ────────────────────────────────────────────────────────────────
 *   Urządzenie nie zna MQTT bezpośrednio — dostaje `transport` z metodami:
 *     transport.publish(topic, payloadString)                → void
 *     transport.subscribe(topic, (msg, topic) => void)       → unsubscribe(): void
 *     transport.userName                                     → string (opcjonalnie)
 *   `msg` w callbacku subscribe może być już sparsowanym obiektem albo stringiem —
 *   obsługujemy oba. To dokładnie API globalnego `client` w sandboxie Drive
 *   („Uruchom w przeglądarce"), więc `new IotDevice({ transport: client, ... })`
 *   działa od ręki.
 */

// Rdzeń systemu obiektowego (Signal + QObject) mieszka w qobject.module.js i jest
// udostępniany przez globalny namespace. Gdy nie został jeszcze załadowany —
// dociągamy go dynamicznie (dla efektu ubocznego: ustawia globale). NIE deklarujemy
// `const QObject/Signal = _g.X`, bo przy wklejeniu obu plików razem kolidowałoby to
// z `class Signal`/`class QObject`; `extends QObject` / `new Signal()` i tak
// rozwiązują się do globalThis.
const _iotcore = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : self);
if (!_iotcore.QObject || !_iotcore.Signal) {
  await import('../qt/qobject.module.js'); // tylko side-effect: ustawia globalne QObject/Signal
}

// ═════════════════════════════════════════════════════════════════════════════
//  IotTopics — budowanie topiców MQTT wg kontraktu MyCastle. Czyste statyki.
// ═════════════════════════════════════════════════════════════════════════════
class IotTopics {
  /** Bazowy prefiks urządzenia: `minis/{user}/{device}`. */
  static prefix(user, device) { return `minis/${user}/${device}`; }
  static hello(user, device) { return `${IotTopics.prefix(user, device)}/hello`; }
  static registerRequest(user, device) { return `${IotTopics.prefix(user, device)}/register-request`; }
  static heartbeat(user, device) { return `${IotTopics.prefix(user, device)}/heartbeat`; }
  static telemetry(user, device) { return `${IotTopics.prefix(user, device)}/telemetry`; }
  static command(user, device) { return `${IotTopics.prefix(user, device)}/command`; }
  static commandAck(user, device) { return `${IotTopics.prefix(user, device)}/command/ack`; }
  static extReq(user, device, type) { return `${IotTopics.prefix(user, device)}/ext/${type}/req`; }
  static extRes(user, device, type) { return `${IotTopics.prefix(user, device)}/ext/${type}/res`; }
  /** Wyłuskuje `extType` z sub-topicu `ext/{type}/req` (lub null). */
  static extTypeOf(subTopic) {
    const m = /(?:^|\/)ext\/([^/]+)\/req$/.exec(subTopic || '');
    return m ? m[1] : null;
  }
}

// Prawidłowe typy encji (zgodne z enumem w core `hello.entities[].type`).
const IOT_ENTITY_TYPES = ['sensor', 'binary_sensor', 'switch', 'number', 'button', 'select'];

// Bezpieczny parse: string→obiekt (JSON) lub przepuść obiekt/wartość.
function _asObj(msg) {
  if (typeof msg === 'string') { try { return JSON.parse(msg); } catch { return {}; } }
  return (msg && typeof msg === 'object') ? msg : {};
}

// ═════════════════════════════════════════════════════════════════════════════
//  IotEntity — bazowa encja urządzenia. STATIC-FIRST. Dziedziczy po QObject.
//  Podklasy: IotSensorEntity / IotBinarySensorEntity / IotSwitchEntity /
//            IotNumberEntity / IotButtonEntity / IotSelectEntity.
// ═════════════════════════════════════════════════════════════════════════════
class IotEntity extends QObject {
  /**
   * @param {string} id    unikalny identyfikator (klucz w telemetrii i komendach)
   * @param {string} type  jeden z IOT_ENTITY_TYPES
   * @param {string} name  etykieta czytelna dla człowieka
   * @param {{icon?:string, deviceClass?:string, state?:any}} [opts]
   */
  constructor(id, type, name, opts = {}) {
    super();
    if (!id) throw new Error('IotEntity: wymagane id');
    if (!IOT_ENTITY_TYPES.includes(type)) throw new Error(`IotEntity: nieznany typ "${type}"`);
    this.setObjectName(String(id));
    this._id = String(id);
    this._type = type;
    this._name = name != null ? String(name) : String(id);
    this._icon = opts.icon || null;
    this._deviceClass = opts.deviceClass || null;
    this._state = opts.state !== undefined ? opts.state : null;
    this._device = null; // ustawiane przez IotDevice.addEntity

    /** Emitowany po zmianie stanu: (newValue, oldValue, entity). */
    this.stateChanged = new Signal('stateChanged', this);
    /** Emitowany dla każdej komendy z serwera: (payload, entity). */
    this.commandReceived = new Signal('commandReceived', this);
  }

  // ── delegaty do statyków ────────────────────────────────────────────────────
  id() { return this._id; }
  type() { return this._type; }
  name() { return this._name; }
  icon() { return this._icon; }
  deviceClass() { return this._deviceClass; }
  device() { return this._device; }
  state() { return this._state; }
  setState(v) { return IotEntity.setState(this, v); }
  /** Reprezentacja encji w wiadomości `hello` (base + pola specyficzne podklasy). */
  toHello() { return IotEntity.toHello(this); }
  /** Wartość zgłaszana w telemetrii (undefined = pomiń, np. button). */
  telemetryValue() { return IotEntity.telemetryValue(this); }
  /** Jednostka w telemetrii (undefined gdy brak). */
  telemetryUnit() { return this._unit || undefined; }
  /** Obsługuje komendę z serwera (podklasy zapisywalne nadpisują `_apply`). */
  handleCommand(payload) { return IotEntity.handleCommand(this, payload); }

  // Hook: pola dokładane do `hello` przez podklasę (nadpisz w podklasie).
  _helloExtra() { return {}; }
  // Hook: zastosuj komendę (nadpisz w zapisywalnej podklasie). Zwróć true gdy obsłużono.
  _apply(_payload) { return false; }

  // ═════════════════ STATIC ═════════════════
  static setState(e, v) {
    const old = e._state;
    if (Object.is(old, v)) return e;
    e._state = v;
    Signal.emit(e.stateChanged, v, old, e);
    return e;
  }
  static toHello(e) {
    const out = { id: e._id, type: e._type, name: e._name };
    if (e._icon) out.icon = e._icon;
    if (e._deviceClass) out.deviceClass = e._deviceClass;
    Object.assign(out, e._helloExtra() || {});
    return out;
  }
  static telemetryValue(e) {
    // Buttony nie mają stanu; reszta zgłasza bieżący state (gdy ustawiony).
    if (e._type === 'button') return undefined;
    return e._state === null || e._state === undefined ? undefined : e._state;
  }
  static handleCommand(e, payload) {
    const p = _asObj(payload);
    Signal.emit(e.commandReceived, p, e);
    e._apply(p);
    return e;
  }

  // ── fabryki (autocomplete: `IotEntity.sensor(...)`, `.switch(...)`, …) ────────
  static sensor(id, name, opts) { return new IotSensorEntity(id, name, opts); }
  static binarySensor(id, name, opts) { return new IotBinarySensorEntity(id, name, opts); }
  static switch(id, name, opts) { return new IotSwitchEntity(id, name, opts); }
  static number(id, name, opts) { return new IotNumberEntity(id, name, opts); }
  static button(id, name, opts) { return new IotButtonEntity(id, name, opts); }
  static select(id, name, opts) { return new IotSelectEntity(id, name, opts); }
  static isEntity(x) { return x instanceof IotEntity; }
}

// ── Sensor (read-only, liczbowy/tekstowy) ───────────────────────────────────────
class IotSensorEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    super(id, 'sensor', name, opts);
    this._unit = opts.unit || '';
  }
  unit() { return this._unit; }
  /** Zgłoś odczyt (ustawia stan → reaktywna telemetria). */
  report(value) { return IotEntity.setState(this, value); }
  _helloExtra() { return this._unit ? { unit: this._unit } : {}; }
  static create(id, name, opts) { return new IotSensorEntity(id, name, opts); }
}

// ── Binary sensor (read-only, bool) ──────────────────────────────────────────────
class IotBinarySensorEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    super(id, 'binary_sensor', name, opts);
    this._onLabel = opts.onLabel || null;
    this._offLabel = opts.offLabel || null;
  }
  onLabel() { return this._onLabel; }
  offLabel() { return this._offLabel; }
  report(bool) { return IotEntity.setState(this, !!bool); }
  _helloExtra() {
    const x = {};
    if (this._onLabel) x.onLabel = this._onLabel;
    if (this._offLabel) x.offLabel = this._offLabel;
    return x;
  }
  static create(id, name, opts) { return new IotBinarySensorEntity(id, name, opts); }
}

// ── Switch (zapisywalny toggle) ──────────────────────────────────────────────────
class IotSwitchEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    super(id, 'switch', name, { ...opts, state: opts.state ?? false });
    /** Emitowany gdy serwer zażąda zmiany: (boolean, entity). */
    this.commanded = new Signal('commanded', this);
  }
  isOn() { return !!this._state; }
  turnOn() { return IotEntity.setState(this, true); }
  turnOff() { return IotEntity.setState(this, false); }
  toggle() { return IotEntity.setState(this, !this._state); }
  _apply(payload) {
    const v = !!payload.state;
    IotEntity.setState(this, v);
    Signal.emit(this.commanded, v, this);
    return true;
  }
  static create(id, name, opts) { return new IotSwitchEntity(id, name, opts); }
}

// ── Number (zapisywalny, z min/max/step) ─────────────────────────────────────────
class IotNumberEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    super(id, 'number', name, { ...opts, state: opts.state ?? (opts.min ?? 0) });
    this._min = opts.min ?? 0;
    this._max = opts.max ?? 100;
    this._step = opts.step ?? 1;
    this._unit = opts.unit || '';
    /** Emitowany gdy serwer ustawi wartość (po przycięciu do [min,max]): (number, entity). */
    this.commanded = new Signal('commanded', this);
  }
  min() { return this._min; }
  max() { return this._max; }
  step() { return this._step; }
  unit() { return this._unit; }
  /** Ustaw wartość lokalnie (z przycięciem do zakresu). */
  setValue(v) { return IotEntity.setState(this, IotNumberEntity.clamp(this, Number(v))); }
  _apply(payload) {
    const v = IotNumberEntity.clamp(this, Number(payload.value));
    IotEntity.setState(this, v);
    Signal.emit(this.commanded, v, this);
    return true;
  }
  _helloExtra() {
    const x = { min: this._min, max: this._max, step: this._step };
    if (this._unit) x.unit = this._unit;
    return x;
  }
  static clamp(e, v) {
    if (Number.isNaN(v)) return e._state;
    return v < e._min ? e._min : v > e._max ? e._max : v;
  }
  static create(id, name, opts) { return new IotNumberEntity(id, name, opts); }
}

// ── Button (zapisywalny, momentalny wyzwalacz, bez stanu) ─────────────────────────
class IotButtonEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    super(id, 'button', name, opts);
    /** Emitowany gdy serwer naciśnie przycisk: (entity). */
    this.pressed = new Signal('pressed', this);
  }
  _apply(_payload) {
    Signal.emit(this.pressed, this);
    return true;
  }
  static create(id, name, opts) { return new IotButtonEntity(id, name, opts); }
}

// ── Select (zapisywalny wybór z listy) ───────────────────────────────────────────
class IotSelectEntity extends IotEntity {
  constructor(id, name, opts = {}) {
    const options = Array.isArray(opts.options) ? opts.options.map(String) : [];
    super(id, 'select', name, { ...opts, state: opts.state ?? options[0] ?? null });
    this._options = options;
    /** Emitowany gdy serwer wybierze prawidłową opcję: (string, entity). */
    this.commanded = new Signal('commanded', this);
  }
  options() { return this._options.slice(); }
  select(value) {
    const v = String(value);
    if (!this._options.includes(v)) return this;
    return IotEntity.setState(this, v);
  }
  _apply(payload) {
    const v = String(payload.value);
    if (!this._options.includes(v)) return false; // ignoruj wartość spoza listy
    IotEntity.setState(this, v);
    Signal.emit(this.commanded, v, this);
    return true;
  }
  _helloExtra() { return { options: this._options.slice() }; }
  static create(id, name, opts) { return new IotSelectEntity(id, name, opts); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  IotExtension — rozszerzenie device'a (request-response na ext/{type}/req·res).
//  Bazowo obsługuje mapę operacji `ops` (fluent), z auto-korelacją id i respond.
// ═════════════════════════════════════════════════════════════════════════════
class IotExtension extends QObject {
  /**
   * @param {string} type  segment `extType` w topicu (np. 'vfs', 'shell')
   * @param {{ops?: Record<string, (args:any, ext:IotExtension)=>any>}} [opts]
   *        ops — mapa `nazwaOp → handler`. Handler może być async; jego wynik trafia
   *        do `data` odpowiedzi. Rzucenie błędu → odpowiedź `{ok:false, error}`.
   */
  constructor(type, opts = {}) {
    super();
    if (!type) throw new Error('IotExtension: wymagany type');
    this.setObjectName(`ext:${type}`);
    this._type = String(type);
    this._ops = opts.ops || {};
    this._device = null; // ustawiane przez IotDevice.addExtension

    /** Emitowany dla każdego requestu z serwera: (payload, ext). */
    this.requestReceived = new Signal('requestReceived', this);
  }

  type() { return this._type; }
  device() { return this._device; }
  /** Zarejestruj/nadpisz obsługę operacji (fluent). */
  on(op, handler) { this._ops[String(op)] = handler; return this; }
  /** Obsłuż przychodzący request (parse → dispatch op → respond). */
  handleRequest(payload) { return IotExtension.handleRequest(this, payload); }
  /** Wyślij odpowiedź na ext/{type}/res. */
  respond(id, ok, data, error) { return IotExtension.respond(this, id, ok, data, error); }
  /** Deklaracja rozszerzenia do wiadomości `hello`. */
  toHello() { return { type: this._type, enabled: true }; }

  // ═════════════════ STATIC ═════════════════
  static async handleRequest(ext, payload) {
    const p = _asObj(payload);
    Signal.emit(ext.requestReceived, p, ext);
    const id = p.id;
    const op = p.op;
    const handler = ext._ops[op];
    if (typeof handler !== 'function') {
      IotExtension.respond(ext, id, false, undefined, { code: 'UNKNOWN_OP', message: `Nieznana operacja "${op}"` });
      return;
    }
    try {
      const data = await handler(p, ext);
      IotExtension.respond(ext, id, true, data);
    } catch (e) {
      IotExtension.respond(ext, id, false, undefined, { code: 'OP_FAILED', message: e && e.message ? e.message : String(e) });
    }
  }
  static respond(ext, id, ok, data, error) {
    const dev = ext._device;
    if (!dev) { console.warn('[IotExtension] respond bez podpiętego device — pomijam'); return ext; }
    const body = { id, ok: !!ok };
    if (data !== undefined) body.data = data;
    if (error !== undefined) body.error = error;
    IotDevice.publish(dev, IotTopics.extRes(dev._userName, dev._deviceName, ext._type), body);
    return ext;
  }
  /** Fabryka: `IotExtension.define('vfs', { readdir: (a)=>[...], stat: (a)=>({}) })`. */
  static define(type, ops) { return new IotExtension(type, { ops: ops || {} }); }
  static create(type, opts) { return new IotExtension(type, opts); }
  static isExtension(x) { return x instanceof IotExtension; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  IotDevice — urządzenie MyCastle. STATIC-FIRST. Spina encje + rozszerzenia,
//  transport, hello/heartbeat/telemetrię, routing komend i requestów.
// ═════════════════════════════════════════════════════════════════════════════
class IotDevice extends QObject {
  /**
   * @param {{
   *   transport: {publish:Function, subscribe:Function, userName?:string},
   *   deviceName: string,
   *   userName?: string,           // domyślnie transport.userName
   *   heartbeatSec?: number,       // domyślnie 30 (0 = wyłącz)
   *   telemetrySec?: number,       // domyślnie 15 (0 = tylko reaktywnie)
   *   platform?: 'web'|'mobile'|'desktop', // domyślnie 'web'
   *   label?: string,
   * }} opts
   */
  constructor(opts = {}) {
    super();
    const transport = opts.transport;
    if (!transport || typeof transport.publish !== 'function' || typeof transport.subscribe !== 'function') {
      throw new Error('IotDevice: transport musi mieć publish(topic,payload) i subscribe(topic,cb)');
    }
    if (!opts.deviceName) throw new Error('IotDevice: wymagany deviceName');
    this._transport = transport;
    this._userName = opts.userName || transport.userName || 'anonymous';
    this._deviceName = String(opts.deviceName);
    this.setObjectName(this._deviceName);
    this._platform = opts.platform || 'web';
    this._label = opts.label || null;
    this._heartbeatSec = opts.heartbeatSec ?? 30;
    this._telemetrySec = opts.telemetrySec ?? 15;

    this._entities = new Map();   // id → IotEntity
    this._extensions = new Map(); // type → IotExtension
    this._subs = [];              // unsubscribe fns
    this._hbTimer = null;
    this._telTimer = null;
    this._startTime = 0;
    this._started = false;

    /** Cykl życia + zdarzenia protokołu (wszystkie emitują też `this`). */
    this.started = new Signal('started', this);
    this.stopped = new Signal('stopped', this);
    this.helloSent = new Signal('helloSent', this);
    this.heartbeatSent = new Signal('heartbeatSent', this);
    this.telemetrySent = new Signal('telemetrySent', this);
    /** (entityId, payload, entity|null) — entity=null gdy nieznane id. */
    this.commandReceived = new Signal('commandReceived', this);
    /** (extType, payload, ext|null). */
    this.requestReceived = new Signal('requestReceived', this);
  }

  // ── delegaty ────────────────────────────────────────────────────────────────
  userName() { return this._userName; }
  deviceName() { return this._deviceName; }
  topicPrefix() { return IotTopics.prefix(this._userName, this._deviceName); }
  isStarted() { return this._started; }
  uptime() { return this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : 0; }
  entity(id) { return this._entities.get(String(id)) || null; }
  extension(type) { return this._extensions.get(String(type)) || null; }
  entities() { return [...this._entities.values()]; }
  extensions() { return [...this._extensions.values()]; }

  addEntity(entity) { return IotDevice.addEntity(this, entity); }
  addExtension(ext) { return IotDevice.addExtension(this, ext); }
  start() { return IotDevice.start(this); }
  stop() { return IotDevice.stop(this); }
  sendHello() { return IotDevice.sendHello(this); }
  sendRegisterRequest() { return IotDevice.sendRegisterRequest(this); }
  sendHeartbeat() { return IotDevice.sendHeartbeat(this); }
  sendTelemetry(metrics) { return IotDevice.sendTelemetry(this, metrics); }
  publish(topic, obj) { return IotDevice.publish(this, topic, obj); }

  // ═════════════════ STATIC: rejestracja ═════════════════
  static addEntity(dev, entity) {
    if (!(entity instanceof IotEntity)) throw new TypeError('IotDevice.addEntity: oczekiwano IotEntity');
    entity._device = dev;
    QObject.setParent(entity, dev);
    dev._entities.set(entity._id, entity);
    // Reaktywna telemetria: zmiana stanu encji → natychmiastowy wysyłka pojedynczej metryki.
    Signal.connect(entity.stateChanged, () => IotDevice._reportEntity(dev, entity), dev);
    return entity;
  }
  static addExtension(dev, ext) {
    if (!(ext instanceof IotExtension)) throw new TypeError('IotDevice.addExtension: oczekiwano IotExtension');
    ext._device = dev;
    QObject.setParent(ext, dev);
    dev._extensions.set(ext._type, ext);
    if (dev._started) IotDevice._subscribeExt(dev, ext);
    return ext;
  }

  // ═════════════════ STATIC: cykl życia ═════════════════
  static start(dev) {
    if (dev._started) return dev;
    dev._started = true;
    dev._startTime = Date.now();

    // 1) komendy z serwera
    dev._subs.push(dev._transport.subscribe(
      IotTopics.command(dev._userName, dev._deviceName),
      (msg) => IotDevice._onCommand(dev, msg),
    ));
    // 2) requesty rozszerzeń
    for (const ext of dev._extensions.values()) IotDevice._subscribeExt(dev, ext);

    // 3) poproś o dopisanie do listy, ogłoś się i uruchom cykliczne wysyłki
    IotDevice.sendRegisterRequest(dev);
    IotDevice.sendHello(dev);
    if (dev._heartbeatSec > 0) {
      IotDevice.sendHeartbeat(dev);
      dev._hbTimer = setInterval(() => IotDevice.sendHeartbeat(dev), dev._heartbeatSec * 1000);
    }
    if (dev._telemetrySec > 0) {
      dev._telTimer = setInterval(() => IotDevice.sendTelemetry(dev), dev._telemetrySec * 1000);
    }
    Signal.emit(dev.started, dev);
    return dev;
  }
  static stop(dev) {
    if (!dev._started) return dev;
    dev._started = false;
    for (const un of dev._subs) { try { if (typeof un === 'function') un(); } catch { /* ignore */ } }
    dev._subs = [];
    if (dev._hbTimer) { clearInterval(dev._hbTimer); dev._hbTimer = null; }
    if (dev._telTimer) { clearInterval(dev._telTimer); dev._telTimer = null; }
    Signal.emit(dev.stopped, dev);
    return dev;
  }

  // ═════════════════ STATIC: wysyłki (device→server) ═════════════════
  /**
   * Prosi o dopisanie urządzenia do listy użytkownika (Electronics → Devices).
   * Wysyłane przy każdym starcie — backend trzyma jedno zgłoszenie na urządzenie,
   * a wpis powstaje dopiero po akceptacji w panelu.
   */
  static sendRegisterRequest(dev) {
    const body = { kind: dev._platform === 'web' ? 'web' : 'firmware' };
    if (dev._label) body.label = dev._label;
    if (dev._sn) body.sn = dev._sn;
    IotDevice.publish(dev, IotTopics.registerRequest(dev._userName, dev._deviceName), body);
    return dev;
  }
  static sendHello(dev) {
    const body = {
      uptime: dev.uptime(),
      extensions: [...dev._extensions.values()].map((e) => e.toHello()),
      entities: [...dev._entities.values()].map((e) => e.toHello()),
      platform: dev._platform,
    };
    if (dev._label) body.label = dev._label;
    IotDevice.publish(dev, IotTopics.hello(dev._userName, dev._deviceName), body);
    Signal.emit(dev.helloSent, body, dev);
    return dev;
  }
  static sendHeartbeat(dev) {
    const body = { uptime: dev.uptime() };
    IotDevice.publish(dev, IotTopics.heartbeat(dev._userName, dev._deviceName), body);
    Signal.emit(dev.heartbeatSent, body, dev);
    return dev;
  }
  /** Wyślij telemetrię. Bez argumentu — zbiera stany wszystkich encji zgłaszalnych. */
  static sendTelemetry(dev, metrics) {
    let list = metrics;
    if (!Array.isArray(list)) {
      list = [];
      for (const e of dev._entities.values()) {
        const value = e.telemetryValue();
        if (value === undefined) continue;
        const m = { key: e._id, value };
        const unit = e.telemetryUnit();
        if (unit) m.unit = unit;
        list.push(m);
      }
    }
    if (!list.length) return dev; // nic do zgłoszenia
    const body = { metrics: list, timestamp: Date.now() };
    IotDevice.publish(dev, IotTopics.telemetry(dev._userName, dev._deviceName), body);
    Signal.emit(dev.telemetrySent, body, dev);
    return dev;
  }
  static publish(dev, topic, obj) {
    const payload = typeof obj === 'string' ? obj : JSON.stringify(obj);
    dev._transport.publish(topic, payload);
    return dev;
  }

  // ═════════════════ STATIC: routing (server→device) ═════════════════
  static _onCommand(dev, msg) {
    const p = _asObj(msg);
    const id = p.id;
    const name = p.name;
    const entity = dev._entities.get(String(name)) || null;
    Signal.emit(dev.commandReceived, name, p.payload, entity);
    const ackTopic = IotTopics.commandAck(dev._userName, dev._deviceName);
    if (!entity) {
      IotDevice.publish(dev, ackTopic, { id, status: 'FAILED', reason: `Nieznana encja "${name}"` });
      return;
    }
    try {
      entity.handleCommand(p.payload);
      IotDevice.publish(dev, ackTopic, { id, status: 'ACKNOWLEDGED' });
    } catch (e) {
      IotDevice.publish(dev, ackTopic, { id, status: 'FAILED', reason: e && e.message ? e.message : String(e) });
    }
  }
  static _subscribeExt(dev, ext) {
    dev._subs.push(dev._transport.subscribe(
      IotTopics.extReq(dev._userName, dev._deviceName, ext._type),
      (msg) => {
        const p = _asObj(msg);
        Signal.emit(dev.requestReceived, ext._type, p, ext);
        ext.handleRequest(p);
      },
    ));
  }
  static _reportEntity(dev, entity) {
    if (!dev._started) return;
    const value = entity.telemetryValue();
    if (value === undefined) return;
    const m = { key: entity._id, value };
    const unit = entity.telemetryUnit();
    if (unit) m.unit = unit;
    IotDevice.sendTelemetry(dev, [m]);
  }

  // ── fabryka ─────────────────────────────────────────────────────────────────
  static create(opts) { return new IotDevice(opts); }

  onDestroy() { IotDevice.stop(this); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Eksport przez globalny namespace (BEZ `export`) — jak w qobject.module.js.
// ═════════════════════════════════════════════════════════════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  _g.IotTopics = IotTopics;
  _g.IotEntity = IotEntity;
  _g.IotSensorEntity = IotSensorEntity;
  _g.IotBinarySensorEntity = IotBinarySensorEntity;
  _g.IotSwitchEntity = IotSwitchEntity;
  _g.IotNumberEntity = IotNumberEntity;
  _g.IotButtonEntity = IotButtonEntity;
  _g.IotSelectEntity = IotSelectEntity;
  _g.IotExtension = IotExtension;
  _g.IotDevice = IotDevice;
}
