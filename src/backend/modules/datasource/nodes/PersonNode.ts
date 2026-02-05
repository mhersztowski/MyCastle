import { NodeBase } from './NodeBase';
import { PersonModel } from '../models/PersonModel';

export class PersonNode extends NodeBase<PersonModel> {
  readonly type = 'person' as const;
  id: string;
  nick: string;
  firstName?: string;
  secondName?: string;
  description?: string;

  constructor(model: PersonModel) {
    super();
    this.id = model.id;
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
  }

  static fromModel(model: PersonModel): PersonNode {
    return new PersonNode(model);
  }

  static fromModels(models: PersonModel[]): PersonNode[] {
    return models.map(m => PersonNode.fromModel(m));
  }

  getDisplayName(): string {
    if (this.firstName || this.secondName) {
      return [this.firstName, this.secondName].filter(Boolean).join(' ');
    }
    return this.nick;
  }

  getFullName(): string | null {
    if (this.firstName && this.secondName) {
      return `${this.firstName} ${this.secondName}`;
    }
    if (this.firstName) return this.firstName;
    if (this.secondName) return this.secondName;
    return null;
  }

  getInitials(): string {
    if (this.firstName && this.secondName) {
      return `${this.firstName[0]}${this.secondName[0]}`.toUpperCase();
    }
    if (this.firstName) {
      return this.firstName.substring(0, 2).toUpperCase();
    }
    return this.nick.substring(0, 2).toUpperCase();
  }

  hasFullName(): boolean {
    return !!(this.firstName || this.secondName);
  }

  matches(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    return (
      this.id.toLowerCase().includes(lowerQuery) ||
      this.nick.toLowerCase().includes(lowerQuery) ||
      (this.firstName?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.secondName?.toLowerCase().includes(lowerQuery) ?? false) ||
      (this.description?.toLowerCase().includes(lowerQuery) ?? false)
    );
  }

  updateFrom(model: PersonModel): this {
    this.nick = model.nick;
    this.firstName = model.firstName;
    this.secondName = model.secondName;
    this.description = model.description;
    this.markDirty();
    return this;
  }

  toModel(): PersonModel {
    return {
      type: 'person',
      id: this.id,
      nick: this.nick,
      firstName: this.firstName,
      secondName: this.secondName,
      description: this.description,
    };
  }

  clone(): PersonNode {
    const cloned = new PersonNode(this.toModel());
    cloned._isDirty = this._isDirty;
    return cloned;
  }

  equals(other: PersonNode | PersonModel): boolean {
    return this.id === other.id;
  }
}
