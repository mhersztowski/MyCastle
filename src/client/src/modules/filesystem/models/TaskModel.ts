export interface TaskModel {
    type: "task";
    name: string;
    description: string;
    duration: number;
    components: TaskComponentModel[];
}

export interface TaskComponentModel {
    type: string;
}

export interface TaskTestComponentModel extends TaskComponentModel {
    type: "task_test";
    name: string;
    description: string;
}
