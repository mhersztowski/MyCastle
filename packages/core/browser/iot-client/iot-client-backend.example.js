/*
 * IoT Client (backend MQTT) — jak `iot-client.example.js`, ale zamiast globalnego
 * `client` z sandboxa Drive budujemy WŁASNY transport MQTT łączący się wprost
 * z brokerem backendu MyCastle (WebSocket `/mqtt`).
 *
 * Dzięki temu ten sam kod urządzenia (IotDevice + encje + rozszerzenia) działa też
 * poza Drive — w zwykłej stronie `<script type="module">`, WebEmbed, albo w Node
 * (gdy `mqtt` jest dostępny globalnie).
 *
 * Uruchomienie w **Drive** (▶ „Uruchom w przeglądarce"): działa od ręki —
 * transport sam pobiera URL z `location` i JWT zalogowanego użytkownika z
 * localStorage, więc łączy się jako bieżący user. `client` z sandboxa jest tu
 * NIEUŻYWANY (celowo — pokazujemy samodzielne połączenie).
 *
 * Wymaga rdzenia `qobject.module.js` (Signal/QObject) i `iot-client.module.js`
 * (IotDevice/IotEntity/IotExtension) — w bundlu `core/browser` są dostępne jako globale.
 */

// ── Konfiguracja połączenia (nadpisz w razie potrzeby) ───────────────────────────
const CONFIG = {
  // Domyślnie: same-origin WebSocket do backendu (dev: proxy 1895→1894, prod: nginx).
  url: null,          // np. 'ws://localhost:1894/mqtt'; null → z window.location
  mqttUsername: 'web', // web-client łączy się jako 'web' + JWT jako hasło
  mqttPassword: null,  // null → spróbuj JWT z localStorage['minis_current_user']
  // Nazwa użytkownika w topicach `minis/{user}/{device}/…`. null → z sesji w localStorage.
  userName: null,
  deviceName: 'wirtualka-backend-1',
};

// ═════════════════════════════════════════════════════════════════════════════
//  Pomocnicze: elastyczne ładowanie mqtt.js + odczyt sesji z localStorage
// ═════════════════════════════════════════════════════════════════════════════

// mqtt.js — jak Lit w qt.module.js: bierz z globalnego namespace, inaczej z CDN.
async function loadMqtt() {
  const g = globalThis;
  if (g.mqtt && typeof g.mqtt.connect === 'function') return g.mqtt;
  if (g.Mqtt && typeof g.Mqtt.connect === 'function') return g.Mqtt;
  for (const url of ['https://esm.sh/mqtt@5', 'https://cdn.jsdelivr.net/npm/mqtt@5/+esm']) {
    try { const m = await import(url); const lib = m.default || m; if (lib && typeof lib.connect === 'function') return lib; }
    catch { /* spróbuj następnego CDN */ }
  }
  throw new Error('Nie udało się załadować mqtt.js (brak globalnego `mqtt` i CDN niedostępny)');
}

// Odczyt sesji web-clienta: localStorage['minis_current_user'] = { token, user }.
function readSession() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem('minis_current_user');
    if (!raw) return {};
    const s = JSON.parse(raw);
    const user = s.user;
    const userName = typeof user === 'string' ? user : (user && (user.name || user.userName || user.username)) || null;
    return { token: s.token || null, userName };
  } catch { return {}; }
}

// Domyślny URL brokera: `${ws|wss}://{host}/mqtt` (jak urlHelper.ts web-clienta).
function defaultMqttUrl() {
  if (typeof location === 'undefined') return 'ws://localhost:1894/mqtt';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/mqtt`;
}

// Dopasowanie topicu do filtra MQTT (obsługa `+` i `#`).
function topicMatches(filter, topic) {
  if (filter === topic) return true;
  const f = filter.split('/'), t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (f[i] === '+') { if (t[i] === undefined) return false; continue; }
    if (f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

// ═════════════════════════════════════════════════════════════════════════════
//  BackendMqttTransport — transport MQTT do backendu MyCastle.
//  Spełnia kontrakt oczekiwany przez IotDevice: publish / subscribe / userName.
//  Dziedziczy po QObject (cykl życia), zdarzenia to Signal — spójnie z bundlem.
// ═════════════════════════════════════════════════════════════════════════════
class BackendMqttTransport extends QObject {
  constructor(opts = {}) {
    super();
    const sess = readSession();
    this._url = opts.url || CONFIG.url || defaultMqttUrl();
    this._mqttUser = opts.mqttUsername || CONFIG.mqttUsername || 'web';
    this._mqttPass = opts.mqttPassword || CONFIG.mqttPassword || sess.token || undefined;
    this._userName = opts.userName || CONFIG.userName || sess.userName || 'anonymous';
    this._clientId = opts.clientId || `iot-js-${Math.random().toString(16).slice(2, 10)}`;
    this._client = null;
    this._routes = []; // { filter, cb }

    this.connected = new Signal('connected', this);
    this.disconnected = new Signal('disconnected', this);
    this.error = new Signal('error', this);
  }

  /** userName używany przez IotDevice do budowy topiców `minis/{user}/…`. */
  get userName() { return this._userName; }

  /** Nawiąż połączenie z brokerem. Rozwiązuje się po zdarzeniu 'connect'. */
  async connect() {
    const mqtt = await loadMqtt();
    return new Promise((resolve, reject) => {
      this._client = mqtt.connect(this._url, {
        clientId: this._clientId,
        protocol: this._url.startsWith('wss') ? 'wss' : 'ws',
        username: this._mqttUser,
        password: this._mqttPass,
        reconnectPeriod: 2000,
        connectTimeout: 10000,
      });
      this._client.on('connect', () => { Signal.emit(this.connected, this); resolve(this); });
      this._client.on('close', () => Signal.emit(this.disconnected, 'close'));
      this._client.on('error', (err) => {
        Signal.emit(this.error, err instanceof Error ? err : new Error(String(err)));
        reject(err);
      });
      this._client.on('message', (topic, payload) => this._dispatch(String(topic), payload));
    });
  }

  /** Publikuj (payload: string albo obiekt → JSON) — kontrakt jak `client.publish`. */
  publish(topic, payload) {
    if (!this._client) throw new Error('BackendMqttTransport: publish przed connect()');
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this._client.publish(topic, body, { qos: 0, retain: false });
  }

  /** Subskrybuj; cb(msg, topic) — msg sparsowany JSON lub string. Zwraca unsubscribe(). */
  subscribe(topic, cb) {
    if (!this._client) throw new Error('BackendMqttTransport: subscribe przed connect()');
    const firstForFilter = !this._routes.some((r) => r.filter === topic);
    const route = { filter: topic, cb };
    this._routes.push(route);
    if (firstForFilter) this._client.subscribe(topic, { qos: 0 });
    return () => {
      const i = this._routes.indexOf(route);
      if (i >= 0) this._routes.splice(i, 1);
      if (this._client && !this._routes.some((r) => r.filter === topic)) this._client.unsubscribe(topic);
    };
  }

  disconnect() {
    try { this._client?.end(true); } catch { /* ignore */ }
    this._client = null;
  }

  _dispatch(topic, payload) {
    let msg = String(payload);
    try { msg = JSON.parse(msg); } catch { /* zostaw string */ }
    for (const r of this._routes.slice()) if (topicMatches(r.filter, topic)) {
      try { r.cb(msg, topic); } catch (e) { console.error('[BackendMqttTransport] błąd handlera:', e); }
    }
  }

  onDestroy() { this.disconnect(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Zbuduj urządzenie na własnym transporcie (reszta identyczna jak w bazowym przykładzie)
// ═════════════════════════════════════════════════════════════════════════════

const transport = new BackendMqttTransport({ deviceName: CONFIG.deviceName });

transport.connected.connect(() => console.info('✅ MQTT połączony:', transport._url, 'jako', transport.userName));
transport.error.connect((err) => console.error('❌ MQTT błąd:', err.message));

console.log('Łączę z brokerem backendu…');
await transport.connect(); // top-level await: działa w Drive (AsyncFunction) i w <script type="module">

const dev = new IotDevice({
  transport,                    // ← nasz transport zamiast globalnego `client`
  deviceName: CONFIG.deviceName,
  heartbeatSec: 30,
  telemetrySec: 15,
  label: 'Wirtualne urządzenie na własnym MQTT (backend)',
});

// ── Encje ──────────────────────────────────────────────────────────────────────
const temp = dev.addEntity(IotEntity.sensor('temp', 'Temperatura', { unit: '°C', deviceClass: 'temperature' }));
const online = dev.addEntity(IotEntity.binarySensor('online', 'Połączenie', { onLabel: 'Online', offLabel: 'Offline' }));
const pump = dev.addEntity(IotEntity.switch('pump', 'Pompa'));
const bright = dev.addEntity(IotEntity.number('bright', 'Jasność', { min: 0, max: 100, step: 5, unit: '%' }));
const reboot = dev.addEntity(IotEntity.button('reboot', 'Restart'));
const mode = dev.addEntity(IotEntity.select('mode', 'Tryb', { options: ['auto', 'manual', 'off'] }));

// ── Reakcje na komendy z serwera ─────────────────────────────────────────────────
pump.commanded.connect((on) => console.log('🔌 Pompa →', on ? 'ON' : 'OFF'));
bright.commanded.connect((v) => console.log('💡 Jasność →', v + '%'));
reboot.pressed.connect(() => console.log('♻️  Restart wywołany'));
mode.commanded.connect((m) => console.log('⚙️  Tryb →', m));

// ── Rozszerzenie: prosty licznik operacji (request-response na ext/counter/req) ──
let n = 0;
dev.addExtension(IotExtension.define('counter', {
  inc: () => ({ value: ++n }),
  get: () => ({ value: n }),
  reset: () => { n = 0; return { value: n }; },
}));

// ── Log zdarzeń protokołu ────────────────────────────────────────────────────────
dev.helloSent.connect(() => console.info('▶ hello wysłane:', dev.entities().length, 'encji'));
dev.commandReceived.connect((id, payload, entity) =>
  console.log('◀ command', id, entity ? '(znane)' : '(NIEZNANE)', payload));

// ── Symulacja odczytów czujników ─────────────────────────────────────────────────
online.report(true);
temp.report(21.0);
let t = 21.0;
const sim = setInterval(() => {
  t = Math.round((t + (Math.random() - 0.5)) * 10) / 10;
  temp.report(t);                 // reaktywna telemetria: publikuje od razu
}, 5000);

// Sprzątanie: gdy urządzenie stanie, zatrzymaj symulator i rozłącz MQTT.
dev.stopped.connect(() => { clearInterval(sim); transport.disconnect(); });

dev.start();
console.log('Urządzenie', dev.deviceName(), 'wystartowało jako', transport.userName + '. Steruj nim z panelu IoT MyCastle.');
