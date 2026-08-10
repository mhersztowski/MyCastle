/**
 * Widok listy — układ, który w ClickUpie jest domyślny: zadania zebrane
 * w grupy po statusie, każda grupa zwijana, wiersz gęsty, wszystkie pola
 * edytowalne w miejscu.
 *
 * Podzadania są wcięte pod rodzicem, a nie w osobnej grupie, choć mają własny
 * status: gdyby szły do grupy swojego statusu, rozjechałyby się z rodzicem
 * i nie dałoby się przeczytać, do czego należą.
 */

import React, { useMemo, useState } from 'react';
import { Box, Collapse, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import LinkIcon from '@mui/icons-material/Link';
import ExtensionIcon from '@mui/icons-material/Extension';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import type { TaskModel, TaskStatusDef } from '@mhersztowski/core';
import { TaskNode } from '@mhersztowski/core';
import { cu, hoursToMinutes } from './clickup';
import {
    Assignees, DateField, InlineName, PersonOption, PriorityFlag, StatusPill, TagList, TimeCell, useTicker,
} from './fields';

export interface TaskViewActions {
    onUpdate: (id: string, patch: Partial<TaskModel>) => void;
    onMutate: (id: string, mutate: (node: TaskNode) => void) => void;
    onAdd: (task: Partial<TaskModel> & { name: string }) => void;
    onRemove: (id: string) => void;
    onOpen: (id: string) => void;
}

interface ListViewProps extends TaskViewActions {
    tasks: TaskModel[];
    statuses: TaskStatusDef[];
    people: PersonOption[];
    knownTags: string[];
    projectId?: string;
}

/** Szerokości kolumn — jedna definicja dla nagłówka i wierszy. */
const COLUMNS = '1fr 132px 108px 96px 40px 150px 132px 32px';

export const ListView: React.FC<ListViewProps> = ({
    tasks, statuses, people, knownTags, projectId, ...actions
}) => {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

    const byParent = useMemo(() => {
        const map = new Map<string, TaskModel[]>();
        for (const task of tasks) {
            if (!task.parentTaskId) continue;
            const siblings = map.get(task.parentTaskId) ?? [];
            siblings.push(task);
            map.set(task.parentTaskId, siblings);
        }
        return map;
    }, [tasks]);

    const ids = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);

    /** Zadanie jest „główne", gdy nie ma rodzica albo rodzic jest poza tym projektem. */
    const roots = useMemo(
        () => tasks.filter(t => !t.parentTaskId || !ids.has(t.parentTaskId)),
        [tasks, ids]
    );

    return (
        <Box sx={{ flex: 1, overflow: 'auto' }}>
            <Box sx={{
                display: 'grid', gridTemplateColumns: COLUMNS, gap: 1, alignItems: 'center',
                px: 2, py: 1, position: 'sticky', top: 0, zIndex: 2,
                bgcolor: cu.bg, borderBottom: `1px solid ${cu.border}`,
            }}>
                {['Nazwa', 'Wykonawcy', 'Termin', 'Priorytet', '', 'Tagi', 'Czas', ''].map((label, index) => (
                    <Typography key={index} sx={{
                        fontSize: 11, fontWeight: 600, color: cu.textMuted,
                        textTransform: 'uppercase', letterSpacing: 0.4,
                    }}>
                        {label}
                    </Typography>
                ))}
            </Box>

            {statuses.map(status => {
                const inStatus = roots.filter(
                    task => (task.status ?? statuses[0].id) === status.id
                );
                const isCollapsed = collapsed[status.id];

                return (
                    <Box key={status.id} sx={{ mb: 1 }}>
                        <Stack
                            direction="row"
                            onClick={() => setCollapsed(c => ({ ...c, [status.id]: !c[status.id] }))}
                            sx={{
                                alignItems: 'center', gap: 0.5, px: 1.5, py: 0.75, cursor: 'pointer',
                                position: 'sticky', top: 33, zIndex: 1, bgcolor: cu.bg,
                            }}
                        >
                            {isCollapsed
                                ? <KeyboardArrowRightIcon sx={{ fontSize: 18, color: cu.textMuted }} />
                                : <KeyboardArrowDownIcon sx={{ fontSize: 18, color: cu.textMuted }} />}
                            <Box sx={{
                                px: 1, py: 0.25, borderRadius: 0.75, bgcolor: status.color,
                                color: '#fff', fontSize: 11, fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: 0.3,
                            }}>
                                {status.name}
                            </Box>
                            <Typography sx={{ fontSize: 12, color: cu.textMuted, ml: 0.5 }}>
                                {inStatus.length}
                            </Typography>
                        </Stack>

                        <Collapse in={!isCollapsed}>
                            {inStatus.map(task => (
                                <TaskRows
                                    key={task.id}
                                    task={task}
                                    depth={0}
                                    byParent={byParent}
                                    expanded={expandedTasks}
                                    onToggleExpand={id => setExpandedTasks(e => ({ ...e, [id]: !e[id] }))}
                                    statuses={statuses}
                                    people={people}
                                    knownTags={knownTags}
                                    allTasks={tasks}
                                    {...actions}
                                />
                            ))}
                            <NewTaskRow
                                onAdd={name => actions.onAdd({ name, status: status.id, projectId })}
                            />
                        </Collapse>
                    </Box>
                );
            })}
        </Box>
    );
};

interface TaskRowsProps extends TaskViewActions {
    task: TaskModel;
    depth: number;
    byParent: Map<string, TaskModel[]>;
    expanded: Record<string, boolean>;
    onToggleExpand: (id: string) => void;
    statuses: TaskStatusDef[];
    people: PersonOption[];
    knownTags: string[];
    allTasks: TaskModel[];
}

const TaskRows: React.FC<TaskRowsProps> = props => {
    const { task, depth, byParent, expanded, onToggleExpand, statuses, people, knownTags, allTasks } = props;
    const { onUpdate, onMutate, onAdd, onRemove, onOpen } = props;

    const children = byParent.get(task.id) ?? [];
    const isOpen = expanded[task.id] ?? true;

    const node = useMemo(() => TaskNode.fromModel(task), [task]);
    useTicker(node.isTracking());

    const done = statuses.find(s => s.id === (task.status ?? statuses[0].id))?.kind === 'done';
    const blockedBy = (task.dependsOn ?? []).filter(id => {
        const dep = allTasks.find(t => t.id === id);
        if (!dep) return false;
        return statuses.find(s => s.id === (dep.status ?? statuses[0].id))?.kind !== 'done';
    });

    return (
        <>
            <Box
                onClick={() => onOpen(task.id)}
                sx={{
                    display: 'grid', gridTemplateColumns: COLUMNS, gap: 1, alignItems: 'center',
                    px: 2, py: 0.75, cursor: 'pointer',
                    borderBottom: `1px solid ${cu.border}`,
                    '&:hover': { bgcolor: cu.hover },
                    '&:hover .row-actions': { opacity: 1 },
                }}
            >
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, minWidth: 0, pl: depth * 2.5 }}>
                    {children.length > 0 ? (
                        <IconButton
                            size="small"
                            onClick={e => { e.stopPropagation(); onToggleExpand(task.id); }}
                            sx={{ p: 0.25 }}
                        >
                            {isOpen
                                ? <KeyboardArrowDownIcon sx={{ fontSize: 15, color: cu.textMuted }} />
                                : <KeyboardArrowRightIcon sx={{ fontSize: 15, color: cu.textMuted }} />}
                        </IconButton>
                    ) : (
                        <Box sx={{ width: depth > 0 ? 0 : 22 }}>
                            {depth > 0 && (
                                <SubdirectoryArrowRightIcon sx={{ fontSize: 13, color: cu.borderStrong }} />
                            )}
                        </Box>
                    )}

                    <StatusPill
                        statuses={statuses}
                        value={task.status}
                        onChange={id => onUpdate(task.id, { status: id })}
                        compact
                    />

                    <InlineName
                        value={task.name}
                        strike={done}
                        onChange={name => onUpdate(task.id, { name })}
                    />

                    {blockedBy.length > 0 && (
                        <Tooltip title={`Czeka na ${blockedBy.length} zadanie/a`}>
                            <LinkIcon sx={{ fontSize: 14, color: '#f5a623', flexShrink: 0 }} />
                        </Tooltip>
                    )}
                    {task.components && task.components.length > 0 && (
                        <Tooltip title={`Komponenty: ${task.components.length}`}>
                            <ExtensionIcon sx={{ fontSize: 14, color: cu.textMuted, flexShrink: 0 }} />
                        </Tooltip>
                    )}
                    {children.length > 0 && (
                        <Typography sx={{ fontSize: 11, color: cu.textMuted, flexShrink: 0 }}>
                            {children.filter(c => statuses.find(s => s.id === (c.status ?? statuses[0].id))?.kind === 'done').length}
                            /{children.length}
                        </Typography>
                    )}
                </Stack>

                <Assignees
                    people={people}
                    value={task.assignees}
                    onChange={assignees => onUpdate(task.id, { assignees })}
                />

                <DateField
                    value={task.dueDate}
                    placeholder="Termin"
                    onChange={dueDate => onUpdate(task.id, { dueDate })}
                />

                <PriorityFlag
                    value={task.priority}
                    onChange={priority => onUpdate(task.id, { priority })}
                />

                <Box />

                <TagList
                    value={task.tags}
                    known={knownTags}
                    readOnly
                    onChange={tags => onUpdate(task.id, { tags })}
                />

                <TimeCell
                    trackedMinutes={node.trackedMinutes()}
                    estimateMinutes={hoursToMinutes(task.duration)}
                    tracking={node.isTracking()}
                    onToggle={() => onMutate(task.id, n => (n.isTracking()
                        ? n.stopTracking()
                        : n.startTracking({ id: `entry-${Date.now()}` })))}
                />

                <Stack direction="row" className="row-actions" sx={{ opacity: 0, transition: 'opacity .15s' }}>
                    <Tooltip title="Otwórz zadanie">
                        <IconButton size="small" onClick={e => { e.stopPropagation(); onOpen(task.id); }}>
                            <OpenInFullIcon sx={{ fontSize: 13, color: cu.textMuted }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Usuń">
                        <IconButton size="small" onClick={e => { e.stopPropagation(); onRemove(task.id); }}>
                            <DeleteOutlineIcon sx={{ fontSize: 14, color: cu.textMuted }} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            <Collapse in={isOpen}>
                {children.map(child => (
                    <TaskRows {...props} key={child.id} task={child} depth={depth + 1} />
                ))}
                {isOpen && children.length > 0 && (
                    <Box sx={{ pl: (depth + 1) * 2.5 + 2 }}>
                        <NewTaskRow
                            label="Podzadanie"
                            onAdd={name => onAdd({
                                name,
                                parentTaskId: task.id,
                                projectId: task.projectId,
                                status: task.status,
                            })}
                        />
                    </Box>
                )}
            </Collapse>
        </>
    );
};

const NewTaskRow: React.FC<{ onAdd: (name: string) => void; label?: string }> = ({ onAdd, label }) => {
    const [value, setValue] = useState('');
    const [active, setActive] = useState(false);

    const commit = () => {
        const clean = value.trim();
        if (clean) onAdd(clean);
        setValue('');
        // Pole zostaje otwarte: zadania dopisuje się seriami, a zamknięcie po
        // każdym Enterze wymuszałoby ponowne kliknięcie przed następnym.
    };

    if (!active) {
        return (
            <Stack
                direction="row"
                onClick={() => setActive(true)}
                sx={{
                    alignItems: 'center', gap: 0.5, px: 2, py: 0.75, cursor: 'pointer',
                    color: cu.textMuted, '&:hover': { color: cu.brand },
                }}
            >
                <AddIcon sx={{ fontSize: 15 }} />
                <Typography sx={{ fontSize: 12 }}>{label ?? 'Nowe zadanie'}</Typography>
            </Stack>
        );
    }

    return (
        <Box sx={{ px: 2, py: 0.5 }}>
            <TextField
                autoFocus
                fullWidth
                size="small"
                variant="standard"
                placeholder={`${label ?? 'Nazwa zadania'} — Enter zapisuje, Esc zamyka`}
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={() => { commit(); setActive(false); }}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setValue(''); setActive(false); }
                }}
                sx={{ '& input': { fontSize: 13 } }}
            />
        </Box>
    );
};
