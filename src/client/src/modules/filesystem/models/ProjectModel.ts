import { TaskModel } from "./TaskModel";

export interface ProjectModel {
    type: "project";
    id: string;
    name: string;
    description?: string;
    cost?: number;
    projects?: ProjectModel[];
    tasks?: TaskModel[];
    components?: ProjectComponentModel[];
}

export interface ProjectsModel {
    type: "projects";
    projects: ProjectModel[];
}

export interface ProjectComponentModel {
    type: string;
}

export interface ProjectTestComponentModel extends ProjectComponentModel {
    type: "project_test";
    name: string;
    description: string;
}
