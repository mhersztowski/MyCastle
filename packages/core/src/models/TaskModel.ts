/**
 * Priorytet w kolejności ważności. Nazwy jak w ClickUpie, bo tam kolor i ikona
 * flagi są przypisane właśnie do tych czterech poziomów — własna skala
 * wymagałaby tłumaczenia w obie strony przy każdym imporcie.
 */
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

/**
 * Jeden odcinek pracy nad zadaniem. Brak `end` znaczy, że licznik biegnie —
 * dlatego czas nie jest trzymany jako suma minut: suma nie umie powiedzieć,
 * czy ktoś właśnie pracuje, a po odświeżeniu strony trwający pomiar przepadłby.
 */
export interface TaskTimeEntry {
    id: string;
    /** ISO 8601. */
    start: string;
    /** ISO 8601; brak = wpis otwarty. */
    end?: string;
    /** Id osoby z PIM/Persons. */
    who?: string;
    note?: string;
}

/**
 * Definicja statusu. Statusy są danymi, a nie wyliczeniem w kodzie, bo w
 * ClickUpie definiuje się je per lista — a i bez tego „Do zrobienia" znaczy co
 * inego w projekcie remontowym niż w programistycznym.
 *
 * `kind` niesie znaczenie, którego nazwa nie niesie: po nim widok wie, co
 * uznać za zamknięte (przekreślenie, wyłączenie z licznika otwartych zadań),
 * niezależnie od tego, jak status nazwał użytkownik.
 */
export interface TaskStatusDef {
    id: string;
    name: string;
    /** Kolor w zapisie CSS — trafia wprost do kropki i tła kolumny. */
    color: string;
    kind: 'open' | 'active' | 'done';
}

/**
 * Zestaw domyślny, używany, gdy projekt nie definiuje własnego. Trzy poziomy
 * wystarczają na start i pokrywają się z domyślnym „Space" w ClickUpie.
 */
export const DEFAULT_TASK_STATUSES: TaskStatusDef[] = [
    { id: 'todo',        name: 'Do zrobienia', color: '#87909e', kind: 'open'   },
    { id: 'in_progress', name: 'W trakcie',    color: '#4194f6', kind: 'active' },
    { id: 'done',        name: 'Gotowe',       color: '#6bc950', kind: 'done'   },
];

export interface TaskModel {
    type: "task";
    id: string;
    projectId?: string;
    name: string;
    description?: string;
    /**
     * Szacowany czas w **godzinach**, ułamkowo (0.25 = kwadrans).
     *
     * To pole jest szacunkiem także w widoku planistycznym — osobne
     * `estimateMinutes` byłoby drugim polem na to samo pojęcie, a stara strona
     * PIM/Projects edytuje `duration` od zawsze (przez `parseFloat`). Czas
     * faktycznie przepracowany idzie osobno, w `timeEntries`.
     */
    duration?: number;
    cost?: number;
    components?: TaskComponentModel[];

    /*
     * Poniższe pola dokłada widok planistyczny (PIM/Projects2). Wszystkie są
     * opcjonalne, bo pliki `tasks.json` sprzed ich wprowadzenia mają się
     * wczytywać bez migracji, a zadanie bez statusu i dat jest nadal
     * poprawnym zadaniem.
     */

    /** Id statusu z `TaskStatusDef`, nie jego nazwa — nazwę wolno zmienić. */
    status?: string;
    priority?: TaskPriority;
    /** ISO: data albo data z czasem. */
    startDate?: string;
    dueDate?: string;
    /** Id osób z PIM/Persons. */
    assignees?: string[];
    tags?: string[];
    timeEntries?: TaskTimeEntry[];
    /** Podzadania: dziecko wskazuje rodzica, więc drzewo nie ma dwóch źródeł. */
    parentTaskId?: string;
    /** Kolejność ręczna w obrębie grupy; brak = na końcu. */
    order?: number;
    /**
     * Zadania, które muszą się skończyć przed tym — czyli poprzedniki.
     *
     * Trzymana jest **wyłącznie** ta strona relacji. „Zadania po tym" to jej
     * odwrotność, liczona z ogółu zadań: dwie listy w pliku rozjeżdżają się
     * przy pierwszym usunięciu zadania i nie ma wtedy jak rozstrzygnąć, która
     * z nich kłamie.
     */
    dependsOn?: string[];
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
