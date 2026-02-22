import { ProjectRealizationModel, TaskRealizationModel } from '../models/ProjectRealizationModel';
import { ProjectDefinitionNode } from './ProjectDefinitionNode';

export class ProjectRealizationNode {
  id: string;
  definitionId: string;
  status: 'pending' | 'in_progress' | 'completed';
  taskRealizations: TaskRealizationModel[];
  created: string;
  modified: string;

  selected = false;
  loading = false;

  private _definitionRef: ProjectDefinitionNode | null = null;

  constructor(model: ProjectRealizationModel) {
    this.id = model.id;
    this.definitionId = model.definitionId;
    this.status = model.status;
    this.taskRealizations = [...model.taskRealizations];
    this.created = model.created;
    this.modified = model.modified;
  }

  static fromModel(model: ProjectRealizationModel): ProjectRealizationNode {
    return new ProjectRealizationNode(model);
  }

  get createdDate(): Date {
    return new Date(this.created);
  }

  get modifiedDate(): Date {
    return new Date(this.modified);
  }

  get isPending(): boolean {
    return this.status === 'pending';
  }

  get isInProgress(): boolean {
    return this.status === 'in_progress';
  }

  get isCompleted(): boolean {
    return this.status === 'completed';
  }

  get definitionRef(): ProjectDefinitionNode | null {
    return this._definitionRef;
  }

  get name(): string {
    return this._definitionRef?.info.name || this.definitionId;
  }

  get progress(): number {
    if (this.taskRealizations.length === 0) return 0;
    const completed = this.taskRealizations.filter(t => t.status === 'completed').length;
    return Math.round((completed / this.taskRealizations.length) * 100);
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    const defName = this._definitionRef?.info.name.toLowerCase() || '';
    return defName.includes(q) || this.id.toLowerCase().includes(q);
  }

  setDefinitionRef(definition: ProjectDefinitionNode): void {
    this._definitionRef = definition;
  }

  getTaskRealization(taskId: string): TaskRealizationModel | undefined {
    return this.taskRealizations.find(t => t.taskId === taskId);
  }

  updateTaskStatus(taskId: string, status: TaskRealizationModel['status']): void {
    const task = this.taskRealizations.find(t => t.taskId === taskId);
    if (task) {
      task.status = status;
    }
  }

  select(): void {
    this.selected = true;
  }

  deselect(): void {
    this.selected = false;
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
  }

  toModel(): ProjectRealizationModel {
    return {
      id: this.id,
      definitionId: this.definitionId,
      status: this.status,
      taskRealizations: this.taskRealizations.map(t => ({ ...t })),
      created: this.created,
      modified: this.modified,
    };
  }
}
