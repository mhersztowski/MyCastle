/**
 * qobject.module.js — kompletny, samodzielny rdzeń systemu obiektowego Qt:
 * mechanizm sygnał/slot (`Signal`) oraz `QObject` (drzewo rodzic-dziecko, nazwy
 * obiektów, właściwości dynamiczne, blokowanie sygnałów, cykl życia, filtry
 * zdarzeń, wyszukiwanie po drzewie).
 *
 * Założenia projektowe:
 *  • API 1:1 jak w Qt (gettery to metody: `obj.objectName()`, `sig.emit()`).
 *  • STATIC-FIRST — cała logika żyje w metodach `static`; metody instancji są
 *    cienkimi delegatami do statyków. Dzięki temu wszystkie operacje na drzewie
 *    (`QObject.findChild`, `QObject.traverse`, `QObject.setParent`, …) są
 *    wywoływalne wprost na klasie, a edytor JS podpowiada je po `QObject.`.
 *  • Kompatybilność wsteczna z `qt.module.js`: zachowane sygnatury
 *    `new Signal()`, `sig.connect(fn)/disconnect(fn)/disconnectAll()/block()/emit()`,
 *    `new QObject(parent)`, `objectName()/setObjectName()`, `property()/setProperty()`,
 *    `blockSignals()/signalsBlocked()`, `QObject.tr()`, pole `this.destroyed`.
 *
 * Uwaga o drzewie: `QObject` trzyma swoje drzewo na `_qparent`/`_qchildren`
 * (osobno od ewentualnego drzewa widgetów w `qt.module.js`, które `QWidget`
 * prowadzi na własnych polach) — żeby dołożenie rodzica QObject nie zaśmiecało
 * listy malowanych dzieci widgetu.
 *
 * Moduł nie ma zależności — czysty ESM, działa w przeglądarce, WebEmbed i w
 * skryptach automatyzacji edytora.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  SignalConnection — uchwyt pojedynczego połączenia (jak QMetaObject::Connection)
// ═════════════════════════════════════════════════════════════════════════════
class SignalConnection {
  constructor(signal, slot, context, once, raw) {
    this._signal = signal;     // Signal, do którego należy
    this._slot = slot;         // znormalizowana funkcja do wywołania
    this._context = context;   // `this` dla slotu (lub null)
    this._once = !!once;       // auto-rozłączenie po pierwszym wywołaniu
    this._raw = raw;           // oryginalny argument (fn/Signal/obiekt) do disconnect-by-ref
    this._active = true;
  }
  isConnected() { return this._active && this._signal != null; }
  signal() { return this._signal; }
  /** Rozłącza to konkretne połączenie. Zwraca true jeśli coś usunięto. */
  disconnect() {
    if (!this._active) return false;
    const s = this._signal;
    this._active = false;
    this._signal = null;
    return s ? Signal.disconnect(s, this) : false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Signal — sygnał Qt (połączenia, blokowanie, emisja). STATIC-FIRST.
// ═════════════════════════════════════════════════════════════════════════════
class Signal {
  constructor(name = '', owner = null) {
    this._connections = [];     // SignalConnection[]
    this._blocked = false;      // jawna blokada przez block()
    this._ownerBlocked = false; // blokada przez właściciela (QObject.blockSignals)
    this._name = name;
    this._owner = owner;
  }
  // Metody instancji to cienkie delegaty do statyków (static-first — całe API
  // jest też wywoływalne jako `Signal.xxx(signal, …)` dla wygody autocomplete).
  name() { return Signal.name(this); }
  owner() { return Signal.owner(this); }

  // ── connect ──────────────────────────────────────────────────────────────
  /** Łączy slot (funkcja albo inny Signal — wtedy przekazuje emisję dalej).
   *  Zwraca `SignalConnection`. */
  connect(slot, context = null) { return Signal.connect(this, slot, context, false); }
  /** Jak connect, ale slot odłącza się po pierwszym wywołaniu. */
  once(slot, context = null) { return Signal.once(this, slot, context); }
  connectOnce(slot, context = null) { return Signal.once(this, slot, context); }

  // ── disconnect ───────────────────────────────────────────────────────────
  /** Rozłącza po referencji slotu, po `SignalConnection`, albo (bez argumentu) wszystko. */
  disconnect(slotOrConnection = null, context = null) { return Signal.disconnect(this, slotOrConnection, context); }
  disconnectAll() { return Signal.disconnectAll(this); }

  // ── blokowanie ───────────────────────────────────────────────────────────
  block(b = true) { return Signal.block(this, b); }
  unblock() { return Signal.unblock(this); }
  /** true jeśli emisja jest aktualnie wstrzymana (jawnie lub przez właściciela). */
  isBlocked() { return this._blocked || this._ownerBlocked; }
  /** Zgodnie z Qt: ustawia blokadę, zwraca poprzedni stan. */
  blockSignals(b) { const prev = this._blocked; this._blocked = !!b; return prev; }

  // ── emisja ───────────────────────────────────────────────────────────────
  emit(...args) { return Signal.emit(this, ...args); }

  // ── inspekcja ────────────────────────────────────────────────────────────
  slotCount() { return Signal.slotCount(this); }
  isConnected() { return this._connections.length > 0; }
  connections() { return Signal.connections(this); }

  // ═════════════════ STATIC ═════════════════
  /** Normalizuje slot do funkcji. Wspiera: funkcję, inny Signal (chaining),
   *  oraz parę (obiekt, 'nazwaMetody'). */
  static _normalize(slot, context) {
    if (slot instanceof Signal) { const target = slot; return { fn: (...a) => Signal.emit(target, ...a), ctx: null }; }
    if (typeof slot === 'function') return { fn: slot, ctx: (context && typeof context === 'object') ? context : null };
    if (slot && typeof context === 'string' && typeof slot[context] === 'function') {
      const obj = slot, method = context; return { fn: (...a) => obj[method](...a), ctx: obj };
    }
    throw new TypeError('Signal.connect: slot musi być funkcją, Signalem lub parą (obiekt, "metoda")');
  }
  static connect(signal, slot, context = null, once = false) {
    if (!(signal instanceof Signal)) throw new TypeError('Signal.connect: pierwszy argument nie jest Signalem');
    const { fn, ctx } = Signal._normalize(slot, context);
    const conn = new SignalConnection(signal, fn, ctx, once, slot);
    signal._connections.push(conn);
    return conn;
  }
  static disconnect(signal, slotOrConnection = null, context = null) {
    if (!(signal instanceof Signal)) return false;
    if (slotOrConnection == null) return Signal.disconnectAll(signal);
    const before = signal._connections.length;
    signal._connections = signal._connections.filter((c) => {
      if (slotOrConnection instanceof SignalConnection) return c !== slotOrConnection;
      const matches = (c._raw === slotOrConnection || c._slot === slotOrConnection)
        && (context == null || c._context === context);
      return !matches;
    });
    return signal._connections.length < before;
  }
  static disconnectAll(signal) {
    if (!(signal instanceof Signal)) return false;
    const had = signal._connections.length > 0;
    for (const c of signal._connections) { c._active = false; c._signal = null; }
    signal._connections = [];
    return had;
  }
  /** Emituje sygnał. Respektuje blokady; izoluje wyjątki slotów; obsługuje
   *  `once`; ustawia bieżącego nadawcę (dla `QObject.prototype.sender()`). */
  static emit(signal, ...args) {
    if (!(signal instanceof Signal) || signal.isBlocked()) return false;
    const prevSender = Signal._activeSignal;
    Signal._activeSignal = signal;
    const list = signal._connections.slice(); // snapshot — sloty mogą (od)łączać w trakcie
    let delivered = 0;
    try {
      for (const c of list) {
        if (!c._active) continue;
        try { c._context ? c._slot.apply(c._context, args) : c._slot(...args); delivered++; }
        catch (e) { console.error('[Signal] błąd slotu w "' + (signal._name || 'anonymous') + '":', e); }
        if (c._once) c.disconnect();
      }
    } finally { Signal._activeSignal = prevSender; }
    return delivered > 0;
  }
  static block(signal, b = true) { if (signal instanceof Signal) signal._blocked = !!b; return signal; }
  static unblock(signal) { if (signal instanceof Signal) signal._blocked = false; return signal; }
  static isBlocked(signal) { return signal instanceof Signal ? signal.isBlocked() : false; }
  static once(signal, slot, context = null) { return Signal.connect(signal, slot, context, true); }
  static slotCount(signal) { return signal instanceof Signal ? signal._connections.length : 0; }
  static connections(signal) { return signal instanceof Signal ? signal._connections.slice() : []; }
  static name(signal) { return signal instanceof Signal ? signal._name : ''; }
  static owner(signal) { return signal instanceof Signal ? signal._owner : null; }
  /** Fabryka — wygodny punkt wejścia dla autocomplete: `Signal.create('clicked')`. */
  static create(name = '', owner = null) { return new Signal(name, owner); }
  static of(name = '', owner = null) { return new Signal(name, owner); }
  static isSignal(x) { return x instanceof Signal; }
}
Signal._activeSignal = null;

// ═════════════════════════════════════════════════════════════════════════════
//  QObject — bazowy obiekt Qt. STATIC-FIRST (drzewo, wyszukiwanie, cykl życia).
// ═════════════════════════════════════════════════════════════════════════════
class QObject {
  constructor(parent = null) {
    this._objectName = '';
    this._props = {};                 // właściwości dynamiczne
    this._signalsBlocked = false;
    this._qparent = null;             // rodzic w drzewie QObject
    this._qchildren = [];             // dzieci w drzewie QObject
    this._eventFilters = [];          // zainstalowane filtry zdarzeń
    this._destroyedFlag = false;
    this._pendingDelete = false;
    // Wbudowane sygnały Qt.
    this.destroyed = new Signal('destroyed', this);
    this.objectNameChanged = new Signal('objectNameChanged', this);
    if (parent) QObject.setParent(this, parent);
  }

  // Metody instancji to cienkie delegaty do statyków — całe API jest też
  // wywoływalne jako `QObject.xxx(obj, …)` (static-first → bogate podpowiedzi
  // po wpisaniu `QObject.` w edytorze).

  // ── tożsamość ──────────────────────────────────────────────────────────────
  objectName() { return this._objectName; }
  setObjectName(n) { return QObject.setObjectName(this, n); }
  className() { return QObject.className(this); }
  /** Czy obiekt dziedziczy (bezpośrednio lub pośrednio) po klasie o danej nazwie. */
  inherits(className) { return QObject.inherits(this, className); }
  isDestroyed() { return this._destroyedFlag; }

  // ── właściwości (zadeklarowane Q_PROPERTY + dynamiczne) ──────────────────────
  property(key) { return QObject.property(this, key); }
  setProperty(key, value) { return QObject.setProperty(this, key, value); }
  dynamicPropertyNames() { return QObject.dynamicPropertyNames(this); }
  /** Scalona mapa zadeklarowanych właściwości tego obiektu. */
  metaProperties() { return QObject.metaProperties(this); }
  /** Wszystkie nazwy właściwości (zadeklarowane + dynamiczne). */
  propertyNames() { return QObject.propertyNames(this); }
  /** Scalona mapa zadeklarowanych sygnałów tego obiektu (łańcuch dziedziczenia). */
  metaSignals() { return QObject.metaSignals(this); }
  /** Nazwy zadeklarowanych sygnałów (np. 'clicked', 'valueChanged'). */
  signalNames() { return QObject.metaSignalNames(this); }

  // ── drzewo (delegaty do statyków) ───────────────────────────────────────────
  parent() { return this._qparent; }
  setParent(parent) { return QObject.setParent(this, parent); }
  children() { return this._qchildren.slice(); }
  childCount() { return this._qchildren.length; }
  childAt(i) { return this._qchildren[i] ?? null; }
  findChild(name = null, opts = {}) { return QObject.findChild(this, name, opts); }
  findChildren(name = null, opts = {}) { return QObject.findChildren(this, name, opts); }

  // ── sygnały: blokowanie ─────────────────────────────────────────────────────
  blockSignals(block) { return QObject.blockSignals(this, block); }
  signalsBlocked() { return this._signalsBlocked; }
  /** Lista wszystkich sygnałów obiektu (pola będące instancjami Signal). */
  signals() { return QObject.signalsOf(this); }
  /** Obiekt, którego sygnał aktualnie wykonuje ten slot (jak QObject::sender()). */
  sender() { return QObject.sender(); }

  // ── filtry zdarzeń ──────────────────────────────────────────────────────────
  installEventFilter(filterObj) { return QObject.installEventFilter(this, filterObj); }
  removeEventFilter(filterObj) { return QObject.removeEventFilter(this, filterObj); }
  eventFilters() { return this._eventFilters.slice(); }
  /** Domyślny filtr — nadpisz w podklasie; zwróć true by „połknąć" zdarzenie. */
  eventFilter(_watched, _event) { return false; }

  // ── cykl życia ──────────────────────────────────────────────────────────────
  destroy() { return QObject.destroy(this); }
  deleteLater() { return QObject.deleteLater(this); }

  // ── serializacja (snapshot/restore stanu obiektu i poddrzewa) ────────────────
  /** Serializuje obiekt i jego poddrzewo do zwykłego JSON-a (format sceny:
   *  { className, objectName?, properties:[{key,value}], children:[] }). */
  serialize() { return QObject.serialize(this); }

  // ── debug ───────────────────────────────────────────────────────────────────
  dumpObjectTree() { return QObject.dumpTree(this); }
  dumpObjectInfo() { return QObject.describe(this); }

  // ── tłumaczenia (no-op, jak w bazowym Qt) ────────────────────────────────────
  static tr(s) { return s; }

  // ═════════════════ STATIC: fabryki + tożsamość/właściwości ═════════════════
  /** Fabryka — wygodny punkt wejścia dla autocomplete: `QObject.create(parent)`. */
  static create(parent = null) { return new QObject(parent); }
  static of(parent = null) { return new QObject(parent); }
  static objectName(o) { return o ? o._objectName : ''; }
  static setObjectName(o, name) {
    const s = name == null ? '' : String(name);
    if (s !== o._objectName) { o._objectName = s; Signal.emit(o.objectNameChanged, s); }
    return o;
  }
  static className(o) { return o ? o.constructor.name : ''; }
  static inherits(o, className) {
    let proto = o ? o.constructor : null;
    while (proto && proto.name) { if (proto.name === className) return true; proto = Object.getPrototypeOf(proto); }
    return false;
  }
  static isDestroyed(o) { return !!(o && o._destroyedFlag); }

  // ── System właściwości (Q_PROPERTY) ──────────────────────────────────────────
  // Każda klasa deklaruje zadeklarowane właściwości w statycznym polu
  // `static properties = { name: { get(self), set?(self, v), notify?, type? } }`.
  // metaProperties() scala deklaracje z całego łańcucha dziedziczenia.
  static properties = {
    objectName: { get: (o) => o.objectName(), set: (o, v) => o.setObjectName(v), notify: 'objectNameChanged', type: 'string' },
  };
  /** Scalona mapa zadeklarowanych właściwości obiektu lub klasy (łańcuch dziedziczenia). */
  static metaProperties(target) {
    const cls = (typeof target === 'function') ? target : (target && target.constructor);
    if (!cls) return {};
    const chain = [];
    let c = cls;
    while (c && c !== Object && c !== Function.prototype) { chain.unshift(c); c = Object.getPrototypeOf(c); }
    const out = {};
    for (const k of chain) {
      if (Object.prototype.hasOwnProperty.call(k, 'properties') && k.properties && typeof k.properties === 'object') {
        Object.assign(out, k.properties);
      }
    }
    return out;
  }
  /** Nazwy zadeklarowanych (meta) właściwości. */
  static metaPropertyNames(target) { return Object.keys(QObject.metaProperties(target)); }

  // ── System sygnałów (metadane, enumerowalne) ─────────────────────────────────
  // Każda klasa deklaruje swoje sygnały w statycznym polu
  // `static signals = { nazwa: { params: ['argName', …] } }`. To metadane do
  // enumeracji/edytorów — faktyczne instancje Signal nadal żyją jako pola obiektu
  // (tworzone w konstruktorze). metaSignals() scala deklaracje z łańcucha dziedziczenia.
  static signals = {
    destroyed: { params: [] },
    objectNameChanged: { params: ['name'] },
  };
  /** Scalona mapa zadeklarowanych sygnałów obiektu lub klasy (łańcuch dziedziczenia). */
  static metaSignals(target) {
    const cls = (typeof target === 'function') ? target : (target && target.constructor);
    if (!cls) return {};
    const chain = [];
    let c = cls;
    while (c && c !== Object && c !== Function.prototype) { chain.unshift(c); c = Object.getPrototypeOf(c); }
    const out = {};
    for (const k of chain) {
      if (Object.prototype.hasOwnProperty.call(k, 'signals') && k.signals && typeof k.signals === 'object') {
        Object.assign(out, k.signals);
      }
    }
    return out;
  }
  /** Nazwy zadeklarowanych (meta) sygnałów. */
  static metaSignalNames(target) { return Object.keys(QObject.metaSignals(target)); }

  /** Odczyt właściwości: najpierw zadeklarowana (getter), potem dynamiczna. */
  static property(o, key) {
    if (!o) return undefined;
    const meta = QObject.metaProperties(o)[key];
    if (meta && typeof meta.get === 'function') { try { return meta.get(o); } catch { return undefined; } }
    return o._props[key];
  }
  /** Zapis właściwości: zadeklarowana (setter + opcjonalny sygnał notify) albo dynamiczna. */
  static setProperty(o, key, value) {
    const meta = QObject.metaProperties(o)[key];
    if (meta && typeof meta.set === 'function') {
      meta.set(o, value);
      if (meta.notify && o[meta.notify] instanceof Signal) Signal.emit(o[meta.notify], value);
    } else {
      o._props[key] = value;
    }
    return o;
  }
  static dynamicPropertyNames(o) { return o ? Object.keys(o._props) : []; }
  /** Wszystkie nazwy właściwości: zadeklarowane (meta) + dynamiczne. */
  static propertyNames(o) { return [...QObject.metaPropertyNames(o), ...QObject.dynamicPropertyNames(o)]; }

  // ── obiekt-nadawca aktualnie wykonywanego slotu (QObject::sender) ────────────
  static sender() { const s = Signal._activeSignal; return s ? s.owner() : null; }

  // ── filtry zdarzeń ───────────────────────────────────────────────────────────
  static installEventFilter(o, filterObj) { if (filterObj && !o._eventFilters.includes(filterObj)) o._eventFilters.unshift(filterObj); return o; }
  static removeEventFilter(o, filterObj) { const i = o._eventFilters.indexOf(filterObj); if (i >= 0) o._eventFilters.splice(i, 1); return o; }
  static eventFilters(o) { return o ? o._eventFilters.slice() : []; }

  // ── deleteLater (odroczone zniszczenie na następnej turze pętli) ─────────────
  static deleteLater(o) {
    if (!(o instanceof QObject) || o._pendingDelete || o._destroyedFlag) return o;
    o._pendingDelete = true;
    const run = () => QObject.destroy(o);
    if (typeof setTimeout === 'function') setTimeout(run, 0);
    else Promise.resolve().then(run);
    return o;
  }

  // ═════════════════ STATIC: drzewo ═════════════════
  /** Ustawia (lub usuwa, gdy parent=null) rodzica obiektu, utrzymując obie listy. */
  static setParent(child, parent = null) {
    if (!(child instanceof QObject)) return child;
    if (parent === child) throw new Error('QObject.setParent: obiekt nie może być swoim rodzicem');
    const old = child._qparent;
    if (old === parent) return child;
    if (old && Array.isArray(old._qchildren)) { const i = old._qchildren.indexOf(child); if (i >= 0) old._qchildren.splice(i, 1); }
    child._qparent = parent || null;
    if (parent) {
      if (parent === child || QObject.contains(child, parent)) throw new Error('QObject.setParent: wykryto cykl w drzewie');
      if (!Array.isArray(parent._qchildren)) parent._qchildren = [];
      if (!parent._qchildren.includes(child)) parent._qchildren.push(child);
    }
    return child;
  }
  static addChild(parent, child) { return QObject.setParent(child, parent); }
  static removeChild(parent, child) { if (child && child._qparent === parent) QObject.setParent(child, null); return parent; }
  static parent(o) { return o ? o._qparent : null; }
  static children(o) { return o ? o._qchildren.slice() : []; }
  static indexOfChild(parent, child) { return parent ? parent._qchildren.indexOf(child) : -1; }
  static contains(root, obj) {
    if (!root || !obj) return false;
    let found = false;
    QObject.traverse(root, (n) => { if (n === obj) { found = true; return false; } }, { includeRoot: false });
    return found;
  }
  static ancestors(o) { const out = []; let p = o ? o._qparent : null; while (p) { out.push(p); p = p._qparent; } return out; }
  static root(o) { let r = o; while (r && r._qparent) r = r._qparent; return r ?? null; }
  static depth(o) { let d = 0, p = o ? o._qparent : null; while (p) { d++; p = p._qparent; } return d; }
  /** Ścieżka objectName od korzenia do obiektu (np. "win/panel/okButton"). */
  static path(o, sep = '/') { const names = []; let n = o; while (n) { names.unshift(n._objectName || n.className()); n = n._qparent; } return names.join(sep); }

  /** Pre-order DFS po drzewie. `visitor(node, depth, parent)`; zwróć `false`
   *  by przerwać. `opts.includeRoot` (domyślnie false) — czy odwiedzić korzeń. */
  static traverse(root, visitor, opts = {}) {
    if (!(root instanceof QObject)) return;
    const includeRoot = opts.includeRoot === true;
    const walk = (node, depth) => {
      if (includeRoot || node !== root) { if (visitor(node, depth, node._qparent) === false) return false; }
      for (const c of node._qchildren.slice()) if (walk(c, depth + 1) === false) return false;
      return true;
    };
    walk(root, 0);
  }
  /** Wszystkie potomki w kolejności pre-order (bez korzenia). */
  static descendants(root) { const out = []; QObject.traverse(root, (n) => { out.push(n); }); return out; }

  /** Buduje predykat dopasowania: null=dowolny, string=objectName, RegExp, fn. */
  static _matcher(name) {
    if (name == null) return () => true;
    if (typeof name === 'function') return name;
    if (name instanceof RegExp) return (o) => name.test(o._objectName);
    return (o) => o._objectName === name;
  }
  /** Pierwszy potomek pasujący po nazwie/predykacie (+ opcjonalnie `opts.type`).
   *  `opts.recursive` domyślnie true. */
  static findChild(root, name = null, opts = {}) {
    const recursive = opts.recursive !== false;
    const type = opts.type || null;
    const match = QObject._matcher(name);
    const test = (o) => match(o) && (!type || o instanceof type);
    for (const c of root._qchildren) {
      if (test(c)) return c;
      if (recursive) { const r = QObject.findChild(c, name, opts); if (r) return r; }
    }
    return null;
  }
  /** Wszystkie pasujące potomki (tablica). */
  static findChildren(root, name = null, opts = {}) {
    const recursive = opts.recursive !== false;
    const type = opts.type || null;
    const match = QObject._matcher(name);
    const out = [];
    const visit = (o) => { if (match(o) && (!type || o instanceof type)) out.push(o); };
    if (recursive) { QObject.traverse(root, (n) => { visit(n); }); }
    else { for (const c of root._qchildren) visit(c); }
    return out;
  }

  // ═════════════════ STATIC: sygnały na obiekcie ═════════════════
  /** Wszystkie pola obiektu będące Signalem. */
  static signalsOf(o) { const out = []; for (const k of Object.keys(o)) { if (o[k] instanceof Signal) out.push(o[k]); } return out; }
  /** Ustawia/zdejmuje blokadę WSZYSTKICH sygnałów obiektu. Zwraca poprzedni stan. */
  static blockSignals(o, block) {
    const prev = o._signalsBlocked;
    o._signalsBlocked = !!block;
    for (const sig of QObject.signalsOf(o)) sig._ownerBlocked = !!block;
    return prev;
  }
  /** Qt-owe `QObject.connect(sender, "signalName"|signal, slot, ctx)`. */
  static connect(sender, signal, slot, context = null) {
    const sig = signal instanceof Signal ? signal
      : (sender && typeof signal === 'string' ? sender[signal] : null);
    if (!(sig instanceof Signal)) throw new TypeError('QObject.connect: nie znaleziono sygnału: ' + signal);
    // slot jako nazwa metody na kontekście/odbiorcy
    if (typeof slot === 'string') {
      const ctx = context || sender;
      return Signal.connect(sig, ctx, slot);
    }
    return Signal.connect(sig, slot, context);
  }
  static disconnect(sender, signal = null, slot = null) {
    if (sender instanceof Signal) return Signal.disconnect(sender, signal, slot);
    const sig = signal instanceof Signal ? signal
      : (sender && typeof signal === 'string' ? sender[signal] : null);
    if (!(sig instanceof Signal)) return false;
    return Signal.disconnect(sig, slot);
  }

  // ═════════════════ STATIC: cykl życia ═════════════════
  /** Rekurencyjnie niszczy obiekt: najpierw dzieci, potem emit `destroyed`,
   *  odpięcie od rodzica i rozłączenie wszystkich własnych sygnałów. */
  static destroy(o) {
    if (!(o instanceof QObject) || o._destroyedFlag) return o;
    for (const child of o._qchildren.slice()) QObject.destroy(child);
    o._qchildren = [];
    if (o._qparent && Array.isArray(o._qparent._qchildren)) {
      const i = o._qparent._qchildren.indexOf(o); if (i >= 0) o._qparent._qchildren.splice(i, 1);
    }
    o._qparent = null;
    o._destroyedFlag = true;
    try { Signal.emit(o.destroyed, o); } catch (e) { console.error('[QObject] błąd w destroyed:', e); }
    for (const sig of QObject.signalsOf(o)) Signal.disconnectAll(sig);
    o._eventFilters = [];
    return o;
  }

  // ═════════════════ STATIC: serializacja (scena ↔ żywe obiekty) ═════════════════
  /** Serializuje wartość właściwości do JSON-owalnej formy (prymitywy 1:1,
   *  QColor → name(), reszta → String). */
  static _serializeValue(v) {
    if (v == null) return v;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (typeof v.name === 'function') { try { return v.name(); } catch { /* fallthrough */ } }
    return String(v);
  }
  /** Serializuje obiekt i poddrzewo do JSON-a (format sceny). Dla każdego węzła
   *  zapisuje className, objectName i ZADEKLAROWANE właściwości (z setterem),
   *  oraz rekurencyjnie dzieci. Drzewo brane z `children()` — dla QWidget jest to
   *  drzewo widgetów, dla QObject drzewo QObject. */
  static serialize(obj) {
    if (!obj || typeof obj.className !== 'function') return null;
    const node = { className: obj.className(), children: [] };
    const nm = typeof obj.objectName === 'function' ? obj.objectName() : '';
    if (nm) node.objectName = nm;
    const meta = QObject.metaProperties(obj);
    const props = [];
    for (const key of Object.keys(meta)) {
      if (key === 'objectName') continue;
      const d = meta[key];
      if (!d || typeof d.set !== 'function') continue; // tylko zapisywalne
      let v; try { v = obj.property(key); } catch { continue; }
      props.push({ key, value: QObject._serializeValue(v) });
    }
    if (props.length) node.properties = props;
    const kids = (typeof obj.children === 'function') ? obj.children() : [];
    for (const c of kids) { const cn = QObject.serialize(c); if (cn) node.children.push(cn); }
    return node;
  }
  /** Buduje ŻYWY obiekt z węzła JSON (odwrotność serialize). Instancjonuje klasę
   *  z `registry` lub `globalThis`, ustawia objectName + właściwości i rekurencyjnie
   *  podpina dzieci przez setParent (polimorficznie). Zwraca null gdy klasa nieznana. */
  static deserialize(data, registry = null) {
    if (!data || !data.className) return null;
    const g = (typeof globalThis !== 'undefined') ? globalThis : {};
    const Cls = (registry && registry[data.className]) || g[data.className];
    let obj = null;
    if (typeof Cls === 'function') {
      try { obj = new Cls(); }
      catch { const f = Cls.create; if (typeof f === 'function') { try { obj = f(); } catch { obj = null; } } }
    }
    if (!obj) return null;
    if (data.objectName && typeof obj.setObjectName === 'function') obj.setObjectName(data.objectName);
    for (const p of (data.properties || [])) { try { obj.setProperty(p.key, p.value); } catch { /* setter odrzucił */ } }
    for (const c of (data.children || [])) {
      const child = QObject.deserialize(c, registry);
      if (child && typeof child.setParent === 'function') { try { child.setParent(obj); } catch { /* ignore */ } }
    }
    return obj;
  }

  // ═════════════════ STATIC: debug ═════════════════
  static describe(o) {
    return `${o.className()}(name="${o._objectName}", children=${o._qchildren.length}, props=[${Object.keys(o._props).join(',')}])`;
  }
  static dumpTree(root) {
    const lines = [];
    lines.push(QObject.describe(root));
    QObject.traverse(root, (n, depth) => { lines.push('  '.repeat(depth + 1) + QObject.describe(n)); });
    const text = lines.join('\n');
    if (typeof console !== 'undefined') console.log(text);
    return text;
  }
  static isQObject(x) { return x instanceof QObject; }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Eksport przez globalny namespace (BEZ `export`).
//  Dzięki temu plik działa też w kontekstach bez ESM — np. w runtime skryptów
//  automatyzacji uruchamianych przez `AsyncFunction`/eval, gdzie `export`/`import`
//  są błędem składni. `qt.module.js` odczytuje te klasy z `globalThis`.
// ═════════════════════════════════════════════════════════════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  _g.Signal = Signal;
  _g.SignalConnection = SignalConnection;
  _g.QObject = QObject;
}
