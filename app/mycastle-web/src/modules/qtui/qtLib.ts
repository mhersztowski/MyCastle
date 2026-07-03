// qtLib — loads the vanilla-JS Qt-on-canvas library (packages/core/browser/qt)
// into the running web app and converts a QtUiScene into a live widget tree that
// the real MinisQt renderer draws on a <qt-canvas>.
//
// The bundles are plain scripts that export nothing — they attach classes
// (QObject/Signal/QtCanvas/QWidget/QLabel/…) to globalThis and register the
// <qt-canvas> custom element. We fetch their source from the public
// /api/browser-scripts/content endpoint (same files listed in scripts.json) and
// import them as blob-URL modules, in order:
//   1. qobject.module.js  → sets globalThis.QObject / Signal
//   2. qt.module.js       → sets globalThis.QtCanvas + widget classes, needs Lit
// qt.module.js only dynamically imports qobject / Lit when they're missing, so we
// pre-seed globalThis.Lit and load qobject first — the blob module then resolves
// everything from globals (no unresolved relative import ever runs).

import type { QtWidgetNode } from './QtUiTypes';

/* eslint-disable @typescript-eslint/no-explicit-any */

const QT_BUNDLES = [
  'packages/core/browser/qt/qobject.module.js',
  'packages/core/browser/qt/qt.module.js',
];

let qtLibPromise: Promise<any> | null = null;

/** Load (once) the Qt canvas library and resolve to globalThis with its classes. */
export function ensureQtLib(): Promise<any> {
  const g = globalThis as any;
  if (g.QtCanvas && g.QWidget) return Promise.resolve(g);
  if (qtLibPromise) return qtLibPromise;

  qtLibPromise = (async () => {
    // qt.module.js reads globalThis.Lit when present (else fetches Lit from a CDN,
    // which we avoid). Lit is a direct dependency of this app.
    if (!g.Lit || !g.Lit.LitElement) {
      g.Lit = await import('lit');
    }
    for (const path of QT_BUNDLES) {
      if (path.includes('qobject') && g.QObject) continue;
      if (path.includes('/qt.module') && g.QtCanvas) continue;
      const res = await fetch(`/api/browser-scripts/content?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`Nie udało się pobrać ${path} (HTTP ${res.status})`);
      const src = await res.text();
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      try {
        await import(/* @vite-ignore */ url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (!g.QtCanvas || !g.QWidget) throw new Error('qt.module.js załadowany, ale brak QtCanvas/QWidget');
    return g;
  })().catch((e) => { qtLibPromise = null; throw e; }); // allow retry on failure

  return qtLibPromise;
}

/** Best-effort call — invokes `w[method](...args)` only if it exists, swallowing errors. */
function tryCall(w: any, method: string, ...args: any[]): void {
  if (w && typeof w[method] === 'function') {
    try { w[method](...args); } catch { /* renderer is best-effort */ }
  }
}

/**
 * Convert a QtUiScene node into a live MinisQt widget (reflection-based, mirrors
 * QObjectSceneBuilderDialog.buildLiveNode). Every property is applied best-effort
 * so an unknown setter is silently skipped instead of throwing. `objectName` is
 * set to the node id so hit-tests can map a widget back to the scene.
 */
export function buildQtWidget(node: QtWidgetNode, g: any): any {
  const Cls = g[node.class];
  if (typeof Cls !== 'function') return null;

  const hasText = node.class === 'QLabel' || node.class === 'QPushButton' || node.class === 'QCheckBox';
  let w: any;
  try { w = hasText && node.text != null ? new Cls(node.text) : new Cls(); }
  catch { try { w = new Cls(); } catch { return null; } }

  tryCall(w, 'setObjectName', node.id);
  if (node.text != null) tryCall(w, 'setText', node.text);
  if (node.alignment && g.Qt && typeof g.Qt[node.alignment] === 'number') tryCall(w, 'setAlignment', g.Qt[node.alignment]);
  if (node.min != null) tryCall(w, 'setMinimum', node.min);
  if (node.max != null) tryCall(w, 'setMaximum', node.max);
  if (node.value != null) tryCall(w, 'setValue', node.value);
  if (node.textVisible != null) tryCall(w, 'setTextVisible', node.textVisible);
  if (node.checked != null) tryCall(w, 'setChecked', node.checked);

  // Font (best-effort — needs a QFont in the library).
  if (node.font && typeof g.QFont === 'function') {
    try {
      const f = new g.QFont();
      if (node.font.pixelSize != null) tryCall(f, 'setPixelSize', node.font.pixelSize);
      if (node.font.bold != null) tryCall(f, 'setBold', node.font.bold);
      tryCall(w, 'setFont', f);
    } catch { /* no QFont */ }
  }

  // Colors (best-effort — only if the widget supports a stylesheet).
  if ((node.color || node.background) && typeof w.setStyleSheet === 'function') {
    const css = [node.background ? `background:${node.background}` : '', node.color ? `color:${node.color}` : '']
      .filter(Boolean).join(';');
    if (css) tryCall(w, 'setStyleSheet', css);
  }

  // Children (only containers).
  if (node.class === 'QWidget') {
    const kids = node.children ?? [];
    if (node.layout && node.layout !== 'none' && typeof g[node.layout] === 'function') {
      let lay: any = null;
      try { lay = new g[node.layout](); } catch { lay = null; }
      if (lay) {
        // Attach the layout to the widget FIRST: addWidget() reparents each child
        // via child.setParent(layout._parentWidget), and _parentWidget is null
        // until setLayout() runs — so adding before setLayout leaves the children
        // orphaned (setParent(null)) and they never paint.
        tryCall(w, 'setLayout', lay);
        if (node.spacing != null) tryCall(lay, 'setSpacing', node.spacing);
        if (node.margin != null) tryCall(lay, 'setContentsMargins', node.margin, node.margin, node.margin, node.margin);
        for (const c of kids) { const cw = buildQtWidget(c, g); if (cw) tryCall(lay, 'addWidget', cw); }
      }
    } else {
      // Absolute positioning: parent the child and set its geometry.
      for (const c of kids) {
        const cw = buildQtWidget(c, g);
        if (!cw) continue;
        if (typeof cw.setParent === 'function') tryCall(cw, 'setParent', w);
        else tryCall(w, 'addWidget', cw);
        if (c.geometry) tryCall(cw, 'setGeometry', c.geometry[0], c.geometry[1], c.geometry[2], c.geometry[3]);
      }
    }
  }

  return w;
}
