/**
 * Base class for all backend Node classes
 * Backend version: no UI state (_isSelected, _isExpanded, _isEditing)
 */
export abstract class NodeBase<TModel> {
  protected _isDirty: boolean = false;

  get isDirty(): boolean {
    return this._isDirty;
  }

  setDirty(value: boolean): this {
    this._isDirty = value;
    return this;
  }

  markDirty(): this {
    this._isDirty = true;
    return this;
  }

  markClean(): this {
    this._isDirty = false;
    return this;
  }

  abstract getDisplayName(): string;
  abstract toModel(): TModel;
  abstract clone(): NodeBase<TModel>;
  abstract matches(query: string): boolean;
}
