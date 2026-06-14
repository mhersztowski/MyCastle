// Build: skleja pliki pakietu scene3d (browser) w jeden plik scene3d.js,
//  • bez import/export (klasy przez globalThis, jak qt.module.js),
//  • z dopełnionymi statycznymi odpowiednikami metod/getterów każdej klasy
//    (delegaty `static foo(self, …) { return self.foo(…); }`) — dla autocomplete;
//    istniejące statyki NIE są nadpisywane.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, dir), 'utf8');

// Kolejność = zależności (Vec3 → Box3 → … ConeGeometry po CylinderGeometry → Geometry).
const FILES = [
  'Vec3.js', 'Box3.js', 'MeshBuilder.js',
  'BoxGeometry.js', 'PlaneGeometry.js', 'CircleGeometry.js',
  'CylinderGeometry.js', 'ConeGeometry.js', 'SphereGeometry.js', 'TorusGeometry.js',
  'Geometry.js',
];

// ── 1) Sklej: usuń import/export, deduplikuj top-level helpery/stałe (np. TAU) ──
const seenTopLevel = new Set();
const parts = [];
for (const f of FILES) {
  const body = read(f)
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l))
    .filter((l) => !/^\s*export\s*\{/.test(l))
    .map((l) => l.replace(/^(\s*)export\s+(class|function|const|let|var)\s/, '$1$2 '))
    .filter((l) => {
      // top-level deklaracja (kolumna 0) o już widzianej nazwie → pomiń (TAU itp.)
      const m = /^(?:function|const|let|var)\s+(\w+)\b/.exec(l);
      if (m) { if (seenTopLevel.has(m[1])) return false; seenTopLevel.add(m[1]); }
      return true;
    })
    .join('\n')
    .trim();
  parts.push(`// ════════════════════ ${f} ════════════════════\n${body}\n`);
}

const HEADER = `/**
 * scene3d.js — przeglądarkowy bundel @mhersztowski/core scene3d: geometrie
 * (Box/Plane/Circle/Cylinder/Cone/Sphere/Torus), Vec3, Box3, MeshBuilder oraz
 * fasada Geometry. Niezależne od bibliotek; liczą objętość/pole/AABB i generują
 * siatkę (pozycje/normalne/UV/indeksy).
 *
 * Wygenerowany ze sklejenia plików scene3d/. BEZ import/export — klasy są
 * eksportowane przez globalny namespace (window/globalThis), więc działają też
 * w skryptach automatyzacji (AsyncFunction/eval). Każda klasa ma metody
 * instancji ORAZ ich statyczne odpowiedniki (\`Class.foo(self, …)\`) — dla
 * wygodnych podpowiedzi w edytorach.
 *
 * NIE edytuj ręcznie — generowane przez _build.mjs ze źródeł w scene3d/.
 */
`;

let combined = HEADER + '\n' + parts.join('\n');

// ── 2) Wstrzyknij statyczne odpowiedniki metod/getterów (nie nadpisuj istniejących) ──
function paramName(p) { return ts.isIdentifier(p.name) ? p.name.text : null; }
function staticsFor(cls, sf) {
  const className = cls.name ? cls.name.text : '(anon)';
  const staticNames = new Set();
  for (const m of cls.members) {
    const isStatic = (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static) !== 0;
    if (isStatic && m.name && ts.isIdentifier(m.name)) staticNames.add(m.name.text);
  }
  const seen = new Set();
  const lines = [];
  for (const m of cls.members) {
    const isStatic = (ts.getCombinedModifierFlags(m) & ts.ModifierFlags.Static) !== 0;
    if (isStatic) continue;
    const name = m.name && ts.isIdentifier(m.name) ? m.name.text : null;
    if (!name || name.startsWith('_')) continue;
    if (staticNames.has(name) || seen.has(name)) continue;
    if (ts.isGetAccessorDeclaration(m)) {
      seen.add(name);
      lines.push(`  static ${name}(self) { return self.${name}; }`);
    } else if (ts.isMethodDeclaration(m)) {
      seen.add(name);
      const params = m.parameters;
      const allIdent = params.every((p) => paramName(p) !== null);
      let sig, call;
      if (!allIdent) { sig = 'self, ...args'; call = '...args'; }
      else {
        sig = ['self', ...params.map((p) => p.getText(sf))].join(', ');
        call = params.map((p) => (p.dotDotDotToken ? '...' : '') + p.name.text).join(', ');
      }
      lines.push(`  static ${name}(${sig}) { return self.${name}(${call}); }`);
    }
  }
  if (!lines.length) return null;
  return `\n  // ── Statyczne odpowiedniki metod instancji (autocomplete: ${className}.foo(self, …)) ──\n${lines.join('\n')}\n`;
}
function inject(source) {
  const sf = ts.createSourceFile('scene3d.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const inserts = [];
  const visit = (node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const block = staticsFor(node, sf);
      if (block) inserts.push({ pos: node.end - 1, text: block });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  inserts.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const ins of inserts) out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  return out;
}
combined = inject(combined);

// ── 3) Eksport globalny (bez `export`) ──
combined += `
// ════════════════════ Eksport przez globalny namespace (bez \`export\`) ════════════════════
{
  const _g = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : this;
  Object.assign(_g, {
    Vec3, Box3, MeshBuilder,
    BoxGeometry, PlaneGeometry, CircleGeometry, CylinderGeometry, ConeGeometry,
    SphereGeometry, TorusGeometry, Geometry,
  });
}
`;

writeFileSync(new URL('./scene3d.js', dir), combined, 'utf8');
console.log('OK — zapisano scene3d.js');
