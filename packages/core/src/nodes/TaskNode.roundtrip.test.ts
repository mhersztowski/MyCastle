/**
 * Pola modelu muszą przeżyć obieg model → węzeł → model.
 *
 * `toModel()` wypisuje pola z listy, a nie rozsypuje całego obiektu — dopisanie
 * pola do `TaskModel` bez dopisania go tutaj kończy się tym, że wartość ustawia
 * się w interfejsie, zapisuje do pliku i **znika przy pierwszym przeładowaniu**.
 * Objaw wygląda jak „nie zapisuje się", a przyczyna leży dwie warstwy niżej.
 *
 * Test porównuje komplet kluczy, więc łapie każde następne pole, nie tylko to,
 * które akurat zabolało.
 */

import { describe, expect, it } from 'vitest';
import { TaskNode } from './TaskNode';
import type { TaskModel } from '../models/TaskModel';

const PELNY: TaskModel = {
    type: 'task',
    id: 'task-1',
    projectId: 'project-1',
    name: 'Zaprojektować zasilanie',
    description: 'Opis',
    duration: 2.5,
    cost: 100,
    status: 'in_progress',
    priority: 'high',
    startDate: '2026-08-01',
    dueDate: '2026-08-20',
    assignees: ['person-1'],
    tags: ['elektronika'],
    timeEntries: [{ id: 'e1', start: '2026-08-01T10:00:00.000Z', end: '2026-08-01T11:00:00.000Z' }],
    parentTaskId: 'task-0',
    order: 3,
    dependsOn: ['task-9'],
    docPath: 'notatki/zasilanie.md',
};

describe('TaskNode — obieg model → węzeł → model', () => {
    it('nie gubi żadnego pola', () => {
        const wynik = TaskNode.fromModel(PELNY).toModel();

        for (const [klucz, wartosc] of Object.entries(PELNY)) {
            expect(wynik[klucz as keyof TaskModel], `pole ${klucz}`).toEqual(wartosc);
        }
    });

    it('notatka przeżywa obieg', () => {
        // To pole zniknęło przy pierwszym podejściu — ustawiało się w panelu,
        // trafiało do pliku i przepadało przy wczytaniu.
        expect(TaskNode.fromModel(PELNY).toModel().docPath).toBe('notatki/zasilanie.md');
    });

    it('brak notatki zostaje brakiem, a nie pustym napisem', () => {
        const bez: TaskModel = { ...PELNY };
        delete bez.docPath;
        expect(TaskNode.fromModel(bez).toModel().docPath).toBeUndefined();
    });
});
