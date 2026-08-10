import { TaskModel, TaskStatusDef } from "./TaskModel";

export interface ProjectModel {
    type: "project";
    id: string;
    name: string;
    description?: string;
    cost?: number;
    projects?: ProjectModel[];
    tasks?: TaskModel[];
    components?: ProjectComponentModel[];

    /*
     * Pola widoku planistycznego (PIM/Projects2) — opcjonalne z tego samego
     * powodu, co w TaskModel: starsze `projects.json` ma się wczytać bez
     * migracji.
     */

    /** Kolor kropki przy nazwie na liście projektów. Zapis CSS. */
    color?: string;
    /**
     * Własny zestaw statusów. Brak = zestaw domyślny (`DEFAULT_TASK_STATUSES`).
     * Statusy siedzą przy projekcie, a nie globalnie, bo kolumny tablicy są
     * własnością listy zadań — tak samo jak w ClickUpie.
     */
    statuses?: TaskStatusDef[];
    /** Projekt schowany z listy, ale nieusunięty (zadania zostają). */
    archived?: boolean;
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
