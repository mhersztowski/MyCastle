import { NodeBase } from './NodeBase';
import { MinisProjectModel } from '../models/MinisProjectModel';

export class MinisProjectNode extends NodeBase<MinisProjectModel> {
  readonly type = 'minis_project' as const;
  id: string;
  name: string;
  projectDefId: string;

  constructor(model: MinisProjectModel) {
    super();
    this.id = model.id;
    this.name = model.name;
    this.projectDefId = model.projectDefId;
  }

  static fromModel(model: MinisProjectModel): MinisProjectNode { return new MinisProjectNode(model); }
  static fromModels(models: MinisProjectModel[]): MinisProjectNode[] { return models.map(m => new MinisProjectNode(m)); }

  getDisplayName(): string {
    return this.name;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.name.toLowerCase().includes(q) ||
      this.projectDefId.toLowerCase().includes(q)
    );
  }

  toModel(): MinisProjectModel {
    return {
      type: 'minis_project',
      id: this.id,
      name: this.name,
      projectDefId: this.projectDefId,
    };
  }

  clone(): MinisProjectNode {
    return this.copyBaseStateTo(new MinisProjectNode(this.toModel()));
  }
}
