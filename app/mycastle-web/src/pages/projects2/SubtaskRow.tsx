/**
 * Wiersz podzadania w panelu zadania.
 *
 * Osobny plik, bo `TaskPanel` ciągnie edytor komponentów i podgląd notatki
 * (a przez nie Monaco), a sam wiersz jest zwykłym kawałkiem interfejsu.
 *
 * Nazwę zmienia się dwuklikiem — tak samo jak w liście i na tablicy — a
 * podzadanie otwiera osobna ikona. Kliknięcie w nazwę nie może otwierać,
 * bo pierwsze z dwóch kliknięć podmieniłoby zawartość panelu, zanim doszłoby
 * drugie: pole edycji nigdy by się nie pokazało.
 */

import React from 'react';
import { IconButton, Stack, Tooltip } from '@mui/material';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import type { TaskModel, TaskStatusDef } from '@mhersztowski/core';
import { cu } from './clickup';
import { Assignees, InlineName, PersonOption, StatusPill } from './fields';

export const SubtaskRow: React.FC<{
    subtask: TaskModel;
    statuses: TaskStatusDef[];
    people: PersonOption[];
    onUpdate: (id: string, patch: Partial<TaskModel>) => void;
    onOpen: (id: string) => void;
}> = ({ subtask, statuses, people, onUpdate, onOpen }) => (
    <Stack direction="row" sx={{
        alignItems: 'center', gap: 1, py: 0.5,
        borderBottom: `1px solid ${cu.border}`,
    }}>
        <StatusPill
            statuses={statuses}
            value={subtask.status}
            onChange={status => onUpdate(subtask.id, { status })}
            compact
        />
        <InlineName
            value={subtask.name}
            onChange={name => onUpdate(subtask.id, { name })}
            strike={statuses.find(s => s.id === subtask.status)?.kind === 'done'}
        />
        <Tooltip title="Otwórz podzadanie">
            <IconButton size="small" aria-label="Otwórz podzadanie" onClick={() => onOpen(subtask.id)}>
                <OpenInFullIcon sx={{ fontSize: 13, color: cu.textMuted }} />
            </IconButton>
        </Tooltip>
        <Assignees
            people={people}
            value={subtask.assignees}
            onChange={assignees => onUpdate(subtask.id, { assignees })}
        />
    </Stack>
);
