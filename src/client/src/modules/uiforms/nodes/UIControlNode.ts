/**
 * UI Control Node - klasa Node z UI state dla kontrolek
 */

import { NodeBase } from '../../filesystem/nodes/NodeBase';
import {
  UIControlModel,
  UIControlType,
  UIAnchors,
  UIOffsets,
  UIAnchorPreset,
  UIMinSize,
  UISizeFlags,
  UIDataBinding,
  UIEventBindings,
  ANCHOR_PRESETS,
} from '../models';

export class UIControlNode extends NodeBase<UIControlModel> {
  // Pola z modelu
  id: string;
  name: string;
  controlType: UIControlType;
  anchors: UIAnchors;
  offsets: UIOffsets;
  anchorPreset?: UIAnchorPreset;
  minSize?: UIMinSize;
  sizeFlags?: UISizeFlags;
  visible: boolean;
  disabled: boolean;
  properties: Record<string, unknown>;
  binding?: UIDataBinding;
  events?: UIEventBindings;

  // Hierarchia
  private _children: UIControlNode[] = [];
  private _parent: UIControlNode | null = null;

  // UI state specyficzny dla designera
  private _isHovered: boolean = false;
  private _isDragging: boolean = false;
  private _isDropTarget: boolean = false;

  constructor(model: UIControlModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.controlType = model.controlType;
    this.anchors = { ...model.anchors };
    this.offsets = { ...model.offsets };
    this.anchorPreset = model.anchorPreset;
    this.minSize = model.minSize ? { ...model.minSize } : undefined;
    this.sizeFlags = model.sizeFlags ? { ...model.sizeFlags } : undefined;
    this.visible = model.visible !== false;
    this.disabled = model.disabled === true;
    this.properties = { ...(model.properties || {}) };
    this.binding = model.binding ? { ...model.binding } : undefined;
    this.events = model.events ? { ...model.events } : undefined;

    // Rekurencyjnie twórz children
    if (model.children) {
      for (const childModel of model.children) {
        const childNode = new UIControlNode(childModel);
        this.addChild(childNode);
      }
    }
  }

  // Factory method
  static fromModel(model: UIControlModel): UIControlNode {
    return new UIControlNode(model);
  }

  // NodeBase abstract methods
  getDisplayName(): string {
    return this.name || this.controlType;
  }

  toModel(): UIControlModel {
    const model: UIControlModel = {
      type: 'ui_control',
      id: this.id,
      name: this.name,
      controlType: this.controlType,
      anchors: { ...this.anchors },
      offsets: { ...this.offsets },
    };

    if (this.anchorPreset) model.anchorPreset = this.anchorPreset;
    if (this.minSize) model.minSize = { ...this.minSize };
    if (this.sizeFlags) model.sizeFlags = { ...this.sizeFlags };
    if (!this.visible) model.visible = false;
    if (this.disabled) model.disabled = true;
    if (Object.keys(this.properties).length > 0) model.properties = { ...this.properties };
    if (this.binding) model.binding = { ...this.binding };
    if (this.events) model.events = { ...this.events };

    if (this._children.length > 0) {
      model.children = this._children.map(child => child.toModel());
    }

    return model;
  }

  clone(): UIControlNode {
    return UIControlNode.fromModel(this.toModel());
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(lowerQuery) ||
      this.controlType.toLowerCase().includes(lowerQuery) ||
      this.id.toLowerCase().includes(lowerQuery)
    );
  }

  // Hierarchia
  get children(): UIControlNode[] {
    return [...this._children];
  }

  get parent(): UIControlNode | null {
    return this._parent;
  }

  hasChildren(): boolean {
    return this._children.length > 0;
  }

  addChild(child: UIControlNode, index?: number): this {
    child._parent = this;
    if (index !== undefined && index >= 0 && index <= this._children.length) {
      this._children.splice(index, 0, child);
    } else {
      this._children.push(child);
    }
    return this;
  }

  removeChild(child: UIControlNode): this {
    const index = this._children.indexOf(child);
    if (index !== -1) {
      this._children.splice(index, 1);
      child._parent = null;
    }
    return this;
  }

  removeChildById(id: string): UIControlNode | null {
    const child = this._children.find(c => c.id === id);
    if (child) {
      this.removeChild(child);
      return child;
    }
    return null;
  }

  getChildIndex(child: UIControlNode): number {
    return this._children.indexOf(child);
  }

  moveChild(child: UIControlNode, newIndex: number): this {
    const currentIndex = this._children.indexOf(child);
    if (currentIndex !== -1 && newIndex >= 0 && newIndex < this._children.length) {
      this._children.splice(currentIndex, 1);
      this._children.splice(newIndex, 0, child);
    }
    return this;
  }

  // Deep search
  findChildById(id: string): UIControlNode | null {
    if (this.id === id) return this;

    for (const child of this._children) {
      const found = child.findChildById(id);
      if (found) return found;
    }

    return null;
  }

  getDepth(): number {
    let depth = 0;
    let current: UIControlNode | null = this._parent;
    while (current) {
      depth++;
      current = current._parent;
    }
    return depth;
  }

  getPath(): string[] {
    const path: string[] = [this.id];
    let current: UIControlNode | null = this._parent;
    while (current) {
      path.unshift(current.id);
      current = current._parent;
    }
    return path;
  }

  // Flatten tree
  getAllDescendants(): UIControlNode[] {
    const descendants: UIControlNode[] = [];

    const collect = (node: UIControlNode) => {
      for (const child of node._children) {
        descendants.push(child);
        collect(child);
      }
    };

    collect(this);
    return descendants;
  }

  // Anchor/Offset helpers
  setAnchorPreset(preset: UIAnchorPreset): this {
    this.anchorPreset = preset;
    this.anchors = { ...ANCHOR_PRESETS[preset] };
    this.markDirty();
    return this;
  }

  setAnchors(anchors: Partial<UIAnchors>): this {
    this.anchors = { ...this.anchors, ...anchors };
    this.anchorPreset = 'custom';
    this.markDirty();
    return this;
  }

  setOffsets(offsets: Partial<UIOffsets>): this {
    this.offsets = { ...this.offsets, ...offsets };
    this.markDirty();
    return this;
  }

  // Property helpers
  getProperty<T>(key: string, defaultValue?: T): T | undefined {
    return (this.properties[key] as T) ?? defaultValue;
  }

  setProperty(key: string, value: unknown): this {
    this.properties[key] = value;
    this.markDirty();
    return this;
  }

  // Designer UI state
  get isHovered(): boolean {
    return this._isHovered;
  }

  setHovered(value: boolean): this {
    this._isHovered = value;
    return this;
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  setDragging(value: boolean): this {
    this._isDragging = value;
    return this;
  }

  get isDropTarget(): boolean {
    return this._isDropTarget;
  }

  setDropTarget(value: boolean): this {
    this._isDropTarget = value;
    return this;
  }

  // Utility
  isContainer(): boolean {
    return ['container', 'vbox', 'hbox', 'grid', 'margin', 'scroll', 'tabs', 'accordion'].includes(this.controlType);
  }

  canHaveChildren(): boolean {
    return this.isContainer();
  }

  // Reset all designer states
  resetDesignerState(): this {
    this._isHovered = false;
    this._isDragging = false;
    this._isDropTarget = false;
    return this;
  }
}
