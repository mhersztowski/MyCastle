// QtUiTypes — the *.qtui.json scene schema.
//
// A scene describes a MinisQt (libs/Qt) widget tree that maps 1:1 onto
// constructible C++ widgets. It is authored in the QtUiSceneEditor and compiled
// to a self-contained MinisQt WASM sketch for a faithful live preview.

export type QtWidgetClass =
  | 'QWidget'
  | 'QLabel'
  | 'QPushButton'
  | 'QSlider'
  | 'QProgressBar'
  | 'QCheckBox';

export type QtAlignment =
  | 'AlignLeft'
  | 'AlignRight'
  | 'AlignHCenter'
  | 'AlignCenter'
  | 'AlignVCenter';

export type QtLayoutType = 'none' | 'QVBoxLayout' | 'QHBoxLayout';

export interface QtFont {
  pixelSize?: number;
  bold?: boolean;
}

export interface QtWidgetNode {
  /** Widget class — determines which MinisQt class is constructed. */
  class: QtWidgetClass;
  /** Stable id; also used to derive the C++ variable name. */
  id: string;
  /** Optional opaque background fill (hex, e.g. "#202428"). */
  background?: string;
  font?: QtFont;

  // ── Container only (class === 'QWidget') ──────────────────────────────────
  /** Layout that arranges children. 'none' = absolute geometry per child. */
  layout?: QtLayoutType;
  spacing?: number;
  margin?: number;
  children?: QtWidgetNode[];
  /** Absolute geometry [x, y, w, h] — used when the parent layout is 'none'. */
  geometry?: [number, number, number, number];

  // ── QLabel ────────────────────────────────────────────────────────────────
  text?: string;          // also QPushButton / QCheckBox
  alignment?: QtAlignment;
  color?: string;         // QLabel text colour / QPushButton background colour

  // ── QSlider / QProgressBar ─────────────────────────────────────────────────
  min?: number;
  max?: number;
  value?: number;
  textVisible?: boolean;  // QProgressBar percentage label

  // ── QCheckBox ──────────────────────────────────────────────────────────────
  checked?: boolean;
}

export interface QtUiScene {
  type: 'qt_ui_scene';
  version: '1';
  width: number;
  height: number;
  /** Window background colour. */
  background?: string;
  /** Root container (always a QWidget; holds the layout + children). */
  root: QtWidgetNode;
}

export const QTUI_EXT = '.qtui.json';

let uidCounter = 0;
/** Short unique-ish id for a freshly added node (stable within a session). */
export function newNodeId(prefix: string): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

/** Which widget classes may be added under a container. */
export const ADDABLE_WIDGETS: { class: QtWidgetClass; label: string }[] = [
  { class: 'QLabel', label: 'Label' },
  { class: 'QPushButton', label: 'Button' },
  { class: 'QSlider', label: 'Slider' },
  { class: 'QProgressBar', label: 'Progress Bar' },
  { class: 'QCheckBox', label: 'Check Box' },
  { class: 'QWidget', label: 'Container' },
];

export function isContainer(node: QtWidgetNode): boolean {
  return node.class === 'QWidget';
}

/** A sensible starter scene for a new *.qtui.json file. */
export function defaultScene(): QtUiScene {
  return {
    type: 'qt_ui_scene',
    version: '1',
    width: 320,
    height: 240,
    background: '#181c20',
    root: {
      class: 'QWidget',
      id: 'root',
      layout: 'QVBoxLayout',
      spacing: 8,
      margin: 12,
      children: [
        { class: 'QLabel', id: 'title', text: 'Hello MinisQt', alignment: 'AlignCenter', color: '#ffffff', font: { pixelSize: 24, bold: true } },
        { class: 'QSlider', id: 'slider', min: 0, max: 100, value: 40 },
        { class: 'QProgressBar', id: 'progress', min: 0, max: 100, value: 40, textVisible: true },
        { class: 'QCheckBox', id: 'check', text: 'Enabled', checked: true },
        { class: 'QPushButton', id: 'button', text: 'Tap me', color: '#3c78c8' },
      ],
    },
  };
}

/** Build a fresh node of the given class with reasonable defaults. */
export function makeNode(cls: QtWidgetClass): QtWidgetNode {
  switch (cls) {
    case 'QLabel':
      return { class: cls, id: newNodeId('label'), text: 'Label', alignment: 'AlignLeft', color: '#ffffff' };
    case 'QPushButton':
      return { class: cls, id: newNodeId('button'), text: 'Button', color: '#3c78c8' };
    case 'QSlider':
      return { class: cls, id: newNodeId('slider'), min: 0, max: 100, value: 50 };
    case 'QProgressBar':
      return { class: cls, id: newNodeId('progress'), min: 0, max: 100, value: 50, textVisible: true };
    case 'QCheckBox':
      return { class: cls, id: newNodeId('check'), text: 'Check', checked: false };
    case 'QWidget':
    default:
      return { class: 'QWidget', id: newNodeId('group'), layout: 'QVBoxLayout', spacing: 6, margin: 6, children: [] };
  }
}

/** Validate + coerce a parsed object into a QtUiScene (throws on hard errors). */
export function parseScene(json: string): QtUiScene {
  const obj = JSON.parse(json) as Partial<QtUiScene>;
  if (!obj || obj.type !== 'qt_ui_scene' || !obj.root) {
    throw new Error('Not a valid *.qtui.json scene (missing type/root).');
  }
  return {
    type: 'qt_ui_scene',
    version: '1',
    width: obj.width ?? 320,
    height: obj.height ?? 240,
    background: obj.background ?? '#181c20',
    root: obj.root,
  };
}

export function serializeScene(scene: QtUiScene): string {
  return JSON.stringify(scene, null, 2);
}
