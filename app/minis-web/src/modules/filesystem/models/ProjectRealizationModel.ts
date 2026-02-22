export interface TaskRealizationModel {
  taskId: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ProjectRealizationModel {
  id: string;
  definitionId: string;
  status: 'pending' | 'in_progress' | 'completed';
  taskRealizations: TaskRealizationModel[];
  created: string;
  modified: string;
}

export interface ProjectRealizationsModel {
  realizations: ProjectRealizationModel[];
}
