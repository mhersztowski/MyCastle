import {
  ProjectDefinitionModel,
  ProjectDefinitionComponentModel,
  ProjectInfoModel,
  PDCTaskModel,
  PDCSourceFileModel,
  PDCBinaryHexModel,
} from '../models/ProjectDefinitionModel';

export class ProjectDefinitionNode {
  id: string;
  info: ProjectInfoModel;
  description: string;
  components: ProjectDefinitionComponentModel[];
  created: string;
  modified: string;

  selected = false;
  expanded = false;
  loading = false;

  constructor(model: ProjectDefinitionModel) {
    this.id = model.id;
    this.info = model.info;
    this.description = model.description;
    this.components = model.components;
    this.created = model.created;
    this.modified = model.modified;
  }

  static fromModel(model: ProjectDefinitionModel): ProjectDefinitionNode {
    return new ProjectDefinitionNode(model);
  }

  get createdDate(): Date {
    return new Date(this.created);
  }

  get modifiedDate(): Date {
    return new Date(this.modified);
  }

  get tagList(): string[] {
    return this.info.tags;
  }

  get hardwareList(): string[] {
    return this.info.hardwareArchitecture;
  }

  matches(query: string): boolean {
    const q = query.toLowerCase();
    return (
      this.info.name.toLowerCase().includes(q) ||
      this.description.toLowerCase().includes(q)
    );
  }

  getTaskComponents(): Extract<ProjectDefinitionComponentModel, { type: 'tasks' }>[] {
    return this.components.filter(
      (c): c is Extract<ProjectDefinitionComponentModel, { type: 'tasks' }> => c.type === 'tasks'
    );
  }

  getSourceFileComponents(): Extract<ProjectDefinitionComponentModel, { type: 'source_files' }>[] {
    return this.components.filter(
      (c): c is Extract<ProjectDefinitionComponentModel, { type: 'source_files' }> => c.type === 'source_files'
    );
  }

  getBinaryHexComponents(): Extract<ProjectDefinitionComponentModel, { type: 'binary_hex' }>[] {
    return this.components.filter(
      (c): c is Extract<ProjectDefinitionComponentModel, { type: 'binary_hex' }> => c.type === 'binary_hex'
    );
  }

  getAllTasks(): PDCTaskModel[] {
    return this.getTaskComponents().flatMap(c => c.tasks);
  }

  getAllSourceFiles(): PDCSourceFileModel[] {
    return this.getSourceFileComponents().flatMap(c => c.sourceFiles);
  }

  getAllBinaryHex(): PDCBinaryHexModel[] {
    return this.getBinaryHexComponents().map(c => c.binaryHex);
  }

  select(): void {
    this.selected = true;
  }

  deselect(): void {
    this.selected = false;
  }

  expand(): void {
    this.expanded = true;
  }

  collapse(): void {
    this.expanded = false;
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
  }

  toModel(): ProjectDefinitionModel {
    return {
      id: this.id,
      info: this.info,
      description: this.description,
      components: this.components,
      created: this.created,
      modified: this.modified,
    };
  }
}
