import { NodeBase } from './NodeBase.js';

/**
 * PersonNode — odpowiednik `PersonNode.ts`.
 *
 * Model (PersonModel):
 *   { type: 'person', id, nick, firstName?, secondName?, description? }
 */
export class PersonNode extends NodeBase {
  constructor(model) {
    super();
    this.type = 'person';
    this.id = model.id;
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
  }

  static fromModel(model) { return new PersonNode(model); }
  static fromModels(models) { return (models ?? []).map((m) => new PersonNode(m)); }

  getDisplayName() { return this.getFullName() ?? this.nick; }

  /** Pełne imię i nazwisko, albo null gdy żadne z pól nie jest ustawione. */
  getFullName() {
    const parts = [this.firstName, this.secondName].filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  /** Inicjały (2 znaki, wielkie litery) — do awatara. */
  getInitials() {
    if (this.firstName || this.secondName) {
      const a = this.firstName?.[0] ?? '';
      const b = this.secondName?.[0] ?? '';
      const initials = (a + b).toUpperCase();
      if (initials) return initials;
    }
    return (this.nick ?? '').slice(0, 2).toUpperCase();
  }

  hasFullName() { return Boolean(this.firstName || this.secondName); }

  matches(query) {
    const q = (query ?? '').toLowerCase();
    return [this.nick, this.firstName, this.secondName, this.description, this.id]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q));
  }

  updateFrom(model) {
    if (model.nick !== undefined) this.nick = model.nick;
    if (model.firstName !== undefined) this.firstName = model.firstName;
    if (model.secondName !== undefined) this.secondName = model.secondName;
    if (model.description !== undefined) this.description = model.description;
    return this.markDirty();
  }

  toModel() {
    return {
      type: 'person',
      id: this.id,
      nick: this.nick,
      firstName: this.firstName,
      secondName: this.secondName,
      description: this.description,
    };
  }

  clone() { return this.copyBaseStateTo(new PersonNode(this.toModel())); }

  equals(other) { return Boolean(other) && other.id === this.id; }
}
