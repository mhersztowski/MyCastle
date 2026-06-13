/**
 * Turns UML projects (drive/uml/*.umlproj.json from Programming/Uml) into
 * Blockly blocks + toolbox categories for the Automate Script block editor.
 *
 * Mapping:
 *  - each UML class            → one toolbox category (named like the class)
 *  - a class's static fields   → constant value blocks  (`Class.Field`)
 *  - a class's methods         → call blocks with one value input per argument;
 *                                value blocks when they return a type, statement
 *                                blocks when they return void.
 *
 * UML members are stored as free-form notation strings (e.g. `+ static AlignLeft`,
 * `+ adopt(a: Animal): void`), so we parse them into a structured shape first.
 */
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { readUserJson } from '../../../services/userJson';

// ── Parsed UML model ─────────────────────────────────────────────────────────
export interface UmlParam { name: string; type?: string }
export interface UmlField { name: string; type?: string; isStatic: boolean; value?: string }
export interface UmlMethod { name: string; params: UmlParam[]; returnType?: string; isStatic: boolean }
export interface UmlClassDef { name: string; fields: UmlField[]; methods: UmlMethod[] }

// Loose shape of a saved UML project (we only read what we need).
interface RawMember { id?: string; kind?: 'field' | 'method'; text?: string }
interface RawNodeData { kind?: string; name?: string; members?: RawMember[] }
interface RawNode { type?: string; data?: RawNodeData }
interface RawDiagram { nodes?: RawNode[] }
interface RawProject { diagrams?: RawDiagram[] }

function stripPrefix(text: string): { body: string; isStatic: boolean } {
  let s = text.trim();
  if (s && '+-#~'.includes(s[0])) s = s.slice(1).trim();
  const isStatic = /^static\b/.test(s);
  if (isStatic) s = s.replace(/^static\b\s*/, '');
  return { body: s, isStatic };
}

function parseField(text: string): UmlField | null {
  const { body, isStatic } = stripPrefix(text);
  // Split off an optional initializer: `RAD = Math.PI / 180` → value = expression.
  const eq = body.indexOf('=');
  const decl = (eq >= 0 ? body.slice(0, eq) : body).trim();
  const value = eq >= 0 ? (body.slice(eq + 1).trim().replace(/;+\s*$/, '').trim() || undefined) : undefined;
  // In the declaration part, `name: type`.
  const colon = decl.indexOf(':');
  const name = (colon >= 0 ? decl.slice(0, colon) : decl).trim();
  if (!name) return null;
  const type = colon >= 0 ? (decl.slice(colon + 1).trim() || undefined) : undefined;
  return { name, type, isStatic, value };
}

function parseMethod(text: string): UmlMethod | null {
  const { body, isStatic } = stripPrefix(text);
  const open = body.indexOf('(');
  const close = open >= 0 ? body.indexOf(')', open) : -1;
  const name = (open >= 0 ? body.slice(0, open) : body).trim();
  if (!name) return null;
  let params: UmlParam[] = [];
  if (open >= 0 && close > open) {
    const inner = body.slice(open + 1, close).trim();
    if (inner) {
      params = inner.split(',').map((p) => {
        const c = p.indexOf(':');
        return c >= 0
          ? { name: p.slice(0, c).trim(), type: p.slice(c + 1).trim() || undefined }
          : { name: p.trim() };
      }).filter((p) => p.name);
    }
  }
  let returnType: string | undefined;
  if (close >= 0) {
    const after = body.slice(close + 1);
    const rc = after.indexOf(':');
    if (rc >= 0) returnType = after.slice(rc + 1).trim() || undefined;
  }
  return { name, params, returnType, isStatic };
}

/** Flatten one-or-more UML projects into a deduped list of class definitions. */
export function extractUmlClasses(projects: unknown[]): UmlClassDef[] {
  const byName = new Map<string, UmlClassDef>();
  for (const proj of projects) {
    const p = proj as RawProject | null;
    for (const dia of p?.diagrams ?? []) {
      for (const node of dia?.nodes ?? []) {
        const d = node?.data;
        if (!d || !d.name) continue;
        const cls = byName.get(d.name) ?? { name: d.name, fields: [], methods: [] };
        for (const m of d.members ?? []) {
          if (!m?.text) continue;
          if (m.kind === 'method') {
            const mm = parseMethod(m.text);
            if (mm && !cls.methods.some((x) => x.name === mm.name && x.params.length === mm.params.length)) {
              cls.methods.push(mm);
            }
          } else {
            const f = parseField(m.text);
            if (f && !cls.fields.some((x) => x.name === f.name)) cls.fields.push(f);
          }
        }
        byName.set(d.name, cls);
      }
    }
  }
  return [...byName.values()].filter((c) => c.fields.length || c.methods.length);
}

// ── Blockly block + toolbox generation ───────────────────────────────────────
export interface UmlToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: Array<{ kind: 'block'; type: string }>;
}

const sanitize = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');
function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/**
 * Registers Blockly blocks + JS generators for every member of the given UML
 * classes and returns matching toolbox categories. Idempotent — re-registering
 * a block type simply overwrites it, so it's safe to call on each editor mount.
 */
export function defineUmlBlocks(classes: UmlClassDef[]): UmlToolboxCategory[] {
  const categories: UmlToolboxCategory[] = [];

  for (const cls of classes) {
    const hue = hueFor(cls.name);
    const contents: Array<{ kind: 'block'; type: string }> = [];

    // Static fields → constant value blocks. With an initializer
    // (`RAD = Math.PI / 180`) the block emits the value expression itself;
    // without one it emits a `Class.Field` reference.
    for (const f of cls.fields) {
      const type = `uml_${sanitize(cls.name)}_field_${sanitize(f.name)}`;
      const ref = `${cls.name}.${f.name}`;
      const hasValue = !!f.value;
      // Parenthesise multi-token value expressions so they compose safely when
      // nested in other blocks (e.g. `x * (Math.PI / 180)`).
      const emit = hasValue ? (/[^\w.$]/.test(f.value as string) ? `(${f.value})` : (f.value as string)) : ref;
      const order = hasValue ? Order.ATOMIC : Order.MEMBER;
      Blockly.Blocks[type] = {
        init(this: Blockly.Block) {
          this.appendDummyInput().appendField(ref);
          this.setOutput(true, null);
          this.setColour(hue);
          this.setTooltip(`${f.isStatic ? 'static ' : ''}${ref}${f.type ? ': ' + f.type : ''}${hasValue ? ` = ${f.value}` : ''}`);
        },
      };
      javascriptGenerator.forBlock[type] = () => [emit, order];
      contents.push({ kind: 'block', type });
    }

    // Methods → call blocks. Promise return types generate an `await` (and for
    // `Promise<X>` the awaited value's effective type is X). A value-returning
    // method gets TWO blocks: a value block (use the result, e.g. assign to a
    // variable) and a statement block (just call it, ignore the result). A void
    // method only gets the statement block.
    for (const m of cls.methods) {
      const baseType = `uml_${sanitize(cls.name)}_method_${sanitize(m.name)}_${m.params.length}`;
      const rt = (m.returnType || '').trim();
      const promiseInner = rt.match(/^Promise\s*<\s*(.*?)\s*>\s*$/i);
      const isPromise = /^Promise\b/i.test(rt);
      // For Promise<X> use X; bare Promise → treat as void.
      const effectiveType = promiseInner ? promiseInner[1].trim() : (isPromise ? '' : rt);
      const isVoid = !effectiveType || /^(void|undefined|never)$/i.test(effectiveType);
      const callBase = `${cls.name}.${m.name}`;
      const params = m.params;
      const sig = `${callBase}(${params.map((p) => p.name + (p.type ? ': ' + p.type : '')).join(', ')})${m.returnType ? ': ' + m.returnType : ''}`;

      const buildArgs = (block: Blockly.Block) =>
        params.map((_, i) => javascriptGenerator.valueToCode(block, 'ARG' + i, Order.NONE) || 'null');
      const callOf = (args: string[]) => {
        const c = `${callBase}(${args.join(', ')})`;
        return isPromise ? `await ${c}` : c;
      };

      // Registers one block variant; `asStatement` → stack block (ignore return),
      // otherwise an output (value) block.
      const register = (suffix: string, asStatement: boolean, labelSuffix: string, tip: string) => {
        const type = baseType + suffix;
        Blockly.Blocks[type] = {
          init(this: Blockly.Block) {
            this.appendDummyInput().appendField(callBase + labelSuffix);
            params.forEach((p, i) => {
              this.appendValueInput('ARG' + i).appendField(p.type ? `${p.name}: ${p.type}` : p.name);
            });
            this.setInputsInline(params.length <= 2);
            if (asStatement) {
              this.setPreviousStatement(true, null);
              this.setNextStatement(true, null);
            } else {
              this.setOutput(true, null);
            }
            this.setColour(hue);
            this.setTooltip((m.isStatic ? 'static ' : '') + sig + tip);
          },
        };
        javascriptGenerator.forBlock[type] = (block: Blockly.Block) => {
          const callExpr = callOf(buildArgs(block));
          if (asStatement) return `${callExpr};\n`;
          // Awaited values are parenthesised so they compose safely in expressions.
          return isPromise
            ? [`(${callExpr})`, Order.ATOMIC] as [string, number]
            : [callExpr, Order.FUNCTION_CALL] as [string, number];
        };
        contents.push({ kind: 'block', type });
      };

      if (isVoid) {
        // Single statement block (keeps the original type name).
        register('', true, '', '');
      } else {
        // Value block (original type name) + a call-only statement variant.
        register('', false, '', ' — zwraca wartość');
        register('_call', true, '', ' — wywołanie (bez wartości)');
      }
    }

    if (contents.length) {
      categories.push({ kind: 'category', name: cls.name, colour: String(hue), contents });
    }
  }

  return categories;
}

// ── Loading helpers (per-user VFS, drive/uml) ────────────────────────────────
function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('minis_current_user');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

/** Lists UML project file names under drive/uml/ for the user. */
export async function listUmlProjects(userName: string): Promise<string[]> {
  if (!userName) return [];
  const u = new URL(`/api/users/${encodeURIComponent(userName)}/vfs/readdir`, window.location.origin);
  u.searchParams.set('path', `/data/Minis/Users/${userName}/drive/uml/`);
  try {
    const r = await fetch(u.pathname + u.search, { headers: authHeaders() });
    if (!r.ok) return [];
    const j = await r.json() as { entries?: Array<{ name: string; type: number }> };
    return (j.entries ?? [])
      .filter((e) => e.type === 1 && e.name.toLowerCase().endsWith('.umlproj.json'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
  } catch { return []; }
}

/** Loads the selected UML projects and parses them into class definitions. */
export async function loadUmlClasses(userName: string, files: string[]): Promise<UmlClassDef[]> {
  if (!userName || !files.length) return [];
  const projects: unknown[] = [];
  for (const f of files) {
    try {
      const p = await readUserJson<unknown>(userName, `drive/uml/${f}`);
      if (p) projects.push(p);
    } catch { /* skip unreadable project */ }
  }
  return extractUmlClasses(projects);
}
