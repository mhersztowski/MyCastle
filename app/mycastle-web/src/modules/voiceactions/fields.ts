/**
 * Niestandardowe pola Blockly otwierające dialogi VFS.
 *  - FieldVfsFile: wybór pliku z VFS (okno dialogowe).
 *  - FieldVfsJson: konfiguracja zapytania JSON (plik + ścieżka + filtry).
 */

import * as Blockly from 'blockly';
import { getVfsFilePicker, getVfsJsonPicker } from './vfsPicker';
import type { VfsJsonQueryConfig } from './vfsPicker';

/** Pole wyboru pliku z VFS — klik otwiera dialog zamiast edycji tekstu. */
export class FieldVfsFile extends Blockly.FieldTextInput {
  protected showEditor_(): void {
    const picker = getVfsFilePicker();
    if (!picker) { super.showEditor_(); return; }
    picker((this.getValue() as string) || '').then(res => {
      if (res != null) this.setValue(res);
    });
  }

  getText(): string {
    const v = (this.getValue() as string) || '';
    if (!v) return '(wybierz plik)';
    return v.split('/').pop() || v;
  }

  static fromJson(options: Record<string, unknown>): FieldVfsFile {
    return new FieldVfsFile((options['value'] as string) ?? '');
  }
}

/** Pole konfiguracji zapytania JSON z VFS. Wartość = JSON stringa konfiguracji. */
export class FieldVfsJson extends Blockly.FieldTextInput {
  protected showEditor_(): void {
    const picker = getVfsJsonPicker();
    if (!picker) { super.showEditor_(); return; }
    let cur: VfsJsonQueryConfig | null = null;
    try { cur = JSON.parse((this.getValue() as string) || 'null'); } catch { cur = null; }
    picker(cur).then(res => {
      if (res) this.setValue(JSON.stringify(res));
    });
  }

  getText(): string {
    try {
      const cfg = JSON.parse((this.getValue() as string) || 'null') as VfsJsonQueryConfig | null;
      if (!cfg || !cfg.path) return '(skonfiguruj JSON)';
      const fname = cfg.path.split('/').pop() || cfg.path;
      const jp = cfg.jsonPath ? ` → ${cfg.jsonPath}` : '';
      const fl = cfg.filters?.length ? ` [${cfg.filters.length} filtr]` : '';
      return `${fname}${jp}${fl}`;
    } catch {
      return '(skonfiguruj JSON)';
    }
  }

  static fromJson(options: Record<string, unknown>): FieldVfsJson {
    return new FieldVfsJson((options['value'] as string) ?? '{}');
  }
}

let registered = false;
export function registerVfsFields(): void {
  if (registered) return;
  registered = true;
  try { Blockly.fieldRegistry.register('field_vfs_file', FieldVfsFile); } catch { /* już zarejestrowane */ }
  try { Blockly.fieldRegistry.register('field_vfs_json', FieldVfsJson); } catch { /* już zarejestrowane */ }
}
