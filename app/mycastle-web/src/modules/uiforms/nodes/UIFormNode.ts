/**
 * UI Form Node - klasa Node dla formularza UI
 */

import { NodeBase } from '@mhersztowski/core';
import {
  UIFormModel,
  UIFormSettings,
  UICallbackDefinition,
  UIDataField,
} from '../models';
import { UIControlNode } from './UIControlNode';

export class UIFormNode extends NodeBase<UIFormModel> {
  // Pola z modelu
  id: string;
  name: string;
  description?: string;
  version: string;

  // Root control
  private _root: UIControlNode;

  // Ustawienia
  settings?: UIFormSettings;

  // Callback'i i schema
  callbacks: Map<string, UICallbackDefinition> = new Map();
  dataSchema: Map<string, UIDataField> = new Map();

  constructor(model: UIFormModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.description = model.description;
    this.version = model.version;

    // Twórz root control
    this._root = UIControlNode.fromModel(model.root);

    // Ustawienia
    if (model.settings) {
      this.settings = { ...model.settings };
    }

    // Callback'i
    if (model.callbacks) {
      for (const [key, value] of Object.entries(model.callbacks)) {
        this.callbacks.set(key, { ...value });
      }
    }

    // Data schema
    if (model.dataSchema) {
      for (const [key, value] of Object.entries(model.dataSchema)) {
        this.dataSchema.set(key, { ...value });
      }
    }
  }

  // Factory method
  static fromModel(model: UIFormModel): UIFormNode {
    return new UIFormNode(model);
  }

  // NodeBase abstract methods
  getDisplayName(): string {
    return this.name;
  }

  toModel(): UIFormModel {
    const model: UIFormModel = {
      type: 'ui_form',
      id: this.id,
      name: this.name,
      version: this.version,
      root: this._root.toModel(),
    };

    if (this.description) model.description = this.description;
    if (this.settings) model.settings = { ...this.settings };

    if (this.callbacks.size > 0) {
      model.callbacks = {};
      for (const [key, value] of this.callbacks) {
        model.callbacks[key] = { ...value };
      }
    }

    if (this.dataSchema.size > 0) {
      model.dataSchema = {};
      for (const [key, value] of this.dataSchema) {
        model.dataSchema[key] = { ...value };
      }
    }

    return model;
  }

  clone(): UIFormNode {
    return UIFormNode.fromModel(this.toModel());
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      this.id.toLowerCase().includes(lowerQuery) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  // Root control
  get root(): UIControlNode {
    return this._root;
  }

  setRoot(root: UIControlNode): this {
    this._root = root;
    this.markDirty();
    return this;
  }

  // Find control by ID w całym drzewie
  findControlById(id: string): UIControlNode | null {
    return this._root.findChildById(id);
  }

  // Get all controls (flat list)
  getAllControls(): UIControlNode[] {
    return [this._root, ...this._root.getAllDescendants()];
  }

  // Callback helpers
  getCallback(name: string): UICallbackDefinition | undefined {
    return this.callbacks.get(name);
  }

  setCallback(name: string, callback: UICallbackDefinition): this {
    this.callbacks.set(name, callback);
    this.markDirty();
    return this;
  }

  removeCallback(name: string): this {
    this.callbacks.delete(name);
    this.markDirty();
    return this;
  }

  // Data schema helpers
  getDataField(name: string): UIDataField | undefined {
    return this.dataSchema.get(name);
  }

  setDataField(name: string, field: UIDataField): this {
    this.dataSchema.set(name, field);
    this.markDirty();
    return this;
  }

  removeDataField(name: string): this {
    this.dataSchema.delete(name);
    this.markDirty();
    return this;
  }

  // Settings helpers
  setSetting<K extends keyof UIFormSettings>(key: K, value: UIFormSettings[K]): this {
    if (!this.settings) {
      this.settings = {};
    }
    this.settings[key] = value;
    this.markDirty();
    return this;
  }

  getSetting<K extends keyof UIFormSettings>(key: K): UIFormSettings[K] | undefined {
    return this.settings?.[key];
  }

  // Get default data based on schema
  getDefaultData(): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    for (const [key, field] of this.dataSchema) {
      if (field.default !== undefined) {
        data[key] = field.default;
      } else {
        // Set type-appropriate defaults
        switch (field.type) {
          case 'string':
            data[key] = '';
            break;
          case 'number':
            data[key] = 0;
            break;
          case 'boolean':
            data[key] = false;
            break;
          case 'array':
            data[key] = [];
            break;
          case 'object':
            data[key] = {};
            break;
          case 'date':
            data[key] = null;
            break;
        }
      }
    }
    return data;
  }

  // Validate data against schema
  validateData(data: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [key, field] of this.dataSchema) {
      const value = data[key];

      // Check required
      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push(`Field "${key}" is required`);
        continue;
      }

      // Skip validation if not required and empty
      if (value === undefined || value === null) continue;

      // Type validation
      switch (field.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`Field "${key}" must be a string`);
          }
          break;
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`Field "${key}" must be a number`);
          }
          break;
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Field "${key}" must be a boolean`);
          }
          break;
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Field "${key}" must be an array`);
          }
          break;
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value)) {
            errors.push(`Field "${key}" must be an object`);
          }
          break;
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
