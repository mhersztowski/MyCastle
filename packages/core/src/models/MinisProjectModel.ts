export interface MinisProjectModel {
  type: 'minis_project';
  id: string;
  name: string;
  projectDefId: string;
}

export interface MinisProjectsModel {
  type: 'minis_projects';
  projects: MinisProjectModel[];
}
