/**
 * Infrastruktura VFS dla Edytora Konwersacji:
 *  - rejestr dialogów wyboru pliku / zapytania JSON (wołane z pól Blockly),
 *  - listowanie plików VFS, odczyt pliku, wykonanie zapytania JSON (ścieżka + filtry).
 */

import { App } from '../../App';
import type { DirectoryTree } from '@mhersztowski/core';

// ---- Model zapytania JSON ----
export type VfsFilterOp =
  | 'has'          // ma atrybut
  | 'not_has'      // nie ma atrybutu
  | 'is_string'    // atrybut jest tekstem
  | 'is_number'    // atrybut jest liczbą
  | 'is_bool'      // atrybut jest bool
  | 'is_array'     // atrybut jest tablicą
  | 'contains'     // atrybut zawiera tekst
  | 'eq'           // atrybut = wartość
  | 'neq'          // atrybut != wartość
  | 'gt'           // atrybut > wartość (liczba)
  | 'lt';          // atrybut < wartość (liczba)

export interface VfsJsonFilter {
  op: VfsFilterOp;
  key: string;
  value?: string;
}

export interface VfsJsonQueryConfig {
  path: string;        // ścieżka pliku w VFS
  jsonPath: string;    // ścieżka wewnątrz JSON (np. "data.items"), pusta = całość
  filters: VfsJsonFilter[];
}

// ---- Rejestr dialogów (ustawiane przez stronę edytora) ----
type FilePicker = (current: string) => Promise<string | null>;
type JsonPicker = (current: VfsJsonQueryConfig | null) => Promise<VfsJsonQueryConfig | null>;

let filePicker: FilePicker | null = null;
let jsonPicker: JsonPicker | null = null;

export function setVfsFilePicker(fn: FilePicker | null): void { filePicker = fn; }
export function getVfsFilePicker(): FilePicker | null { return filePicker; }
export function setVfsJsonPicker(fn: JsonPicker | null): void { jsonPicker = fn; }
export function getVfsJsonPicker(): JsonPicker | null { return jsonPicker; }

// ---- Operacje na VFS ----
export async function getVfsTree(): Promise<DirectoryTree> {
  return App.instance.mqttClient.listDirectory('');
}

export async function listVfsFiles(): Promise<string[]> {
  const tree = await App.instance.mqttClient.listDirectory('');
  const out: string[] = [];
  const walk = (node: DirectoryTree) => {
    if (node.type === 'file') out.push(node.path);
    node.children?.forEach(walk);
  };
  walk(tree);
  return out.sort((a, b) => a.localeCompare(b));
}

export async function readVfsFile(path: string): Promise<string> {
  const f = await App.instance.mqttClient.readFile(path);
  return f?.content ?? '';
}

export async function readVfsJson(path: string): Promise<unknown> {
  const content = await readVfsFile(path);
  return content ? JSON.parse(content) : null;
}

/** Nawiguj po ścieżce w obiekcie (dot notation + indeksy tablic). */
export function navigateJsonPath(root: unknown, jsonPath: string): unknown {
  if (!jsonPath || !jsonPath.trim()) return root;
  const parts = jsonPath.split('.').map(p => p.trim()).filter(Boolean);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function matchFilter(item: unknown, f: VfsJsonFilter): boolean {
  if (typeof item !== 'object' || item === null) {
    // dla wartości prostych: 'has' bez klucza traktuj jako prawda
    return f.op === 'has' && !f.key;
  }
  const obj = item as Record<string, unknown>;
  const has = Object.prototype.hasOwnProperty.call(obj, f.key);
  const v = obj[f.key];
  switch (f.op) {
    case 'has': return has;
    case 'not_has': return !has;
    case 'is_string': return typeof v === 'string';
    case 'is_number': return typeof v === 'number';
    case 'is_bool': return typeof v === 'boolean';
    case 'is_array': return Array.isArray(v);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value ?? '').toLowerCase());
    case 'eq': return String(v) === String(f.value ?? '');
    case 'neq': return String(v) !== String(f.value ?? '');
    case 'gt': return typeof v === 'number' && v > Number(f.value);
    case 'lt': return typeof v === 'number' && v < Number(f.value);
    default: return true;
  }
}

/** Zastosuj filtry (AND) do tablicy; dla nie-tablicy zwróć wartość bez zmian. */
export function applyFilters(value: unknown, filters: VfsJsonFilter[]): unknown {
  if (!filters?.length) return value;
  if (!Array.isArray(value)) return value;
  return value.filter(item => filters.every(f => matchFilter(item, f)));
}

/** Pełne zapytanie: odczyt pliku → parse → nawigacja ścieżki → filtry. */
export async function runVfsJsonQuery(config: VfsJsonQueryConfig): Promise<unknown> {
  const root = await readVfsJson(config.path);
  const scoped = navigateJsonPath(root, config.jsonPath || '');
  return applyFilters(scoped, config.filters || []);
}
