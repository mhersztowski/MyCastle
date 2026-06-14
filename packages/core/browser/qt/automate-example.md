# qt w skrypcie automatyzacji (edytor Markdown)

Przykład użycia biblioteki **`qt.module.js`** (widgety Qt rysowane na canvasie)
wewnątrz bloku **Automate Script** w edytorze Markdown.

## Jak uruchomić

1. W notatce wpisz `/` → wybierz **Automate Script** (albo **Plugin Script**).
2. Wklej kod z sekcji niżej do bloku.
3. Uruchom (▶ / `Ctrl+Enter`).

### Dwie ważne rzeczy

- **`// @library: lit`** na górze — wstrzykuje bibliotekę *lit* jako globalne
  `Lit`, której wymaga `qt.module.js`. (Statyczny `import` w skryptach jest
  błędem składni — dlatego moduł czytamy dynamicznie przez `await import(...)`.)
- Po `await import('…/qt.module.js')` wszystkie klasy (`QtCanvas`, `QVBoxLayout`,
  `QPushButton`, `QColor`, …) lądują na `window`/`globalThis` — moduł
  eksportuje je globalnie, więc używasz ich wprost, bez `import { … }`.
- Żywy element montujemy w wyniku bloku przez **`display.dom(element)`**.

> Ścieżka URL wskazuje na plik w Twoim Drive:
> `drive/public/lit/qt/qt.module.js` → adres publiczny
> `/public/drive/users/<TWÓJ_USER>/lit/qt/qt.module.js`.
> W przykładzie użyto `marcin` — podmień na swoją nazwę użytkownika.

## Przykład — suwak, pasek, pole tekstu, przyciski

```js
// @library: lit

// 1) Wczytaj bibliotekę qt (klasy trafiają na globalThis/window).
await import('/public/drive/users/marcin/lit/qt/qt.module.js');

// 2) Host rysujący na <canvas> + pionowy layout w jego korzeniu.
const view = new QtCanvas();
const col = new QVBoxLayout(view.root);
col.setContentsMargins(16, 16, 16, 16);
col.setSpacing(10);

// 3) Nagłówek.
col.addWidget(QLabel.create('Demo qt — suwak steruje paskiem postępu:'));

// 4) Suwak → pasek postępu (połączenie sygnał/slot).
const slider = QSlider.create(0, 100, 30);
const bar    = QProgressBar.create(0, 100, 30);
slider.valueChanged.connect((v) => bar.setValue(v));
col.addWidget(slider);
col.addWidget(bar);

// 5) Pole tekstowe → etykieta na żywo.
const echo = QLabel.create('Wpisz tekst…');
const edit = QLineEdit.create('');
edit.textChanged.connect((t) => echo.setText(t ? `Tekst: ${t}` : 'Wpisz tekst…'));
col.addWidget(edit);
col.addWidget(echo);

// 6) Rząd przycisków (zagnieżdżony layout poziomy).
const row = new QHBoxLayout();
row.addWidget(QPushButton.create('Reset', () => { slider.setValue(0); edit.setText(''); }));
row.addWidget(QCheckBox.create('Suwak aktywny', (on) => slider.setEnabled(on)));
col.addLayout(row);

// 7) Zamontuj żywy widget w wyniku bloku.
display.dom(view);
```

## Wariant z piórem/rysikiem (`QInkCanvas`)

Działa myszą, palcem i rysikiem (nacisk steruje grubością linii).

```js
// @library: lit
await import('/public/drive/users/marcin/lit/qt/qt.module.js');

const view = new QtCanvas();
const col = new QVBoxLayout(view.root);
col.setContentsMargins(12, 12, 12, 12);

const ink = QInkCanvas.create();
ink.setPenColor(QColor.fromString('#1d72f3')).setPenWidth(3);

const tools = new QHBoxLayout();
tools.addWidget(QPushButton.create('Cofnij', () => ink.undo()));
tools.addWidget(QPushButton.create('Wyczyść', () => ink.clear()));
tools.addWidget(QPushButton.create('Gumka',  () => ink.setEraser(true)));
tools.addWidget(QPushButton.create('Pisz',   () => ink.setEraser(false)));

col.addLayout(tools);
col.addWidget(ink, /* stretch */ 1);

display.dom(view);
```

## Static-first (podpowiedzi w edytorze)

Większość konstrukcji ma fabryki/utility `static`, więc po wpisaniu nazwy klasy
z kropką edytor podpowiada gotowe wywołania:

```js
QColor.fromHsv(210, 0.8, 0.9);   // kolor z HSV
QRect.of(0, 0, 120, 32);         // prostokąt
QFont.of('monospace', 13, 700);  // czcionka
QPushButton.create('OK', onOk);  // przycisk z handlerem
QSlider.create(0, 255, 128);     // suwak min/max/wartość
Qt.AlignCenter;                  // enumy w przestrzeni Qt
```
