import { NodeBase } from './NodeBase';
import { MinisDeviceModel } from '../models/MinisDeviceModel';

export class MinisDeviceNode extends NodeBase<MinisDeviceModel> {
  readonly type = 'device' as const;
  id: string;
  deviceDefId: string;
  isAssembled: boolean;
  sn: string;

  constructor(model: MinisDeviceModel) {
    super();
    this.id = model.id;
    this.deviceDefId = model.deviceDefId;
    this.isAssembled = model.isAssembled;
    this.sn = model.sn;
  }

  static fromModel(model: MinisDeviceModel): MinisDeviceNode {
    return new MinisDeviceNode(model);
  }

  static fromModels(models: MinisDeviceModel[]): MinisDeviceNode[] {
    return models.map(m => MinisDeviceNode.fromModel(m));
  }

  getDisplayName(): string {
    return `${this.deviceDefId} (${this.sn})`;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.deviceDefId.toLowerCase().includes(q) ||
      this.sn.toLowerCase().includes(q)
    );
  }

  toModel(): MinisDeviceModel {
    return {
      type: 'device',
      id: this.id,
      deviceDefId: this.deviceDefId,
      isAssembled: this.isAssembled,
      sn: this.sn,
    };
  }

  clone(): MinisDeviceNode {
    const cloned = new MinisDeviceNode(this.toModel());
    cloned._isSelected = this._isSelected;
    cloned._isExpanded = this._isExpanded;
    cloned._isEditing = this._isEditing;
    cloned._isDirty = this._isDirty;
    return cloned;
  }
}
