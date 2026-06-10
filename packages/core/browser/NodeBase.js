/**
 * NodeBase — bazowa klasa węzła (czysty przeglądarkowy ES module).
 *
 * Odpowiednik `packages/core/src/nodes/NodeBase.ts`, ale bez TypeScriptu i bez
 * żadnego builda — plik można importować wprost w przeglądarce:
 *
 *   import { PersonNode } from './browser/index.js';
 *
 * Trzyma stan UI (zaznaczenie / rozwinięcie / edycja / dirty) oraz wspólne
 * helpery. Klasy pochodne nadpisują getDisplayName(), toModel(), clone(), matches().
 */
export class NodeBase {
  constructor() {
    this._isSelected = false;
    this._isExpanded = false;
    this._isEditing = false;
    this._isDirty = false;
  }

  get isSelected() { return this._isSelected; }
  setSelected(value) { this._isSelected = value; return this; }
  toggleSelected() { this._isSelected = !this._isSelected; return this; }

  get isExpanded() { return this._isExpanded; }
  setExpanded(value) { this._isExpanded = value; return this; }
  toggleExpanded() { this._isExpanded = !this._isExpanded; return this; }

  get isEditing() { return this._isEditing; }
  setEditing(value) { this._isEditing = value; return this; }

  get isDirty() { return this._isDirty; }
  setDirty(value) { this._isDirty = value; return this; }
  markDirty() { this._isDirty = true; return this; }
  markClean() { this._isDirty = false; return this; }

  /** Reset całego stanu UI do wartości domyślnych. */
  resetState() {
    this._isSelected = false;
    this._isExpanded = false;
    this._isEditing = false;
    this._isDirty = false;
    return this;
  }

  /** Kopiuje stan UI tego węzła do innego (używane w clone()). */
  copyBaseStateTo(target) {
    target._isSelected = this._isSelected;
    target._isExpanded = this._isExpanded;
    target._isEditing = this._isEditing;
    target._isDirty = this._isDirty;
    return target;
  }

  // ── Do nadpisania w klasach pochodnych ──
  getDisplayName() { throw new Error('getDisplayName() not implemented'); }
  toModel() { throw new Error('toModel() not implemented'); }
  clone() { throw new Error('clone() not implemented'); }
  matches(_query) { return false; }
}
