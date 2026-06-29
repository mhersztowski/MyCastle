// qtUiCodegen — turn a QtUiScene into a self-contained MinisQt Arduino sketch.
//
// The generated .ino constructs the widget tree directly in C++ (no runtime JSON
// parser), so the preview compiles "the Qt library with that scene" exactly.
// It is paired with a vendored MinisQt.h (see minisQtHeader.ts) written next to
// it, so the WASM build is self-contained in any project.

import type { QtUiScene, QtWidgetNode, QtAlignment } from './QtUiTypes';

const ALIGN_MAP: Record<QtAlignment, string> = {
  AlignLeft: 'Qt::AlignLeft | Qt::AlignVCenter',
  AlignRight: 'Qt::AlignRight | Qt::AlignVCenter',
  AlignHCenter: 'Qt::AlignHCenter | Qt::AlignVCenter',
  AlignCenter: 'Qt::AlignCenter',
  AlignVCenter: 'Qt::AlignVCenter',
};

function cstr(s: string | undefined): string {
  return JSON.stringify(s ?? '');   // valid C string literal (escapes quotes etc.)
}

function color(hex: string): string {
  return `QColor::fromString(${cstr(hex)})`;
}

class Emitter {
  private lines: string[] = [];
  private counter = 0;
  private varOf(node: QtWidgetNode): string {
    this.counter += 1;
    const safe = (node.id || 'w').replace(/[^A-Za-z0-9_]/g, '_');
    return `w_${safe}_${this.counter}`;
  }
  line(s: string) { this.lines.push('  ' + s); }
  blank() { this.lines.push(''); }
  body(): string { return this.lines.join('\n'); }

  /** Emit common widget properties shared by every QWidget subclass. */
  private emitCommon(v: string, node: QtWidgetNode) {
    if (node.background) this.line(`${v}->setBackground(${color(node.background)});`);
    if (node.font) {
      const px = node.font.pixelSize ?? 16;
      const bold = node.font.bold ? 'true' : 'false';
      this.line(`${v}->setFont(QFont(${px}, ${bold}));`);
    }
  }

  /**
   * Emit a node as a child of `parentVar`. If `layoutVar` is given the widget is
   * added to that layout; otherwise its absolute geometry (if any) is applied.
   * Returns the created variable name.
   */
  emit(node: QtWidgetNode, parentVar: string, layoutVar: string | null): string {
    const v = this.varOf(node);
    switch (node.class) {
      case 'QLabel':
        this.line(`QLabel* ${v} = new QLabel(${cstr(node.text)}, ${parentVar});`);
        if (node.alignment) this.line(`${v}->setAlignment(${ALIGN_MAP[node.alignment]});`);
        if (node.color) this.line(`${v}->setColor(${color(node.color)});`);
        break;
      case 'QPushButton':
        this.line(`QPushButton* ${v} = new QPushButton(${cstr(node.text)}, ${parentVar});`);
        if (node.color) this.line(`${v}->color = ${color(node.color)};`);
        this.line(`${v}->clicked.connect([]{ Serial.println(${cstr('clicked: ' + node.id)}); });`);
        break;
      case 'QSlider':
        this.line(`QSlider* ${v} = new QSlider(${parentVar});`);
        this.line(`${v}->setRange(${node.min ?? 0}, ${node.max ?? 100});`);
        this.line(`${v}->setValue(${node.value ?? 0});`);
        break;
      case 'QProgressBar':
        this.line(`QProgressBar* ${v} = new QProgressBar(${parentVar});`);
        this.line(`${v}->setRange(${node.min ?? 0}, ${node.max ?? 100});`);
        this.line(`${v}->setValue(${node.value ?? 0});`);
        this.line(`${v}->setTextVisible(${node.textVisible === false ? 'false' : 'true'});`);
        break;
      case 'QCheckBox':
        this.line(`QCheckBox* ${v} = new QCheckBox(${cstr(node.text)}, ${parentVar});`);
        this.line(`${v}->setChecked(${node.checked ? 'true' : 'false'});`);
        break;
      case 'QWidget':
      default:
        this.line(`QWidget* ${v} = new QWidget(${parentVar});`);
        break;
    }
    this.emitCommon(v, node);

    // Place the widget: into a layout, or absolutely.
    if (layoutVar) {
      this.line(`${layoutVar}->addWidget(${v});`);
    } else if (node.geometry) {
      const [x, y, w, h] = node.geometry;
      this.line(`${v}->setGeometry(${x}, ${y}, ${w}, ${h});`);
    }

    // Recurse into containers.
    if (node.class === 'QWidget') this.emitContainer(node, v);
    return v;
  }

  /** Emit a container's layout (if any) and its children. */
  emitContainer(node: QtWidgetNode, v: string) {
    const children = node.children ?? [];
    if (node.layout && node.layout !== 'none') {
      const lay = `${v}_lay`;
      this.line(`${node.layout}* ${lay} = new ${node.layout}();`);
      if (node.spacing != null) this.line(`${lay}->setSpacing(${node.spacing});`);
      if (node.margin != null) this.line(`${lay}->setContentsMargins(${node.margin});`);
      for (const c of children) this.emit(c, v, lay);
      this.line(`${v}->setLayout(${lay});`);
    } else {
      for (const c of children) this.emit(c, v, null);
    }
  }
}

/** Generate the full .ino source for a scene. */
export function generateQtUiSketch(scene: QtUiScene): string {
  const em = new Emitter();
  const root = scene.root;
  // The scene root maps onto the existing QApplication root widget.
  em.line(`QWidget* root = app->root();`);
  if (root.background) em.line(`root->setBackground(${color(root.background)});`);
  if (root.font) {
    const px = root.font.pixelSize ?? 16;
    em.line(`root->setFont(QFont(${px}, ${root.font.bold ? 'true' : 'false'}));`);
  }
  em.emitContainer(root, 'root');

  const bg = scene.background ? `app->setBackground(${color(scene.background)});` : '';

  return `// AUTO-GENERATED from a *.qtui.json scene by the QtUiSceneEditor.
// Edits here are overwritten on the next preview build — edit the scene instead.
#include "MinisQt.h"

static QApplication* app = nullptr;

void setup() {
  Serial.begin(115200);
  app = new QApplication(${scene.width}, ${scene.height});
  ${bg}
${em.body()}
}

void loop() {
  app->tick();
  delay(33);
}
`;
}
