# qt — widgety Qt rysowane na canvasie (Lit)

Biblioteka web-componentów (Lit) z API **wzorowanym 1:1 na Qt** (nazwy klas/metod
jak `QWidget`, `QPushButton`, `QSlider`, `rect.width()`, `slider.value()`), ale
widgety są **rysowane na `<canvas>`** w trybie retained-mode. Dużo metod `static`
(fabryki/utility) — dla wygodnego autocomplete w edytorze JS.

Zaprojektowana pod **urządzenia mobilne** (dotyk, przewijanie gestem, long-press →
menu, popupy) i **pióro/rysik** (`QTabletEvent`: nacisk steruje grubością, pochył,
gumka). Klasy nie są eksportowane przy deklaracji — eksport zbiorczy na końcu pliku.

## Pliki
- `qt.module.js` — cała biblioteka (~1380 linii): typy, kolory/gradienty, czcionki, painter, zdarzenia, widgety, layouty, host `<qt-canvas>`.
- `example.module.js` — demo z 3 zakładkami (Widgety / Pióro / Mobile). Osadzalne.

## Szybki start
```js
import { QtCanvas, QVBoxLayout, QPushButton, QSlider, QProgressBar } from './qt.module.js';

const view = new QtCanvas();                  // <qt-canvas> — host, sam rysuje (rAF)
const lay  = new QVBoxLayout(view.root);
const slider = QSlider.create(0, 100, 30);
const bar    = QProgressBar.create(0, 100, 30);
slider.valueChanged.connect(v => bar.setValue(v));
lay.addWidget(slider); lay.addWidget(bar);
lay.addWidget(QPushButton.create('Reset', () => slider.setValue(0)));
document.body.appendChild(view);
```

## Pióro / rysik (`QInkCanvas`)
```js
import { QInkCanvas, QColor } from './qt.module.js';
const ink = QInkCanvas.create();
ink.setPenColor(QColor.fromString('#1d72f3')).setPenWidth(3);
ink.setEraser(false);            // gumka: setEraser(true)
ink.undo(); ink.clear();
const png = ink.toDataURL();     // eksport rysunku
```
`QInkCanvas` odbiera `QTabletEvent` (pen/eraser) z `pressure()`/`xTilt()`/`yTilt()` —
nacisk steruje grubością linii; działa też palcem i myszą.

## Mobile (`QScrollArea`)
Owiń wysoką zawartość w `QScrollArea` — na telefonie/tablecie **przeciągnięcie palcem
przewija** (host kradnie gest), kółko myszy też. `long-press` wywołuje
`contextMenuEvent` (możesz pokazać `QMenu`). `QComboBox`/`QMenu`/`QToolTip` rysują się
w warstwie popup nad resztą.

## Zawartość API (skrót)
- **Typy:** `QPoint(F)`, `QSize(F)`, `QRect(F)`, `QMargins`, `QLine(F)`, `QPolygon` — `r.width()`, `r.center()`, `r.contains(p)`. Fabryki: `QRect.of`, `QPoint.of`, …
- **Kolor/gradienty/czcionki:** `QColor` (`fromRgb/fromHsv/fromHsl/fromString/blend/lighter/darker`), `QLinearGradient`, `QRadialGradient`, `QFont`, `QFontMetrics` (`horizontalAdvance`, `elidedText`), `QPen` (style linii: `Qt.DashLine`…), `QBrush`, `QPainterPath`.
- **Qt:** enumy + kolory: `Qt.AlignCenter`, `Qt.Horizontal`, `Qt.Checked`, `Qt.LeftButton`, `Qt.ShiftModifier`, `Qt.DashLine`, `Qt.PointingHandCursor`, `Qt.white`/`Qt.red`…, klawisze `Qt.Key_*`.
- **Zdarzenia:** `QEvent`, `QMouseEvent` (`pos/button/buttons/modifiers/pressure/pointerType`), `QTabletEvent`, `QKeyEvent`, `QWheelEvent`, `QResizeEvent` — z `accept()/ignore()` i **bąbelkowaniem**.
- **QPainter:** `drawRect/RoundedRect/Ellipse/Arc/Pie/Line/Polyline/Polygon/Path/Text/Image`, `fillRect`, gradienty, `setPen/Brush/Font`, `save/restore/translate/rotate/scale/setClipRect/setOpacity`.
- **QWidget (baza):** geometria, `min/maximumSize`, `setSizePolicy`, `setToolTip`, `setCursor`, `setMouseTracking`, `raise/lower`, `mapToGlobal`, `setFocus`, wirtualne `paintEvent` + handlery zdarzeń.
- **Widgety:** `QLabel` (wordWrap/elide), `QFrame`, `QPushButton`/`QToolButton` (`clicked`), `QCheckBox`/`QRadioButton` (`toggled`), `QSlider`/`QScrollBar`/`QDial` (`valueChanged`), `QProgressBar`, `QSpinBox`/`QDoubleSpinBox`, `QLineEdit` (hasło/echo), `QTextEdit` (wieloliniowy), `QGroupBox`, `QComboBox`, `QListWidget`, `QStackedWidget`/`QTabBar`/`QTabWidget`, `QScrollArea`, `QMenu`/`QAction`, `QToolTip`, `QInkCanvas`.
- **Layouty:** `QVBoxLayout`, `QHBoxLayout` (stretch/spacing/marginy), `QGridLayout` (span + `setColumnStretch`), `QFormLayout` (`addRow`).
- **Host:** `QtCanvas` (`<qt-canvas>`) — pętla rAF, mysz/pióro/dotyk/klawiatura, focus, popupy, tooltipy, kursor, DPR. `QApplication.palette()`, `QApplication.setStyleColor(...)`.

## Static-first (autocomplete)
Wpisując `QColor.`, `QRect.`, `QPushButton.`, `QSlider.`, `Qt.` dostajesz listę:
`QColor.fromHsv(210,.8,.9)`, `QRect.of(0,0,120,32)`, `QFont.of('monospace',13,700)`,
`QPushButton.create('OK', onOk)`, `QSlider.create(0,255,128)`, `QInkCanvas.create()`,
`QMenu.create()`, `Qt.AlignCenter`.

## Różnice względem Qt
- Renderowanie na canvasie (nie natywne) — klon API, nie silnik Qt.
- Pętla zdarzeń to rAF + zdarzenia DOM (Pointer Events: mysz/pióro/dotyk).
- `QLineEdit`/`QTextEdit` uproszczone (bez zaznaczania myszą/IME). `QDial` przybliżony.
- Celowo dużo `static` fabryk (poza tym nazwy 1:1 jak w Qt).

## Osadzenie w Markdown
```
@[web:lit:/public/drive/users/marcin/lit/qt/example.module.js]
```
