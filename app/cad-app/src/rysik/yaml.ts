/**
 * Mini-YAML: podzbiór potrzebny ciału bloku Rysika.
 *
 * Świadomie nie sięgamy po pełną bibliotekę YAML — ciało bloku ma być
 * przewidywalne w round-tripie, a pełny YAML ma zbyt wiele sposobów zapisu
 * tej samej wartości, żeby `serialize(parse(x)) === x` dało się utrzymać.
 *
 * Obsługiwane: mapy blokowe (wcięcia po 2 spacje), listy blokowe (`- `),
 * mapy i listy inline (`{a: 1}`, `[1, 2]`), skalary (liczba, bool, null,
 * string goły albo w cudzysłowie), komentarze `#` w linii.
 */

import type { YamlValue } from './types';

// ─────────────────────────────────────────────────────────── skalary

export function parseScalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return unquote(s);
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return Number(s);
  return s;
}

function unquote(s: string): string {
  return s
    .slice(1, -1)
    .replace(/\\(["\\/bfnrt])/g, (_m, c: string) => {
      switch (c) {
        case 'n': return '\n';
        case 't': return '\t';
        case 'r': return '\r';
        case 'b': return '\b';
        case 'f': return '\f';
        default: return c;
      }
    });
}

/** Czy goły string przejdzie round-trip bez cudzysłowów. */
function isPlainSafe(s: string): boolean {
  if (s === '') return false;
  if (s !== s.trim()) return false;
  if (/^(true|false|null|~)$/.test(s)) return false;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return false;
  // Znaki o znaczeniu składniowym w naszym podzbiorze.
  return !/[:{}[\],"'#\n]/.test(s) && !/^[-?&*!|>%@`]/.test(s);
}

export function formatScalar(v: YamlValue): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'string') return isPlainSafe(v) ? v : JSON.stringify(v);
  return JSON.stringify(v);
}

/** Liczby bez wykładnika i bez ogonów zmiennoprzecinkowych (0.30000000000000004). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(12)));
}

/** Kwantyzacja floatów — bez niej samo obrócenie kamery generuje diff. */
export function quantize(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function quantizeDeep(v: YamlValue, decimals: number): YamlValue {
  if (typeof v === 'number') return quantize(v, decimals);
  if (Array.isArray(v)) return v.map(x => quantizeDeep(x, decimals));
  if (v && typeof v === 'object') {
    const out: Record<string, YamlValue> = {};
    for (const [k, x] of Object.entries(v)) out[k] = quantizeDeep(x, decimals);
    return out;
  }
  return v;
}

// ─────────────────────────────────────────────────────────── flow (inline)

/** Parsuje `{a: 1, b: "x"}` / `[1, 2]`; zwraca null gdy to nie jest flow. */
function parseFlow(s: string): { value: YamlValue } | null {
  const t = s.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return null;
  const p = new FlowParser(t);
  const v = p.parseValue();
  p.skipWs();
  if (!p.atEnd()) return null;
  return { value: v };
}

class FlowParser {
  private i = 0;
  constructor(private readonly src: string) {}

  atEnd(): boolean { return this.i >= this.src.length; }
  skipWs(): void { while (this.i < this.src.length && /\s/.test(this.src[this.i])) this.i++; }

  parseValue(): YamlValue {
    this.skipWs();
    const c = this.src[this.i];
    if (c === '{') return this.parseMap();
    if (c === '[') return this.parseSeq();
    return parseScalar(this.readUntil([',', '}', ']']));
  }

  private parseMap(): YamlValue {
    this.i++; // {
    const out: Record<string, YamlValue> = {};
    this.skipWs();
    if (this.src[this.i] === '}') { this.i++; return out; }
    for (;;) {
      this.skipWs();
      const key = this.readKey();
      this.skipWs();
      if (this.src[this.i] === ':') this.i++;
      out[key] = this.parseValue();
      this.skipWs();
      const c = this.src[this.i];
      this.i++;
      if (c === '}') break;
      if (c !== ',') break;
    }
    return out;
  }

  private parseSeq(): YamlValue {
    this.i++; // [
    const out: YamlValue[] = [];
    this.skipWs();
    if (this.src[this.i] === ']') { this.i++; return out; }
    for (;;) {
      out.push(this.parseValue());
      this.skipWs();
      const c = this.src[this.i];
      this.i++;
      if (c === ']') break;
      if (c !== ',') break;
    }
    return out;
  }

  private readKey(): string {
    const c = this.src[this.i];
    if (c === '"' || c === "'") return String(parseScalar(this.readQuoted()));
    return this.readUntil([':', ',', '}']).trim();
  }

  private readQuoted(): string {
    const quote = this.src[this.i];
    let out = quote;
    this.i++;
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      out += c;
      this.i++;
      if (c === '\\') { out += this.src[this.i]; this.i++; continue; }
      if (c === quote) break;
    }
    return out;
  }

  private readUntil(stops: string[]): string {
    let out = '';
    let depth = 0;
    while (this.i < this.src.length) {
      const c = this.src[this.i];
      if (c === '"' || c === "'") { out += this.readQuoted(); continue; }
      // Nawiasy okrągłe liczą się do zagnieżdżenia, żeby `{expr: f(a, b)}`
      // bez cudzysłowów nie rozpadło się na przecinku wywołania.
      if (c === '{' || c === '[' || c === '(') depth++;
      if (c === ')') depth--;
      if (c === '}' || c === ']') { if (depth === 0 && stops.includes(c)) break; depth--; }
      if (depth === 0 && stops.includes(c)) break;
      out += c;
      this.i++;
    }
    return out;
  }
}

// ─────────────────────────────────────────────────────────── parse (block)

interface Line {
  indent: number;
  text: string;
}

function toLines(src: string): Line[] {
  return src
    .split('\n')
    .map(l => l.replace(/\s+$/, ''))
    .filter(l => l.trim() !== '' && !/^\s*#/.test(l))
    .map(l => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
}

/**
 * Parsuje ciało bloku do listy par klucz→wartość. Zwracamy tablicę,
 * nie obiekt, żeby zachować kolejność kluczy dla nieznanych pól.
 */
export function parseYamlBody(src: string): [string, YamlValue][] {
  const lines = toLines(src);
  const [entries] = parseMapAt(lines, 0, lines.length > 0 ? lines[0].indent : 0);
  return entries;
}

function parseMapAt(lines: Line[], start: number, indent: number): [[string, YamlValue][], number] {
  const out: [string, YamlValue][] = [];
  let i = start;
  while (i < lines.length && lines[i].indent >= indent) {
    if (lines[i].indent > indent) { i++; continue; }
    const line = lines[i];
    const colon = findKeyColon(line.text);
    if (colon < 0) { i++; continue; }
    const key = String(parseScalar(line.text.slice(0, colon)));
    const rest = line.text.slice(colon + 1).trim();
    if (rest !== '') {
      out.push([key, parseInlineValue(rest)]);
      i++;
      continue;
    }
    // Wartość zagnieżdżona w kolejnych liniach.
    const childIndent = i + 1 < lines.length ? lines[i + 1].indent : indent;
    if (i + 1 >= lines.length || childIndent <= indent) {
      out.push([key, null]);
      i++;
      continue;
    }
    if (lines[i + 1].text.startsWith('- ') || lines[i + 1].text === '-') {
      const [seq, next] = parseSeqAt(lines, i + 1, childIndent);
      out.push([key, seq]);
      i = next;
    } else {
      const [map, next] = parseMapAt(lines, i + 1, childIndent);
      out.push([key, fromEntries(map)]);
      i = next;
    }
  }
  return [out, i];
}

function parseSeqAt(lines: Line[], start: number, indent: number): [YamlValue[], number] {
  const out: YamlValue[] = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && (lines[i].text.startsWith('- ') || lines[i].text === '-')) {
    const head = lines[i].text === '-' ? '' : lines[i].text.slice(2).trim();
    const itemLines: Line[] = [];
    if (head !== '') itemLines.push({ indent: 0, text: head });
    let j = i + 1;
    while (j < lines.length && lines[j].indent > indent) {
      itemLines.push({ indent: lines[j].indent - indent - 2, text: lines[j].text });
      j++;
    }
    if (itemLines.length === 0) {
      out.push(null);
    } else if (itemLines.length === 1 && findKeyColon(itemLines[0].text) < 0) {
      out.push(parseInlineValue(itemLines[0].text));
    } else {
      const [map] = parseMapAt(itemLines, 0, 0);
      out.push(fromEntries(map));
    }
    i = j;
  }
  return [out, i];
}

/** Dwukropek kończący klucz — pomija te wewnątrz cudzysłowów i nawiasów. */
function findKeyColon(text: string): number {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
    else if (c === ':' && depth === 0) {
      const next = text[i + 1];
      if (next === undefined || next === ' ') return i;
    }
  }
  return -1;
}

function parseInlineValue(raw: string): YamlValue {
  const flow = parseFlow(raw);
  if (flow) return flow.value;
  return parseScalar(raw);
}

function fromEntries(entries: [string, YamlValue][]): Record<string, YamlValue> {
  const out: Record<string, YamlValue> = {};
  for (const [k, v] of entries) out[k] = v;
  return out;
}

// ─────────────────────────────────────────────────────────── serialize

/** Krótkie mapy/listy skalarów zapisujemy inline — czytelniej i stabilnie. */
function isInlineable(v: YamlValue): boolean {
  if (Array.isArray(v)) return v.every(x => x === null || typeof x !== 'object');
  if (v && typeof v === 'object') {
    const entries = Object.entries(v);
    return entries.length <= 3 && entries.every(([, x]) => x === null || typeof x !== 'object');
  }
  return true;
}

export function formatInline(v: YamlValue): string {
  if (Array.isArray(v)) return `[${v.map(formatInline).join(', ')}]`;
  if (v && typeof v === 'object') {
    const body = Object.entries(v).map(([k, x]) => `${k}: ${formatInline(x)}`).join(', ');
    return `{${body}}`;
  }
  return formatScalar(v);
}

export function serializeYamlEntry(key: string, value: YamlValue, indent = 0): string[] {
  const pad = ' '.repeat(indent);
  if (value === null || typeof value !== 'object' || isInlineable(value)) {
    return [`${pad}${key}: ${formatInline(value)}`];
  }
  const lines = [`${pad}${key}:`];
  if (Array.isArray(value)) {
    for (const item of value) lines.push(...serializeSeqItem(item, indent + 2));
  } else {
    for (const [k, v] of Object.entries(value)) lines.push(...serializeYamlEntry(k, v, indent + 2));
  }
  return lines;
}

function serializeSeqItem(item: YamlValue, indent: number): string[] {
  const pad = ' '.repeat(indent);
  if (item === null || typeof item !== 'object' || isInlineable(item)) {
    return [`${pad}- ${formatInline(item)}`];
  }
  if (Array.isArray(item)) {
    return [`${pad}- ${formatInline(item)}`];
  }
  const entries = Object.entries(item);
  const lines: string[] = [];
  entries.forEach(([k, v], idx) => {
    const sub = serializeYamlEntry(k, v, indent + 2);
    if (idx === 0) {
      lines.push(`${pad}- ${sub[0].trimStart()}`, ...sub.slice(1));
    } else {
      lines.push(...sub);
    }
  });
  return lines;
}
