export interface TaskModel {
    type: "task";
    id: string;
    projectId?: string;
    name: string;
    description?: string;
    duration?: number;
    cost?: number;
    components?: TaskComponentModel[];
}

export interface TasksModel {
    type: "tasks";
    tasks: TaskModel[];
}

export interface TaskComponentModel {
    type: string;
}

export interface TaskTestComponentModel extends TaskComponentModel {
    type: "task_test";
    name: string;
    description: string;
}

export interface TaskIntervalComponentModel extends TaskComponentModel {
    type: "task_interval";
    daysInterval: number;
}

export interface TaskSequenceComponentModel extends TaskComponentModel {
    type: "task_sequence";
    tasks?: TaskModel[];
}