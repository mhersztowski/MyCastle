/**
 * qt2.module.js (wariant static-first) — biblioteka web-componentów (Lit) z API wzorowanym 1:1 na Qt,
 * rysowana na canvasie HTML (retained-mode). Nacisk na: urządzenia mobilne
 * (dotyk, przewijanie gestem, popupy) i pióro/rysik (pressure, tilt, gumka).
 *
 * Konwencja: gettery jak w Qt to METODY — rect.width(), slider.value().
 * Dużo metod `static` (fabryki/utility) dla wygodnego autocomplete w edytorze JS.
 * Klasy NIE są eksportowane przy deklaracji — eksport zbiorczy na końcu pliku.
 *
 * Host: <qt-canvas> (QtCanvas). Tworzysz widgety i wstawiasz do layoutów na
 * QtCanvas.root; canvas sam przerysowuje (rAF) i rozsyła zdarzenia
 * (QMouseEvent / QTabletEvent / QKeyEvent / QWheelEvent), z bąbelkowaniem,
 * focusem, warstwą popupów i gestami dotyku.
 */
// Rdzeń systemu obiektowego Qt (sygnał/slot + drzewo QObject) mieszka w
// qobject.module.js i jest udostępniany przez globalny namespace (BEZ statycznego
// `import`, żeby ten plik dało się uruchomić też w runtime skryptów, gdzie
// `import`/`export` są błędem składni). Jeśli rdzeń nie został jeszcze załadowany,
// dociągamy go dynamicznie (działa w kontekście modułu/WebEmbed) — analogicznie
// do ładowania `lit` poniżej.
const _qcore = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined' ? window : self);
if (!_qcore.QObject || !_qcore.Signal) {
  await import('./qobject.module.js'); // tylko dla efektu ubocznego: ustawia globale
}
// UWAGA: NIE deklarujemy `const Signal/SignalConnection/QObject = _qcore.X`.
// Gdy ten plik jest WKLEJANY do skryptu razem z qobject.module.js (żeby parser
// i autocomplete edytora widziały klasy), takie `const` kolidowałoby z
// `class Signal`/`class QObject` z qobject ("Identifier already declared").
// Zamiast tego `new Signal()` / `extends QObject` rozwiązują się do globalThis
// (ustawione przez qobject — wklejone wyżej lub doimportowane powyżej).

// Lit jest pobierany elastycznie, żeby moduł działał w dwóch kontekstach:
//  • skrypty automatyzacji edytora markdown — lit jest WSTRZYKIWANY jako globalny
//    `Lit` (przez znacznik `// @library: lit`), więc statyczny import by się nie
//    związał ("LitElement is not defined"); bierzemy go z globalnego `Lit`.
//  • WebEmbed (iframe, `<script type="module">`) / zwykły ESM — ładujemy z CDN.
const _lit = (typeof globalThis !== 'undefined' && globalThis.Lit && globalThis.Lit.LitElement)
  ? globalThis.Lit
  : await import('https://cdn.jsdelivr.net/npm/lit@3/+esm');
const { LitElement, html, css } = _lit;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const _measureCtx = document.createElement('canvas').getContext('2d');

// ═════════════════════════════════════════════════════════════════════════════
//  Qt — przestrzeń nazw: enumy, klawisze, kursory, kolory globalne
// ═════════════════════════════════════════════════════════════════════════════
class Qt {
  static AlignLeft = 0x0001; static AlignRight = 0x0002; static AlignHCenter = 0x0004; static AlignJustify = 0x0008;
  static AlignTop = 0x0020; static AlignBottom = 0x0040; static AlignVCenter = 0x0080; static AlignBaseline = 0x0100;
  static AlignCenter = 0x0084; static AlignHorizontal_Mask = 0x000f; static AlignVertical_Mask = 0x01e0;
  static Horizontal = 1; static Vertical = 2;
  static Unchecked = 0; static PartiallyChecked = 1; static Checked = 2;
  static NoButton = 0; static LeftButton = 1; static RightButton = 2; static MiddleButton = 4; static BackButton = 8; static ForwardButton = 16;
  static NoModifier = 0x0000; static ShiftModifier = 0x0200; static ControlModifier = 0x0400; static AltModifier = 0x0800; static MetaModifier = 0x1000;
  static NoPen = 0; static SolidLine = 1; static DashLine = 2; static DotLine = 3; static DashDotLine = 4; static DashDotDotLine = 5;
  static FlatCap = 0x00; static SquareCap = 0x10; static RoundCap = 0x20; static MiterJoin = 0x00; static BevelJoin = 0x40; static RoundJoin = 0x80;
  static NoBrush = 0; static SolidPattern = 1; static LinearGradientPattern = 15; static RadialGradientPattern = 17;
  static _dash(style, w) { if (style === Qt.DashLine) return [4 * w, 3 * w]; if (style === Qt.DotLine) return [w, 3 * w]; if (style === Qt.DashDotLine) return [4 * w, 3 * w, w, 3 * w]; if (style === Qt.DashDotDotLine) return [4 * w, 3 * w, w, 3 * w, w, 3 * w]; return []; }
  static ArrowCursor = 'default'; static PointingHandCursor = 'pointer'; static IBeamCursor = 'text';
  static SizeVerCursor = 'ns-resize'; static SizeHorCursor = 'ew-resize'; static OpenHandCursor = 'grab'; static ClosedHandCursor = 'grabbing'; static CrossCursor = 'crosshair'; static BlankCursor = 'none';
  static ElideLeft = 0; static ElideRight = 1; static ElideMiddle = 2; static ElideNone = 3;
  static ScrollBarAsNeeded = 0; static ScrollBarAlwaysOff = 1; static ScrollBarAlwaysOn = 2;
  static NoFocus = 0; static TabFocus = 1; static ClickFocus = 2; static StrongFocus = 11; static WheelFocus = 15;
  static Key_Escape = 'Escape'; static Key_Tab = 'Tab'; static Key_Backspace = 'Backspace'; static Key_Return = 'Enter';
  static Key_Enter = 'Enter'; static Key_Delete = 'Delete'; static Key_Home = 'Home'; static Key_End = 'End';
  static Key_Left = 'ArrowLeft'; static Key_Up = 'ArrowUp'; static Key_Right = 'ArrowRight'; static Key_Down = 'ArrowDown'; static Key_Space = ' ';
  static white = null; static black = null; static red = null; static darkRed = null; static green = null; static darkGreen = null;
  static blue = null; static darkBlue = null; static cyan = null; static magenta = null; static yellow = null;
  static gray = null; static darkGray = null; static lightGray = null; static transparent = null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Typy geometryczne
// ═════════════════════════════════════════════════════════════════════════════
class QPoint {
  constructor(x = 0, y = 0) { this._x = x; this._y = y; }
  static of(x, y) { return new QPoint(x, y); }
  static create(x, y) { return new QPoint(x, y); }
  static fromObject(o) { return new QPoint(o.x ?? 0, o.y ?? 0); }
  // static-first: lustra metod instancji (wygodne autocomplete `QPoint.`).
  static x(p) { return p.x(); } static y(p) { return p.y(); }
  static isNull(p) { return p.isNull(); }
  static manhattanLength(p) { return p.manhattanLength(); }
  static dotProduct(a, b) { return a.dotProduct(b); }
  static add(a, b) { return a.add(b); } static sub(a, b) { return a.sub(b); }
  static scaled(p, s) { return p.scaled(s); }
  static distanceTo(a, b) { return a.distanceTo(b); }
  static clone(p) { return p.clone(); }
  static properties = {
    x: { get: (o) => o.x(), set: (o, v) => o.setX(v), type: 'number' },
    y: { get: (o) => o.y(), set: (o, v) => o.setY(v), type: 'number' },
  };
  x() { return this._x; } y() { return this._y; }
  setX(v) { this._x = v; return this; } setY(v) { this._y = v; return this; }
  isNull() { return this._x === 0 && this._y === 0; }
  manhattanLength() { return Math.abs(this._x) + Math.abs(this._y); }
  dotProduct(p) { return this._x * p.x() + this._y * p.y(); }
  add(p) { return new QPoint(this._x + p.x(), this._y + p.y()); }
  sub(p) { return new QPoint(this._x - p.x(), this._y - p.y()); }
  scaled(s) { return new QPoint(this._x * s, this._y * s); }
  distanceTo(p) { return Math.hypot(this._x - p.x(), this._y - p.y()); }
  clone() { return new QPoint(this._x, this._y); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QPoint.foo(self, …)) ──
  static setX(self, v) { return self.setX(v); }
  static setY(self, v) { return self.setY(v); }
}
class QPointF extends QPoint { static of(x, y) { return new QPointF(x, y); } static create(x, y) { return new QPointF(x, y); } }

class QSize {
  constructor(w = 0, h = 0) { this._w = w; this._h = h; }
  static of(w, h) { return new QSize(w, h); }
  static create(w, h) { return new QSize(w, h); }
  static width(s) { return s.width(); } static height(s) { return s.height(); }
  static isValid(s) { return s.isValid(); } static isEmpty(s) { return s.isEmpty(); }
  static expandedTo(a, b) { return a.expandedTo(b); } static boundedTo(a, b) { return a.boundedTo(b); }
  static clone(s) { return s.clone(); }
  static properties = {
    width: { get: (o) => o.width(), set: (o, v) => o.setWidth(v), type: 'number' },
    height: { get: (o) => o.height(), set: (o, v) => o.setHeight(v), type: 'number' },
  };
  width() { return this._w; } height() { return this._h; }
  setWidth(v) { this._w = v; return this; } setHeight(v) { this._h = v; return this; }
  isValid() { return this._w >= 0 && this._h >= 0; }
  isEmpty() { return this._w <= 0 || this._h <= 0; }
  expandedTo(s) { return new QSize(Math.max(this._w, s.width()), Math.max(this._h, s.height())); }
  boundedTo(s) { return new QSize(Math.min(this._w, s.width()), Math.min(this._h, s.height())); }
  clone() { return new QSize(this._w, this._h); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QSize.foo(self, …)) ──
  static setWidth(self, v) { return self.setWidth(v); }
  static setHeight(self, v) { return self.setHeight(v); }
}
class QSizeF extends QSize { static of(w, h) { return new QSizeF(w, h); } static create(w, h) { return new QSizeF(w, h); } }

class QMargins {
  constructor(l = 0, t = 0, r = 0, b = 0) { this._l = l; this._t = t; this._r = r; this._b = b; }
  static of(l, t, r, b) { return new QMargins(l, t, r, b); }
  static create(l, t, r, b) { return new QMargins(l, t, r, b); }
  static all(v) { return new QMargins(v, v, v, v); }
  static left(m) { return m.left(); } static top(m) { return m.top(); } static right(m) { return m.right(); } static bottom(m) { return m.bottom(); }
  static isNull(m) { return m.isNull(); }
  static properties = {
    left: { get: (o) => o.left(), type: 'number' },
    top: { get: (o) => o.top(), type: 'number' },
    right: { get: (o) => o.right(), type: 'number' },
    bottom: { get: (o) => o.bottom(), type: 'number' },
  };
  left() { return this._l; } top() { return this._t; } right() { return this._r; } bottom() { return this._b; }
  isNull() { return !this._l && !this._t && !this._r && !this._b; }
}

class QRect {
  constructor(x = 0, y = 0, w = 0, h = 0) { this._x = x; this._y = y; this._w = w; this._h = h; }
  static of(x, y, w, h) { return new QRect(x, y, w, h); }
  static create(x, y, w, h) { return new QRect(x, y, w, h); }
  static fromTopLeft(point, size) { return new QRect(point.x(), point.y(), size.width(), size.height()); }
  static fromCoords(x1, y1, x2, y2) { return new QRect(x1, y1, x2 - x1, y2 - y1); }
  // static-first: lustra metod instancji.
  static left(r) { return r.left(); } static top(r) { return r.top(); } static right(r) { return r.right(); } static bottom(r) { return r.bottom(); }
  static width(r) { return r.width(); } static height(r) { return r.height(); }
  static center(r) { return r.center(); } static size(r) { return r.size(); }
  static topLeft(r) { return r.topLeft(); } static topRight(r) { return r.topRight(); } static bottomLeft(r) { return r.bottomLeft(); } static bottomRight(r) { return r.bottomRight(); }
  static contains(r, p, py) { return r.contains(p, py); }
  static intersects(a, b) { return a.intersects(b); } static intersected(a, b) { return a.intersected(b); }
  static adjusted(r, dl, dt, dr, db) { return r.adjusted(dl, dt, dr, db); }
  static marginsRemoved(r, m) { return r.marginsRemoved(m); } static marginsAdded(r, m) { return r.marginsAdded(m); }
  static translated(r, dx, dy) { return r.translated(dx, dy); }
  static isNull(r) { return r.isNull(); } static isValid(r) { return r.isValid(); } static clone(r) { return r.clone(); }
  static properties = {
    x: { get: (o) => o.x(), set: (o, v) => o.setX(v), type: 'number' },
    y: { get: (o) => o.y(), set: (o, v) => o.setY(v), type: 'number' },
    width: { get: (o) => o.width(), set: (o, v) => o.setWidth(v), type: 'number' },
    height: { get: (o) => o.height(), set: (o, v) => o.setHeight(v), type: 'number' },
    left: { get: (o) => o.left(), type: 'number' },
    top: { get: (o) => o.top(), type: 'number' },
    right: { get: (o) => o.right(), type: 'number' },
    bottom: { get: (o) => o.bottom(), type: 'number' },
  };
  x() { return this._x; } y() { return this._y; }
  left() { return this._x; } top() { return this._y; }
  right() { return this._x + this._w; } bottom() { return this._y + this._h; }
  width() { return this._w; } height() { return this._h; }
  setX(v) { this._x = v; return this; } setY(v) { this._y = v; return this; }
  setWidth(v) { this._w = v; return this; } setHeight(v) { this._h = v; return this; }
  setRect(x, y, w, h) { this._x = x; this._y = y; this._w = w; this._h = h; return this; }
  topLeft() { return new QPoint(this._x, this._y); }
  topRight() { return new QPoint(this.right(), this._y); }
  bottomLeft() { return new QPoint(this._x, this.bottom()); }
  bottomRight() { return new QPoint(this.right(), this.bottom()); }
  size() { return new QSize(this._w, this._h); }
  center() { return new QPoint(this._x + this._w / 2, this._y + this._h / 2); }
  contains(p, py) { const x = py === undefined ? p.x() : p, y = py === undefined ? p.y() : py; return x >= this._x && x <= this.right() && y >= this._y && y <= this.bottom(); }
  intersects(r) { return !(r.left() > this.right() || r.right() < this._x || r.top() > this.bottom() || r.bottom() < this._y); }
  intersected(r) { const x1 = Math.max(this._x, r.left()), y1 = Math.max(this._y, r.top()), x2 = Math.min(this.right(), r.right()), y2 = Math.min(this.bottom(), r.bottom()); return QRect.fromCoords(x1, y1, Math.max(x1, x2), Math.max(y1, y2)); }
  adjusted(dl, dt, dr, db) { return new QRect(this._x + dl, this._y + dt, this._w - dl + dr, this._h - dt + db); }
  marginsRemoved(m) { return this.adjusted(m.left(), m.top(), -m.right(), -m.bottom()); }
  marginsAdded(m) { return this.adjusted(-m.left(), -m.top(), m.right(), m.bottom()); }
  translated(dx, dy) { return new QRect(this._x + dx, this._y + dy, this._w, this._h); }
  isNull() { return this._w === 0 && this._h === 0; }
  isValid() { return this._w > 0 && this._h > 0; }
  clone() { return new QRect(this._x, this._y, this._w, this._h); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QRect.foo(self, …)) ──
  static x(self) { return self.x(); }
  static y(self) { return self.y(); }
  static setX(self, v) { return self.setX(v); }
  static setY(self, v) { return self.setY(v); }
  static setWidth(self, v) { return self.setWidth(v); }
  static setHeight(self, v) { return self.setHeight(v); }
  static setRect(self, x, y, w, h) { return self.setRect(x, y, w, h); }
}
class QRectF extends QRect { static of(x, y, w, h) { return new QRectF(x, y, w, h); } static create(x, y, w, h) { return new QRectF(x, y, w, h); } }

class QLine {
  constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0) { this._x1 = x1; this._y1 = y1; this._x2 = x2; this._y2 = y2; }
  static of(x1, y1, x2, y2) { return new QLine(x1, y1, x2, y2); }
  static create(x1, y1, x2, y2) { return new QLine(x1, y1, x2, y2); }
  static fromPoints(a, b) { return new QLine(a.x(), a.y(), b.x(), b.y()); }
  static p1(l) { return l.p1(); } static p2(l) { return l.p2(); }
  static dx(l) { return l.dx(); } static dy(l) { return l.dy(); }
  static length(l) { return l.length(); } static angle(l) { return l.angle(); } static center(l) { return l.center(); }
  p1() { return new QPoint(this._x1, this._y1); } p2() { return new QPoint(this._x2, this._y2); }
  x1() { return this._x1; } y1() { return this._y1; } x2() { return this._x2; } y2() { return this._y2; }
  dx() { return this._x2 - this._x1; } dy() { return this._y2 - this._y1; }
  length() { return Math.hypot(this.dx(), this.dy()); }
  angle() { return (Math.atan2(-this.dy(), this.dx()) * 180 / Math.PI + 360) % 360; }
  center() { return new QPoint((this._x1 + this._x2) / 2, (this._y1 + this._y2) / 2); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QLine.foo(self, …)) ──
  static x1(self) { return self.x1(); }
  static y1(self) { return self.y1(); }
  static x2(self) { return self.x2(); }
  static y2(self) { return self.y2(); }
}
class QLineF extends QLine { static of(x1, y1, x2, y2) { return new QLineF(x1, y1, x2, y2); } static create(x1, y1, x2, y2) { return new QLineF(x1, y1, x2, y2); } }

class QPolygon {
  constructor(points = []) { this._pts = points.map((p) => (p instanceof QPoint ? p : QPoint.of(p.x, p.y))); }
  static of(...points) { return new QPolygon(points); }
  static create(points = []) { return new QPolygon(points); }
  static point(poly, i) { return poly.point(i); } static count(poly) { return poly.count(); } static points(poly) { return poly.points(); }
  static boundingRect(poly) { return poly.boundingRect(); }
  add(p) { this._pts.push(p instanceof QPoint ? p : QPoint.of(p.x, p.y)); return this; }
  point(i) { return this._pts[i]; } count() { return this._pts.length; } points() { return this._pts; }
  boundingRect() { if (!this._pts.length) return new QRect(); let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity; for (const p of this._pts) { minx = Math.min(minx, p.x()); miny = Math.min(miny, p.y()); maxx = Math.max(maxx, p.x()); maxy = Math.max(maxy, p.y()); } return QRect.fromCoords(minx, miny, maxx, maxy); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QPolygon.foo(self, …)) ──
  static add(self, p) { return self.add(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QColor + gradienty
// ═════════════════════════════════════════════════════════════════════════════
class QColor {
  constructor(r = 0, g = 0, b = 0, a = 255) { this._r = clamp(r | 0, 0, 255); this._g = clamp(g | 0, 0, 255); this._b = clamp(b | 0, 0, 255); this._a = clamp(a, 0, 255); }
  static fromRgb(r, g, b, a = 255) { return new QColor(r, g, b, a); }
  static fromRgbF(r, g, b, a = 1) { return new QColor(r * 255, g * 255, b * 255, a * 255); }
  static fromString(s) {
    if (s instanceof QColor) return s.clone();
    const c = String(s).trim().toLowerCase();
    if (QColor._named[c]) { const [r, g, b] = QColor._named[c]; return new QColor(r, g, b); }
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(c);
    if (hex) {
      let h = hex[1]; if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
      return new QColor(r, g, b, a);
    }
    return new QColor(0, 0, 0);
  }
  static fromHsv(h, s, v, a = 255) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return new QColor((r + m) * 255, (g + m) * 255, (b + m) * 255, a);
  }
  static fromHsl(h, s, l, a = 255) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return new QColor((r + m) * 255, (g + m) * 255, (b + m) * 255, a);
  }
  red() { return this._r; } green() { return this._g; } blue() { return this._b; } alpha() { return this._a; }
  redF() { return this._r / 255; } greenF() { return this._g / 255; } blueF() { return this._b / 255; } alphaF() { return this._a / 255; }
  name() { const h = (n) => n.toString(16).padStart(2, '0'); return `#${h(this._r)}${h(this._g)}${h(this._b)}`; }
  rgba() { return `rgba(${this._r},${this._g},${this._b},${(this._a / 255).toFixed(3)})`; }
  toHsv() { const r = this._r / 255, g = this._g / 255, b = this._b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return { h, s: mx ? d / mx : 0, v: mx }; }
  lighter(factor = 150) { const f = factor / 100; return QColor.fromRgb(this._r * f, this._g * f, this._b * f, this._a); }
  darker(factor = 200) { const f = 100 / factor; return QColor.fromRgb(this._r * f, this._g * f, this._b * f, this._a); }
  withAlpha(a) { return new QColor(this._r, this._g, this._b, a); }
  static blend(a, b, t) { return new QColor(lerp(a.red(), b.red(), t), lerp(a.green(), b.green(), t), lerp(a.blue(), b.blue(), t), lerp(a.alpha(), b.alpha(), t)); }
  static create(r, g, b, a = 255) { return new QColor(r, g, b, a); }
  // static-first: lustra metod instancji.
  static red(c) { return c.red(); } static green(c) { return c.green(); } static blue(c) { return c.blue(); } static alpha(c) { return c.alpha(); }
  static name(c) { return c.name(); } static rgba(c) { return c.rgba(); } static toHsv(c) { return c.toHsv(); }
  static lighter(c, f = 150) { return c.lighter(f); } static darker(c, f = 200) { return c.darker(f); }
  static withAlpha(c, a) { return c.withAlpha(a); } static clone(c) { return c.clone(); }
  clone() { return new QColor(this._r, this._g, this._b, this._a); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QColor.foo(self, …)) ──
  static redF(self) { return self.redF(); }
  static greenF(self) { return self.greenF(); }
  static blueF(self) { return self.blueF(); }
  static alphaF(self) { return self.alphaF(); }
  static properties = {
    red: { get: (o) => o.red(), type: 'number' },
    green: { get: (o) => o.green(), type: 'number' },
    blue: { get: (o) => o.blue(), type: 'number' },
    alpha: { get: (o) => o.alpha(), type: 'number' },
    name: { get: (o) => o.name(), type: 'string' },
    rgba: { get: (o) => o.rgba(), type: 'string' },
  };
}
QColor._named = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], darkred: [128, 0, 0], green: [0, 128, 0], darkgreen: [0, 100, 0],
  blue: [0, 0, 255], darkblue: [0, 0, 139], cyan: [0, 255, 255], magenta: [255, 0, 255], yellow: [255, 255, 0],
  gray: [128, 128, 128], grey: [128, 128, 128], darkgray: [169, 169, 169], lightgray: [211, 211, 211], orange: [255, 165, 0],
  purple: [128, 0, 128], pink: [255, 192, 203], brown: [165, 42, 42], transparent: [0, 0, 0],
};

class QGradient {
  constructor() { this._stops = []; }
  static create() { return new QGradient(); }
  static setColorAt(g, pos, color) { return g.setColorAt(pos, color); }
  setColorAt(pos, color) { this._stops.push([clamp(pos, 0, 1), color instanceof QColor ? color : QColor.fromString(color)]); this._stops.sort((a, b) => a[0] - b[0]); return this; }
  _build(ctx, grad) { for (const [p, c] of this._stops) grad.addColorStop(p, c.rgba()); return grad; }
}
class QLinearGradient extends QGradient {
  constructor(x1, y1, x2, y2) { super(); this._x1 = x1; this._y1 = y1; this._x2 = x2; this._y2 = y2; }
  static of(x1, y1, x2, y2) { return new QLinearGradient(x1, y1, x2, y2); }
  static create(x1, y1, x2, y2) { return new QLinearGradient(x1, y1, x2, y2); }
  _toCanvas(ctx) { return this._build(ctx, ctx.createLinearGradient(this._x1, this._y1, this._x2, this._y2)); }
}
class QRadialGradient extends QGradient {
  constructor(cx, cy, radius, fx = cx, fy = cy) { super(); this._cx = cx; this._cy = cy; this._r = radius; this._fx = fx; this._fy = fy; }
  static of(cx, cy, radius) { return new QRadialGradient(cx, cy, radius); }
  static create(cx, cy, radius) { return new QRadialGradient(cx, cy, radius); }
  _toCanvas(ctx) { return this._build(ctx, ctx.createRadialGradient(this._fx, this._fy, 0, this._cx, this._cy, this._r)); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QFont + QFontMetrics
// ═════════════════════════════════════════════════════════════════════════════
class QFont {
  constructor(family = 'system-ui, sans-serif', pixelSize = 14, weight = 400) { this._family = family; this._size = pixelSize; this._weight = weight; this._italic = false; this._underline = false; }
  static of(family, pixelSize, weight = 400) { return new QFont(family, pixelSize, weight); }
  static create(family, pixelSize, weight = 400) { return new QFont(family, pixelSize, weight); }
  // static-first: lustra metod instancji.
  static family(f) { return f.family(); } static pixelSize(f) { return f.pixelSize(); } static pointSize(f) { return f.pointSize(); } static weight(f) { return f.weight(); }
  static bold(f) { return f.bold(); } static italic(f) { return f.italic(); } static underline(f) { return f.underline(); }
  static toCss(f) { return f.toCss(); } static clone(f) { return f.clone(); }
  family() { return this._family; } pixelSize() { return this._size; } pointSize() { return Math.round(this._size * 0.75); } weight() { return this._weight; }
  bold() { return this._weight >= 600; } italic() { return this._italic; } underline() { return this._underline; }
  setFamily(v) { this._family = v; return this; } setPixelSize(v) { this._size = v; return this; } setPointSize(v) { this._size = Math.round(v / 0.75); return this; }
  setWeight(w) { this._weight = w; return this; } setBold(b) { this._weight = b ? 700 : 400; return this; } setItalic(b) { this._italic = b; return this; } setUnderline(b) { this._underline = b; return this; }
  toCss() { return `${this._italic ? 'italic ' : ''}${this._weight} ${this._size}px ${this._family}`; }
  clone() { const f = new QFont(this._family, this._size, this._weight); f._italic = this._italic; f._underline = this._underline; return f; }
  static properties = {
    family: { get: (o) => o.family(), set: (o, v) => o.setFamily(v), type: 'string' },
    pixelSize: { get: (o) => o.pixelSize(), set: (o, v) => o.setPixelSize(v), type: 'number' },
    pointSize: { get: (o) => o.pointSize(), set: (o, v) => o.setPointSize(v), type: 'number' },
    weight: { get: (o) => o.weight(), set: (o, v) => o.setWeight(v), type: 'number' },
    bold: { get: (o) => o.bold(), set: (o, v) => o.setBold(v), type: 'bool' },
    italic: { get: (o) => o.italic(), set: (o, v) => o.setItalic(v), type: 'bool' },
    underline: { get: (o) => o.underline(), set: (o, v) => o.setUnderline(v), type: 'bool' },
  };

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QFont.foo(self, …)) ──
  static setFamily(self, v) { return self.setFamily(v); }
  static setPixelSize(self, v) { return self.setPixelSize(v); }
  static setPointSize(self, v) { return self.setPointSize(v); }
  static setWeight(self, w) { return self.setWeight(w); }
  static setBold(self, b) { return self.setBold(b); }
  static setItalic(self, b) { return self.setItalic(b); }
  static setUnderline(self, b) { return self.setUnderline(b); }
}
class QFontMetrics {
  constructor(font) { this._font = font; }
  static of(font) { return new QFontMetrics(font); }
  static create(font) { return new QFontMetrics(font); }
  // static-first: lustra metod instancji.
  static horizontalAdvance(fm, text) { return fm.horizontalAdvance(text); } static width(fm, text) { return fm.width(text); }
  static height(fm) { return fm.height(); } static ascent(fm) { return fm.ascent(); } static descent(fm) { return fm.descent(); }
  static boundingRect(fm, text) { return fm.boundingRect(text); }
  static elidedText(fm, text, mode, widthPx) { return fm.elidedText(text, mode, widthPx); }
  horizontalAdvance(text) { _measureCtx.font = this._font.toCss(); return _measureCtx.measureText(String(text)).width; }
  width(text) { return this.horizontalAdvance(text); }
  height() { return Math.ceil(this._font.pixelSize() * 1.3); }
  ascent() { return Math.ceil(this._font.pixelSize() * 0.8); }
  descent() { return Math.ceil(this._font.pixelSize() * 0.25); }
  boundingRect(text) { return new QRect(0, 0, Math.ceil(this.horizontalAdvance(text)), this.height()); }
  elidedText(text, mode, widthPx) {
    text = String(text); if (this.horizontalAdvance(text) <= widthPx) return text;
    const ell = '…';
    if (mode === Qt.ElideRight) { let s = text; while (s.length && this.horizontalAdvance(s + ell) > widthPx) s = s.slice(0, -1); return s + ell; }
    if (mode === Qt.ElideLeft) { let s = text; while (s.length && this.horizontalAdvance(ell + s) > widthPx) s = s.slice(1); return ell + s; }
    let l = text, r = ''; let i = 0;
    while (this.horizontalAdvance(l + ell + r) > widthPx && (l.length || r.length)) { if (i++ % 2) r = text.slice(text.length - r.length - 1); else l = l.slice(0, -1); }
    return l + ell + r;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QPen, QBrush
// ═════════════════════════════════════════════════════════════════════════════
class QPen {
  constructor(color = new QColor(0, 0, 0), width = 1, style = Qt.SolidLine) { this._color = color instanceof QColor ? color : QColor.fromString(color); this._width = width; this._style = style; this._cap = Qt.RoundCap; this._join = Qt.RoundJoin; }
  static of(color, width = 1, style = Qt.SolidLine) { return new QPen(color instanceof QColor ? color : QColor.fromString(color), width, style); }
  static create(color, width = 1, style = Qt.SolidLine) { return QPen.of(color, width, style); }
  static color(p) { return p.color(); } static width(p) { return p.width(); } static style(p) { return p.style(); } static capStyle(p) { return p.capStyle(); } static joinStyle(p) { return p.joinStyle(); }
  color() { return this._color; } width() { return this._width; } style() { return this._style; } capStyle() { return this._cap; } joinStyle() { return this._join; }
  setColor(c) { this._color = c instanceof QColor ? c : QColor.fromString(c); return this; }
  setWidth(w) { this._width = w; return this; } setStyle(s) { this._style = s; return this; } setCapStyle(c) { this._cap = c; return this; } setJoinStyle(j) { this._join = j; return this; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QPen.foo(self, …)) ──
  static setColor(self, c) { return self.setColor(c); }
  static setWidth(self, w) { return self.setWidth(w); }
  static setStyle(self, s) { return self.setStyle(s); }
  static setCapStyle(self, c) { return self.setCapStyle(c); }
  static setJoinStyle(self, j) { return self.setJoinStyle(j); }
  static properties = {
    color: { get: (o) => o.color(), set: (o, v) => o.setColor(v), type: 'QColor' },
    width: { get: (o) => o.width(), set: (o, v) => o.setWidth(v), type: 'number' },
    style: { get: (o) => o.style(), set: (o, v) => o.setStyle(v), type: 'number' },
    capStyle: { get: (o) => o.capStyle(), set: (o, v) => o.setCapStyle(v), type: 'number' },
    joinStyle: { get: (o) => o.joinStyle(), set: (o, v) => o.setJoinStyle(v), type: 'number' },
  };
}
class QBrush {
  constructor(color = new QColor(0, 0, 0), style = Qt.SolidPattern) { this._color = color instanceof QColor ? color : color instanceof QGradient ? color : QColor.fromString(color); this._style = color instanceof QGradient ? Qt.LinearGradientPattern : style; this._gradient = color instanceof QGradient ? color : null; }
  static of(color) { return new QBrush(color instanceof QColor || color instanceof QGradient ? color : QColor.fromString(color)); }
  static create(color) { return QBrush.of(color); }
  static color(b) { return b.color(); } static gradient(b) { return b.gradient(); } static style(b) { return b.style(); }
  color() { return this._color instanceof QColor ? this._color : new QColor(0, 0, 0); }
  gradient() { return this._gradient; }
  style() { return this._style; }
  setColor(c) { this._color = c instanceof QColor ? c : QColor.fromString(c); this._gradient = null; this._style = Qt.SolidPattern; return this; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QBrush.foo(self, …)) ──
  static setColor(self, c) { return self.setColor(c); }
  static properties = {
    color: { get: (o) => o.color(), set: (o, v) => o.setColor(v), type: 'QColor' },
    style: { get: (o) => o.style(), type: 'number' },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  QPainterPath
// ═════════════════════════════════════════════════════════════════════════════
class QPainterPath {
  constructor() { this._ops = []; }
  static of() { return new QPainterPath(); }
  static create() { return new QPainterPath(); }
  // static-first: lustra metod instancji (zwracają tę samą ścieżkę — łańcuchowo).
  static moveTo(p, x, y) { return p.moveTo(x, y); } static lineTo(p, x, y) { return p.lineTo(x, y); }
  static cubicTo(p, c1x, c1y, c2x, c2y, ex, ey) { return p.cubicTo(c1x, c1y, c2x, c2y, ex, ey); }
  static quadTo(p, cx, cy, ex, ey) { return p.quadTo(cx, cy, ex, ey); }
  static arcTo(p, rect, startAngle, sweep) { return p.arcTo(rect, startAngle, sweep); }
  static addRect(p, r) { return p.addRect(r); } static addEllipse(p, r) { return p.addEllipse(r); }
  static closeSubpath(p) { return p.closeSubpath(); }
  moveTo(x, y) { this._ops.push(['M', x, y]); return this; }
  lineTo(x, y) { this._ops.push(['L', x, y]); return this; }
  cubicTo(c1x, c1y, c2x, c2y, ex, ey) { this._ops.push(['C', c1x, c1y, c2x, c2y, ex, ey]); return this; }
  quadTo(cx, cy, ex, ey) { this._ops.push(['Q', cx, cy, ex, ey]); return this; }
  arcTo(rect, startAngle, sweep) { this._ops.push(['A', rect, startAngle, sweep]); return this; }
  addRect(r) { this.moveTo(r.left(), r.top()).lineTo(r.right(), r.top()).lineTo(r.right(), r.bottom()).lineTo(r.left(), r.bottom()).closeSubpath(); return this; }
  addEllipse(r) { this._ops.push(['E', r]); return this; }
  closeSubpath() { this._ops.push(['Z']); return this; }
  _toPath2D() {
    const p = new Path2D();
    for (const op of this._ops) {
      if (op[0] === 'M') p.moveTo(op[1], op[2]);
      else if (op[0] === 'L') p.lineTo(op[1], op[2]);
      else if (op[0] === 'C') p.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
      else if (op[0] === 'Q') p.quadraticCurveTo(op[1], op[2], op[3], op[4]);
      else if (op[0] === 'E') { const r = op[1]; p.ellipse(r.center().x(), r.center().y(), r.width() / 2, r.height() / 2, 0, 0, Math.PI * 2); }
      else if (op[0] === 'A') { const r = op[1]; p.ellipse(r.center().x(), r.center().y(), r.width() / 2, r.height() / 2, 0, -op[2] * Math.PI / 180, -(op[2] + op[3]) * Math.PI / 180, op[3] > 0); }
      else if (op[0] === 'Z') p.closePath();
    }
    return p;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Klasy zdarzeń (QEvent + pochodne) — z accept()/ignore()
// ═════════════════════════════════════════════════════════════════════════════
class QEvent {
  constructor(type) { this._type = type; this._accepted = true; }
  static of(type) { return new QEvent(type); }
  static create(type) { return new QEvent(type); }
  static type(e) { return e.type(); } static isAccepted(e) { return e.isAccepted(); }
  type() { return this._type; } accept() { this._accepted = true; } ignore() { this._accepted = false; } isAccepted() { return this._accepted; } setAccepted(a) { this._accepted = a; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QEvent.foo(self, …)) ──
  static accept(self) { return self.accept(); }
  static ignore(self) { return self.ignore(); }
  static setAccepted(self, a) { return self.setAccepted(a); }
}
QEvent.MouseButtonPress = 2; QEvent.MouseButtonRelease = 3; QEvent.MouseButtonDblClick = 4; QEvent.MouseMove = 5;
QEvent.KeyPress = 6; QEvent.KeyRelease = 7; QEvent.Enter = 10; QEvent.Leave = 11; QEvent.FocusIn = 8; QEvent.FocusOut = 9;
QEvent.Paint = 12; QEvent.Resize = 14; QEvent.Wheel = 31; QEvent.TabletPress = 92; QEvent.TabletMove = 87; QEvent.TabletRelease = 93; QEvent.ContextMenu = 82;

class QInputEvent extends QEvent { modifiers() { return this._mods || Qt.NoModifier; } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QInputEvent.foo(self, …)) ──
  static modifiers(self) { return self.modifiers(); }
}
class QMouseEvent extends QInputEvent {
  constructor(type, pos, globalPos, button, buttons, mods, extra = {}) {
    super(type); this._pos = pos; this._gpos = globalPos; this._button = button; this._buttons = buttons; this._mods = mods;
    this._pressure = extra.pressure ?? 0.5; this._tiltX = extra.tiltX ?? 0; this._tiltY = extra.tiltY ?? 0; this._pType = extra.pointerType ?? 'mouse';
  }
  static of(type, pos, globalPos, button, buttons, mods, extra = {}) { return new QMouseEvent(type, pos, globalPos, button, buttons, mods, extra); }
  static create(type, pos, globalPos, button, buttons, mods, extra = {}) { return new QMouseEvent(type, pos, globalPos, button, buttons, mods, extra); }
  pos() { return this._pos; } position() { return this._pos; } x() { return this._pos.x(); } y() { return this._pos.y(); }
  globalPos() { return this._gpos; } globalPosition() { return this._gpos; }
  button() { return this._button; } buttons() { return this._buttons; }
  pressure() { return this._pressure; } xTilt() { return this._tiltX; } yTilt() { return this._tiltY; } pointerType() { return this._pType; }
  _withPos(p) { return new QMouseEvent(this._type, p, this._gpos, this._button, this._buttons, this._mods, { pressure: this._pressure, tiltX: this._tiltX, tiltY: this._tiltY, pointerType: this._pType }); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QMouseEvent.foo(self, …)) ──
  static pos(self) { return self.pos(); }
  static position(self) { return self.position(); }
  static x(self) { return self.x(); }
  static y(self) { return self.y(); }
  static globalPos(self) { return self.globalPos(); }
  static globalPosition(self) { return self.globalPosition(); }
  static button(self) { return self.button(); }
  static buttons(self) { return self.buttons(); }
  static pressure(self) { return self.pressure(); }
  static xTilt(self) { return self.xTilt(); }
  static yTilt(self) { return self.yTilt(); }
  static pointerType(self) { return self.pointerType(); }
}
class QTabletEvent extends QInputEvent {
  constructor(type, pos, globalPos, pressure, tiltX, tiltY, pointerType, mods) {
    super(type); this._pos = pos; this._gpos = globalPos; this._pressure = pressure; this._tiltX = tiltX; this._tiltY = tiltY; this._pType = pointerType; this._mods = mods;
  }
  static of(type, pos, globalPos, pressure, tiltX, tiltY, pointerType, mods) { return new QTabletEvent(type, pos, globalPos, pressure, tiltX, tiltY, pointerType, mods); }
  static create(type, pos, globalPos, pressure, tiltX, tiltY, pointerType, mods) { return new QTabletEvent(type, pos, globalPos, pressure, tiltX, tiltY, pointerType, mods); }
  pos() { return this._pos; } position() { return this._pos; } globalPos() { return this._gpos; }
  pressure() { return this._pressure; } xTilt() { return this._tiltX; } yTilt() { return this._tiltY; }
  pointerType() { return this._pType; }
  _withPos(p) { return new QTabletEvent(this._type, p, this._gpos, this._pressure, this._tiltX, this._tiltY, this._pType, this._mods); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QTabletEvent.foo(self, …)) ──
  static pos(self) { return self.pos(); }
  static position(self) { return self.position(); }
  static globalPos(self) { return self.globalPos(); }
  static pressure(self) { return self.pressure(); }
  static xTilt(self) { return self.xTilt(); }
  static yTilt(self) { return self.yTilt(); }
  static pointerType(self) { return self.pointerType(); }
}
class QKeyEvent extends QInputEvent { constructor(type, key, text, mods) { super(type); this._key = key; this._text = text; this._mods = mods; } static of(type, key, text, mods) { return new QKeyEvent(type, key, text, mods); } static create(type, key, text, mods) { return new QKeyEvent(type, key, text, mods); } key() { return this._key; } text() { return this._text; } matches(k) { return this._key === k; } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QKeyEvent.foo(self, …)) ──
  static key(self) { return self.key(); }
  static text(self) { return self.text(); }
  static matches(self, k) { return self.matches(k); }
}
class QWheelEvent extends QInputEvent { constructor(pos, angleDelta, pixelDelta, mods) { super(QEvent.Wheel); this._pos = pos; this._angle = angleDelta; this._pixel = pixelDelta; this._mods = mods; } static of(pos, angleDelta, pixelDelta, mods) { return new QWheelEvent(pos, angleDelta, pixelDelta, mods); } static create(pos, angleDelta, pixelDelta, mods) { return new QWheelEvent(pos, angleDelta, pixelDelta, mods); } pos() { return this._pos; } position() { return this._pos; } angleDelta() { return this._angle; } pixelDelta() { return this._pixel; } _withPos(p) { return new QWheelEvent(p, this._angle, this._pixel, this._mods); } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QWheelEvent.foo(self, …)) ──
  static pos(self) { return self.pos(); }
  static position(self) { return self.position(); }
  static angleDelta(self) { return self.angleDelta(); }
  static pixelDelta(self) { return self.pixelDelta(); }
}
class QResizeEvent extends QEvent { constructor(size, oldSize) { super(QEvent.Resize); this._size = size; this._old = oldSize; } static of(size, oldSize) { return new QResizeEvent(size, oldSize); } static create(size, oldSize) { return new QResizeEvent(size, oldSize); } size() { return this._size; } oldSize() { return this._old; } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QResizeEvent.foo(self, …)) ──
  static size(self) { return self.size(); }
  static oldSize(self) { return self.oldSize(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QPainter — bogata warstwa nad CanvasRenderingContext2D w stylu Qt
// ═════════════════════════════════════════════════════════════════════════════
class QPainter {
  constructor(ctx) { this._ctx = ctx; this._pen = new QPen(new QColor(0, 0, 0), 1); this._brush = new QBrush(Qt.transparent); this._font = new QFont(); }
  static of(ctx) { return new QPainter(ctx); }
  static create(ctx) { return new QPainter(ctx); }
  device() { return this._ctx.canvas; }
  save() { this._ctx.save(); return this; }
  restore() { this._ctx.restore(); return this; }
  translate(x, y) { this._ctx.translate(x instanceof QPoint ? x.x() : x, x instanceof QPoint ? x.y() : y); return this; }
  rotate(deg) { this._ctx.rotate(deg * Math.PI / 180); return this; }
  scale(sx, sy = sx) { this._ctx.scale(sx, sy); return this; }
  setOpacity(o) { this._ctx.globalAlpha = o; return this; }
  opacity() { return this._ctx.globalAlpha; }
  setRenderHint(_hint, on = true) { this._ctx.imageSmoothingEnabled = on; return this; }
  setClipRect(r) { this._ctx.beginPath(); this._ctx.rect(r.x(), r.y(), r.width(), r.height()); this._ctx.clip(); return this; }
  setClipPath(path) { this._ctx.clip(path._toPath2D()); return this; }
  setPen(p) { this._pen = p instanceof QPen ? p : QPen.of(p); return this; }
  setBrush(b) { this._brush = b instanceof QBrush ? b : QBrush.of(b); return this; }
  setFont(f) { this._font = f; return this; }
  pen() { return this._pen; } brush() { return this._brush; } font() { return this._font; }
  fontMetrics() { return new QFontMetrics(this._font); }

  _fillStyle(brush) { const b = brush || this._brush; if (b._gradient) return b._gradient._toCanvas(this._ctx); return b.color().rgba(); }
  _applyStroke() {
    const c = this._ctx; c.strokeStyle = this._pen.color().rgba(); c.lineWidth = this._pen.width();
    c.setLineDash(Qt._dash(this._pen.style(), this._pen.width()));
    c.lineCap = this._pen.capStyle() === Qt.RoundCap ? 'round' : this._pen.capStyle() === Qt.SquareCap ? 'square' : 'butt';
    c.lineJoin = this._pen.joinStyle() === Qt.RoundJoin ? 'round' : this._pen.joinStyle() === Qt.BevelJoin ? 'bevel' : 'miter';
  }
  _applyFill() { this._ctx.fillStyle = this._fillStyle(); }

  fillRect(r, color) { this._ctx.fillStyle = color instanceof QColor ? color.rgba() : color instanceof QBrush ? this._fillStyle(color) : color ? QColor.fromString(color).rgba() : this._fillStyle(); this._ctx.fillRect(r.x(), r.y(), r.width(), r.height()); return this; }
  drawRect(r) { if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); this._ctx.fillRect(r.x(), r.y(), r.width(), r.height()); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); this._ctx.strokeRect(r.x(), r.y(), r.width(), r.height()); } return this; }
  _roundedPath(r, rad) { const c = this._ctx, x = r.x(), y = r.y(), w = r.width(), h = r.height(), rr = Math.max(0, Math.min(rad, w / 2, h / 2)); c.beginPath(); c.moveTo(x + rr, y); c.arcTo(x + w, y, x + w, y + h, rr); c.arcTo(x + w, y + h, x, y + h, rr); c.arcTo(x, y + h, x, y, rr); c.arcTo(x, y, x + w, y, rr); c.closePath(); }
  drawRoundedRect(r, rx, ry = rx) { this._roundedPath(r, rx); if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); this._ctx.fill(); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); this._ctx.stroke(); } return this; }
  fillRoundedRect(r, rad, color) { this._roundedPath(r, rad); this._ctx.fillStyle = color instanceof QColor ? color.rgba() : color instanceof QBrush ? this._fillStyle(color) : QColor.fromString(color).rgba(); this._ctx.fill(); return this; }
  drawLine(a, b, c, d) { this._applyStroke(); const ctx = this._ctx; ctx.beginPath(); if (a instanceof QLine) { ctx.moveTo(a.x1(), a.y1()); ctx.lineTo(a.x2(), a.y2()); } else if (a instanceof QPoint) { ctx.moveTo(a.x(), a.y()); ctx.lineTo(b.x(), b.y()); } else { ctx.moveTo(a, b); ctx.lineTo(c, d); } ctx.stroke(); return this; }
  drawPolyline(poly) { this._applyStroke(); const ctx = this._ctx, pts = poly.points ? poly.points() : poly; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x(), p.y()) : ctx.moveTo(p.x(), p.y()))); ctx.stroke(); return this; }
  drawPolygon(poly) { const ctx = this._ctx, pts = poly.points ? poly.points() : poly; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x(), p.y()) : ctx.moveTo(p.x(), p.y()))); ctx.closePath(); if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); ctx.fill(); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); ctx.stroke(); } return this; }
  drawEllipse(r) { const ctx = this._ctx; ctx.beginPath(); ctx.ellipse(r.center().x(), r.center().y(), r.width() / 2, r.height() / 2, 0, 0, Math.PI * 2); if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); ctx.fill(); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); ctx.stroke(); } return this; }
  drawArc(r, startAngle, spanAngle) { const ctx = this._ctx; ctx.beginPath(); ctx.ellipse(r.center().x(), r.center().y(), r.width() / 2, r.height() / 2, 0, -startAngle * Math.PI / 180, -(startAngle + spanAngle) * Math.PI / 180, spanAngle > 0); this._applyStroke(); ctx.stroke(); return this; }
  drawPie(r, startAngle, spanAngle) { const ctx = this._ctx, c = r.center(); ctx.beginPath(); ctx.moveTo(c.x(), c.y()); ctx.ellipse(c.x(), c.y(), r.width() / 2, r.height() / 2, 0, -startAngle * Math.PI / 180, -(startAngle + spanAngle) * Math.PI / 180, spanAngle > 0); ctx.closePath(); if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); ctx.fill(); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); ctx.stroke(); } return this; }
  drawPath(path) { const p2 = path._toPath2D(); if (this._brush.style() !== Qt.NoBrush) { this._applyFill(); this._ctx.fill(p2); } if (this._pen.style() !== Qt.NoPen) { this._applyStroke(); this._ctx.stroke(p2); } return this; }
  drawImage(target, image) { const r = target instanceof QRect ? target : new QRect(target.x(), target.y(), image.width, image.height); try { this._ctx.drawImage(image, r.x(), r.y(), r.width(), r.height()); } catch (e) {} return this; }
  drawPixmap(target, image) { return this.drawImage(target, image); }
  drawText(rect, flagsOrText, maybeText) {
    const isPoint = rect instanceof QPoint;
    const flags = maybeText === undefined ? (isPoint ? 0 : Qt.AlignLeft | Qt.AlignTop) : flagsOrText;
    const text = maybeText === undefined ? flagsOrText : maybeText;
    const c = this._ctx; c.font = this._font.toCss(); c.fillStyle = this._pen.color().rgba(); c.textAlign = 'left';
    if (isPoint) { c.textBaseline = 'alphabetic'; c.fillText(String(text), rect.x(), rect.y()); return this; }
    const tw = c.measureText(String(text)).width;
    let x = rect.left();
    if (flags & Qt.AlignHCenter) x = rect.left() + (rect.width() - tw) / 2; else if (flags & Qt.AlignRight) x = rect.right() - tw;
    let y;
    if (flags & Qt.AlignVCenter) { c.textBaseline = 'middle'; y = rect.top() + rect.height() / 2; }
    else if (flags & Qt.AlignBottom) { c.textBaseline = 'bottom'; y = rect.bottom(); }
    else { c.textBaseline = 'top'; y = rect.top(); }
    c.fillText(String(text), x, y);
    if (this._font.underline()) { const uw = c.measureText(String(text)).width; c.strokeStyle = this._pen.color().rgba(); c.lineWidth = 1; c.beginPath(); const uy = (flags & Qt.AlignVCenter) ? y + this._font.pixelSize() * 0.4 : (flags & Qt.AlignBottom) ? y - 1 : y + this._font.pixelSize(); c.moveTo(x, uy); c.lineTo(x + uw, uy); c.stroke(); }
    return this;
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QPainter.foo(self, …)) ──
  static device(self) { return self.device(); }
  static save(self) { return self.save(); }
  static restore(self) { return self.restore(); }
  static translate(self, x, y) { return self.translate(x, y); }
  static rotate(self, deg) { return self.rotate(deg); }
  static scale(self, sx, sy = sx) { return self.scale(sx, sy); }
  static setOpacity(self, o) { return self.setOpacity(o); }
  static opacity(self) { return self.opacity(); }
  static setRenderHint(self, _hint, on = true) { return self.setRenderHint(_hint, on); }
  static setClipRect(self, r) { return self.setClipRect(r); }
  static setClipPath(self, path) { return self.setClipPath(path); }
  static setPen(self, p) { return self.setPen(p); }
  static setBrush(self, b) { return self.setBrush(b); }
  static setFont(self, f) { return self.setFont(f); }
  static pen(self) { return self.pen(); }
  static brush(self) { return self.brush(); }
  static font(self) { return self.font(); }
  static fontMetrics(self) { return self.fontMetrics(); }
  static fillRect(self, r, color) { return self.fillRect(r, color); }
  static drawRect(self, r) { return self.drawRect(r); }
  static drawRoundedRect(self, r, rx, ry = rx) { return self.drawRoundedRect(r, rx, ry); }
  static fillRoundedRect(self, r, rad, color) { return self.fillRoundedRect(r, rad, color); }
  static drawLine(self, a, b, c, d) { return self.drawLine(a, b, c, d); }
  static drawPolyline(self, poly) { return self.drawPolyline(poly); }
  static drawPolygon(self, poly) { return self.drawPolygon(poly); }
  static drawEllipse(self, r) { return self.drawEllipse(r); }
  static drawArc(self, r, startAngle, spanAngle) { return self.drawArc(r, startAngle, spanAngle); }
  static drawPie(self, r, startAngle, spanAngle) { return self.drawPie(r, startAngle, spanAngle); }
  static drawPath(self, path) { return self.drawPath(path); }
  static drawImage(self, target, image) { return self.drawImage(target, image); }
  static drawPixmap(self, target, image) { return self.drawPixmap(target, image); }
  static drawText(self, rect, flagsOrText, maybeText) { return self.drawText(rect, flagsOrText, maybeText); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QSizePolicy
// ═════════════════════════════════════════════════════════════════════════════
class QSizePolicy {
  constructor(h = QSizePolicy.Preferred, v = QSizePolicy.Preferred) { this._h = h; this._v = v; }
  static of(h = QSizePolicy.Preferred, v = QSizePolicy.Preferred) { return new QSizePolicy(h, v); }
  static create(h = QSizePolicy.Preferred, v = QSizePolicy.Preferred) { return new QSizePolicy(h, v); }
  static Fixed = 0; static Minimum = 1; static Maximum = 4; static Preferred = 5; static Expanding = 7; static MinimumExpanding = 3;
  horizontalPolicy() { return this._h; } verticalPolicy() { return this._v; }
  setHorizontalPolicy(p) { this._h = p; return this; } setVerticalPolicy(p) { this._v = p; return this; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QSizePolicy.foo(self, …)) ──
  static horizontalPolicy(self) { return self.horizontalPolicy(); }
  static verticalPolicy(self) { return self.verticalPolicy(); }
  static setHorizontalPolicy(self, p) { return self.setHorizontalPolicy(p); }
  static setVerticalPolicy(self, p) { return self.setVerticalPolicy(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QWidget — bazowy widget rysowany na canvasie
// ═════════════════════════════════════════════════════════════════════════════
class QWidget extends QObject {
  constructor(parent = null) {
    super();
    this._geom = new QRect(0, 0, 100, 30);
    this._visible = true; this._enabled = true;
    this._parent = null; this._children = []; this._layout = null;
    this._view = null;
    this._hovered = false; this._pressed = false; this._focus = false;
    this._margins = new QMargins(0, 0, 0, 0);
    this._font = new QFont();
    this._minSize = new QSize(0, 0); this._maxSize = new QSize(16777215, 16777215);
    this._sizePolicy = new QSizePolicy();
    this._toolTip = ''; this._cursor = Qt.ArrowCursor; this._mouseTracking = false; this._focusPolicy = Qt.NoFocus;
    if (parent) parent._addChild(this);
  }
  static create(parent) { return new QWidget(parent); }
  static properties = {
    geometry: { get: (o) => o.geometry(), set: (o, v) => o.setGeometry(v), type: 'QRect' },
    pos: { get: (o) => o.pos(), set: (o, v) => o.move(v), type: 'QPoint' },
    size: { get: (o) => o.size(), set: (o, v) => o.resize(v), type: 'QSize' },
    x: { get: (o) => o.x(), type: 'number' },
    y: { get: (o) => o.y(), type: 'number' },
    width: { get: (o) => o.width(), type: 'number' },
    height: { get: (o) => o.height(), type: 'number' },
    visible: { get: (o) => o.isVisible(), set: (o, v) => o.setVisible(v), type: 'bool' },
    enabled: { get: (o) => o.isEnabled(), set: (o, v) => o.setEnabled(v), type: 'bool' },
    toolTip: { get: (o) => o.toolTip(), set: (o, v) => o.setToolTip(v), type: 'string' },
    font: { get: (o) => o.font(), set: (o, v) => o.setFont(v), type: 'QFont' },
    cursor: { get: (o) => o.cursor(), set: (o, v) => o.setCursor(v), type: 'string' },
    focus: { get: (o) => o.hasFocus(), type: 'bool' },
    mouseTracking: { get: (o) => o.hasMouseTracking(), set: (o, v) => o.setMouseTracking(v), type: 'bool' },
  };

  geometry() { return this._geom; }
  setGeometry(r) { const old = this._geom.size(); this._geom = r instanceof QRect ? r : QRect.of(...arguments); this._relayout(); if (old.width() !== this._geom.width() || old.height() !== this._geom.height()) this.resizeEvent(new QResizeEvent(this._geom.size(), old)); this.update(); return this; }
  rect() { return new QRect(0, 0, this._geom.width(), this._geom.height()); }
  contentsRect() { return this.rect().marginsRemoved(this._margins); }
  x() { return this._geom.x(); } y() { return this._geom.y(); } width() { return this._geom.width(); } height() { return this._geom.height(); }
  pos() { return this._geom.topLeft(); } size() { return this._geom.size(); }
  move(x, y) { this._geom.setX(x instanceof QPoint ? x.x() : x).setY(x instanceof QPoint ? x.y() : y); this.update(); return this; }
  resize(w, h) { this.setGeometry(QRect.of(this.x(), this.y(), w instanceof QSize ? w.width() : w, w instanceof QSize ? w.height() : h)); return this; }
  setFixedSize(w, h) { const ww = w instanceof QSize ? w.width() : w, hh = w instanceof QSize ? w.height() : h; this._minSize = new QSize(ww, hh); this._maxSize = new QSize(ww, hh); this.resize(ww, hh); return this; }
  setFixedWidth(w) { this._minSize.setWidth(w); this._maxSize.setWidth(w); this.update(); return this; }
  setFixedHeight(h) { this._minSize.setHeight(h); this._maxSize.setHeight(h); this.update(); return this; }
  setMinimumSize(w, h) { this._minSize = new QSize(w, h); return this; } setMaximumSize(w, h) { this._maxSize = new QSize(w, h); return this; }
  minimumSize() { return this._minSize; } maximumSize() { return this._maxSize; }
  setContentsMargins(l, t, r, b) { this._margins = new QMargins(l, t, r, b); this._relayout(); return this; }
  contentsMargins() { return this._margins; }

  parentWidget() { return this._parent; }
  children() { return this._children; }
  _addChild(w) { w._parent = this; w._propagateView(this._view); this._children.push(w); this.update(); return w; }
  _propagateView(view) { this._view = view; for (const c of this._children) c._propagateView(view); }
  setParent(p) { if (this._parent) { const i = this._parent._children.indexOf(this); if (i >= 0) this._parent._children.splice(i, 1); } if (p) p._addChild(this); else { this._parent = null; this._propagateView(null); } return this; }
  setLayout(layout) { this._layout = layout; layout._parentWidget = this; this._relayout(); return this; }
  layout() { return this._layout; }

  isVisible() { return this._visible; }
  setVisible(v) { this._visible = !!v; if (this._parent) this._parent._relayout(); this.update(); return this; }
  show() { return this.setVisible(true); } hide() { return this.setVisible(false); }
  isEnabled() { return this._enabled; }
  setEnabled(e) { this._enabled = !!e; this.update(); return this; }
  hasFocus() { return this._focus; }
  setFocus() { if (this._view) this._view._setFocus(this); return this; }
  clearFocus() { if (this._view && this._view._focusWidget === this) this._view._setFocus(null); return this; }
  font() { return this._font; } setFont(f) { this._font = f; this.update(); return this; }
  fontMetrics() { return new QFontMetrics(this._font); }
  setToolTip(t) { this._toolTip = String(t); return this; } toolTip() { return this._toolTip; }
  setCursor(c) { this._cursor = c; return this; } cursor() { return this._cursor; }
  setMouseTracking(b) { this._mouseTracking = !!b; return this; } hasMouseTracking() { return this._mouseTracking; }
  setSizePolicy(h, v) { this._sizePolicy = h instanceof QSizePolicy ? h : new QSizePolicy(h, v); return this; } sizePolicy() { return this._sizePolicy; }
  setFocusPolicy(p) { this._focusPolicy = p; return this; }
  underMouse() { return this._hovered; }
  mapToGlobal(p) { const a = this._absPos(); return new QPoint(a.x() + p.x(), a.y() + p.y()); }
  mapFromGlobal(p) { const a = this._absPos(); return new QPoint(p.x() - a.x(), p.y() - a.y()); }
  raise() { if (this._parent) { const i = this._parent._children.indexOf(this); if (i >= 0) { this._parent._children.splice(i, 1); this._parent._children.push(this); } } this.update(); return this; }
  lower() { if (this._parent) { const i = this._parent._children.indexOf(this); if (i >= 0) { this._parent._children.splice(i, 1); this._parent._children.unshift(this); } } this.update(); return this; }

  update() { this._view && this._view._scheduleRepaint(); }
  repaint() { this._view && this._view._repaint(); }
  sizeHint() {
    if (this._layout) { const s = this._layout.sizeHint(); return new QSize(s.width() + this._margins.left() + this._margins.right(), s.height() + this._margins.top() + this._margins.bottom()); }
    return new QSize(100, 30);
  }
  minimumSizeHint() { return this.sizeHint(); }

  paintEvent(_p) {}
  resizeEvent(_e) {}
  mousePressEvent(e) { e.ignore && e.ignore(); }
  mouseReleaseEvent(e) { e.ignore && e.ignore(); }
  mouseMoveEvent(e) { e.ignore && e.ignore(); }
  mouseDoubleClickEvent(e) { e.ignore && e.ignore(); }
  wheelEvent(e) { e.ignore && e.ignore(); }
  keyPressEvent(e) { e.ignore && e.ignore(); }
  tabletEvent(e) { e.ignore && e.ignore(); }
  contextMenuEvent(e) { e.ignore && e.ignore(); }
  enterEvent() { this._hovered = true; this.update(); }
  leaveEvent() { this._hovered = false; this.update(); }
  focusInEvent() { this._focus = true; this.update(); }
  focusOutEvent() { this._focus = false; this.update(); }
  focusPolicy() { return this._focusPolicy !== Qt.NoFocus; }

  _relayout() { if (this._layout) this._layout._activate(this.contentsRect()); for (const c of this._children) c._relayout(); }
  _paint(painter) {
    if (!this._visible) return;
    painter.save();
    painter.translate(this._geom.x(), this._geom.y());
    painter.save(); this.paintEvent(painter); painter.restore();
    for (const c of this._children) c._paint(painter);
    painter.restore();
  }
  _absPos() { let x = 0, y = 0, w = this; while (w) { x += w._geom.x(); y += w._geom.y(); w = w._parent; } return new QPoint(x, y); }
  _hitTest(p) {
    if (!this._visible) return null;
    if (p.x() < 0 || p.y() < 0 || p.x() > this.width() || p.y() > this.height()) return null;
    for (let i = this._children.length - 1; i >= 0; i--) { const ch = this._children[i]; const hit = ch._hitTest(p.sub(ch.pos())); if (hit) return hit; }
    return this;
  }
  _ancestorMatching(pred) { let w = this; while (w) { if (pred(w)) return w; w = w._parent; } return null; }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QWidget.foo(self, …)) ──
  static geometry(self) { return self.geometry(); }
  static setGeometry(self, r) { return self.setGeometry(r); }
  static rect(self) { return self.rect(); }
  static contentsRect(self) { return self.contentsRect(); }
  static x(self) { return self.x(); }
  static y(self) { return self.y(); }
  static width(self) { return self.width(); }
  static height(self) { return self.height(); }
  static pos(self) { return self.pos(); }
  static size(self) { return self.size(); }
  static move(self, x, y) { return self.move(x, y); }
  static resize(self, w, h) { return self.resize(w, h); }
  static setFixedSize(self, w, h) { return self.setFixedSize(w, h); }
  static setFixedWidth(self, w) { return self.setFixedWidth(w); }
  static setFixedHeight(self, h) { return self.setFixedHeight(h); }
  static setMinimumSize(self, w, h) { return self.setMinimumSize(w, h); }
  static setMaximumSize(self, w, h) { return self.setMaximumSize(w, h); }
  static minimumSize(self) { return self.minimumSize(); }
  static maximumSize(self) { return self.maximumSize(); }
  static setContentsMargins(self, l, t, r, b) { return self.setContentsMargins(l, t, r, b); }
  static contentsMargins(self) { return self.contentsMargins(); }
  static parentWidget(self) { return self.parentWidget(); }
  static children(self) { return self.children(); }
  static setParent(self, p) { return self.setParent(p); }
  static setLayout(self, layout) { return self.setLayout(layout); }
  static layout(self) { return self.layout(); }
  static isVisible(self) { return self.isVisible(); }
  static setVisible(self, v) { return self.setVisible(v); }
  static show(self) { return self.show(); }
  static hide(self) { return self.hide(); }
  static isEnabled(self) { return self.isEnabled(); }
  static setEnabled(self, e) { return self.setEnabled(e); }
  static hasFocus(self) { return self.hasFocus(); }
  static setFocus(self) { return self.setFocus(); }
  static clearFocus(self) { return self.clearFocus(); }
  static font(self) { return self.font(); }
  static setFont(self, f) { return self.setFont(f); }
  static fontMetrics(self) { return self.fontMetrics(); }
  static setToolTip(self, t) { return self.setToolTip(t); }
  static toolTip(self) { return self.toolTip(); }
  static setCursor(self, c) { return self.setCursor(c); }
  static cursor(self) { return self.cursor(); }
  static setMouseTracking(self, b) { return self.setMouseTracking(b); }
  static hasMouseTracking(self) { return self.hasMouseTracking(); }
  static setSizePolicy(self, h, v) { return self.setSizePolicy(h, v); }
  static sizePolicy(self) { return self.sizePolicy(); }
  static setFocusPolicy(self, p) { return self.setFocusPolicy(p); }
  static underMouse(self) { return self.underMouse(); }
  static mapToGlobal(self, p) { return self.mapToGlobal(p); }
  static mapFromGlobal(self, p) { return self.mapFromGlobal(p); }
  static raise(self) { return self.raise(); }
  static lower(self) { return self.lower(); }
  static update(self) { return self.update(); }
  static repaint(self) { return self.repaint(); }
  static sizeHint(self) { return self.sizeHint(); }
  static minimumSizeHint(self) { return self.minimumSizeHint(); }
  static paintEvent(self, _p) { return self.paintEvent(_p); }
  static resizeEvent(self, _e) { return self.resizeEvent(_e); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseReleaseEvent(self, e) { return self.mouseReleaseEvent(e); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static mouseDoubleClickEvent(self, e) { return self.mouseDoubleClickEvent(e); }
  static wheelEvent(self, e) { return self.wheelEvent(e); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static tabletEvent(self, e) { return self.tabletEvent(e); }
  static contextMenuEvent(self, e) { return self.contextMenuEvent(e); }
  static enterEvent(self) { return self.enterEvent(); }
  static leaveEvent(self) { return self.leaveEvent(); }
  static focusInEvent(self) { return self.focusInEvent(); }
  static focusOutEvent(self) { return self.focusOutEvent(); }
  static focusPolicy(self) { return self.focusPolicy(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QFrame
// ═════════════════════════════════════════════════════════════════════════════
class QFrame extends QWidget {
  constructor(parent = null) { super(parent); this._frameShape = QFrame.StyledPanel; this._lineWidth = 1; }
  static create(parent = null) { return new QFrame(parent); }
  static properties = {
    frameShape: { get: (o) => o.frameShape(), set: (o, v) => o.setFrameShape(v), type: 'number' },
  };
  static NoFrame = 0; static Box = 1; static Panel = 2; static StyledPanel = 6; static HLine = 4; static VLine = 5;
  setFrameShape(s) { this._frameShape = s; this.update(); return this; } frameShape() { return this._frameShape; }
  setLineWidth(w) { this._lineWidth = w; this.update(); return this; }
  paintEvent(p) {
    const Pal = QApplication.palette();
    if (this._frameShape === QFrame.HLine) { p.setPen(QPen.of(Pal.border.lighter(140), this._lineWidth)); p.drawLine(0, this.height() / 2, this.width(), this.height() / 2); return; }
    if (this._frameShape === QFrame.VLine) { p.setPen(QPen.of(Pal.border.lighter(140), this._lineWidth)); p.drawLine(this.width() / 2, 0, this.width() / 2, this.height()); return; }
    if (this._frameShape === QFrame.NoFrame) return;
    p.setBrush(Pal.base.lighter(105)); p.setPen(QPen.of(Pal.border.lighter(140), this._lineWidth)); p.drawRoundedRect(this.rect().adjusted(0, 0, -1, -1), 6);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QFrame.foo(self, …)) ──
  static setFrameShape(self, s) { return self.setFrameShape(s); }
  static frameShape(self) { return self.frameShape(); }
  static setLineWidth(self, w) { return self.setLineWidth(w); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Layouty
// ═════════════════════════════════════════════════════════════════════════════
class QSpacerItem { constructor(w, h, hPolicy = QSizePolicy.Expanding, vPolicy = QSizePolicy.Minimum) { this._w = w; this._h = h; this._hp = hPolicy; this._vp = vPolicy; } static of(w, h, hPolicy = QSizePolicy.Expanding, vPolicy = QSizePolicy.Minimum) { return new QSpacerItem(w, h, hPolicy, vPolicy); } static create(w, h, hPolicy = QSizePolicy.Expanding, vPolicy = QSizePolicy.Minimum) { return new QSpacerItem(w, h, hPolicy, vPolicy); } sizeHint() { return new QSize(this._w, this._h); } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QSpacerItem.foo(self, …)) ──
  static sizeHint(self) { return self.sizeHint(); }
}
class QLayout extends QObject {
  constructor(parentWidget = null) { super(); this._items = []; this._parentWidget = null; this._spacing = 6; this._margins = new QMargins(9, 9, 9, 9); if (parentWidget) parentWidget.setLayout(this); }
  static create(parentWidget = null) { return new QLayout(parentWidget); }
  setSpacing(s) { this._spacing = s; this._reactivate(); return this; } spacing() { return this._spacing; }
  setContentsMargins(l, t, r, b) { this._margins = l instanceof QMargins ? l : new QMargins(l, t, r, b); this._reactivate(); return this; } contentsMargins() { return this._margins; }
  addWidget(w) { w.setParent(this._parentWidget); this._items.push({ widget: w, stretch: 0 }); this._reactivate(); return this; }
  addLayout(layout, stretch = 0) { const host = new QWidget(); host.setLayout(layout); this.addWidget(host, stretch); return this; }
  removeWidget(w) { this._items = this._items.filter((it) => it.widget !== w); w.setParent(null); this._reactivate(); return this; }
  count() { return this._items.length; } itemAt(i) { return this._items[i]; }
  _reactivate() { if (this._parentWidget) this._parentWidget._relayout(); }
  _activate(_rect) {} sizeHint() { return new QSize(0, 0); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QLayout.foo(self, …)) ──
  static setSpacing(self, s) { return self.setSpacing(s); }
  static spacing(self) { return self.spacing(); }
  static setContentsMargins(self, l, t, r, b) { return self.setContentsMargins(l, t, r, b); }
  static contentsMargins(self) { return self.contentsMargins(); }
  static addWidget(self, w) { return self.addWidget(w); }
  static addLayout(self, layout, stretch = 0) { return self.addLayout(layout, stretch); }
  static removeWidget(self, w) { return self.removeWidget(w); }
  static count(self) { return self.count(); }
  static itemAt(self, i) { return self.itemAt(i); }
  static sizeHint(self) { return self.sizeHint(); }
}
class QBoxLayout extends QLayout {
  constructor(dir, parentWidget = null) { super(parentWidget); this._dir = dir; }
  static create(dir, parentWidget = null) { return new QBoxLayout(dir, parentWidget); }
  static LeftToRight = 0; static RightToLeft = 1; static TopToBottom = 2; static BottomToTop = 3;
  addWidget(w, stretch = 0, alignment = 0) { w.setParent(this._parentWidget); this._items.push({ widget: w, stretch, alignment }); this._reactivate(); return this; }
  addLayout(layout, stretch = 0) { const host = new QWidget(); host.setLayout(layout); this.addWidget(host, stretch); return this; }
  addStretch(stretch = 1) { this._items.push({ widget: null, stretch: Math.max(1, stretch) }); this._reactivate(); return this; }
  addSpacing(px) { this._items.push({ widget: null, stretch: 0, fixed: px }); this._reactivate(); return this; }
  addSpacerItem(sp) { this._items.push({ widget: null, stretch: this._dir < 2 ? (sp._hp >= QSizePolicy.Expanding ? 1 : 0) : (sp._vp >= QSizePolicy.Expanding ? 1 : 0), fixed: this._dir < 2 ? sp._w : sp._h }); this._reactivate(); return this; }
  sizeHint() {
    const vertical = this._dir >= 2; let main = 0, cross = 0, count = 0;
    for (const it of this._items) { let w = 0, h = 0; if (it.fixed !== undefined) { if (vertical) h = it.fixed; else w = it.fixed; } else if (it.widget) { const s = it.widget.sizeHint(); w = s.width(); h = s.height(); } main += vertical ? h : w; cross = Math.max(cross, vertical ? w : h); count++; }
    main += Math.max(0, count - 1) * this._spacing + (vertical ? this._margins.top() + this._margins.bottom() : this._margins.left() + this._margins.right());
    cross += vertical ? this._margins.left() + this._margins.right() : this._margins.top() + this._margins.bottom();
    return vertical ? new QSize(cross, main) : new QSize(main, cross);
  }
  _activate(rect) {
    const vertical = this._dir >= 2; const inner = rect.marginsRemoved(this._margins);
    const total = vertical ? inner.height() : inner.width(); const cross = vertical ? inner.width() : inner.height();
    const n = this._items.length; const spacingTotal = Math.max(0, n - 1) * this._spacing;
    let fixed = 0, stretchSum = 0;
    const sizes = this._items.map((it) => {
      if (it.fixed !== undefined) { if (!it.stretch) { fixed += it.fixed; return it.fixed; } stretchSum += it.stretch; return it.fixed; }
      if (it.widget) { const hint = it.widget.sizeHint(); const s = vertical ? hint.height() : hint.width(); if (it.stretch > 0) { stretchSum += it.stretch; return 0; } fixed += s; return s; }
      stretchSum += it.stretch; return 0;
    });
    const remaining = Math.max(0, total - fixed - spacingTotal);
    let cursor = vertical ? inner.top() : inner.left();
    this._items.forEach((it, i) => {
      let main = sizes[i]; if (it.stretch > 0 && stretchSum > 0) main = (it.fixed || 0) + remaining * (it.stretch / stretchSum);
      if (it.widget) {
        const maxC = vertical ? it.widget.maximumSize().width() : it.widget.maximumSize().height();
        const cc = Math.min(cross, maxC); const off = (cross - cc) / 2;
        if (vertical) it.widget.setGeometry(QRect.of(inner.left() + off, cursor, cc, main));
        else it.widget.setGeometry(QRect.of(cursor, inner.top() + off, main, cc));
      }
      cursor += main + this._spacing;
    });
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QBoxLayout.foo(self, …)) ──
  static addWidget(self, w, stretch = 0, alignment = 0) { return self.addWidget(w, stretch, alignment); }
  static addLayout(self, layout, stretch = 0) { return self.addLayout(layout, stretch); }
  static addStretch(self, stretch = 1) { return self.addStretch(stretch); }
  static addSpacing(self, px) { return self.addSpacing(px); }
  static addSpacerItem(self, sp) { return self.addSpacerItem(sp); }
  static sizeHint(self) { return self.sizeHint(); }
}
class QVBoxLayout extends QBoxLayout { constructor(parent = null) { super(2, parent); } static create(parent = null) { return new QVBoxLayout(parent); } }
class QHBoxLayout extends QBoxLayout { constructor(parent = null) { super(0, parent); } static create(parent = null) { return new QHBoxLayout(parent); } }

class QGridLayout extends QLayout {
  constructor(parentWidget = null) { super(parentWidget); this._cells = []; this._colStretch = {}; this._rowStretch = {}; }
  static create(parentWidget = null) { return new QGridLayout(parentWidget); }
  addWidget(w, row, col, rowSpan = 1, colSpan = 1) { w.setParent(this._parentWidget); this._cells.push({ widget: w, row, col, rowSpan, colSpan }); this._reactivate(); return this; }
  setColumnStretch(col, s) { this._colStretch[col] = s; this._reactivate(); return this; }
  setRowStretch(row, s) { this._rowStretch[row] = s; this._reactivate(); return this; }
  _dims() { let rows = 0, cols = 0; for (const c of this._cells) { rows = Math.max(rows, c.row + c.rowSpan); cols = Math.max(cols, c.col + c.colSpan); } return { rows, cols }; }
  sizeHint() {
    const { rows, cols } = this._dims(); const colW = new Array(cols).fill(0), rowH = new Array(rows).fill(0);
    for (const c of this._cells) { const s = c.widget.sizeHint(); if (c.colSpan === 1) colW[c.col] = Math.max(colW[c.col], s.width()); if (c.rowSpan === 1) rowH[c.row] = Math.max(rowH[c.row], s.height()); }
    const w = colW.reduce((a, b) => a + b, 0) + Math.max(0, cols - 1) * this._spacing + this._margins.left() + this._margins.right();
    const h = rowH.reduce((a, b) => a + b, 0) + Math.max(0, rows - 1) * this._spacing + this._margins.top() + this._margins.bottom();
    return new QSize(w, h);
  }
  _activate(rect) {
    const inner = rect.marginsRemoved(this._margins); const { rows, cols } = this._dims(); if (!rows || !cols) return;
    const baseColW = new Array(cols).fill(0), baseRowH = new Array(rows).fill(0);
    for (const c of this._cells) { const s = c.widget.sizeHint(); if (c.colSpan === 1) baseColW[c.col] = Math.max(baseColW[c.col], s.width()); if (c.rowSpan === 1) baseRowH[c.row] = Math.max(baseRowH[c.row], s.height()); }
    const distribute = (base, total, spacing, stretch) => {
      const used = base.reduce((a, b) => a + b, 0) + Math.max(0, base.length - 1) * spacing;
      const extra = Math.max(0, total - used); const ssum = Object.values(stretch).reduce((a, b) => a + b, 0) || base.length;
      return base.map((b, i) => b + extra * ((stretch[i] ?? (Object.keys(stretch).length ? 0 : 1)) / ssum));
    };
    const colW = distribute(baseColW, inner.width(), this._spacing, this._colStretch);
    const rowH = distribute(baseRowH, inner.height(), this._spacing, this._rowStretch);
    const colX = []; let cx = inner.left(); for (let i = 0; i < cols; i++) { colX[i] = cx; cx += colW[i] + this._spacing; }
    const rowY = []; let cy = inner.top(); for (let i = 0; i < rows; i++) { rowY[i] = cy; cy += rowH[i] + this._spacing; }
    for (const c of this._cells) { let w = 0, h = 0; for (let i = 0; i < c.colSpan; i++) w += colW[c.col + i] + (i ? this._spacing : 0); for (let i = 0; i < c.rowSpan; i++) h += rowH[c.row + i] + (i ? this._spacing : 0); c.widget.setGeometry(QRect.of(colX[c.col], rowY[c.row], w, h)); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QGridLayout.foo(self, …)) ──
  static addWidget(self, w, row, col, rowSpan = 1, colSpan = 1) { return self.addWidget(w, row, col, rowSpan, colSpan); }
  static setColumnStretch(self, col, s) { return self.setColumnStretch(col, s); }
  static setRowStretch(self, row, s) { return self.setRowStretch(row, s); }
  static sizeHint(self) { return self.sizeHint(); }
}
class QFormLayout extends QLayout {
  constructor(parentWidget = null) { super(parentWidget); this._rows = []; }
  static create(parentWidget = null) { return new QFormLayout(parentWidget); }
  addRow(labelOrWidget, field) { if (field === undefined) { this._rows.push({ label: null, field: labelOrWidget }); labelOrWidget.setParent(this._parentWidget); } else { const lab = typeof labelOrWidget === 'string' ? new QLabel(labelOrWidget) : labelOrWidget; lab.setParent(this._parentWidget); field.setParent(this._parentWidget); this._rows.push({ label: lab, field }); } this._reactivate(); return this; }
  sizeHint() { let labW = 0, h = 0; for (const r of this._rows) { if (r.label) labW = Math.max(labW, r.label.sizeHint().width()); h += Math.max(r.field.sizeHint().height(), r.label ? r.label.sizeHint().height() : 0) + this._spacing; } return new QSize(labW + 12 + 180 + this._margins.left() + this._margins.right(), h + this._margins.top() + this._margins.bottom()); }
  _activate(rect) {
    const inner = rect.marginsRemoved(this._margins); let labW = 0; for (const r of this._rows) if (r.label) labW = Math.max(labW, r.label.sizeHint().width());
    let y = inner.top();
    for (const r of this._rows) { const rh = Math.max(r.field.sizeHint().height(), r.label ? r.label.sizeHint().height() : 0); if (r.label) { r.label.setGeometry(QRect.of(inner.left(), y, labW, rh)); r.field.setGeometry(QRect.of(inner.left() + labW + 12, y, inner.width() - labW - 12, rh)); } else { r.field.setGeometry(QRect.of(inner.left(), y, inner.width(), rh)); } y += rh + this._spacing; }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QFormLayout.foo(self, …)) ──
  static addRow(self, labelOrWidget, field) { return self.addRow(labelOrWidget, field); }
  static sizeHint(self) { return self.sizeHint(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QPalette (lite) + QApplication
// ═════════════════════════════════════════════════════════════════════════════
class QPalette {
  constructor() {
    this.window = QColor.fromString('#2b2d31'); this.base = QColor.fromString('#1e1f22'); this.text = QColor.fromString('#e3e5e8');
    this.button = QColor.fromString('#3a3d44'); this.buttonHover = QColor.fromString('#474b54'); this.buttonDown = QColor.fromString('#2f323a');
    this.border = QColor.fromString('#1a1b1e'); this.highlight = QColor.fromString('#5865f2'); this.highlightedText = QColor.fromString('#ffffff');
    this.disabled = QColor.fromString('#6b6f76'); this.alternateBase = QColor.fromString('#26272b');
  }
  static create() { return new QPalette(); }
  static of() { return new QPalette(); }
}
class QApplication extends QObject {
  static _inst = null; static _palette = new QPalette();
  constructor() { super(); }
  static instance() { return QApplication._inst || (QApplication._inst = new QApplication()); }
  static palette() { return QApplication._palette; }
  static setPalette(p) { QApplication._palette = p; }
  static setStyleColor(key, color) { QApplication._palette[key] = color instanceof QColor ? color : QColor.fromString(color); }
  processEvents() {}

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QApplication.foo(self, …)) ──
  static processEvents(self) { return self.processEvents(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QLabel
// ═════════════════════════════════════════════════════════════════════════════
class QLabel extends QFrame {
  constructor(text = '', parent = null) { super(parent); this._frameShape = QFrame.NoFrame; this._text = text; this._align = Qt.AlignLeft | Qt.AlignVCenter; this._wordWrap = false; this._elide = Qt.ElideNone; }
  static create(text, parent = null) { return new QLabel(text, parent); }
  static properties = {
    text: { get: (o) => o.text(), set: (o, v) => o.setText(v), type: 'string' },
    alignment: { get: (o) => o.alignment(), set: (o, v) => o.setAlignment(v), type: 'number' },
  };
  text() { return this._text; } setText(t) { this._text = String(t); this.update(); return this; }
  alignment() { return this._align; } setAlignment(a) { this._align = a; this.update(); return this; }
  setWordWrap(b) { this._wordWrap = !!b; this.update(); return this; }
  setTextElide(mode) { this._elide = mode; this.update(); return this; }
  sizeHint() { const fm = new QFontMetrics(this._font); return new QSize(Math.ceil(fm.horizontalAdvance(this._text)) + 4, fm.height() + 6); }
  paintEvent(p) {
    super.paintEvent(p); p.setFont(this._font); const Pal = QApplication.palette(); p.setPen(this._enabled ? Pal.text : Pal.disabled);
    const r = this.rect().adjusted(2, 0, -2, 0); const fm = new QFontMetrics(this._font);
    if (this._wordWrap) { this._paintWrapped(p, r, fm); return; }
    const t = this._elide !== Qt.ElideNone ? fm.elidedText(this._text, this._elide, r.width()) : this._text;
    p.drawText(r, this._align, t);
  }
  _paintWrapped(p, r, fm) {
    const words = this._text.split(/\s+/); const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (fm.horizontalAdvance(t) > r.width() && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); const lh = fm.height();
    lines.forEach((ln, i) => p.drawText(QRect.of(r.left(), r.top() + i * lh, r.width(), lh), this._align & Qt.AlignHorizontal_Mask, ln));
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QLabel.foo(self, …)) ──
  static text(self) { return self.text(); }
  static setText(self, t) { return self.setText(t); }
  static alignment(self) { return self.alignment(); }
  static setAlignment(self, a) { return self.setAlignment(a); }
  static setWordWrap(self, b) { return self.setWordWrap(b); }
  static setTextElide(self, mode) { return self.setTextElide(mode); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QAbstractButton → QPushButton, QToolButton, QCheckBox, QRadioButton
// ═════════════════════════════════════════════════════════════════════════════
class QAbstractButton extends QWidget {
  constructor(text = '', parent = null) { super(parent); this._text = text; this._checkable = false; this._checked = false; this._down = false; this._focusPolicy = Qt.StrongFocus; this.clicked = new Signal(); this.toggled = new Signal(); this.pressed = new Signal(); this.released = new Signal(); }
  static create(text = '', parent = null) { return new QAbstractButton(text, parent); }
  static properties = {
    text: { get: (o) => o.text(), set: (o, v) => o.setText(v), type: 'string' },
    checkable: { get: (o) => o.isCheckable(), set: (o, v) => o.setCheckable(v), type: 'bool' },
    checked: { get: (o) => o.isChecked(), set: (o, v) => o.setChecked(v), notify: 'toggled', type: 'bool' },
    down: { get: (o) => o.isDown(), type: 'bool' },
  };
  text() { return this._text; } setText(t) { this._text = String(t); this.update(); return this; }
  isCheckable() { return this._checkable; } setCheckable(b) { this._checkable = !!b; return this; }
  isChecked() { return this._checked; } setChecked(b) { if (this._checked === !!b) return this; this._checked = !!b; this.toggled.emit(this._checked); this.update(); return this; }
  toggle() { return this.setChecked(!this._checked); }
  isDown() { return this._down; }
  mousePressEvent(e) { if (!this._enabled) return; this._down = true; this._pressed = true; this.pressed.emit(); this.update(); }
  mouseReleaseEvent(e) { if (!this._enabled) return; const was = this._down; this._down = false; this._pressed = false; this.released.emit(); if (was && this.rect().contains(e.pos())) { if (this._checkable) this.toggle(); this.clicked.emit(this._checked); } this.update(); }
  keyPressEvent(e) { if ((e.key() === 'Enter' || e.key() === ' ') && this._enabled) { if (this._checkable) this.toggle(); this.clicked.emit(this._checked); } }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QAbstractButton.foo(self, …)) ──
  static text(self) { return self.text(); }
  static setText(self, t) { return self.setText(t); }
  static isCheckable(self) { return self.isCheckable(); }
  static setCheckable(self, b) { return self.setCheckable(b); }
  static isChecked(self) { return self.isChecked(); }
  static setChecked(self, b) { return self.setChecked(b); }
  static toggle(self) { return self.toggle(); }
  static isDown(self) { return self.isDown(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseReleaseEvent(self, e) { return self.mouseReleaseEvent(e); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
}
class QPushButton extends QAbstractButton {
  constructor(text = '', parent = null) { super(text, parent); this._cursor = Qt.PointingHandCursor; this._flat = false; this._default = false; }
  static create(text, onClick = null, parent = null) { const b = new QPushButton(text, parent); if (onClick) b.clicked.connect(onClick); return b; }
  setFlat(b) { this._flat = !!b; this.update(); return this; } setDefault(b) { this._default = !!b; this.update(); return this; }
  sizeHint() { const fm = new QFontMetrics(this._font); return new QSize(Math.ceil(fm.horizontalAdvance(this._text)) + 36, Math.max(34, this._font.pixelSize() + 18)); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(1, 1, -1, -1);
    let bg = !this._enabled ? Pal.button.darker(120) : this._down ? Pal.buttonDown : this._hovered ? Pal.buttonHover : Pal.button;
    if (this._checkable && this._checked) bg = Pal.highlight; if (this._default && !this._checkable) bg = Pal.highlight;
    if (this._flat && !this._down && !this._hovered) { p.setBrush(Qt.transparent); p.setPen(QPen.of(Qt.transparent, 0)); }
    else { const grad = QLinearGradient.of(0, r.top(), 0, r.bottom()).setColorAt(0, bg.lighter(108)).setColorAt(1, bg); p.setBrush(new QBrush(grad)); p.setPen(QPen.of(this._focus ? Pal.highlight : Pal.border, this._focus ? 2 : 1)); }
    p.drawRoundedRect(r, 7);
    p.setFont(this._font); p.setPen(this._enabled ? (this._checked || this._default ? Pal.highlightedText : Pal.text) : Pal.disabled);
    p.drawText(this.rect(), Qt.AlignCenter, this._text);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QPushButton.foo(self, …)) ──
  static setFlat(self, b) { return self.setFlat(b); }
  static setDefault(self, b) { return self.setDefault(b); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QToolButton extends QPushButton {
  constructor(text = '', parent = null) { super(text, parent); }
  static create(text, onClick = null, parent = null) { const b = new QToolButton(text, parent); if (onClick) b.clicked.connect(onClick); return b; }
  sizeHint() { return new QSize(34, 34); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QToolButton.foo(self, …)) ──
  static sizeHint(self) { return self.sizeHint(); }
}
class QCheckBox extends QAbstractButton {
  constructor(text = '', parent = null) { super(text, parent); this._checkable = true; this._tristate = false; this._cursor = Qt.PointingHandCursor; }
  static create(text, onToggled = null, parent = null) { const c = new QCheckBox(text, parent); if (onToggled) c.toggled.connect(onToggled); return c; }
  setTristate(b) { this._tristate = !!b; return this; }
  sizeHint() { const fm = new QFontMetrics(this._font); return new QSize(Math.ceil(fm.horizontalAdvance(this._text)) + 30, Math.max(24, this._font.pixelSize() + 10)); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const s = 18, y = (this.height() - s) / 2, box = QRect.of(1, y, s, s);
    p.setBrush(this._checked ? Pal.highlight : Pal.base); p.setPen(QPen.of(this._hovered ? Pal.highlight : Pal.border.lighter(160), 1.5)); p.drawRoundedRect(box, 4);
    if (this._checked) { p.setPen(QPen.of(Pal.highlightedText, 2.2)); p.drawLine(box.left() + 4, box.center().y(), box.center().x() - 1, box.bottom() - 5); p.drawLine(box.center().x() - 1, box.bottom() - 5, box.right() - 4, box.top() + 4); }
    p.setFont(this._font); p.setPen(this._enabled ? Pal.text : Pal.disabled);
    p.drawText(QRect.of(s + 10, 0, this.width() - s - 10, this.height()), Qt.AlignLeft | Qt.AlignVCenter, this._text);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QCheckBox.foo(self, …)) ──
  static setTristate(self, b) { return self.setTristate(b); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QRadioButton extends QAbstractButton {
  constructor(text = '', parent = null) { super(text, parent); this._checkable = true; this._cursor = Qt.PointingHandCursor; }
  static create(text, parent = null) { return new QRadioButton(text, parent); }
  setChecked(b) { if (b && this._parent) for (const sib of this._parent._children) if (sib !== this && sib instanceof QRadioButton) { sib._checked = false; sib.update(); } return super.setChecked(b); }
  sizeHint() { const fm = new QFontMetrics(this._font); return new QSize(Math.ceil(fm.horizontalAdvance(this._text)) + 30, Math.max(24, this._font.pixelSize() + 10)); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const s = 18, y = (this.height() - s) / 2, box = QRect.of(1, y, s, s);
    p.setBrush(Pal.base); p.setPen(QPen.of(this._hovered ? Pal.highlight : Pal.border.lighter(160), 1.5)); p.drawEllipse(box);
    if (this._checked) { p.setBrush(Pal.highlight); p.setPen(QPen.of(Qt.transparent, 0)); p.drawEllipse(box.adjusted(4, 4, -4, -4)); }
    p.setFont(this._font); p.setPen(this._enabled ? Pal.text : Pal.disabled);
    p.drawText(QRect.of(s + 10, 0, this.width() - s - 10, this.height()), Qt.AlignLeft | Qt.AlignVCenter, this._text);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QRadioButton.foo(self, …)) ──
  static setChecked(self, b) { return self.setChecked(b); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QAbstractSlider → QSlider, QScrollBar, QDial
// ═════════════════════════════════════════════════════════════════════════════
class QAbstractSlider extends QWidget {
  constructor(orientation = Qt.Horizontal, parent = null) { super(parent); this._orientation = orientation; this._min = 0; this._max = 100; this._value = 0; this._step = 1; this._pageStep = 10; this._focusPolicy = Qt.StrongFocus; this.valueChanged = new Signal(); this.sliderMoved = new Signal(); }
  static create(orientation = Qt.Horizontal, parent = null) { return new QAbstractSlider(orientation, parent); }
  static properties = {
    orientation: { get: (o) => o.orientation(), set: (o, v) => o.setOrientation(v), type: 'number' },
    minimum: { get: (o) => o.minimum(), set: (o, v) => o.setMinimum(v), type: 'number' },
    maximum: { get: (o) => o.maximum(), set: (o, v) => o.setMaximum(v), type: 'number' },
    value: { get: (o) => o.value(), set: (o, v) => o.setValue(v), notify: 'valueChanged', type: 'number' },
    singleStep: { get: (o) => o.singleStep(), set: (o, v) => o.setSingleStep(v), type: 'number' },
    pageStep: { get: (o) => o.pageStep(), set: (o, v) => o.setPageStep(v), type: 'number' },
  };
  orientation() { return this._orientation; } setOrientation(o) { this._orientation = o; this.update(); return this; }
  minimum() { return this._min; } maximum() { return this._max; } value() { return this._value; } singleStep() { return this._step; } pageStep() { return this._pageStep; }
  setMinimum(v) { this._min = v; return this.setValue(this._value); } setMaximum(v) { this._max = v; return this.setValue(this._value); }
  setRange(min, max) { this._min = min; this._max = max; return this.setValue(this._value); }
  setSingleStep(s) { this._step = s; return this; } setPageStep(s) { this._pageStep = s; return this; }
  setValue(v) { const nv = clamp(Math.round(v), this._min, this._max); if (nv !== this._value) { this._value = nv; this.valueChanged.emit(nv); } this.update(); return this; }
  _ratio() { return this._max === this._min ? 0 : (this._value - this._min) / (this._max - this._min); }
  keyPressEvent(e) { const k = e.key(); if (k === 'ArrowRight' || k === 'ArrowUp') this.setValue(this._value + this._step); else if (k === 'ArrowLeft' || k === 'ArrowDown') this.setValue(this._value - this._step); else if (k === 'PageUp') this.setValue(this._value + this._pageStep); else if (k === 'PageDown') this.setValue(this._value - this._pageStep); else if (k === 'Home') this.setValue(this._min); else if (k === 'End') this.setValue(this._max); }
  wheelEvent(e) { this.setValue(this._value + Math.sign(e.angleDelta().y ? e.angleDelta().y : e.angleDelta()) * this._step); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QAbstractSlider.foo(self, …)) ──
  static orientation(self) { return self.orientation(); }
  static setOrientation(self, o) { return self.setOrientation(o); }
  static minimum(self) { return self.minimum(); }
  static maximum(self) { return self.maximum(); }
  static value(self) { return self.value(); }
  static singleStep(self) { return self.singleStep(); }
  static pageStep(self) { return self.pageStep(); }
  static setMinimum(self, v) { return self.setMinimum(v); }
  static setMaximum(self, v) { return self.setMaximum(v); }
  static setRange(self, min, max) { return self.setRange(min, max); }
  static setSingleStep(self, s) { return self.setSingleStep(s); }
  static setPageStep(self, s) { return self.setPageStep(s); }
  static setValue(self, v) { return self.setValue(v); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static wheelEvent(self, e) { return self.wheelEvent(e); }
}
class QSlider extends QAbstractSlider {
  constructor(orientation = Qt.Horizontal, parent = null) { super(orientation, parent); }
  static create(min = 0, max = 100, value = 0, parent = null) { const s = new QSlider(Qt.Horizontal, parent); s.setRange(min, max); s.setValue(value); return s; }
  sizeHint() { return this._orientation === Qt.Horizontal ? new QSize(160, 26) : new QSize(26, 160); }
  _setFromPos(p) { const horiz = this._orientation === Qt.Horizontal; const t = horiz ? clamp((p.x() - 9) / Math.max(1, this.width() - 18), 0, 1) : clamp((p.y() - 9) / Math.max(1, this.height() - 18), 0, 1); this.setValue(this._min + (horiz ? t : 1 - t) * (this._max - this._min)); this.sliderMoved.emit(this._value); }
  mousePressEvent(e) { if (this._enabled) { this._pressed = true; this._setFromPos(e.pos()); } }
  mouseMoveEvent(e) { if (this._pressed) this._setFromPos(e.pos()); }
  mouseReleaseEvent() { this._pressed = false; this.update(); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const horiz = this._orientation === Qt.Horizontal, r = this._ratio();
    if (horiz) {
      const cy = this.height() / 2;
      p.setBrush(Pal.base); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(QRect.of(7, cy - 3, this.width() - 14, 6), 3);
      const hx = 9 + r * (this.width() - 18);
      p.setBrush(Pal.highlight); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(QRect.of(7, cy - 3, Math.max(0, hx - 7), 6), 3);
      p.setBrush(this._pressed ? Pal.highlight.lighter(130) : Pal.text); p.setPen(QPen.of(Pal.border, 1)); p.drawEllipse(QRect.of(hx - 9, cy - 9, 18, 18));
    } else {
      const cx = this.width() / 2;
      p.setBrush(Pal.base); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(QRect.of(cx - 3, 7, 6, this.height() - 14), 3);
      const hy = 9 + (1 - r) * (this.height() - 18);
      p.setBrush(this._pressed ? Pal.highlight.lighter(130) : Pal.text); p.setPen(QPen.of(Pal.border, 1)); p.drawEllipse(QRect.of(cx - 9, hy - 9, 18, 18));
    }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QSlider.foo(self, …)) ──
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static mouseReleaseEvent(self) { return self.mouseReleaseEvent(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QScrollBar extends QAbstractSlider {
  constructor(orientation = Qt.Vertical, parent = null) { super(orientation, parent); this._pageStep = 30; }
  static create(orientation = Qt.Vertical) { return new QScrollBar(orientation); }
  sizeHint() { return this._orientation === Qt.Horizontal ? new QSize(80, 12) : new QSize(12, 80); }
  _handleRect() { const horiz = this._orientation === Qt.Horizontal; const span = horiz ? this.width() : this.height(); const ext = clamp(this._pageStep / Math.max(1, this._max - this._min + this._pageStep), 0.08, 1); const len = Math.max(20, span * ext); const t = this._ratio(); const off = t * (span - len); return horiz ? QRect.of(off, 1, len, this.height() - 2) : QRect.of(1, off, this.width() - 2, len); }
  mousePressEvent(e) { this._pressed = true; this._grabOff = (this._orientation === Qt.Horizontal ? e.pos().x() : e.pos().y()) - (this._orientation === Qt.Horizontal ? this._handleRect().x() : this._handleRect().y()); this.mouseMoveEvent(e); }
  mouseMoveEvent(e) { if (!this._pressed) return; const horiz = this._orientation === Qt.Horizontal; const span = horiz ? this.width() : this.height(); const len = horiz ? this._handleRect().width() : this._handleRect().height(); const pos = (horiz ? e.pos().x() : e.pos().y()) - this._grabOff; const t = clamp(pos / Math.max(1, span - len), 0, 1); this.setValue(this._min + t * (this._max - this._min)); }
  mouseReleaseEvent() { this._pressed = false; this.update(); }
  paintEvent(p) { const Pal = QApplication.palette(); p.setBrush(Pal.base); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(this.rect(), 6); p.setBrush(this._hovered || this._pressed ? Pal.disabled.lighter(120) : Pal.disabled); p.drawRoundedRect(this._handleRect(), 5); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QScrollBar.foo(self, …)) ──
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static mouseReleaseEvent(self) { return self.mouseReleaseEvent(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QDial extends QAbstractSlider {
  constructor(parent = null) { super(Qt.Horizontal, parent); this._focusPolicy = Qt.StrongFocus; }
  static create(min = 0, max = 100, value = 0) { const d = new QDial(); d.setRange(min, max); d.setValue(value); return d; }
  sizeHint() { return new QSize(80, 80); }
  mousePressEvent(e) { this._pressed = true; this._setFromPos(e.pos()); }
  mouseMoveEvent(e) { if (this._pressed) this._setFromPos(e.pos()); }
  mouseReleaseEvent() { this._pressed = false; this.update(); }
  _setFromPos(p) { const c = this.rect().center(); let deg = Math.atan2(c.y() - p.y(), p.x() - c.x()) * 180 / Math.PI; deg = (deg + 360) % 360; const startDeg = 225, sweep = 270; let rel = (startDeg - deg + 360) % 360; if (rel > sweep) rel = rel - 360 < -sweep ? sweep : 0; const frac = clamp(rel / sweep, 0, 1); this.setValue(this._min + frac * (this._max - this._min)); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(6, 6, -6, -6); const c = r.center(); const rad = Math.min(r.width(), r.height()) / 2;
    p.setBrush(Pal.base); p.setPen(QPen.of(Pal.border, 2)); p.drawEllipse(r);
    p.setPen(QPen.of(Pal.disabled, 4, Qt.SolidLine).setCapStyle(Qt.RoundCap)); p.drawArc(r.adjusted(2, 2, -2, -2), 225, -270);
    p.setPen(QPen.of(Pal.highlight, 4).setCapStyle(Qt.RoundCap)); p.drawArc(r.adjusted(2, 2, -2, -2), 225, -270 * this._ratio());
    const ang = (225 - 270 * this._ratio()) * Math.PI / 180; const hx = c.x() + Math.cos(ang) * (rad - 8), hy = c.y() - Math.sin(ang) * (rad - 8);
    p.setBrush(this._hovered || this._pressed ? Pal.highlight.lighter(130) : Pal.text); p.setPen(QPen.of(Pal.border, 1)); p.drawEllipse(QRect.of(hx - 5, hy - 5, 10, 10));
    p.setFont(QFont.of(this._font.family(), 11, 600)); p.setPen(Pal.text); p.drawText(this.rect(), Qt.AlignCenter, String(this._value));
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QDial.foo(self, …)) ──
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static mouseReleaseEvent(self) { return self.mouseReleaseEvent(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QProgressBar
// ═════════════════════════════════════════════════════════════════════════════
class QProgressBar extends QWidget {
  constructor(parent = null) { super(parent); this._min = 0; this._max = 100; this._value = 0; this._textVisible = true; this._orientation = Qt.Horizontal; }
  static create(min = 0, max = 100, value = 0, parent = null) { const b = new QProgressBar(parent); b.setRange(min, max); b.setValue(value); return b; }
  static properties = {
    minimum: { get: (o) => o.minimum(), type: 'number' },
    maximum: { get: (o) => o.maximum(), type: 'number' },
    value: { get: (o) => o.value(), set: (o, v) => o.setValue(v), type: 'number' },
  };
  minimum() { return this._min; } maximum() { return this._max; } value() { return this._value; }
  setRange(min, max) { this._min = min; this._max = max; this.update(); return this; }
  setValue(v) { this._value = clamp(v, this._min, this._max); this.update(); return this; }
  setTextVisible(b) { this._textVisible = !!b; this.update(); return this; }
  sizeHint() { return new QSize(220, 22); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(Pal.base); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(r, 6);
    const frac = this._max === this._min ? 0 : (this._value - this._min) / (this._max - this._min);
    if (frac > 0) { const fr = QRect.of(r.x() + 1, r.y() + 1, (r.width() - 2) * frac, r.height() - 2); const g = QLinearGradient.of(0, fr.top(), 0, fr.bottom()).setColorAt(0, Pal.highlight.lighter(115)).setColorAt(1, Pal.highlight); p.setBrush(new QBrush(g)); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(fr, 5); }
    if (this._textVisible) { p.setFont(this._font); p.setPen(frac > 0.5 ? Pal.highlightedText : Pal.text); p.drawText(this.rect(), Qt.AlignCenter, `${Math.round(frac * 100)}%`); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QProgressBar.foo(self, …)) ──
  static minimum(self) { return self.minimum(); }
  static maximum(self) { return self.maximum(); }
  static value(self) { return self.value(); }
  static setRange(self, min, max) { return self.setRange(min, max); }
  static setValue(self, v) { return self.setValue(v); }
  static setTextVisible(self, b) { return self.setTextVisible(b); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QSpinBox / QDoubleSpinBox
// ═════════════════════════════════════════════════════════════════════════════
class QSpinBox extends QWidget {
  constructor(parent = null) { super(parent); this._min = 0; this._max = 99; this._value = 0; this._step = 1; this._prefix = ''; this._suffix = ''; this._decimals = 0; this._focusPolicy = Qt.StrongFocus; this.valueChanged = new Signal(); }
  static create(min = 0, max = 99, value = 0) { const s = new QSpinBox(); s.setRange(min, max); s.setValue(value); return s; }
  static properties = {
    minimum: { get: (o) => o.minimum(), type: 'number' },
    maximum: { get: (o) => o.maximum(), type: 'number' },
    value: { get: (o) => o.value(), set: (o, v) => o.setValue(v), notify: 'valueChanged', type: 'number' },
    singleStep: { get: (o) => o.singleStep(), set: (o, v) => o.setSingleStep(v), type: 'number' },
    prefix: { get: (o) => o._prefix, set: (o, v) => o.setPrefix(v), type: 'string' },
    suffix: { get: (o) => o._suffix, set: (o, v) => o.setSuffix(v), type: 'string' },
  };
  minimum() { return this._min; } maximum() { return this._max; } value() { return this._value; } singleStep() { return this._step; }
  setRange(a, b) { this._min = a; this._max = b; return this.setValue(this._value); } setSingleStep(s) { this._step = s; return this; }
  setPrefix(s) { this._prefix = s; this.update(); return this; } setSuffix(s) { this._suffix = s; this.update(); return this; } setDecimals(d) { this._decimals = d; this.update(); return this; }
  setValue(v) { const nv = clamp(v, this._min, this._max); if (nv !== this._value) { this._value = nv; this.valueChanged.emit(nv); } this.update(); return this; }
  stepBy(n) { return this.setValue(this._value + n * this._step); }
  text() { return `${this._prefix}${this._value.toFixed(this._decimals)}${this._suffix}`; }
  sizeHint() { return new QSize(110, 32); }
  _btnRects() { const w = 22, h = this.height() / 2; return { up: QRect.of(this.width() - w - 1, 1, w, h - 1), down: QRect.of(this.width() - w - 1, h, w, h - 1) }; }
  mousePressEvent(e) { const { up, down } = this._btnRects(); if (up.contains(e.pos())) this.stepBy(1); else if (down.contains(e.pos())) this.stepBy(-1); }
  wheelEvent(e) { this.stepBy(Math.sign(e.angleDelta().y ? e.angleDelta().y : e.angleDelta())); }
  keyPressEvent(e) { if (e.key() === 'ArrowUp') this.stepBy(1); else if (e.key() === 'ArrowDown') this.stepBy(-1); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(Pal.base); p.setPen(QPen.of(this._focus ? Pal.highlight : Pal.border, this._focus ? 2 : 1)); p.drawRoundedRect(r, 6);
    p.setFont(this._font); p.setPen(Pal.text); p.drawText(QRect.of(10, 0, this.width() - 34, this.height()), Qt.AlignLeft | Qt.AlignVCenter, this.text());
    const { up, down } = this._btnRects();
    p.setBrush(Pal.button); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(up, 3); p.drawRoundedRect(down, 3);
    p.setPen(QPen.of(Pal.text, 1.5)); const uc = up.center(); p.drawLine(uc.x() - 4, uc.y() + 2, uc.x(), uc.y() - 2); p.drawLine(uc.x(), uc.y() - 2, uc.x() + 4, uc.y() + 2);
    const dc = down.center(); p.drawLine(dc.x() - 4, dc.y() - 2, dc.x(), dc.y() + 2); p.drawLine(dc.x(), dc.y() + 2, dc.x() + 4, dc.y() - 2);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QSpinBox.foo(self, …)) ──
  static minimum(self) { return self.minimum(); }
  static maximum(self) { return self.maximum(); }
  static value(self) { return self.value(); }
  static singleStep(self) { return self.singleStep(); }
  static setRange(self, a, b) { return self.setRange(a, b); }
  static setSingleStep(self, s) { return self.setSingleStep(s); }
  static setPrefix(self, s) { return self.setPrefix(s); }
  static setSuffix(self, s) { return self.setSuffix(s); }
  static setDecimals(self, d) { return self.setDecimals(d); }
  static setValue(self, v) { return self.setValue(v); }
  static stepBy(self, n) { return self.stepBy(n); }
  static text(self) { return self.text(); }
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static wheelEvent(self, e) { return self.wheelEvent(e); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QDoubleSpinBox extends QSpinBox { constructor(parent = null) { super(parent); this._decimals = 2; this._step = 0.1; this._max = 99.99; } static create(min = 0, max = 99.99, value = 0) { const s = new QDoubleSpinBox(); s.setRange(min, max); s.setValue(value); return s; } setValue(v) { const nv = clamp(v, this._min, this._max); if (nv !== this._value) { this._value = nv; this.valueChanged.emit(nv); } this.update(); return this; } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QDoubleSpinBox.foo(self, …)) ──
  static setValue(self, v) { return self.setValue(v); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QLineEdit / QTextEdit (proste)
// ═════════════════════════════════════════════════════════════════════════════
class QLineEdit extends QWidget {
  constructor(text = '', parent = null) { super(parent); this._text = text; this._caret = text.length; this._placeholder = ''; this._echoMode = 0; this._readOnly = false; this._maxLen = 32767; this._focusPolicy = Qt.StrongFocus; this._cursor = Qt.IBeamCursor; this.textChanged = new Signal(); this.textEdited = new Signal(); this.returnPressed = new Signal(); this.editingFinished = new Signal(); }
  static Normal = 0; static Password = 2; static NoEcho = 1;
  static create(text = '', parent = null) { return new QLineEdit(text, parent); }
  static properties = {
    text: { get: (o) => o.text(), set: (o, v) => o.setText(v), notify: 'textChanged', type: 'string' },
    placeholderText: { get: (o) => o.placeholderText(), set: (o, v) => o.setPlaceholderText(v), type: 'string' },
    echoMode: { get: (o) => o._echoMode, set: (o, v) => o.setEchoMode(v), type: 'number' },
    readOnly: { get: (o) => o._readOnly, set: (o, v) => o.setReadOnly(v), type: 'bool' },
    maxLength: { get: (o) => o._maxLen, set: (o, v) => o.setMaxLength(v), type: 'number' },
  };
  text() { return this._text; } setText(t) { this._text = String(t).slice(0, this._maxLen); this._caret = this._text.length; this.textChanged.emit(this._text); this.update(); return this; }
  placeholderText() { return this._placeholder; } setPlaceholderText(t) { this._placeholder = String(t); this.update(); return this; }
  setEchoMode(m) { this._echoMode = m; this.update(); return this; } setReadOnly(b) { this._readOnly = !!b; return this; } setMaxLength(n) { this._maxLen = n; return this; }
  clear() { return this.setText(''); }
  _display() { return this._echoMode === QLineEdit.Password ? '•'.repeat(this._text.length) : this._echoMode === QLineEdit.NoEcho ? '' : this._text; }
  sizeHint() { return new QSize(160, Math.max(30, this._font.pixelSize() + 14)); }
  focusOutEvent() { super.focusOutEvent(); this.editingFinished.emit(); }
  mousePressEvent(e) { const fm = new QFontMetrics(this._font); let best = this._text.length; for (let i = 0; i <= this._text.length; i++) { if (8 + fm.horizontalAdvance(this._display().slice(0, i)) >= e.pos().x()) { best = i; break; } } this._caret = best; this.update(); }
  keyPressEvent(e) {
    if (this._readOnly) return; const k = e.key();
    if (k === 'Backspace') { if (this._caret > 0) { this._text = this._text.slice(0, this._caret - 1) + this._text.slice(this._caret); this._caret--; } }
    else if (k === 'Delete') { this._text = this._text.slice(0, this._caret) + this._text.slice(this._caret + 1); }
    else if (k === 'ArrowLeft') { this._caret = Math.max(0, this._caret - 1); this.update(); return; }
    else if (k === 'ArrowRight') { this._caret = Math.min(this._text.length, this._caret + 1); this.update(); return; }
    else if (k === 'Home') { this._caret = 0; this.update(); return; }
    else if (k === 'End') { this._caret = this._text.length; this.update(); return; }
    else if (k === 'Enter') { this.returnPressed.emit(); this.editingFinished.emit(); return; }
    else if (e.text() && e.text().length === 1 && this._text.length < this._maxLen) { this._text = this._text.slice(0, this._caret) + e.text() + this._text.slice(this._caret); this._caret++; }
    else return;
    this.textChanged.emit(this._text); this.textEdited.emit(this._text); this.update();
  }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(Pal.base); p.setPen(QPen.of(this._focus ? Pal.highlight : Pal.border, this._focus ? 2 : 1)); p.drawRoundedRect(r, 6);
    p.setFont(this._font); const tr = this.rect().adjusted(8, 0, -8, 0); const disp = this._display();
    if (disp) { p.setPen(Pal.text); p.drawText(tr, Qt.AlignLeft | Qt.AlignVCenter, disp); }
    else if (this._placeholder) { p.setPen(Pal.disabled); p.drawText(tr, Qt.AlignLeft | Qt.AlignVCenter, this._placeholder); }
    if (this._focus && !this._readOnly && Math.floor(Date.now() / 530) % 2 === 0) { const fm = new QFontMetrics(this._font); const cx = 8 + fm.horizontalAdvance(disp.slice(0, this._caret)); p.setPen(QPen.of(Pal.text, 1)); p.drawLine(cx, 7, cx, this.height() - 7); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QLineEdit.foo(self, …)) ──
  static text(self) { return self.text(); }
  static setText(self, t) { return self.setText(t); }
  static placeholderText(self) { return self.placeholderText(); }
  static setPlaceholderText(self, t) { return self.setPlaceholderText(t); }
  static setEchoMode(self, m) { return self.setEchoMode(m); }
  static setReadOnly(self, b) { return self.setReadOnly(b); }
  static setMaxLength(self, n) { return self.setMaxLength(n); }
  static clear(self) { return self.clear(); }
  static sizeHint(self) { return self.sizeHint(); }
  static focusOutEvent(self) { return self.focusOutEvent(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QTextEdit extends QWidget {
  constructor(text = '', parent = null) { super(parent); this._lines = String(text).split('\n'); this._row = 0; this._col = 0; this._scroll = 0; this._readOnly = false; this._focusPolicy = Qt.StrongFocus; this._cursor = Qt.IBeamCursor; this.textChanged = new Signal(); }
  static create(text = '', parent = null) { return new QTextEdit(text, parent); }
  static properties = {
    plainText: { get: (o) => o.toPlainText(), set: (o, v) => o.setPlainText(v), notify: 'textChanged', type: 'string' },
    readOnly: { get: (o) => o._readOnly, set: (o, v) => o.setReadOnly(v), type: 'bool' },
  };
  toPlainText() { return this._lines.join('\n'); } setPlainText(t) { this._lines = String(t).split('\n'); this._row = 0; this._col = 0; this.textChanged.emit(); this.update(); return this; }
  setReadOnly(b) { this._readOnly = !!b; return this; }
  sizeHint() { return new QSize(240, 120); }
  _lineHeight() { return Math.ceil(this._font.pixelSize() * 1.45); }
  keyPressEvent(e) {
    if (this._readOnly) return; const k = e.key(); const line = this._lines[this._row];
    if (k === 'Backspace') { if (this._col > 0) { this._lines[this._row] = line.slice(0, this._col - 1) + line.slice(this._col); this._col--; } else if (this._row > 0) { this._col = this._lines[this._row - 1].length; this._lines[this._row - 1] += line; this._lines.splice(this._row, 1); this._row--; } }
    else if (k === 'Enter') { this._lines.splice(this._row + 1, 0, line.slice(this._col)); this._lines[this._row] = line.slice(0, this._col); this._row++; this._col = 0; }
    else if (k === 'ArrowLeft') { if (this._col > 0) this._col--; else if (this._row > 0) { this._row--; this._col = this._lines[this._row].length; } }
    else if (k === 'ArrowRight') { if (this._col < line.length) this._col++; else if (this._row < this._lines.length - 1) { this._row++; this._col = 0; } }
    else if (k === 'ArrowUp') { if (this._row > 0) { this._row--; this._col = Math.min(this._col, this._lines[this._row].length); } }
    else if (k === 'ArrowDown') { if (this._row < this._lines.length - 1) { this._row++; this._col = Math.min(this._col, this._lines[this._row].length); } }
    else if (e.text() && e.text().length === 1) { this._lines[this._row] = line.slice(0, this._col) + e.text() + line.slice(this._col); this._col++; }
    else return;
    this.textChanged.emit(); this.update();
  }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(Pal.base); p.setPen(QPen.of(this._focus ? Pal.highlight : Pal.border, this._focus ? 2 : 1)); p.drawRoundedRect(r, 6);
    p.save(); p.setClipRect(this.rect().adjusted(8, 6, -8, -6)); p.setFont(this._font); p.setPen(Pal.text); const lh = this._lineHeight();
    this._lines.forEach((ln, i) => p.drawText(QRect.of(8, 6 + i * lh, this.width() - 16, lh), Qt.AlignLeft | Qt.AlignVCenter, ln));
    if (this._focus && Math.floor(Date.now() / 530) % 2 === 0) { const fm = new QFontMetrics(this._font); const cx = 8 + fm.horizontalAdvance(this._lines[this._row].slice(0, this._col)); const cy = 6 + this._row * lh; p.setPen(QPen.of(Pal.text, 1)); p.drawLine(cx, cy + 2, cx, cy + lh - 2); }
    p.restore();
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QTextEdit.foo(self, …)) ──
  static toPlainText(self) { return self.toPlainText(); }
  static setPlainText(self, t) { return self.setPlainText(t); }
  static setReadOnly(self, b) { return self.setReadOnly(b); }
  static sizeHint(self) { return self.sizeHint(); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QGroupBox
// ═════════════════════════════════════════════════════════════════════════════
class QGroupBox extends QWidget {
  constructor(title = '', parent = null) { super(parent); this._title = title; this._margins = new QMargins(12, 30, 12, 12); }
  static create(title, parent = null) { return new QGroupBox(title, parent); }
  static properties = {
    title: { get: (o) => o.title(), set: (o, v) => o.setTitle(v), type: 'string' },
  };
  title() { return this._title; } setTitle(t) { this._title = String(t); this.update(); return this; }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(1, 11, -1, -1);
    p.setBrush(Pal.window.lighter(108)); p.setPen(QPen.of(Pal.border.lighter(150), 1)); p.drawRoundedRect(r, 8);
    if (this._title) { p.setFont(QFont.of(this._font.family(), this._font.pixelSize(), 600)); p.setPen(Pal.text); p.drawText(QRect.of(14, 0, this.width() - 28, 22), Qt.AlignLeft | Qt.AlignVCenter, this._title); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QGroupBox.foo(self, …)) ──
  static title(self) { return self.title(); }
  static setTitle(self, t) { return self.setTitle(t); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QListWidget (przewijalna lista z zaznaczeniem)
// ═════════════════════════════════════════════════════════════════════════════
class QListWidgetItem { constructor(text = '') { this._text = text; this._data = null; } static of(text = '') { return new QListWidgetItem(text); } static create(text = '') { return new QListWidgetItem(text); } text() { return this._text; } setText(t) { this._text = t; return this; } setData(d) { this._data = d; return this; } data() { return this._data; } 
  // ── Statyczne odpowiedniki metod instancji (autocomplete: QListWidgetItem.foo(self, …)) ──
  static text(self) { return self.text(); }
  static setText(self, t) { return self.setText(t); }
  static setData(self, d) { return self.setData(d); }
  static data(self) { return self.data(); }
}
class QListWidget extends QWidget {
  constructor(parent = null) { super(parent); this._items = []; this._current = -1; this._scroll = 0; this._rowH = 30; this._focusPolicy = Qt.StrongFocus; this._scrollable = true; this.currentRowChanged = new Signal(); this.itemClicked = new Signal(); this.itemDoubleClicked = new Signal(); }
  static create(items = [], parent = null) { const l = new QListWidget(parent); items.forEach((t) => l.addItem(t)); return l; }
  addItem(item) { this._items.push(item instanceof QListWidgetItem ? item : new QListWidgetItem(String(item))); this.update(); return this; }
  addItems(arr) { arr.forEach((t) => this.addItem(t)); return this; }
  clear() { this._items = []; this._current = -1; this._scroll = 0; this.update(); return this; }
  count() { return this._items.length; } item(i) { return this._items[i]; }
  currentRow() { return this._current; } currentItem() { return this._items[this._current]; }
  setCurrentRow(r) { if (r !== this._current) { this._current = r; this.currentRowChanged.emit(r); } this._ensureVisible(r); this.update(); return this; }
  _maxScroll() { return Math.max(0, this._items.length * this._rowH - this.height() + 2); }
  scrollBy(_dx, dy) { this._scroll = clamp(this._scroll + dy, 0, this._maxScroll()); this.update(); }
  _ensureVisible(r) { const top = r * this._rowH, bot = top + this._rowH; if (top < this._scroll) this._scroll = top; else if (bot > this._scroll + this.height()) this._scroll = bot - this.height(); }
  _rowAt(y) { return Math.floor((y + this._scroll - 1) / this._rowH); }
  mousePressEvent(e) { const r = this._rowAt(e.pos().y()); if (r >= 0 && r < this._items.length) { this.setCurrentRow(r); this.itemClicked.emit(this._items[r]); } }
  mouseDoubleClickEvent(e) { const r = this._rowAt(e.pos().y()); if (r >= 0 && r < this._items.length) this.itemDoubleClicked.emit(this._items[r]); }
  wheelEvent(e) { this.scrollBy(0, -(e.angleDelta().y ? e.angleDelta().y : e.angleDelta())); }
  keyPressEvent(e) { if (e.key() === 'ArrowDown') this.setCurrentRow(Math.min(this._items.length - 1, this._current + 1)); else if (e.key() === 'ArrowUp') this.setCurrentRow(Math.max(0, this._current - 1)); }
  sizeHint() { return new QSize(180, 160); }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(Pal.base); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(r, 6);
    p.save(); p.setClipRect(this.rect().adjusted(1, 1, -1, -1)); p.setFont(this._font);
    this._items.forEach((it, i) => {
      const y = 1 + i * this._rowH - this._scroll; if (y + this._rowH < 0 || y > this.height()) return;
      const rr = QRect.of(1, y, this.width() - 2, this._rowH);
      if (i === this._current) { p.setBrush(Pal.highlight); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(rr.adjusted(2, 1, -2, -1), 4); }
      else if (i % 2) { p.fillRect(rr, Pal.alternateBase); }
      p.setPen(i === this._current ? Pal.highlightedText : Pal.text); p.drawText(rr.adjusted(10, 0, -8, 0), Qt.AlignLeft | Qt.AlignVCenter, it.text());
    });
    p.restore();
    if (this._maxScroll() > 0) { const span = this.height() - 4; const ext = clamp(this.height() / (this._items.length * this._rowH), 0.1, 1); const len = span * ext; const off = 2 + (this._scroll / this._maxScroll()) * (span - len); p.setBrush(Pal.disabled); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(QRect.of(this.width() - 6, off, 4, len), 2); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QListWidget.foo(self, …)) ──
  static addItem(self, item) { return self.addItem(item); }
  static addItems(self, arr) { return self.addItems(arr); }
  static clear(self) { return self.clear(); }
  static count(self) { return self.count(); }
  static item(self, i) { return self.item(i); }
  static currentRow(self) { return self.currentRow(); }
  static currentItem(self) { return self.currentItem(); }
  static setCurrentRow(self, r) { return self.setCurrentRow(r); }
  static scrollBy(self, _dx, dy) { return self.scrollBy(_dx, dy); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseDoubleClickEvent(self, e) { return self.mouseDoubleClickEvent(e); }
  static wheelEvent(self, e) { return self.wheelEvent(e); }
  static keyPressEvent(self, e) { return self.keyPressEvent(e); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QStackedWidget + QTabBar + QTabWidget
// ═════════════════════════════════════════════════════════════════════════════
class QStackedWidget extends QWidget {
  constructor(parent = null) { super(parent); this._index = 0; this.currentChanged = new Signal(); }
  static create(parent = null) { return new QStackedWidget(parent); }
  addWidget(w) { w.setParent(this); this._updateVisibility(); this._relayout(); return this._children.length - 1; }
  count() { return this._children.length; } currentIndex() { return this._index; } currentWidget() { return this._children[this._index]; }
  setCurrentIndex(i) { i = clamp(i, 0, this._children.length - 1); if (i !== this._index) { this._index = i; this.currentChanged.emit(i); } this._updateVisibility(); this.update(); return this; }
  _updateVisibility() { this._children.forEach((c, i) => { c._visible = i === this._index; }); }
  _relayout() { for (const c of this._children) c.setGeometry(this.rect()); }
  sizeHint() { let w = 0, h = 0; for (const c of this._children) { const s = c.sizeHint(); w = Math.max(w, s.width()); h = Math.max(h, s.height()); } return new QSize(w, h); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QStackedWidget.foo(self, …)) ──
  static addWidget(self, w) { return self.addWidget(w); }
  static count(self) { return self.count(); }
  static currentIndex(self) { return self.currentIndex(); }
  static currentWidget(self) { return self.currentWidget(); }
  static setCurrentIndex(self, i) { return self.setCurrentIndex(i); }
  static sizeHint(self) { return self.sizeHint(); }
}
class QTabBar extends QWidget {
  constructor(parent = null) { super(parent); this._tabs = []; this._current = 0; this._focusPolicy = Qt.ClickFocus; this.currentChanged = new Signal(); }
  static create(parent = null) { return new QTabBar(parent); }
  addTab(text) { this._tabs.push(text); this.update(); return this._tabs.length - 1; }
  count() { return this._tabs.length; } currentIndex() { return this._current; }
  setCurrentIndex(i) { i = clamp(i, 0, this._tabs.length - 1); if (i !== this._current) { this._current = i; this.currentChanged.emit(i); } this.update(); return this; }
  sizeHint() { return new QSize(200, 38); }
  _tabRects() { const fm = new QFontMetrics(this._font); let x = 0; return this._tabs.map((t) => { const w = fm.horizontalAdvance(t) + 28; const r = QRect.of(x, 4, w, this.height() - 4); x += w + 2; return r; }); }
  mousePressEvent(e) { this._tabRects().forEach((r, i) => { if (r.contains(e.pos())) this.setCurrentIndex(i); }); }
  paintEvent(p) {
    const Pal = QApplication.palette(); p.setFont(this._font); const rects = this._tabRects();
    p.setPen(QPen.of(Pal.border.lighter(150), 1)); p.drawLine(0, this.height() - 1, this.width(), this.height() - 1);
    rects.forEach((r, i) => {
      const active = i === this._current;
      p.setBrush(active ? Pal.base.lighter(115) : this._hovered ? Pal.button : Qt.transparent); p.setPen(QPen.of(active ? Pal.border.lighter(150) : Qt.transparent, 1));
      p.drawRoundedRect(r, 6);
      if (active) { p.setPen(QPen.of(Pal.highlight, 2)); p.drawLine(r.left() + 6, r.bottom() - 1, r.right() - 6, r.bottom() - 1); }
      p.setPen(active ? Pal.text : Pal.disabled); p.drawText(r, Qt.AlignCenter, this._tabs[i]);
    });
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QTabBar.foo(self, …)) ──
  static addTab(self, text) { return self.addTab(text); }
  static count(self) { return self.count(); }
  static currentIndex(self) { return self.currentIndex(); }
  static setCurrentIndex(self, i) { return self.setCurrentIndex(i); }
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QTabWidget extends QWidget {
  constructor(parent = null) { super(parent); this._bar = new QTabBar(); this._bar.setParent(this); this._stack = new QStackedWidget(); this._stack.setParent(this); this._bar.currentChanged.connect((i) => this._stack.setCurrentIndex(i)); this.currentChanged = this._bar.currentChanged; }
  static create(parent = null) { return new QTabWidget(parent); }
  addTab(widget, label) { this._bar.addTab(label); this._stack.addWidget(widget); return this; }
  setCurrentIndex(i) { this._bar.setCurrentIndex(i); return this; } currentIndex() { return this._bar.currentIndex(); }
  _relayout() { const bh = 38; this._bar.setGeometry(QRect.of(0, 0, this.width(), bh)); this._stack.setGeometry(QRect.of(0, bh + 2, this.width(), this.height() - bh - 2)); }
  sizeHint() { const s = this._stack.sizeHint(); return new QSize(Math.max(240, s.width()), s.height() + 40); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QTabWidget.foo(self, …)) ──
  static addTab(self, widget, label) { return self.addTab(widget, label); }
  static setCurrentIndex(self, i) { return self.setCurrentIndex(i); }
  static currentIndex(self) { return self.currentIndex(); }
  static sizeHint(self) { return self.sizeHint(); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QScrollArea — przewijalny kontener (dotyk: przeciągnięcie przewija)
// ═════════════════════════════════════════════════════════════════════════════
class QScrollArea extends QWidget {
  constructor(parent = null) { super(parent); this._widget = null; this._sx = 0; this._sy = 0; this._scrollable = true; this.scrolled = new Signal(); }
  static create(parent = null) { return new QScrollArea(parent); }
  setWidget(w) { if (this._widget) this._widget.setParent(null); this._widget = w; w.setParent(this); this._relayout(); return this; }
  widget() { return this._widget; }
  _maxScrollY() { return this._widget ? Math.max(0, this._widget.sizeHint().height() - this.height()) : 0; }
  _maxScrollX() { return this._widget ? Math.max(0, this._widget.sizeHint().width() - this.width()) : 0; }
  scrollBy(dx, dy) { this._sx = clamp(this._sx + dx, 0, this._maxScrollX()); this._sy = clamp(this._sy + dy, 0, this._maxScrollY()); this._applyScroll(); this.scrolled.emit(this._sx, this._sy); }
  _applyScroll() { if (this._widget) { const sh = this._widget.sizeHint(); this._widget.setGeometry(QRect.of(-this._sx, -this._sy, Math.max(this.width(), sh.width()), Math.max(this.height(), sh.height()))); } this.update(); }
  _relayout() { this._applyScroll(); }
  wheelEvent(e) { this.scrollBy(0, -(e.angleDelta().y ? e.angleDelta().y : e.angleDelta())); }
  sizeHint() { return new QSize(200, 200); }
  _paint(painter) {
    if (!this._visible) return;
    painter.save(); painter.translate(this.x(), this.y());
    painter.save(); this.paintEvent(painter); painter.restore();
    painter.save(); painter.setClipRect(this.rect()); for (const c of this._children) c._paint(painter); painter.restore();
    this._paintScrollbars(painter); painter.restore();
  }
  paintEvent(p) { const Pal = QApplication.palette(); p.fillRect(this.rect(), Pal.base); }
  _paintScrollbars(p) {
    const Pal = QApplication.palette();
    if (this._maxScrollY() > 0) { const span = this.height() - 4, ext = clamp(this.height() / (this._widget.sizeHint().height()), 0.08, 1), len = span * ext, off = 2 + (this._sy / this._maxScrollY()) * (span - len); p.setBrush(Pal.disabled); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(QRect.of(this.width() - 6, off, 4, len), 2); }
    if (this._maxScrollX() > 0) { const span = this.width() - 4, ext = clamp(this.width() / (this._widget.sizeHint().width()), 0.08, 1), len = span * ext, off = 2 + (this._sx / this._maxScrollX()) * (span - len); p.setBrush(Pal.disabled); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(QRect.of(off, this.height() - 6, len, 4), 2); }
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QScrollArea.foo(self, …)) ──
  static setWidget(self, w) { return self.setWidget(w); }
  static widget(self) { return self.widget(); }
  static scrollBy(self, dx, dy) { return self.scrollBy(dx, dy); }
  static wheelEvent(self, e) { return self.wheelEvent(e); }
  static sizeHint(self) { return self.sizeHint(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QComboBox (rozwija listę przez warstwę popup hosta)
// ═════════════════════════════════════════════════════════════════════════════
class QComboBox extends QWidget {
  constructor(parent = null) { super(parent); this._items = []; this._index = -1; this._focusPolicy = Qt.ClickFocus; this._cursor = Qt.PointingHandCursor; this._open = false; this.currentIndexChanged = new Signal(); this.activated = new Signal(); }
  static create(items = [], parent = null) { const c = new QComboBox(parent); c.addItems(items); return c; }
  static properties = {
    currentIndex: { get: (o) => o.currentIndex(), set: (o, v) => o.setCurrentIndex(v), notify: 'currentIndexChanged', type: 'number' },
    currentText: { get: (o) => o.currentText(), type: 'string' },
    count: { get: (o) => o.count(), type: 'number' },
  };
  addItem(t) { this._items.push(String(t)); if (this._index < 0) this.setCurrentIndex(0); this.update(); return this; }
  addItems(arr) { arr.forEach((t) => this.addItem(t)); return this; }
  clear() { this._items = []; this._index = -1; this.update(); return this; }
  count() { return this._items.length; } currentIndex() { return this._index; } currentText() { return this._items[this._index] ?? ''; } itemText(i) { return this._items[i]; }
  setCurrentIndex(i) { i = clamp(i, -1, this._items.length - 1); if (i !== this._index) { this._index = i; this.currentIndexChanged.emit(i); } this.update(); return this; }
  sizeHint() { return new QSize(160, 34); }
  mousePressEvent() { this.showPopup(); }
  showPopup() {
    if (!this._view) return;
    const list = new QListWidget(); this._items.forEach((t) => list.addItem(t)); list.setCurrentRow(this._index);
    const g = this._absPos(); const h = Math.min(240, this._items.length * 30 + 2);
    list.setGeometry(QRect.of(g.x(), g.y() + this.height() + 3, Math.max(this.width(), 120), h));
    list.itemClicked.connect(() => { const r = list.currentRow(); this.setCurrentIndex(r); this.activated.emit(r); this._open = false; this._view._closePopup(list); });
    this._open = true; this._view._openPopup(list); this.update();
  }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.setBrush(this._hovered ? Pal.button : Pal.base); p.setPen(QPen.of(this._open || this._focus ? Pal.highlight : Pal.border, this._open || this._focus ? 2 : 1)); p.drawRoundedRect(r, 6);
    p.setFont(this._font); p.setPen(Pal.text); p.drawText(QRect.of(10, 0, this.width() - 30, this.height()), Qt.AlignLeft | Qt.AlignVCenter, this.currentText());
    const ax = this.width() - 16, ay = this.height() / 2; p.setPen(QPen.of(Pal.text, 1.8)); p.drawLine(ax - 5, ay - 2, ax, ay + 3); p.drawLine(ax, ay + 3, ax + 5, ay - 2);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QComboBox.foo(self, …)) ──
  static addItem(self, t) { return self.addItem(t); }
  static addItems(self, arr) { return self.addItems(arr); }
  static clear(self) { return self.clear(); }
  static count(self) { return self.count(); }
  static currentIndex(self) { return self.currentIndex(); }
  static currentText(self) { return self.currentText(); }
  static itemText(self, i) { return self.itemText(i); }
  static setCurrentIndex(self, i) { return self.setCurrentIndex(i); }
  static sizeHint(self) { return self.sizeHint(); }
  static mousePressEvent(self) { return self.mousePressEvent(); }
  static showPopup(self) { return self.showPopup(); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QAction + QMenu (popup) + QToolTip
// ═════════════════════════════════════════════════════════════════════════════
class QAction extends QObject {
  constructor(text = '', parent = null) { super(parent); this._text = text; this._enabled = true; this._checkable = false; this._checked = false; this._separator = false; this.triggered = new Signal(); this.toggled = new Signal(); }
  static create(text, onTriggered = null) { const a = new QAction(text); if (onTriggered) a.triggered.connect(onTriggered); return a; }
  text() { return this._text; } setText(t) { this._text = t; return this; }
  isEnabled() { return this._enabled; } setEnabled(b) { this._enabled = !!b; return this; }
  setCheckable(b) { this._checkable = !!b; return this; } isCheckable() { return this._checkable; }
  isChecked() { return this._checked; } setChecked(b) { this._checked = !!b; this.toggled.emit(this._checked); return this; }
  trigger() { if (!this._enabled) return; if (this._checkable) this.setChecked(!this._checked); this.triggered.emit(this._checked); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QAction.foo(self, …)) ──
  static text(self) { return self.text(); }
  static setText(self, t) { return self.setText(t); }
  static isEnabled(self) { return self.isEnabled(); }
  static setEnabled(self, b) { return self.setEnabled(b); }
  static setCheckable(self, b) { return self.setCheckable(b); }
  static isCheckable(self) { return self.isCheckable(); }
  static isChecked(self) { return self.isChecked(); }
  static setChecked(self, b) { return self.setChecked(b); }
  static trigger(self) { return self.trigger(); }
}
class QMenu extends QWidget {
  constructor(title = '', parent = null) { super(parent); this._title = title; this._actions = []; this._hoverIndex = -1; this._rowH = 30; this.aboutToHide = new Signal(); }
  static create() { return new QMenu(); }
  addAction(textOrAction, onTriggered = null) { const a = textOrAction instanceof QAction ? textOrAction : QAction.create(textOrAction, onTriggered); this._actions.push(a); return a; }
  addSeparator() { const a = new QAction(''); a._separator = true; this._actions.push(a); return a; }
  actions() { return this._actions; }
  sizeHint() { const fm = new QFontMetrics(this._font); let w = 80; for (const a of this._actions) if (!a._separator) w = Math.max(w, fm.horizontalAdvance(a.text()) + 40); let h = 6; for (const a of this._actions) h += a._separator ? 9 : this._rowH; return new QSize(w, h); }
  popup(globalPos, view) { view = view || this._view; if (!view) return; const s = this.sizeHint(); let x = globalPos.x(), y = globalPos.y(); x = Math.min(x, view.root.width() - s.width() - 2); y = Math.min(y, view.root.height() - s.height() - 2); this.setGeometry(QRect.of(Math.max(2, x), Math.max(2, y), s.width(), s.height())); view._openPopup(this); }
  exec(globalPos, view) { return this.popup(globalPos, view); }
  _indexAt(y) { let cy = 3; for (let i = 0; i < this._actions.length; i++) { const a = this._actions[i]; const rh = a._separator ? 9 : this._rowH; if (y >= cy && y < cy + rh && !a._separator) return i; cy += rh; } return -1; }
  mouseMoveEvent(e) { const i = this._indexAt(e.pos().y()); if (i !== this._hoverIndex) { this._hoverIndex = i; this.update(); } }
  enterEvent() {} leaveEvent() { this._hoverIndex = -1; this.update(); }
  mouseReleaseEvent(e) { const i = this._indexAt(e.pos().y()); if (i >= 0 && this._actions[i]._enabled) { this._actions[i].trigger(); } if (this._view) this._view._closePopup(this); }
  paintEvent(p) {
    const Pal = QApplication.palette(); p.setBrush(Pal.window.lighter(118)); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(this.rect().adjusted(0, 0, -1, -1), 8);
    p.setFont(this._font); let cy = 3;
    this._actions.forEach((a, i) => {
      if (a._separator) { p.setPen(QPen.of(Pal.border.lighter(150), 1)); p.drawLine(8, cy + 4, this.width() - 8, cy + 4); cy += 9; return; }
      const rr = QRect.of(3, cy, this.width() - 6, this._rowH);
      if (i === this._hoverIndex && a._enabled) { p.setBrush(Pal.highlight); p.setPen(QPen.of(Qt.transparent, 0)); p.drawRoundedRect(rr, 5); }
      p.setPen(!a._enabled ? Pal.disabled : i === this._hoverIndex ? Pal.highlightedText : Pal.text);
      if (a._checkable && a._checked) p.drawText(QRect.of(rr.left() + 8, cy, 16, this._rowH), Qt.AlignLeft | Qt.AlignVCenter, '✓');
      p.drawText(rr.adjusted(a._checkable ? 26 : 12, 0, -10, 0), Qt.AlignLeft | Qt.AlignVCenter, a.text());
      cy += this._rowH;
    });
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QMenu.foo(self, …)) ──
  static addAction(self, textOrAction, onTriggered = null) { return self.addAction(textOrAction, onTriggered); }
  static addSeparator(self) { return self.addSeparator(); }
  static actions(self) { return self.actions(); }
  static sizeHint(self) { return self.sizeHint(); }
  static popup(self, globalPos, view) { return self.popup(globalPos, view); }
  static exec(self, globalPos, view) { return self.exec(globalPos, view); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static enterEvent(self) { return self.enterEvent(); }
  static leaveEvent(self) { return self.leaveEvent(); }
  static mouseReleaseEvent(self, e) { return self.mouseReleaseEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
}
class QToolTip {
  static showText(globalPos, text, view) { if (view) { view._tooltip = { pos: globalPos, text: String(text) }; view._scheduleRepaint(); } }
  static hideText(view) { if (view && view._tooltip) { view._tooltip = null; view._scheduleRepaint(); } }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QInkCanvas — pole rysowania piórem/rysikiem (pressure, tilt, gumka, dotyk)
// ═════════════════════════════════════════════════════════════════════════════
class QInkCanvas extends QWidget {
  constructor(parent = null) {
    super(parent);
    this._strokes = []; this._cur = null; this._bg = QColor.fromString('#ffffff');
    this._penColor = QColor.fromString('#1a1b1e'); this._penWidth = 3; this._eraser = false; this._eraserWidth = 22;
    this._pressureEnabled = true; this._focusPolicy = Qt.ClickFocus; this._cursor = Qt.CrossCursor;
    this.strokeAdded = new Signal(); this.cleared = new Signal();
  }
  static create(parent = null) { return new QInkCanvas(parent); }
  setPenColor(c) { this._penColor = c instanceof QColor ? c : QColor.fromString(c); return this; } penColor() { return this._penColor; }
  setPenWidth(w) { this._penWidth = w; return this; } penWidth() { return this._penWidth; }
  setBackground(c) { this._bg = c instanceof QColor ? c : QColor.fromString(c); this.update(); return this; }
  setEraser(b) { this._eraser = !!b; this._cursor = b ? Qt.PointingHandCursor : Qt.CrossCursor; return this; } isEraser() { return this._eraser; }
  setPressureEnabled(b) { this._pressureEnabled = !!b; return this; }
  strokeCount() { return this._strokes.length; }
  clear() { this._strokes = []; this._cur = null; this.cleared.emit(); this.update(); return this; }
  undo() { this._strokes.pop(); this.update(); return this; }
  _wForP(stroke, pressure) { const base = stroke.eraser ? this._eraserWidth : stroke.width; return this._pressureEnabled ? base * (0.35 + 1.3 * clamp(pressure, 0, 1)) : base; }
  _begin(x, y, pressure, eraser) { this._cur = { color: this._penColor.clone(), width: this._penWidth, eraser: eraser ?? this._eraser, points: [{ x, y, p: pressure }] }; this.update(); }
  _extend(x, y, pressure) { if (!this._cur) return; const pts = this._cur.points; const last = pts[pts.length - 1]; if (Math.hypot(x - last.x, y - last.y) < 1.1) { last.p = pressure; return; } pts.push({ x, y, p: pressure }); this.update(); }
  _end() { if (this._cur) { this._strokes.push(this._cur); this.strokeAdded.emit(this._cur); this._cur = null; this.update(); } }
  mousePressEvent(e) { this._begin(e.pos().x(), e.pos().y(), e.pressure ? e.pressure() : 0.5, this._eraser); }
  mouseMoveEvent(e) { this._extend(e.pos().x(), e.pos().y(), e.pressure ? e.pressure() : 0.5); }
  mouseReleaseEvent() { this._end(); }
  tabletEvent(e) {
    const eraser = e.pointerType() === 'eraser';
    if (e.type() === QEvent.TabletPress) this._begin(e.pos().x(), e.pos().y(), e.pressure(), eraser);
    else if (e.type() === QEvent.TabletMove) this._extend(e.pos().x(), e.pos().y(), e.pressure());
    else if (e.type() === QEvent.TabletRelease) this._end();
  }
  paintEvent(p) {
    const Pal = QApplication.palette(); const r = this.rect().adjusted(0, 0, -1, -1);
    p.fillRect(this.rect(), this._bg);
    p.save(); p.setClipRect(this.rect().adjusted(1, 1, -2, -2));
    for (const s of this._strokes) this._drawStroke(p, s);
    if (this._cur) this._drawStroke(p, this._cur);
    p.restore();
    p.setBrush(Qt.transparent); p.setPen(QPen.of(Pal.border, 1)); p.drawRoundedRect(r, 6);
  }
  _drawStroke(p, s) {
    const col = s.eraser ? this._bg : s.color; const pts = s.points;
    if (pts.length === 1) { const w = this._wForP(s, pts[0].p); p.setBrush(col); p.setPen(QPen.of(Qt.transparent, 0)); p.drawEllipse(QRect.of(pts[0].x - w / 2, pts[0].y - w / 2, w, w)); return; }
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const w = this._wForP(s, (a.p + b.p) / 2); p.setPen(QPen.of(col, w, Qt.SolidLine).setCapStyle(Qt.RoundCap).setJoinStyle(Qt.RoundJoin)); p.drawLine(a.x, a.y, b.x, b.y); }
  }
  toDataURL(type = 'image/png') {
    const dpr = window.devicePixelRatio || 1; const off = document.createElement('canvas'); off.width = this.width() * dpr; off.height = this.height() * dpr;
    const ctx = off.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const p = new QPainter(ctx);
    p.fillRect(this.rect(), this._bg); for (const s of this._strokes) this._drawStroke(p, s); return off.toDataURL(type);
  }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QInkCanvas.foo(self, …)) ──
  static setPenColor(self, c) { return self.setPenColor(c); }
  static penColor(self) { return self.penColor(); }
  static setPenWidth(self, w) { return self.setPenWidth(w); }
  static penWidth(self) { return self.penWidth(); }
  static setBackground(self, c) { return self.setBackground(c); }
  static setEraser(self, b) { return self.setEraser(b); }
  static isEraser(self) { return self.isEraser(); }
  static setPressureEnabled(self, b) { return self.setPressureEnabled(b); }
  static strokeCount(self) { return self.strokeCount(); }
  static clear(self) { return self.clear(); }
  static undo(self) { return self.undo(); }
  static mousePressEvent(self, e) { return self.mousePressEvent(e); }
  static mouseMoveEvent(self, e) { return self.mouseMoveEvent(e); }
  static mouseReleaseEvent(self) { return self.mouseReleaseEvent(); }
  static tabletEvent(self, e) { return self.tabletEvent(e); }
  static paintEvent(self, p) { return self.paintEvent(p); }
  static toDataURL(self, type = 'image/png') { return self.toDataURL(type); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  QtCanvas — host webcomponentowy (Lit): canvas + pętla + zdarzenia
//  Mysz, PIÓRO (QTabletEvent: pressure/tilt/gumka), DOTYK (przewijanie gestem,
//  long-press → menu kontekstowe), bąbelkowanie, focus, popupy, tooltipy, kursor.
// ═════════════════════════════════════════════════════════════════════════════
class QtCanvas extends LitElement {
  // UWAGA: QtCanvas to custom element — trzeba go zarejestrować, by dało się
  // utworzyć instancję (`new QtCanvas()` na niezarejestrowanej klasie → "Illegal
  // constructor").
  //
  // WAŻNE dla skryptów z WKLEJONĄ biblioteką: przy każdym uruchomieniu kod jest
  // re-ewaluowany, więc `class QtCanvas`, `class QWidget`, `class QPushButton`…
  // to ZA KAŻDYM RAZEM NOWE obiekty klas (nowa "generacja"). Custom element raz
  // zarejestrowany pod tagiem 'qt-canvas' zostaje związany z PIERWSZĄ generacją,
  // więc `createElement('qt-canvas')` zwracałby starą klasę → `view.root` byłby
  // QWidget gen-1, a widgety budowane przez skrypt (i `getRoot()`) gen-N →
  // drzewo/layout nie współgrają i nic się nie maluje.
  //
  // Dlatego rejestrujemy ŚWIEŻY tag dla BIEŻĄCEJ generacji klasy: `view.root`
  // jest wtedy tej samej generacji co reszta widgetów skryptu. (Przy ładowaniu
  // przez `import` moduł jest cache'owany → jedna generacja, jeden tag.)
  static create() {
    if (typeof customElements === 'undefined' || typeof document === 'undefined') return new QtCanvas();
    // Klasa może być zarejestrowana tylko pod JEDNYM tagiem. Najpierw sprawdź,
    // czy TA klasa (generacja) jest już zarejestrowana — i użyj jej tagu:
    //  • `__tag` ustawiamy sami (tu i przy auto-rejestracji na dole pliku),
    //  • `customElements.getName(this)` to natywny odczyt tagu konstruktora.
    // Dopiero gdy klasa NIE jest jeszcze nigdzie zarejestrowana, nadajemy świeży
    // tag. To zapobiega błędowi "this constructor has already been used".
    let tag = (Object.prototype.hasOwnProperty.call(this, '__tag') && this.__tag) ? this.__tag : null;
    if (!tag && typeof customElements.getName === 'function') tag = customElements.getName(this);
    if (!tag) {
      let seq = (globalThis.__QT_CANVAS_SEQ = (globalThis.__QT_CANVAS_SEQ || 0) + 1);
      tag = `qt-canvas-${seq}`;
      while (customElements.get(tag)) tag = `qt-canvas-${(globalThis.__QT_CANVAS_SEQ = globalThis.__QT_CANVAS_SEQ + 1)}`;
      customElements.define(tag, this);
      this.__tag = tag;
    }
    return document.createElement(tag);
  }
  static styles = css`
    /* min-width:0 jest KLUCZOWE: gdy <qt-canvas> jest elementem kontenera flex
       (tak montuje display.dom w output skryptu), bez tego min-content elementu =
       intrinsic szerokość backing-bufora canvasu (w*devicePixelRatio = 2× na
       Retinie) → host rośnie do 2× → mysz w osi X rozjeżdża się o połowę.
       min-width:0 pozwala uszanować width:100% zamiast min-content. */
    :host { display: block; width: 100%; min-width: 0; max-width: 100%; height: 300px; box-sizing: border-box; }
    canvas { display: block; width: 100%; height: 100%; outline: none; touch-action: none; user-select: none; }
  `;
  constructor() {
    super();
    this.root = new QWidget(); this.root._objectName = 'root';
    this._raf = 0; this._grab = null; this._hover = null; this._focusWidget = null;
    this._popups = []; this._tooltip = null; this._ttTimer = 0;
    this._scrolling = false; this._scrollTarget = null; this._pressPos = null; this._lastMove = null; this._lpTimer = 0;
    this.root.paintEvent = (p) => { p.fillRect(this.root.rect(), QApplication.palette().window); };
  }
  render() { return html`<canvas tabindex="0"></canvas>`; }

  firstUpdated() {
    this._canvas = this.renderRoot.querySelector('canvas'); this._ctx = this._canvas.getContext('2d');
    this.root._view = this; this.root._propagateView(this);
    this._bindEvents();
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
    this._blink = setInterval(() => { if (this._focusWidget && (this._focusWidget instanceof QLineEdit || this._focusWidget instanceof QTextEdit)) this._scheduleRepaint(); }, 500);
    this._resize();
  }
  disconnectedCallback() { super.disconnectedCallback(); this._ro && this._ro.disconnect(); clearInterval(this._blink); cancelAnimationFrame(this._raf); clearTimeout(this._ttTimer); clearTimeout(this._lpTimer); }

  _openPopup(w) { w._view = this; w._propagateView(this); this._popups.push(w); this._scheduleRepaint(); }
  _closePopup(w) { const i = this._popups.indexOf(w); if (i >= 0) this._popups.splice(i, 1); this._scheduleRepaint(); }
  _closeAllPopups() { if (this._popups.length) { this._popups = []; this._scheduleRepaint(); } }

  _resize() {
    const dpr = window.devicePixelRatio || 1; const r = this.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)) || 300, h = Math.max(1, Math.round(r.height)) || 300;
    this._canvas.width = w * dpr; this._canvas.height = h * dpr; this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.root.setGeometry(QRect.of(0, 0, w, h)); this._scheduleRepaint();
  }
  _scheduleRepaint() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this._repaint(); }); }
  _repaint() {
    if (!this._ctx) return; const dpr = window.devicePixelRatio || 1;
    this._ctx.save(); this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this._ctx.clearRect(0, 0, this.root.width(), this.root.height());
    const painter = new QPainter(this._ctx); painter.setRenderHint(0, true);
    this.root._paint(painter);
    for (const pu of this._popups) { painter.save(); painter.setOpacity(0.25); painter.fillRect(pu.geometry().translated(0, 3), QColor.fromString('#000000')); painter.restore(); pu._paint(painter); }
    if (this._tooltip) this._paintTooltip(painter);
    this._ctx.restore();
  }
  _paintTooltip(p) {
    const Pal = QApplication.palette(); const f = QFont.of('system-ui, sans-serif', 12); const fm = new QFontMetrics(f);
    const tw = fm.horizontalAdvance(this._tooltip.text) + 16, th = fm.height() + 8;
    let x = this._tooltip.pos.x() + 12, y = this._tooltip.pos.y() + 18; x = Math.min(x, this.root.width() - tw - 2); y = Math.min(y, this.root.height() - th - 2);
    p.setBrush(QColor.fromString('#11151c').withAlpha(240)); p.setPen(QPen.of(Pal.border.lighter(160), 1)); p.drawRoundedRect(QRect.of(x, y, tw, th), 5);
    p.setFont(f); p.setPen(Pal.text); p.drawText(QRect.of(x + 8, y, tw - 16, th), Qt.AlignLeft | Qt.AlignVCenter, this._tooltip.text);
  }

  _toView(e) { const r = this._canvas.getBoundingClientRect(); return new QPoint(e.clientX - r.left, e.clientY - r.top); }
  _hitAll(vp) {
    for (let i = this._popups.length - 1; i >= 0; i--) { const pu = this._popups[i]; if (pu.geometry().contains(vp)) return { target: pu._hitTest(vp.sub(pu.pos())), inPopup: true }; }
    if (this._popups.length) return { target: null, inPopup: false, outsidePopup: true };
    return { target: this.root._hitTest(vp), inPopup: false };
  }
  _scrollableAncestor(w) { let n = w; while (n) { if (n._scrollable && typeof n.scrollBy === 'function') return n; n = n._parent; } return null; }

  _mouse(type, local, vp, e) { const btn = (e.button ?? 0) + 1; const buttons = e.buttons ?? 1; let mods = 0; if (e.shiftKey) mods |= Qt.ShiftModifier; if (e.ctrlKey) mods |= Qt.ControlModifier; if (e.altKey) mods |= Qt.AltModifier; return new QMouseEvent(type, local, vp, type === QEvent.MouseMove ? Qt.NoButton : btn, buttons, mods, { pressure: e.pressure || 0.5, tiltX: e.tiltX || 0, tiltY: e.tiltY || 0, pointerType: e.pointerType || 'mouse' }); }
  _tablet(type, local, vp, e) { const eraser = (e.buttons & 32) || e.button === 5; return new QTabletEvent(type, local, vp, Math.max(e.pressure || 0, type === QEvent.TabletPress ? 0.05 : 0), e.tiltX || 0, e.tiltY || 0, eraser ? 'eraser' : 'pen', 0); }
  _isPen(e) { return e.pointerType === 'pen'; }

  _bindEvents() {
    const cv = this._canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId); cv.focus(); this._hideTooltip();
      const vp = this._toView(e); const hit = this._hitAll(vp);
      if (hit.outsidePopup) { this._closeAllPopups(); return; }
      const target = hit.target; this._setFocus(target);
      this._pressPos = vp.clone(); this._lastMove = vp.clone(); this._scrolling = false;
      this._scrollTarget = e.pointerType === 'touch' ? this._scrollableAncestor(target) : null;
      if (e.pointerType === 'touch') this._startLongPress(target, vp);
      if (!target) { this._grab = null; return; }
      const pen = this._isPen(e);
      if (pen) {
        const tev = this._tablet(QEvent.TabletPress, vp.sub(target._absPos()), vp, e); target.tabletEvent(tev);
        if (tev.isAccepted()) { this._grab = { widget: target, tablet: true }; return; }
      }
      const acc = this._deliverPress(target, vp, e); this._grab = acc ? { widget: acc, tablet: false } : { widget: target, tablet: false };
    });
    cv.addEventListener('pointermove', (e) => {
      const vp = this._toView(e);
      if (this._grab) {
        if (this._scrollTarget && !this._scrolling) { const m = vp.sub(this._pressPos); if (Math.abs(m.x()) > 9 || Math.abs(m.y()) > 9) { this._scrolling = true; this._cancelLongPress(); if (!this._grab.tablet && this._grab.widget) this._grab.widget._pressed = false; } }
        if (this._scrolling) { const d = vp.sub(this._lastMove); this._scrollTarget.scrollBy(-d.x(), -d.y()); this._lastMove = vp; return; }
        if (vp.sub(this._pressPos).manhattanLength() > 9) this._cancelLongPress();
        const g = this._grab; const local = vp.sub(g.widget._absPos());
        if (g.tablet) g.widget.tabletEvent(this._tablet(QEvent.TabletMove, local, vp, e));
        else g.widget.mouseMoveEvent(this._mouse(QEvent.MouseMove, local, vp, e));
        return;
      }
      const hit = this._hitAll(vp); const target = hit.target;
      if (target !== this._hover) { this._hover && this._hover.leaveEvent(); this._hover = target; target && target.enterEvent(); this._canvas.style.cursor = target ? (target._cursor || 'default') : 'default'; this._hideTooltip(); this._scheduleTooltip(target, vp); }
      else if (target && target.toolTip && target.toolTip()) this._scheduleTooltip(target, vp);
      if (target && target.hasMouseTracking && target.hasMouseTracking()) target.mouseMoveEvent(this._mouse(QEvent.MouseMove, vp.sub(target._absPos()), vp, e));
    });
    const up = (e) => {
      const vp = this._toView(e); this._cancelLongPress();
      if (this._scrolling) { this._scrolling = false; this._grab = null; this._scrollTarget = null; return; }
      if (this._grab) { const g = this._grab; const local = vp.sub(g.widget._absPos()); if (g.tablet) g.widget.tabletEvent(this._tablet(QEvent.TabletRelease, local, vp, e)); else g.widget.mouseReleaseEvent(this._mouse(QEvent.MouseButtonRelease, local, vp, e)); }
      this._grab = null; this._scrollTarget = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', (e) => { const vp = this._toView(e); const t = this._hitAll(vp).target; if (t) t.mouseDoubleClickEvent(this._mouse(QEvent.MouseButtonDblClick, vp.sub(t._absPos()), vp, e)); });
    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); const vp = this._toView(e); const t = this._hitAll(vp).target; if (t) this._deliverContextMenu(t, vp); });
    cv.addEventListener('wheel', (e) => { const vp = this._toView(e); const t = this._hitAll(vp).target; if (!t) return; let w = t; const ev = new QWheelEvent(vp, { x: -e.deltaX, y: -e.deltaY }, { x: -e.deltaX, y: -e.deltaY }, 0); while (w) { ev.accept(); w.wheelEvent(ev._withPos(vp.sub(w._absPos()))); if (ev.isAccepted()) { e.preventDefault(); break; } w = w._parent; } }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._popups.length) { this._closeAllPopups(); return; }
      if (this._focusWidget && this._focusWidget.focusPolicy()) {
        const k = e.key; if (['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Home', 'End', 'PageUp', 'PageDown'].includes(k)) e.preventDefault();
        let mods = 0; if (e.shiftKey) mods |= Qt.ShiftModifier; if (e.ctrlKey) mods |= Qt.ControlModifier; if (e.altKey) mods |= Qt.AltModifier;
        this._focusWidget.keyPressEvent(new QKeyEvent(QEvent.KeyPress, k === 'Enter' ? 'Enter' : k, k.length === 1 ? k : '', mods));
      }
    });
  }

  _deliverPress(target, vp, e) { let w = target; while (w) { const ev = this._mouse(QEvent.MouseButtonPress, vp.sub(w._absPos()), vp, e); ev.accept(); w.mousePressEvent(ev); if (ev.isAccepted()) return w; w = w._parent; } return null; }
  _deliverContextMenu(target, vp) { let w = target; while (w) { const ev = new QMouseEvent(QEvent.ContextMenu, vp.sub(w._absPos()), vp, Qt.RightButton, 0, 0); ev.accept(); w.contextMenuEvent(ev); if (ev.isAccepted()) return; w = w._parent; } }
  _startLongPress(target, vp) { clearTimeout(this._lpTimer); this._lpTimer = setTimeout(() => { if (!this._scrolling && target) this._deliverContextMenu(target, vp); }, 500); }
  _cancelLongPress() { clearTimeout(this._lpTimer); this._lpTimer = 0; }
  _scheduleTooltip(target, vp) { clearTimeout(this._ttTimer); if (!target || !target.toolTip || !target.toolTip()) return; this._ttTimer = setTimeout(() => { QToolTip.showText(vp, target.toolTip(), this); }, 600); }
  _hideTooltip() { clearTimeout(this._ttTimer); QToolTip.hideText(this); }
  _setFocus(w) { const focusable = w && w.focusPolicy && w.focusPolicy() ? w : null; if (focusable === this._focusWidget) return; this._focusWidget && this._focusWidget.focusOutEvent(); this._focusWidget = focusable; this._focusWidget && this._focusWidget.focusInEvent(); }

  // ── Statyczne odpowiedniki metod instancji (autocomplete: QtCanvas.foo(self, …)) ──
  static render(self) { return self.render(); }
  static firstUpdated(self) { return self.firstUpdated(); }
  static disconnectedCallback(self) { return self.disconnectedCallback(); }
}
// Auto-rejestracja taga dla bieżącej generacji QtCanvas.
// Gdy 'qt-canvas' jest już zajęty (stara generacja z poprzedniego uruchomienia
// skryptu), rejestrujemy pod świeżym tagiem qt-canvas-N. Dzięki temu zarówno
// `new QtCanvas()` jak i `QtCanvas.create()` działają przy każdym ponownym
// uruchomieniu skryptu bez "Failed to construct 'HTMLElement': Illegal constructor".
if (!customElements.get('qt-canvas')) {
  customElements.define('qt-canvas', QtCanvas);
  QtCanvas.__tag = 'qt-canvas';
} else if (!Object.prototype.hasOwnProperty.call(QtCanvas, '__tag')) {
  // Nowa generacja (re-ewaluacja): rejestrujemy pod unikalnym tagiem qt-canvas-N.
  let _seq = (globalThis.__QT_CANVAS_SEQ = (globalThis.__QT_CANVAS_SEQ || 0) + 1);
  let _tag = `qt-canvas-${_seq}`;
  while (customElements.get(_tag)) _tag = `qt-canvas-${(globalThis.__QT_CANVAS_SEQ = globalThis.__QT_CANVAS_SEQ + 1)}`;
  customElements.define(_tag, QtCanvas);
  QtCanvas.__tag = _tag;
}

const QT_CANVAS_TAG = QtCanvas.__tag;

// inicjalizacja kolorów globalnych Qt.* (po zdefiniowaniu QColor)
Qt.white = new QColor(255, 255, 255); Qt.black = new QColor(0, 0, 0); Qt.red = new QColor(255, 0, 0); Qt.darkRed = new QColor(128, 0, 0);
Qt.green = new QColor(0, 255, 0); Qt.darkGreen = new QColor(0, 128, 0); Qt.blue = new QColor(0, 0, 255); Qt.darkBlue = new QColor(0, 0, 128);
Qt.cyan = new QColor(0, 255, 255); Qt.magenta = new QColor(255, 0, 255); Qt.yellow = new QColor(255, 255, 0);
Qt.gray = new QColor(160, 160, 164); Qt.darkGray = new QColor(128, 128, 128); Qt.lightGray = new QColor(192, 192, 192); Qt.transparent = new QColor(0, 0, 0, 0);

// ═════════════════════════════════════════════════════════════════════════════
//  Eksport przez globalny namespace (BEZ `export`) — wszystkie klasy lądują na
//  globalThis, więc są dostępne bez `import` (także w runtime skryptów
//  automatyzacji uruchamianych przez AsyncFunction/eval).
//  Signal/SignalConnection/QObject eksportuje qobject.module.js — pomijamy tu.
// ═════════════════════════════════════════════════════════════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  Object.assign(_g, {
    Qt, QPoint, QPointF, QSize, QSizeF, QMargins, QRect, QRectF, QLine, QLineF, QPolygon,
    QColor, QGradient, QLinearGradient, QRadialGradient, QFont, QFontMetrics, QPen, QBrush, QPainterPath,
    QEvent, QInputEvent, QMouseEvent, QTabletEvent, QKeyEvent, QWheelEvent, QResizeEvent,
    QPainter, QSizePolicy,
    QWidget, QFrame,
    QSpacerItem, QLayout, QBoxLayout, QVBoxLayout, QHBoxLayout, QGridLayout, QFormLayout,
    QPalette, QApplication,
    QLabel, QAbstractButton, QPushButton, QToolButton, QCheckBox, QRadioButton,
    QAbstractSlider, QSlider, QScrollBar, QDial, QProgressBar, QSpinBox, QDoubleSpinBox,
    QLineEdit, QTextEdit, QGroupBox,
    QListWidgetItem, QListWidget, QStackedWidget, QTabBar, QTabWidget, QScrollArea,
    QComboBox, QAction, QMenu, QToolTip, QInkCanvas,
    QtCanvas, QT_CANVAS_TAG,
  });
}
