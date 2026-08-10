/**
 * Widok tablicy — kolumna na status, karta na zadanie, przeciąganie zmienia
 * status.
 *
 * Przeciąganie na natywnym HTML5 drag&drop, bez biblioteki: karta ma jeden
 * uchwyt (całą siebie) i jeden cel (kolumnę), więc rzeczy, za które płaci się
 * przy dnd-kit — sortowanie w obrębie listy, obsługa dotyku, wirtualizacja —
 * nie są tu do niczego potrzebne.
 *
 * Podzadania nie dostają własnych kart. Na tablicy liczy się to, co ktoś ma
 * zrobić, a podzadanie bez rodzica jest nieczytelne — pokazujemy je licznikiem
 * na karcie rodzica.
 */

import React, { useMemo, useState } from 'react';
import { Box, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChecklistIcon from '@mui/icons-material/Checklist';
import LinkIcon from '@mui/icons-material/Link';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { TaskModel, TaskStatusDef } from '@mhersztowski/core';
import { TaskNode } from '@mhersztowski/core';
import { cu, formatDate, formatMinutes, isOverdue, priorityDef } from './clickup';
import { Assignees, PersonOption, useTicker } from './fields';
import type { TaskViewActions } from './ListView';

interface BoardViewProps extends TaskViewActions {
    tasks: TaskModel[];
    statuses: TaskStatusDef[];
    people: PersonOption[];
    projectId?: string;
}

export const BoardView: React.FC<BoardViewProps> = ({
    tasks, statuses, people, projectId, onUpdate, onMutate, onAdd, onRemove, onOpen,
}) => {
    const [dragOver, setDragOver] = useState<string | null>(null);

    const subtaskCounts = useMemo(() => {
        const counts = new Map<string, { done: number; total: number }>();
        const doneIds = new Set(statuses.filter(s => s.kind === 'done').map(s => s.id));
        for (const task of tasks) {
            if (!task.parentTaskId) continue;
            const entry = counts.get(task.parentTaskId) ?? { done: 0, total: 0 };
            entry.total += 1;
            if (doneIds.has(task.status ?? '')) entry.done += 1;
            counts.set(task.parentTaskId, entry);
        }
        return counts;
    }, [tasks, statuses]);

    const roots = tasks.filter(task => !task.parentTaskId);

    return (
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            <Stack direction="row" sx={{ gap: 2, alignItems: 'flex-start', minHeight: '100%' }}>
                {statuses.map(status => {
                    const inStatus = roots.filter(t => (t.status ?? statuses[0].id) === status.id);
                    return (
                        <Box
                            key={status.id}
                            onDragOver={e => { e.preventDefault(); setDragOver(status.id); }}
                            onDragLeave={() => setDragOver(current => (current === status.id ? null : current))}
                            onDrop={e => {
                                e.preventDefault();
                                const id = e.dataTransfer.getData('text/plain');
                                if (id) onUpdate(id, { status: status.id });
                                setDragOver(null);
                            }}
                            sx={{
                                width: 300, flexShrink: 0, borderRadius: 2, p: 1,
                                bgcolor: dragOver === status.id ? cu.brandSoft : cu.bgSubtle,
                                border: `1px solid ${dragOver === status.id ? cu.brand : 'transparent'}`,
                                transition: 'background-color .15s, border-color .15s',
                            }}
                        >
                            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 0.5, py: 1 }}>
                                <Box sx={{
                                    px: 1, py: 0.25, borderRadius: 0.75, bgcolor: status.color,
                                    color: '#fff', fontSize: 11, fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: 0.3,
                                }}>
                                    {status.name}
                                </Box>
                                <Typography sx={{ fontSize: 12, color: cu.textMuted }}>
                                    {inStatus.length}
                                </Typography>
                            </Stack>

                            <Stack sx={{ gap: 1 }}>
                                {inStatus.map(task => (
                                    <BoardCard
                                        key={task.id}
                                        task={task}
                                        people={people}
                                        subtasks={subtaskCounts.get(task.id)}
                                        onOpen={() => onOpen(task.id)}
                                        onRemove={() => onRemove(task.id)}
                                        onAssignees={assignees => onUpdate(task.id, { assignees })}
                                        onToggleTracking={() => onMutate(task.id, n => (n.isTracking()
                                            ? n.stopTracking()
                                            : n.startTracking({ id: `entry-${Date.now()}` })))}
                                    />
                                ))}
                                <NewCard onAdd={name => onAdd({ name, status: status.id, projectId })} />
                            </Stack>
                        </Box>
                    );
                })}
            </Stack>
        </Box>
    );
};

const BoardCard: React.FC<{
    task: TaskModel;
    people: PersonOption[];
    subtasks?: { done: number; total: number };
    onOpen: () => void;
    onRemove: () => void;
    onAssignees: (ids: string[]) => void;
    onToggleTracking: () => void;
}> = ({ task, people, subtasks, onOpen, onRemove, onAssignees, onToggleTracking }) => {
    const node = useMemo(() => TaskNode.fromModel(task), [task]);
    useTicker(node.isTracking());
    const priority = priorityDef(task.priority);
    const tracked = node.trackedMinutes();

    return (
        <Box
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', task.id)}
            onClick={onOpen}
            sx={{
                bgcolor: cu.bg, borderRadius: 1.5, p: 1.25, cursor: 'pointer',
                border: `1px solid ${cu.border}`,
                boxShadow: '0 1px 2px rgba(0,0,0,.04)',
                '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,.10)' },
                '&:hover .card-actions': { opacity: 1 },
            }}
        >
            <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 0.5 }}>
                {priority && (
                    <Box sx={{
                        width: 3, alignSelf: 'stretch', borderRadius: 2,
                        bgcolor: priority.color, flexShrink: 0,
                    }} />
                )}
                <Typography sx={{ fontSize: 13, flex: 1, color: cu.text, lineHeight: 1.4 }}>
                    {task.name}
                </Typography>
                <Tooltip title="Usuń">
                    <IconButton
                        size="small"
                        className="card-actions"
                        onClick={e => { e.stopPropagation(); onRemove(); }}
                        sx={{ opacity: 0, transition: 'opacity .15s', p: 0.25 }}
                    >
                        <DeleteOutlineIcon sx={{ fontSize: 14, color: cu.textMuted }} />
                    </IconButton>
                </Tooltip>
            </Stack>

            {task.tags && task.tags.length > 0 && (
                <Stack direction="row" sx={{ gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
                    {task.tags.map(tag => (
                        <Chip key={tag} label={tag} size="small" sx={{
                            height: 18, fontSize: 10, bgcolor: cu.brandSoft, color: cu.brand,
                        }} />
                    ))}
                </Stack>
            )}

            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Assignees people={people} value={task.assignees} onChange={onAssignees} />

                {task.dueDate && (
                    <Typography sx={{
                        fontSize: 11,
                        color: isOverdue(task.dueDate) ? cu.danger : cu.textMuted,
                    }}>
                        {formatDate(task.dueDate)}
                    </Typography>
                )}

                {subtasks && (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.25 }}>
                        <ChecklistIcon sx={{ fontSize: 13, color: cu.textMuted }} />
                        <Typography sx={{ fontSize: 11, color: cu.textMuted }}>
                            {subtasks.done}/{subtasks.total}
                        </Typography>
                    </Stack>
                )}

                {task.dependsOn && task.dependsOn.length > 0 && (
                    <Tooltip title={`Zależy od ${task.dependsOn.length} zadania/zadań`}>
                        <LinkIcon sx={{ fontSize: 13, color: '#f5a623' }} />
                    </Tooltip>
                )}

                <Box sx={{ flex: 1 }} />

                <Typography
                    onClick={e => { e.stopPropagation(); onToggleTracking(); }}
                    sx={{
                        fontSize: 11, cursor: 'pointer',
                        color: node.isTracking() ? cu.danger : cu.textMuted,
                        fontWeight: node.isTracking() ? 600 : 400,
                    }}
                >
                    {node.isTracking() ? `■ ${formatMinutes(tracked) || '0m'}` : (formatMinutes(tracked) || '▶')}
                </Typography>
            </Stack>
        </Box>
    );
};

const NewCard: React.FC<{ onAdd: (name: string) => void }> = ({ onAdd }) => {
    const [value, setValue] = useState('');
    const [active, setActive] = useState(false);

    if (!active) {
        return (
            <Stack
                direction="row"
                onClick={() => setActive(true)}
                sx={{
                    alignItems: 'center', gap: 0.5, px: 1, py: 0.75, cursor: 'pointer',
                    color: cu.textMuted, '&:hover': { color: cu.brand },
                }}
            >
                <AddIcon sx={{ fontSize: 15 }} />
                <Typography sx={{ fontSize: 12 }}>Nowe zadanie</Typography>
            </Stack>
        );
    }

    return (
        <Box sx={{ bgcolor: cu.bg, borderRadius: 1.5, p: 1, border: `1px solid ${cu.brand}` }}>
            <TextField
                autoFocus
                fullWidth
                size="small"
                variant="standard"
                multiline
                placeholder="Nazwa zadania"
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={() => {
                    if (value.trim()) onAdd(value.trim());
                    setValue('');
                    setActive(false);
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (value.trim()) onAdd(value.trim());
                        setValue('');
                    }
                    if (e.key === 'Escape') { setValue(''); setActive(false); }
                }}
                sx={{ '& textarea': { fontSize: 13 } }}
            />
        </Box>
    );
};
