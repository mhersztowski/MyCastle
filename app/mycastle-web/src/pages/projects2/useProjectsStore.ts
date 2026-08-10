/**
 * Warstwa danych widoku PIM/Projects2.
 *
 * Czyta i zapisuje **te same pliki, co PIM/Projects** (`data/projects.json`
 * + `data/tasks.json`) i w tym samym układzie: projekty bez zadań w środku,
 * zadania osobno ze wskazaniem `projectId`. Dzięki temu obie strony pokazują
 * ten sam stan, a nie dwie kopie, które trzeba synchronizować.
 *
 * Zapis jest odroczony (`SAVE_DELAY`), bo ten widok edytuje się polami — przy
 * zapisie po każdym naciśnięciu klawisza pisanie nazwy zadania oznaczałoby
 * kilkanaście zapisów całego pliku.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFilesystem } from '../../modules/filesystem';
import type { ProjectModel, ProjectsModel, TaskModel, TasksModel } from '@mhersztowski/core';
import { TaskNode } from '@mhersztowski/core';

const PROJECTS_PATH = 'data/projects.json';
const TASKS_PATH = 'data/tasks.json';
const SAVE_DELAY = 900;

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** Zadania trzymamy płasko — hierarchię (podzadania) daje `parentTaskId`. */
function collectTasks(projects: ProjectModel[], into: Map<string, TaskModel>): void {
    for (const project of projects) {
        for (const task of project.tasks ?? []) {
            into.set(task.id, { ...task, projectId: task.projectId ?? project.id });
        }
        if (project.projects) collectTasks(project.projects, into);
    }
}

function stripTasks(projects: ProjectModel[]): ProjectModel[] {
    return projects.map(({ tasks: _tasks, ...rest }) => ({
        ...rest,
        projects: rest.projects ? stripTasks(rest.projects) : undefined,
    }));
}

/** Spłaszczona lista projektów z poziomem zagnieżdżenia — na potrzeby paska bocznego. */
export interface ProjectRow {
    project: ProjectModel;
    depth: number;
}

export function flattenProjects(projects: ProjectModel[], depth = 0): ProjectRow[] {
    return projects.flatMap(project => [
        { project, depth },
        ...(project.projects ? flattenProjects(project.projects, depth + 1) : []),
    ]);
}

function mapProjects(projects: ProjectModel[], fn: (p: ProjectModel) => ProjectModel): ProjectModel[] {
    return projects.map(project => {
        const mapped = fn(project);
        return mapped.projects ? { ...mapped, projects: mapProjects(mapped.projects, fn) } : mapped;
    });
}

export function useProjectsStore() {
    const { dataSource, isDataLoaded, writeFile } = useFilesystem();

    const [projects, setProjects] = useState<ProjectModel[]>([]);
    const [tasks, setTasks] = useState<TaskModel[]>([]);
    const [saveState, setSaveState] = useState<SaveState>('idle');

    // Zapis czyta najświeższy stan, a nie ten z chwili zaplanowania timera.
    const latest = useRef({ projects, tasks });
    latest.current = { projects, tasks };
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** Przeładowanie z dataSource po własnym zapisie skasowałoby świeże zmiany. */
    const savingOwnChanges = useRef(false);

    // Przeładowanie z `DataSource` nie może wejść na niezapisane zmiany —
    // `loadAllData()` wywołuje też ktoś inny (np. po wznowieniu połączenia
    // MQTT), a wtedy zdążony patch trafia do pliku, ale widok wróciłby do
    // stanu sprzed edycji.
    const pending = useRef(false);
    pending.current = saveState === 'dirty' || saveState === 'saving';

    useEffect(() => {
        if (!isDataLoaded || savingOwnChanges.current || pending.current) return;
        const hierarchy = dataSource.projects.map(p => p.toModel());
        const collected = new Map<string, TaskModel>();
        collectTasks(hierarchy, collected);
        // Zadania z `tasks.json` mają pierwszeństwo nad kopią wpisaną kiedyś
        // w środek projektu — to one są dziś edytowane przez obie strony.
        for (const task of dataSource.tasks) collected.set(task.id, task.toModel());

        setProjects(stripTasks(hierarchy));
        setTasks([...collected.values()]);
        setSaveState('idle');
    }, [isDataLoaded, dataSource]);

    /**
     * Po zapisie **nie** wołamy `loadAllData()`.
     *
     * Byłoby zbędne: `writeFile` sam przebudowuje odpowiedni kawałek
     * `DataSource` (`data/tasks.json` i `data/projects.json` są w jego
     * `DATA_FILE_MAP`), więc reszta aplikacji widzi zmianę natychmiast.
     *
     * I było szkodliwe: `loadAllData()` zaczyna od `setIsDataLoaded(false)`,
     * a strona pod tą flagą pokazuje spinner — więc każda zmiana pola w panelu
     * bocznym gasiła na chwilę cały widok razem z otwartym panelem. Wyglądało
     * to jak przeładowanie strony, bo w praktyce nim było.
     */
    const save = useCallback(async () => {
        setSaveState('saving');
        savingOwnChanges.current = true;
        try {
            const snapshot = latest.current;
            const projectsData: ProjectsModel = { type: 'projects', projects: snapshot.projects };
            await writeFile(PROJECTS_PATH, JSON.stringify(projectsData, null, 2));
            const tasksData: TasksModel = { type: 'tasks', tasks: snapshot.tasks };
            await writeFile(TASKS_PATH, JSON.stringify(tasksData, null, 2));
            setSaveState('saved');
        } catch (error) {
            console.error('Projects2: zapis nie powiódł się', error);
            setSaveState('error');
        } finally {
            savingOwnChanges.current = false;
        }
    }, [writeFile]);

    const scheduleSave = useCallback(() => {
        setSaveState('dirty');
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void save(); }, SAVE_DELAY);
    }, [save]);

    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    // --- mutacje zadań ------------------------------------------------------

    const updateTask = useCallback((id: string, patch: Partial<TaskModel>) => {
        setTasks(current => current.map(task => (task.id === id ? { ...task, ...patch } : task)));
        scheduleSave();
    }, [scheduleSave]);

    /** Mutacja wyrażona operacją na węźle — dla logiki, która żyje w `TaskNode`. */
    const mutateTask = useCallback((id: string, mutate: (node: TaskNode) => void) => {
        setTasks(current => current.map(task => {
            if (task.id !== id) return task;
            const node = TaskNode.fromModel(task);
            mutate(node);
            return node.toModel();
        }));
        scheduleSave();
    }, [scheduleSave]);

    const addTask = useCallback((task: Partial<TaskModel> & { name: string }): TaskModel => {
        const created: TaskModel = {
            type: 'task',
            id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ...task,
        };
        setTasks(current => [...current, created]);
        scheduleSave();
        return created;
    }, [scheduleSave]);

    /**
     * Usuwa zadanie razem z podzadaniami i sprząta zależności — osierocony
     * poprzednik nie daje się już usunąć z panelu, bo panel pokazuje tylko
     * zadania, które istnieją.
     */
    const removeTask = useCallback((id: string) => {
        setTasks(current => {
            const doomed = new Set<string>([id]);
            let grew = true;
            while (grew) {
                grew = false;
                for (const task of current) {
                    if (task.parentTaskId && doomed.has(task.parentTaskId) && !doomed.has(task.id)) {
                        doomed.add(task.id);
                        grew = true;
                    }
                }
            }
            return current
                .filter(task => !doomed.has(task.id))
                .map(task => (task.dependsOn?.some(dep => doomed.has(dep))
                    ? { ...task, dependsOn: keepOrDrop(task.dependsOn.filter(dep => !doomed.has(dep))) }
                    : task));
        });
        scheduleSave();
    }, [scheduleSave]);

    // --- mutacje projektów --------------------------------------------------

    const updateProject = useCallback((id: string, patch: Partial<ProjectModel>) => {
        setProjects(current => mapProjects(current, p => (p.id === id ? { ...p, ...patch } : p)));
        scheduleSave();
    }, [scheduleSave]);

    const addProject = useCallback((name: string, parentId?: string): ProjectModel => {
        const created: ProjectModel = {
            type: 'project',
            id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
        };
        setProjects(current => (parentId
            ? mapProjects(current, p => (p.id === parentId
                ? { ...p, projects: [...(p.projects ?? []), created] }
                : p))
            : [...current, created]));
        scheduleSave();
        return created;
    }, [scheduleSave]);

    const removeProject = useCallback((id: string) => {
        const drop = (list: ProjectModel[]): ProjectModel[] => list
            .filter(p => p.id !== id)
            .map(p => (p.projects ? { ...p, projects: drop(p.projects) } : p));
        setProjects(current => drop(current));
        // Zadania zostają bez projektu, a nie znikają: projekt bywa usuwany
        // przez pomyłkę, a praca zapisana w zadaniach nie ma z tym związku.
        setTasks(current => current.map(t => (t.projectId === id ? { ...t, projectId: undefined } : t)));
        scheduleSave();
    }, [scheduleSave]);

    const persons = useMemo(
        () => (isDataLoaded ? dataSource.persons.map(p => ({
            id: p.id,
            name: p.getDisplayName(),
            initials: p.getInitials(),
        })) : []),
        [isDataLoaded, dataSource]
    );

    /** Wszystkie tagi użyte w zadaniach — podpowiedzi przy dodawaniu nowego. */
    const knownTags = useMemo(
        () => [...new Set(tasks.flatMap(t => t.tags ?? []))].sort(),
        [tasks]
    );

    return {
        isDataLoaded,
        projects, tasks, persons, knownTags, saveState,
        updateTask, mutateTask, addTask, removeTask,
        updateProject, addProject, removeProject,
        saveNow: save,
    };
}

function keepOrDrop(list: string[]): string[] | undefined {
    return list.length > 0 ? list : undefined;
}
