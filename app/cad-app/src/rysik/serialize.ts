/**
 * Parser i serializer dokumentu `.qmd` z blokami Rysika.
 *
 * Format bloku jest tym, co Pandoc rozumie natywnie — blok kodu z klasą:
 *
 * ```{.scene3d-terrain}
 * #| label: fig-wisla
 * #| fig-cap: "Model terenu"
 *
 * exaggeration: 1.5
 * ```
 *
 * Klasa w kropce (nie `{scene3d-terrain}`), bo klamry bez kropki oznaczają
 * komórkę wykonywalną i Quarto próbowałoby wysłać ją do silnika. Dokument bez
 * naszego narzędzia nadal się renderuje — jako zwykły blok kodu.
 *
 * Reguły zapisu (bez nich git zamienia diff w śmieci):
 *  • kolejność kluczy z manifestu, nie z kolejności wpisywania,
 *  • wartości domyślne nie są zapisywane,
 *  • floaty kwantyzowane wg `precision`/`step`,
 *  • kamera to stan sesji — trafia do pliku dopiero po jawnym poleceniu.
 */

import { getManifest, manifestByClass, typeToClass, VARS_CLASS } from './blocks/registry';
import {
  defaultProps,
  isDefaultValue,
  literal,
  paramFromYaml,
  paramToYamlForSpec,
  coerceValue,
} from './props';
import { formatInline, parseYamlBody, serializeYamlEntry } from './yaml';
import type {
  BlockManifest,
  BlockNode,
  ChildNode,
  ChildSpec,
  DocSegment,
  DocVar,
  Primitive,
  RysikDoc,
  YamlValue,
} from './types';

let uidCounter = 0;
const nextUid = (): string => `n${++uidCounter}`;

// ─────────────────────────────────────────────────────────── tworzenie

export function createBlock(manifest: BlockManifest): BlockNode {
  return {
    uid: nextUid(),
    type: manifest.type,
    options: [],
    props: defaultProps(manifest.props),
    children: Object.fromEntries(Object.keys(manifest.children ?? {}).map(k => [k, []])),
    extras: [],
  };
}

export function createChild(spec: ChildSpec, id: string): ChildNode {
  return { id, kind: spec.kind, props: defaultProps(spec.props), extras: [] };
}

export function emptyDoc(): RysikDoc {
  return { frontmatter: '', segments: [], vars: [] };
}

// ─────────────────────────────────────────────────────────── ciało bloku

function parseChildren(spec: ChildSpec, value: YamlValue, fallbackPrefix: string): ChildNode[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, idx) => {
    const child = createChild(spec, `${fallbackPrefix}${idx + 1}`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return child;
    for (const [key, v] of Object.entries(raw)) {
      if (key === 'id') { child.id = String(v); continue; }
      const propSpec = spec.props[key];
      if (!propSpec) { child.extras.push([key, v]); continue; }
      const param = paramFromYaml(v);
      child.props[key] = param.src === 'literal'
        ? literal(coerceValue(propSpec, param.value))
        : param;
    }
    return child;
  });
}

/** Rozkłada ciało YAML na właściwości z manifestu, dzieci i klucze nieznane. */
export function parseBlockBody(manifest: BlockManifest, body: string): Pick<BlockNode, 'props' | 'children' | 'extras'> {
  const props = defaultProps(manifest.props);
  const children: Record<string, ChildNode[]> = Object.fromEntries(
    Object.keys(manifest.children ?? {}).map(k => [k, []]),
  );
  const extras: [string, YamlValue][] = [];

  for (const [key, value] of parseYamlBody(body)) {
    const childSpec = manifest.children?.[key];
    if (childSpec) {
      children[key] = parseChildren(childSpec, value, `${childSpec.kind}-`);
      continue;
    }
    const spec = manifest.props[key];
    if (!spec) { extras.push([key, value]); continue; }
    const param = paramFromYaml(value);
    props[key] = param.src === 'literal' ? literal(coerceValue(spec, param.value)) : param;
  }

  return { props, children, extras };
}

function serializeChild(spec: ChildSpec, child: ChildNode): string[] {
  const entries: [string, YamlValue][] = [['id', child.id]];
  for (const [key, propSpec] of Object.entries(spec.props)) {
    const value = child.props[key];
    if (!value || isDefaultValue(propSpec, value)) continue;
    entries.push([key, paramToYamlForSpec(propSpec, value)]);
  }
  entries.push(...child.extras);

  const lines: string[] = [];
  entries.forEach(([key, value], idx) => {
    const sub = serializeYamlEntry(key, value, idx === 0 ? 0 : 4);
    if (idx === 0) lines.push(`  - ${sub[0]}`, ...sub.slice(1).map(l => `    ${l}`));
    else lines.push(...sub);
  });
  return lines;
}

/** Ciało bloku (bez fence i bez opcji `#|`). */
export function serializeBlockBody(block: BlockNode, manifest: BlockManifest): string {
  const lines: string[] = [];

  for (const [key, spec] of Object.entries(manifest.props)) {
    const value = block.props[key];
    if (!value || isDefaultValue(spec, value)) continue;
    lines.push(...serializeYamlEntry(key, paramToYamlForSpec(spec, value)));
  }

  for (const [key, spec] of Object.entries(manifest.children ?? {})) {
    const list = block.children[key] ?? [];
    if (list.length === 0) continue;
    lines.push(`${key}:`);
    for (const child of list) lines.push(...serializeChild(spec, child));
  }

  for (const [key, value] of block.extras) {
    lines.push(...serializeYamlEntry(key, value));
  }

  return lines.join('\n');
}

/** Pełny blok wraz z fence i opcjami `#|`. */
export function serializeBlock(block: BlockNode): string {
  const manifest = getManifest(block.type);
  if (!manifest) return '';

  const options: [string, string][] = [];
  if (block.label) options.push(['label', block.label]);
  // Podpis zawsze w cudzysłowach — konwencja Quarto i jedna forma w round-tripie.
  if (block.caption !== undefined) options.push(['fig-cap', JSON.stringify(block.caption)]);
  options.push(...block.options);

  const head = `\`\`\`{.${typeToClass(block.type)}}`;
  const optionLines = options.map(([k, v]) => `#| ${k}: ${v}`);
  const body = serializeBlockBody(block, manifest);

  const parts = [head, ...optionLines];
  if (body !== '') {
    if (optionLines.length > 0) parts.push('');
    parts.push(body);
  }
  parts.push('```');
  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────── zmienne dokumentu

export function serializeVars(vars: DocVar[]): string {
  const lines = [`\`\`\`{.${VARS_CLASS}}`];
  for (const v of vars) {
    const fields: [string, YamlValue][] = [['name', v.name]];
    if (v.label !== undefined && v.label !== '') fields.push(['label', v.label]);
    fields.push(['value', v.value]);
    if (v.min !== undefined) fields.push(['min', v.min]);
    if (v.max !== undefined) fields.push(['max', v.max]);
    if (v.step !== undefined) fields.push(['step', v.step]);
    // Mapa inline (w klamrach) — jedna zmienna to jedna linia diffu.
    lines.push(`- {${fields.map(([k, val]) => `${k}: ${formatInline(val)}`).join(', ')}}`);
  }
  lines.push('```');
  return lines.join('\n');
}

export function parseVars(body: string): DocVar[] {
  const out: DocVar[] = [];
  // Ciało to lista map — parser mini-YAML wymaga klucza, więc opakowujemy.
  const entries = parseYamlBody(`vars:\n${body.split('\n').map(l => `  ${l}`).join('\n')}`);
  const list = entries.find(([k]) => k === 'vars')?.[1];
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const name = typeof item.name === 'string' ? item.name : '';
    if (!name) continue;
    const value = (item.value ?? 0) as Primitive;
    const v: DocVar = { name, value: typeof value === 'object' ? 0 : value };
    if (typeof item.label === 'string') v.label = item.label;
    if (typeof item.min === 'number') v.min = item.min;
    if (typeof item.max === 'number') v.max = item.max;
    if (typeof item.step === 'number') v.step = item.step;
    out.push(v);
  }
  return out;
}

// ─────────────────────────────────────────────────────────── dokument

const FENCE_OPEN = /^(`{3,})\{([^}]*)\}\s*$/;
const OPTION_LINE = /^#\|\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/;

function classesOf(attrs: string): string[] {
  return attrs
    .split(/\s+/)
    .filter(t => t.startsWith('.'))
    .map(t => t.slice(1));
}

export function parseDocument(src: string): RysikDoc {
  const lines = src.split('\n');
  let i = 0;
  let frontmatter = '';

  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, idx) => idx > 0 && l.trim() === '---');
    if (end > 0) {
      frontmatter = lines.slice(1, end).join('\n');
      i = end + 1;
    }
  }

  const segments: DocSegment[] = [];
  let vars: DocVar[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length === 0) return;
    segments.push({ kind: 'markdown', text: buffer.join('\n') });
    buffer = [];
  };

  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i]);
    const cls = open ? classesOf(open[2]) : [];
    const manifest = cls.map(c => manifestByClass(c)).find(Boolean);
    const isVars = cls.includes(VARS_CLASS);

    if (!open || (!manifest && !isVars)) {
      buffer.push(lines[i]);
      i++;
      continue;
    }

    const fence = open[1];
    let end = i + 1;
    while (end < lines.length && lines[end].trimEnd() !== fence) end++;
    const inner = lines.slice(i + 1, end);
    i = end < lines.length ? end + 1 : end;

    if (isVars) {
      flush();
      vars = parseVars(inner.join('\n'));
      segments.push({ kind: 'vars' });
      continue;
    }

    flush();
    segments.push({ kind: 'block', block: parseBlockLines(manifest!, inner) });
  }

  flush();
  return { frontmatter, segments, vars };
}

function parseBlockLines(manifest: BlockManifest, inner: string[]): BlockNode {
  const block = createBlock(manifest);
  let idx = 0;
  while (idx < inner.length) {
    const m = OPTION_LINE.exec(inner[idx].trim());
    if (!m) break;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    if (key === 'label') block.label = value;
    else if (key === 'fig-cap') block.caption = String(parseOptionValue(value) ?? '');
    else block.options.push([key, value]);
    idx++;
  }

  const body = inner.slice(idx).join('\n');
  Object.assign(block, parseBlockBody(manifest, body));
  return block;
}

function parseOptionValue(raw: string): YamlValue {
  const entries = parseYamlBody(`v: ${raw}`);
  return entries.length > 0 ? entries[0][1] : raw;
}

export function serializeDocument(doc: RysikDoc): string {
  const parts: string[] = [];
  if (doc.frontmatter.trim() !== '') parts.push(`---\n${doc.frontmatter}\n---`);

  const body = doc.segments.map(seg => {
    switch (seg.kind) {
      case 'markdown': return seg.text;
      case 'block': return serializeBlock(seg.block);
      case 'vars': return serializeVars(doc.vars);
    }
  });

  parts.push(body.join('\n'));
  return parts.join('\n');
}

/** Blokom brakuje pozycji w tekście — pomocnicze wyszukiwanie po uid. */
export function findBlock(doc: RysikDoc, uid: string): BlockNode | undefined {
  for (const seg of doc.segments) {
    if (seg.kind === 'block' && seg.block.uid === uid) return seg.block;
  }
  return undefined;
}

export function allBlocks(doc: RysikDoc): BlockNode[] {
  return doc.segments.flatMap(seg => (seg.kind === 'block' ? [seg.block] : []));
}
