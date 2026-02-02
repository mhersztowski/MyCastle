import { TaskModel } from "./TaskModel";

export interface ProjectModel {
    type: "project";
    name: string;
    description: string;
    tasks: TaskModel[];
    components: ProjectComponentModel[];
}

export interface ProjectComponentModel {
    type: string;
}

export interface ProjectTestComponentModel extends ProjectComponentModel {
    type: "project_test";
    name: string;
    description: string;
}
