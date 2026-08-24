/**
 * Nazwa zadania ma być edytowalna wszędzie tam, gdzie zadanie widać — nie
 * tylko w liście. Tablica pokazywała nazwę zwykłym tekstem, a podzadania
 * w panelu też, więc jedyną drogą do poprawki literówki było otwarcie
 * zadania w panelu bocznym.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TaskModel, TaskStatusDef } from '@mhersztowski/core';
import { BoardView } from './BoardView';
import { SubtaskRow } from './SubtaskRow';

const statuses: TaskStatusDef[] = [
    { id: 'todo', name: 'Do zrobienia', color: '#888', kind: 'open' },
    { id: 'done', name: 'Zrobione', color: '#2a2', kind: 'done' },
];

function task(overrides: Partial<TaskModel> = {}): TaskModel {
    return { type: 'task', id: 'task-1', name: 'Stara nazwa', status: 'todo', ...overrides };
}

function renderBoard(onUpdate = vi.fn()) {
    render(
        <BoardView
            tasks={[task()]}
            statuses={statuses}
            people={[]}
            onUpdate={onUpdate}
            onMutate={vi.fn()}
            onAdd={vi.fn()}
            onRemove={vi.fn()}
            onOpen={vi.fn()}
        />
    );
    return onUpdate;
}

describe('BoardView — zmiana nazwy zadania', () => {
    it('dwuklik w nazwę karty otwiera pole edycji, a Enter zapisuje', () => {
        const onUpdate = renderBoard();

        fireEvent.doubleClick(screen.getByText('Stara nazwa'));
        const input = screen.getByDisplayValue('Stara nazwa');
        fireEvent.change(input, { target: { value: 'Nowa nazwa' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onUpdate).toHaveBeenCalledWith('task-1', { name: 'Nowa nazwa' });
    });

    it('Escape porzuca zmianę', () => {
        const onUpdate = renderBoard();

        fireEvent.doubleClick(screen.getByText('Stara nazwa'));
        const input = screen.getByDisplayValue('Stara nazwa');
        fireEvent.change(input, { target: { value: 'Nowa nazwa' } });
        fireEvent.keyDown(input, { key: 'Escape' });

        expect(onUpdate).not.toHaveBeenCalled();
        expect(screen.getByText('Stara nazwa')).toBeTruthy();
    });

    it('dwuklik w nazwę nie otwiera panelu zadania', () => {
        const onOpen = vi.fn();
        render(
            <BoardView
                tasks={[task()]}
                statuses={statuses}
                people={[]}
                onUpdate={vi.fn()}
                onMutate={vi.fn()}
                onAdd={vi.fn()}
                onRemove={vi.fn()}
                onOpen={onOpen}
            />
        );

        fireEvent.doubleClick(screen.getByText('Stara nazwa'));

        expect(onOpen).not.toHaveBeenCalled();
    });

    it('karta nie jest przeciągalna w trakcie edycji nazwy — inaczej nie da się zaznaczyć tekstu', () => {
        renderBoard();
        const card = screen.getByText('Stara nazwa').closest('[draggable]') as HTMLElement;
        expect(card.getAttribute('draggable')).toBe('true');

        fireEvent.doubleClick(screen.getByText('Stara nazwa'));

        const editing = screen.getByDisplayValue('Stara nazwa').closest('[draggable]') as HTMLElement;
        expect(editing.getAttribute('draggable')).toBe('false');
    });
});

describe('SubtaskRow — zmiana nazwy podzadania', () => {
    const child = task({ id: 'task-2', name: 'Podzadanie', parentTaskId: 'task-1' });

    function renderRow() {
        const onUpdate = vi.fn();
        const onOpen = vi.fn();
        render(
            <SubtaskRow
                subtask={child}
                statuses={statuses}
                people={[]}
                onUpdate={onUpdate}
                onOpen={onOpen}
            />
        );
        return { onUpdate, onOpen };
    }

    it('dwuklik w nazwę podzadania pozwala ją poprawić', () => {
        const { onUpdate } = renderRow();

        fireEvent.doubleClick(screen.getByText('Podzadanie'));
        const input = screen.getByDisplayValue('Podzadanie');
        fireEvent.change(input, { target: { value: 'Inna nazwa' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(onUpdate).toHaveBeenCalledWith('task-2', { name: 'Inna nazwa' });
    });

    it('podzadanie otwiera osobna ikona, a nie kliknięcie w nazwę', () => {
        const { onOpen } = renderRow();

        fireEvent.click(screen.getByText('Podzadanie'));
        expect(onOpen).not.toHaveBeenCalled();

        fireEvent.click(screen.getByLabelText('Otwórz podzadanie'));
        expect(onOpen).toHaveBeenCalledWith('task-2');
    });
});
