/**
 * example.module.js — demo biblioteki qt (Qt na canvasie). Pokazuje 3 zakładki:
 *   • Widgety  — przyciski, suwak→pasek, pole tekstowe, radio, combo, spinbox, dial
 *   • Pióro    — QInkCanvas: rysowanie rysikiem (nacisk steruje grubością), gumka
 *   • Mobile   — QScrollArea: długi formularz przewijany palcem (gest)
 *
 * Osadzenie: /Osadź stronę www → Komponent (lit) → qt/example.module.js
 *   albo @[web:lit:/public/drive/users/marcin/lit/qt/example.module.js]
 * Klasa nie jest eksportowana przy deklaracji — eksport zbiorczy na końcu.
 */
// lit z globalnego `Lit` (skrypty automatyzacji) lub z CDN (WebEmbed) — patrz qt.module.js
const _lit = (typeof globalThis !== 'undefined' && globalThis.Lit && globalThis.Lit.LitElement)
  ? globalThis.Lit
  : await import('https://cdn.jsdelivr.net/npm/lit@3/+esm');
const { LitElement, html, css } = _lit;
import {
  QWidget, QVBoxLayout, QHBoxLayout, QFormLayout, QGroupBox,
  QLabel, QPushButton, QToolButton, QCheckBox, QRadioButton, QSlider, QProgressBar,
  QLineEdit, QComboBox, QSpinBox, QDial, QListWidget, QTabWidget, QScrollArea, QInkCanvas,
  QFont, QColor, Qt,
} from './qt.module.js';

const QT_EXAMPLE_TAG = 'qt-example';

class QtExample extends LitElement {
  static styles = css`
    :host { display: block; font-family: system-ui, sans-serif; }
    qt-canvas { height: 540px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 6px rgba(0,0,0,.35); }
  `;
  render() { return html`<qt-canvas></qt-canvas>`; }

  firstUpdated() {
    const view = this.renderRoot.querySelector('qt-canvas');
    const tabs = new QTabWidget();
    view.root.setLayout(new QVBoxLayout());
    view.root.layout().setContentsMargins(0, 0, 0, 0);
    view.root.layout().addWidget(tabs);

    tabs.addTab(this._widgetsPage(), 'Widgety');
    tabs.addTab(this._penPage(), 'Pióro / rysik');
    tabs.addTab(this._mobilePage(), 'Mobile / scroll');
  }

  // ── Zakładka 1: przegląd widgetów ──────────────────────────────────────────
  _widgetsPage() {
    const page = new QWidget();
    const main = new QVBoxLayout(page);
    main.setContentsMargins(16, 16, 16, 16); main.setSpacing(12);

    const title = QLabel.create('Widgety Qt rysowane na canvasie');
    title.setFont(QFont.of('system-ui, sans-serif', 17, 700));
    main.addWidget(title);

    const grp = QGroupBox.create('QSlider → QProgressBar');
    const gl = new QVBoxLayout(grp);
    const slider = QSlider.create(0, 100, 40);
    const bar = QProgressBar.create(0, 100, 40);
    slider.valueChanged.connect((v) => bar.setValue(v));
    gl.addWidget(slider); gl.addWidget(bar);
    main.addWidget(grp);

    const form = new QFormLayout();
    const edit = QLineEdit.create(''); edit.setPlaceholderText('QLineEdit');
    const combo = QComboBox.create(['Czerwony', 'Zielony', 'Niebieski']);
    const spin = QSpinBox.create(0, 100, 12); spin.setSuffix(' px');
    const dial = QDial.create(0, 100, 30); dial.setToolTip('QDial — obróć');
    form.addRow('Nazwa:', edit);
    form.addRow('Kolor:', combo);
    form.addRow('Rozmiar:', spin);
    form.addRow('Obrót:', dial);
    const formHost = new QWidget(); formHost.setLayout(form);
    main.addWidget(formHost);

    const row = new QWidget(); const rl = new QHBoxLayout(row); rl.setContentsMargins(0, 0, 0, 0);
    const cb = QCheckBox.create('Aktywne', null); cb.setChecked(true);
    const rA = QRadioButton.create('A'); const rB = QRadioButton.create('B'); rA.setChecked(true);
    const ok = QPushButton.create('OK', () => slider.setValue(slider.value() + 10)); ok.setDefault(true);
    cb.toggled.connect((on) => ok.setEnabled(on));
    rl.addWidget(cb); rl.addWidget(rA); rl.addWidget(rB); rl.addStretch(1); rl.addWidget(ok);
    main.addWidget(row);
    main.addStretch(1);
    return page;
  }

  // ── Zakładka 2: pióro / rysik (QInkCanvas) ─────────────────────────────────
  _penPage() {
    const page = new QWidget();
    const v = new QVBoxLayout(page);
    v.setContentsMargins(12, 12, 12, 12); v.setSpacing(8);

    const ink = QInkCanvas.create();
    ink.setToolTip('Rysuj rysikiem — nacisk steruje grubością');

    // pasek narzędzi
    const tb = new QWidget(); const tl = new QHBoxLayout(tb); tl.setContentsMargins(0, 0, 0, 0); tl.setSpacing(6);
    const colors = [['#1a1b1e', 'Czarny'], ['#e02424', 'Czerwony'], ['#1d72f3', 'Niebieski'], ['#16a34a', 'Zielony']];
    for (const [hex, name] of colors) {
      const b = QToolButton.create(name.slice(0, 1), () => { ink.setEraser(false); eraser.setChecked(false); ink.setPenColor(QColor.fromString(hex)); });
      b.setToolTip(name); tl.addWidget(b);
    }
    const eraser = QCheckBox.create('Gumka', (on) => ink.setEraser(on));
    tl.addWidget(eraser);
    tl.addWidget(QLabel.create('Grubość:'));
    const width = QSlider.create(1, 18, 3); width.setMaximumSize(120, 30); width.valueChanged.connect((w) => ink.setPenWidth(w));
    tl.addWidget(width);
    tl.addStretch(1);
    tl.addWidget(QPushButton.create('Cofnij', () => ink.undo()));
    tl.addWidget(QPushButton.create('Wyczyść', () => ink.clear()));
    v.addWidget(tb);

    const hint = QLabel.create('Pisz rysikiem (Apple Pencil / S-Pen), palcem albo myszą.');
    hint.setFont(QFont.of('system-ui, sans-serif', 12)); v.addWidget(hint);

    v.addWidget(ink, 1); // ink wypełnia resztę
    return page;
  }

  // ── Zakładka 3: mobile — długi formularz w QScrollArea (przewijanie gestem) ─
  _mobilePage() {
    const page = new QWidget();
    const v = new QVBoxLayout(page); v.setContentsMargins(0, 0, 0, 0); v.setSpacing(0);

    const area = new QScrollArea();
    const content = new QWidget();
    const cl = new QVBoxLayout(content); cl.setContentsMargins(16, 16, 16, 16); cl.setSpacing(12);

    cl.addWidget(QLabel.create('Przewiń palcem (na telefonie/tablecie) lub kółkiem myszy.'));
    for (let i = 1; i <= 8; i++) {
      const g = QGroupBox.create(`Sekcja ${i}`);
      const gl = new QVBoxLayout(g);
      gl.addWidget(QSlider.create(0, 100, i * 10));
      gl.addWidget(QComboBox.create(['Opcja A', 'Opcja B', 'Opcja C']));
      const r = new QWidget(); const rl = new QHBoxLayout(r); rl.setContentsMargins(0, 0, 0, 0);
      rl.addWidget(QCheckBox.create('Tak')); rl.addWidget(QPushButton.create('Akcja')); rl.addStretch(1);
      gl.addWidget(r);
      cl.addWidget(g);
    }
    const list = QListWidget.create(['Element 1', 'Element 2', 'Element 3', 'Element 4', 'Element 5', 'Element 6']);
    list.setMinimumSize(0, 180); list.setFixedHeight(180);
    cl.addWidget(list);

    area.setWidget(content);
    v.addWidget(area, 1);
    return page;
  }
}

export { QtExample, QT_EXAMPLE_TAG };
