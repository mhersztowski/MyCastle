/**
 * Operacje na wartościach właściwości: konstrukcja ParamValue, walidacja wg
 * manifestu, wartości domyślne, widoczność warunkowa i rozwiązywanie
 * wiązań (`ref`) oraz wyrażeń (`expr`) względem zmiennych dokumentu.
 */

import { evalExpr, exprDeps, isValidExpr } from './expr';
import type {
  BlockManifest,
  ChildNode,
  ChildSpec,
  DocVar,
  ParamValue,
  Primitive,
  PropSpec,
  VisibleCond,
  VisibleIf,
  YamlValue,
} from './types';

// ─────────────────────────────────────────────────────────── konstruktory

export const literal = (value: Primitive): ParamValue => ({ src: 'literal', value });
export const ref = (name: string): ParamValue => ({ src: 'ref', name });
export const expr = (code: string): ParamValue => ({ src: 'expr', code, deps: exprDeps(code) });

export function isParamValue(v: unknown): v is ParamValue {
  if (!v || typeof v !== 'object') return false;
  const src = (v as { src?: unknown }).src;
  return src === 'literal' || src === 'ref' || src === 'expr';
}

/** Rozpoznaje `{ref: nazwa}` / `{expr: "..."}` w danych YAML. */
export function paramFromYaml(value: YamlValue): ParamValue {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'ref' && typeof value.ref === 'string') {
      return ref(value.ref);
    }
    if (keys.length === 1 && keys[0] === 'expr' && typeof value.expr === 'string') {
      return expr(value.expr);
    }
  }
  if (value === null) return literal('');
  if (Array.isArray(value) || typeof value === 'object') return literal(String(value));
  return literal(value);
}

export function paramToYaml(p: ParamValue): YamlValue {
  switch (p.src) {
    case 'literal': return p.value;
    case 'ref': return { ref: p.name };
    case 'expr': return { expr: p.code };
  }
}

/**
 * Postać zapisywana do pliku. Liczby przechodzą przez kwantyzację z manifestu —
 * inaczej model trzymający 1.2999999999 wypuszcza do gita fałszywy diff.
 */
export function paramToYamlForSpec(spec: PropSpec, p: ParamValue): YamlValue {
  if (p.src === 'literal' && typeof p.value === 'number') return quantizeProp(spec, p.value);
  return paramToYaml(p);
}

// ─────────────────────────────────────────────────────────── domyślne

export function specDefault(spec: PropSpec): Primitive {
  if (spec.kind === 'resource') return spec.default ?? '';
  return spec.default;
}

export function defaultProps(props: Record<string, PropSpec>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [key, spec] of Object.entries(props)) out[key] = literal(specDefault(spec));
  return out;
}

/** Czy wartość jest równa domyślnej — takich pól nie zapisujemy do pliku. */
export function isDefaultValue(spec: PropSpec, value: ParamValue): boolean {
  return value.src === 'literal' && value.value === specDefault(spec);
}

// ─────────────────────────────────────────────────────────── walidacja

export interface ValidationIssue {
  key: string;
  message: string;
}

/** Sprowadza wartość do dziedziny opisanej specyfikacją (zakres, enum, typ). */
export function coerceValue(spec: PropSpec, raw: unknown): Primitive {
  switch (spec.kind) {
    case 'number':
    case 'quantity': {
      let n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) n = spec.default;
      if (spec.range) {
        const [lo, hi] = spec.range;
        if (spec.kind === 'quantity' && spec.wrap) {
          const span = hi - lo;
          n = span > 0 ? lo + (((n - lo) % span) + span) % span : lo;
        } else {
          n = Math.min(hi, Math.max(lo, n));
        }
      }
      return quantizeProp(spec, n);
    }
    case 'enum':
      return spec.options.includes(String(raw)) ? String(raw) : spec.default;
    case 'bool':
      return typeof raw === 'boolean' ? raw : raw === 'true';
    case 'string':
    case 'color':
      return raw == null ? spec.default : String(raw);
    case 'resource':
      return raw == null ? (spec.default ?? '') : String(raw);
  }
}

/** Kwantyzacja liczby wg `precision` albo kroku — bez niej diff puchnie. */
export function quantizeProp(spec: PropSpec, n: number): number {
  if (spec.kind !== 'number' && spec.kind !== 'quantity') return n;
  const decimals = spec.precision ?? decimalsFromStep(spec.step);
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function decimalsFromStep(step?: number): number {
  if (!step || !Number.isFinite(step)) return 3;
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : Math.min(6, s.length - dot - 1);
}

export function validateParam(key: string, spec: PropSpec, value: ParamValue): ValidationIssue | null {
  if (value.src === 'expr') {
    return isValidExpr(value.code) ? null : { key, message: 'Nieprawidłowe wyrażenie' };
  }
  if (value.src === 'ref') {
    return value.name.trim() === '' ? { key, message: 'Brak nazwy zmiennej' } : null;
  }
  const v = value.value;
  switch (spec.kind) {
    case 'number':
    case 'quantity': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { key, message: 'Oczekiwano liczby' };
      if (spec.range && !spec.wrap) {
        const [lo, hi] = spec.range;
        if (v < lo || v > hi) return { key, message: `Poza zakresem ${lo}–${hi}` };
      }
      return null;
    }
    case 'enum':
      return spec.options.includes(String(v)) ? null : { key, message: `Dozwolone: ${spec.options.join(', ')}` };
    case 'bool':
      return typeof v === 'boolean' ? null : { key, message: 'Oczekiwano wartości logicznej' };
    default:
      return typeof v === 'string' ? null : { key, message: 'Oczekiwano tekstu' };
  }
}

export function validateProps(
  specs: Record<string, PropSpec>,
  props: Record<string, ParamValue>,
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const [key, spec] of Object.entries(specs)) {
    const value = props[key];
    if (!value) continue;
    const issue = validateParam(key, spec, value);
    if (issue) out.push(issue);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── widoczność

function testCond(cond: VisibleCond, value: Primitive | undefined): boolean {
  if ('eq' in cond) return value === cond.eq;
  if ('ne' in cond) return value !== cond.ne;
  if ('gt' in cond) return typeof value === 'number' && value > cond.gt;
  if ('lt' in cond) return typeof value === 'number' && value < cond.lt;
  if ('in' in cond) return value !== undefined && cond.in.includes(value);
  return true;
}

export function isVisible(visibleIf: VisibleIf | undefined, resolved: Record<string, Primitive>): boolean {
  if (!visibleIf) return true;
  return Object.entries(visibleIf).every(([key, cond]) => testCond(cond, resolved[key]));
}

// ─────────────────────────────────────────────────────────── rozwiązywanie

export type Scope = Record<string, Primitive>;

export function varsToScope(vars: DocVar[]): Scope {
  const out: Scope = {};
  for (const v of vars) out[v.name] = v.value;
  return out;
}

/**
 * Zamienia ParamValue na konkretną wartość. Błąd wiązania nie wywraca sceny —
 * wracamy do wartości domyślnej, bo blok musi dać się wyrenderować zawsze.
 */
export function resolveParam(spec: PropSpec, value: ParamValue | undefined, scope: Scope): Primitive {
  if (!value) return specDefault(spec);
  try {
    switch (value.src) {
      case 'literal':
        return coerceValue(spec, value.value);
      case 'ref':
        return value.name in scope ? coerceValue(spec, scope[value.name]) : specDefault(spec);
      case 'expr':
        return coerceValue(spec, evalExpr(value.code, scope));
    }
  } catch {
    return specDefault(spec);
  }
}

export function resolveProps(
  specs: Record<string, PropSpec>,
  props: Record<string, ParamValue>,
  scope: Scope,
): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [key, spec] of Object.entries(specs)) out[key] = resolveParam(spec, props[key], scope);
  return out;
}

/**
 * Wartości do renderu statycznego (PDF/snapshot): `ref`/`expr` bierze
 * `pdfDefault`, jeśli manifest go deklaruje — w PDF nie ma interakcji,
 * więc dokument musi znać wartość kanoniczną.
 */
export function resolveStaticProps(
  specs: Record<string, PropSpec>,
  props: Record<string, ParamValue>,
  scope: Scope,
): Record<string, Primitive> {
  const out: Record<string, Primitive> = {};
  for (const [key, spec] of Object.entries(specs)) {
    const value = props[key];
    const pdfDefault = (spec as { pdfDefault?: Primitive }).pdfDefault;
    if (value && value.src !== 'literal' && pdfDefault !== undefined) {
      out[key] = coerceValue(spec, pdfDefault);
    } else {
      out[key] = resolveParam(spec, value, scope);
    }
  }
  return out;
}

export function resolveChild(spec: ChildSpec, child: ChildNode, scope: Scope): Record<string, Primitive> {
  return resolveProps(spec.props, child.props, scope);
}

/** Grupy pól w kolejności deklaracji z manifestu — panel nie sortuje sam. */
export function groupProps(specs: Record<string, PropSpec>): { group: string; keys: string[] }[] {
  const groups: { group: string; keys: string[] }[] = [];
  for (const [key, spec] of Object.entries(specs)) {
    const group = spec.group ?? 'Ogólne';
    const bucket = groups.find(g => g.group === group);
    if (bucket) bucket.keys.push(key);
    else groups.push({ group, keys: [key] });
  }
  return groups;
}

/** Wszystkie zmienne, od których blok zależy — wejście do grafu reaktywnego. */
export function blockDeps(manifest: BlockManifest, props: Record<string, ParamValue>): string[] {
  const seen = new Set<string>();
  for (const key of Object.keys(manifest.props)) {
    const v = props[key];
    if (!v) continue;
    if (v.src === 'ref') seen.add(v.name);
    if (v.src === 'expr') v.deps.forEach(d => seen.add(d));
  }
  return [...seen].sort();
}
