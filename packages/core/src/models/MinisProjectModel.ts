export interface MinisProjectModel {
  type: 'minis_project';
  id: string;
  name: string;
  githubProjectId: string;
  githubRepoUrl?: string;
  softwarePlatform: string;
  moduleId?: string;
  boardProfileKey?: string;
}

export interface MinisProjectsModel {
  type: 'minis_projects';
  projects: MinisProjectModel[];
}
