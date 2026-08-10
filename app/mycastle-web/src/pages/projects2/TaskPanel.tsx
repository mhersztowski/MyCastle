/**
 * Panel szczegółów zadania — odpowiednik prawego panelu w ClickUpie.
 *
 * Zależności pokazujemy w dwie strony („Czeka na" i „Blokuje"), choć w pliku
 * zapisana jest tylko jedna (`dependsOn` = poprzedniki). Druga strona jest jej
 * odwrotnością liczoną z ogółu zadań, a dopisanie czegoś do „Blokuje" zapisuje
 * się jako `dependsOn` u tamtego zadania. Użytkownik myśli relacją, nie jej
 * kierunkiem zapisu — a plik nie ma dwóch list, które mogą się rozjechać.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    Autocomplete, Box, Divider, Drawer, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExtensionIcon from '@mui/icons-material/Extension';
import type {
    TaskComponentModel, TaskIntervalComponentModel, TaskModel,
    TaskSequenceComponentModel, TaskStatusDef, TaskTestComponentModel,
} from '@mhersztowski/core';
import { TaskNode } from '@mhersztowski/core';
import TaskComponentEditorDialog from '../../components/project/TaskComponentEditorDialog';
import { cu, formatMinutes, hoursToMinutes, parseHours } from './clickup';
import {
    Assignees, DateField, PersonOption, PriorityFlag, StatusPill, TagList, useTicker,
} from './fields';

interface TaskPanelProps {
    task: TaskModel | null;
    allTasks: TaskModel[];
    statuses: TaskStatusDef[];
    people: PersonOption[];
    knownTags: string[];
    onClose: () => void;
    onUpdate: (id: string, patch: Partial<TaskModel>) => void;
    onMutate: (id: string, mutate: (node: TaskNode) => void) => void;
    onAdd: (task: Partial<TaskModel> & { name: string }) => void;
    onRemove: (id: string) => void;
    onOpen: (id: string) => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({
    task, allTasks, statuses, people, knownTags,
    onClose, onUpdate, onMutate, onAdd, onRemove, onOpen,
}) => (
    <Drawer
        anchor="right"
        open={!!task}
        onClose={onClose}
        PaperProps={{ sx: { width: 460, maxWidth: '100vw', bgcolor: cu.bg } }}
    >
        {task && (
            <TaskPanelBody
                key={task.id}
                task={task}
                allTasks={allTasks}
                statuses={statuses}
                people={people}
                knownTags={knownTags}
                onClose={onClose}
                onUpdate={onUpdate}
                onMutate={onMutate}
                onAdd={onAdd}
                onRemove={onRemove}
                onOpen={onOpen}
            />
        )}
    </Drawer>
);

const TaskPanelBody: React.FC<TaskPanelProps & { task: TaskModel }> = ({
    task, allTasks, statuses, people, knownTags,
    onClose, onUpdate, onMutate, onAdd, onRemove, onOpen,
}) => {
    const node = useMemo(() => TaskNode.fromModel(task), [task]);
    useTicker(node.isTracking());
    const [componentsOpen, setComponentsOpen] = useState(false);

    const subtasks = allTasks.filter(t => t.parentTaskId === task.id);
    const waitingFor = (task.dependsOn ?? [])
        .map(id => allTasks.find(t => t.id === id))
        .filter((t): t is TaskModel => !!t);
    const blocking = allTasks.filter(t => t.dependsOn?.includes(task.id));

    /** Kandydaci na zależność: wszystko poza sobą i poza już powiązanymi. */
    const candidates = (exclude: TaskModel[]) => allTasks.filter(
        t => t.id !== task.id && !exclude.some(e => e.id === t.id)
    );

    return (
        <Stack sx={{ height: '100%' }}>
            <Stack direction="row" sx={{
                alignItems: 'center', gap: 1, px: 2, py: 1.5,
                borderBottom: `1px solid ${cu.border}`,
            }}>
                <StatusPill
                    statuses={statuses}
                    value={task.status}
                    onChange={status => onUpdate(task.id, { status })}
                />
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Usuń zadanie">
                    <IconButton size="small" onClick={() => { onRemove(task.id); onClose(); }}>
                        <DeleteOutlineIcon sx={{ fontSize: 18, color: cu.textMuted }} />
                    </IconButton>
                </Tooltip>
                <IconButton size="small" onClick={onClose}>
                    <CloseIcon sx={{ fontSize: 18, color: cu.textMuted }} />
                </IconButton>
            </Stack>

            <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
                <TextField
                    fullWidth
                    variant="standard"
                    multiline
                    value={task.name}
                    onChange={e => onUpdate(task.id, { name: e.target.value })}
                    InputProps={{ disableUnderline: true }}
                    sx={{ mb: 2, '& textarea': { fontSize: 20, fontWeight: 600, color: cu.text } }}
                />

                <Stack sx={{ gap: 1.5 }}>
                    <Field label="Wykonawcy">
                        <Assignees
                            people={people}
                            value={task.assignees}
                            onChange={assignees => onUpdate(task.id, { assignees })}
                        />
                    </Field>

                    <Field label="Daty">
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                            <DateField
                                value={task.startDate}
                                placeholder="Start"
                                onChange={startDate => onUpdate(task.id, { startDate })}
                            />
                            <Typography sx={{ fontSize: 12, color: cu.textMuted }}>→</Typography>
                            <DateField
                                value={task.dueDate}
                                placeholder="Termin"
                                onChange={dueDate => onUpdate(task.id, { dueDate })}
                            />
                        </Stack>
                    </Field>

                    <Field label="Priorytet">
                        <PriorityFlag
                            value={task.priority}
                            onChange={priority => onUpdate(task.id, { priority })}
                        />
                    </Field>

                    <Field label="Szacowany czas (h)">
                        <EstimateInput
                            value={task.duration}
                            onChange={duration => onUpdate(task.id, { duration })}
                        />
                    </Field>

                    <Field label="Tagi">
                        <TagList
                            value={task.tags}
                            known={knownTags}
                            onChange={tags => onUpdate(task.id, { tags })}
                        />
                    </Field>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <SectionTitle>Opis</SectionTitle>
                <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    size="small"
                    placeholder="Dodaj opis…"
                    value={task.description ?? ''}
                    onChange={e => onUpdate(task.id, { description: e.target.value || undefined })}
                    sx={{ '& textarea': { fontSize: 13 } }}
                />

                <Divider sx={{ my: 2 }} />

                <SectionTitle>
                    Śledzenie czasu
                    <Typography component="span" sx={{ fontSize: 12, color: cu.textMuted, ml: 1 }}>
                        {formatMinutes(node.trackedMinutes()) || '0m'}
                        {task.duration ? ` z ${formatMinutes(hoursToMinutes(task.duration))}` : ''}
                    </Typography>
                </SectionTitle>

                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1 }}>
                    <Box
                        onClick={() => onMutate(task.id, n => (n.isTracking()
                            ? n.stopTracking()
                            : n.startTracking({ id: `entry-${Date.now()}` })))}
                        sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                            px: 1.25, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 600,
                            color: '#fff', bgcolor: node.isTracking() ? cu.danger : cu.brand,
                        }}
                    >
                        {node.isTracking()
                            ? <><StopIcon sx={{ fontSize: 15 }} /> Zatrzymaj</>
                            : <><PlayArrowIcon sx={{ fontSize: 15 }} /> Zacznij</>}
                    </Box>
                </Stack>

                {(task.timeEntries ?? []).map(entry => (
                    <Stack key={entry.id} direction="row" sx={{
                        alignItems: 'center', gap: 1, py: 0.5,
                        borderBottom: `1px solid ${cu.border}`,
                    }}>
                        <Typography sx={{ fontSize: 12, color: cu.text, flex: 1 }}>
                            {new Date(entry.start).toLocaleString('pl-PL', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                            })}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: entry.end ? cu.textMuted : cu.danger }}>
                            {entry.end
                                ? formatMinutes(Math.round((Date.parse(entry.end) - Date.parse(entry.start)) / 60000))
                                : 'trwa…'}
                        </Typography>
                        <IconButton
                            size="small"
                            onClick={() => onUpdate(task.id, {
                                timeEntries: (task.timeEntries ?? []).filter(e => e.id !== entry.id),
                            })}
                        >
                            <DeleteOutlineIcon sx={{ fontSize: 14, color: cu.textMuted }} />
                        </IconButton>
                    </Stack>
                ))}

                <Divider sx={{ my: 2 }} />

                <SectionTitle>
                    Podzadania
                    <Typography component="span" sx={{ fontSize: 12, color: cu.textMuted, ml: 1 }}>
                        {subtasks.filter(s => statuses.find(x => x.id === s.status)?.kind === 'done').length}
                        /{subtasks.length}
                    </Typography>
                </SectionTitle>

                {subtasks.map(subtask => (
                    <Stack key={subtask.id} direction="row" sx={{
                        alignItems: 'center', gap: 1, py: 0.5,
                        borderBottom: `1px solid ${cu.border}`,
                    }}>
                        <StatusPill
                            statuses={statuses}
                            value={subtask.status}
                            onChange={status => onUpdate(subtask.id, { status })}
                            compact
                        />
                        <Typography
                            onClick={() => onOpen(subtask.id)}
                            sx={{ fontSize: 13, flex: 1, cursor: 'pointer', '&:hover': { color: cu.brand } }}
                        >
                            {subtask.name}
                        </Typography>
                        <Assignees
                            people={people}
                            value={subtask.assignees}
                            onChange={assignees => onUpdate(subtask.id, { assignees })}
                        />
                    </Stack>
                ))}

                <QuickAdd
                    placeholder="Nowe podzadanie"
                    onAdd={name => onAdd({
                        name,
                        parentTaskId: task.id,
                        projectId: task.projectId,
                        status: statuses[0].id,
                    })}
                />

                <Divider sx={{ my: 2 }} />

                <SectionTitle>
                    Komponenty
                    <Typography component="span" sx={{ fontSize: 12, color: cu.textMuted, ml: 1 }}>
                        {task.components?.length ?? 0}
                    </Typography>
                </SectionTitle>

                {(task.components ?? []).map((component, index) => (
                    <Stack
                        key={index}
                        direction="row"
                        onClick={() => setComponentsOpen(true)}
                        sx={{
                            alignItems: 'center', gap: 1, py: 0.5, cursor: 'pointer',
                            borderBottom: `1px solid ${cu.border}`,
                            '&:hover': { color: cu.brand },
                        }}
                    >
                        <ExtensionIcon sx={{ fontSize: 15, color: cu.textMuted }} />
                        <Typography sx={{ fontSize: 13, flex: 1 }}>
                            {COMPONENT_LABELS[component.type] ?? component.type}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: cu.textMuted }}>
                            {describeComponent(component)}
                        </Typography>
                    </Stack>
                ))}

                <Stack
                    direction="row"
                    onClick={() => setComponentsOpen(true)}
                    sx={{
                        alignItems: 'center', gap: 0.5, mt: 1, cursor: 'pointer',
                        color: cu.textMuted, '&:hover': { color: cu.brand },
                    }}
                >
                    <AddIcon sx={{ fontSize: 14 }} />
                    <Typography sx={{ fontSize: 12 }}>
                        {task.components?.length ? 'Edytuj komponenty' : 'Dodaj komponent'}
                    </Typography>
                </Stack>

                {/* Ten sam edytor, którego używa PIM/Projects — komponenty mają
                    tam własne reguły (test, interwał, sekwencja podzadań),
                    a druga implementacja rozjechałaby się z pierwszą. */}
                <TaskComponentEditorDialog
                    open={componentsOpen}
                    onClose={() => setComponentsOpen(false)}
                    taskName={task.name}
                    components={task.components ?? []}
                    onChange={components => onUpdate(task.id, {
                        components: components.length > 0 ? components : undefined,
                    })}
                />

                <Divider sx={{ my: 2 }} />

                <SectionTitle>Zależności</SectionTitle>

                <DependencyGroup
                    label="Czeka na (poprzedzające)"
                    items={waitingFor}
                    statuses={statuses}
                    options={candidates(waitingFor)}
                    onOpen={onOpen}
                    onAdd={other => onMutate(task.id, n => n.addDependency(other.id))}
                    onRemove={other => onMutate(task.id, n => n.removeDependency(other.id))}
                />

                <DependencyGroup
                    label="Blokuje (następujące)"
                    items={blocking}
                    statuses={statuses}
                    options={candidates(blocking)}
                    onOpen={onOpen}
                    // Odwrotny kierunek: zapisujemy u tamtego zadania.
                    onAdd={other => onMutate(other.id, n => n.addDependency(task.id))}
                    onRemove={other => onMutate(other.id, n => n.removeDependency(task.id))}
                />
            </Box>
        </Stack>
    );
};

const COMPONENT_LABELS: Record<string, string> = {
    task_test: 'Test',
    task_interval: 'Interwał',
    task_sequence: 'Sekwencja',
};

/** Jednowierszowe streszczenie — pełna edycja jest w dialogu. */
function describeComponent(component: TaskComponentModel): string {
    if (component.type === 'task_test') {
        return (component as TaskTestComponentModel).name || '';
    }
    if (component.type === 'task_interval') {
        return `co ${(component as TaskIntervalComponentModel).daysInterval} dni`;
    }
    if (component.type === 'task_sequence') {
        return `${(component as TaskSequenceComponentModel).tasks?.length ?? 0} zadań`;
    }
    return '';
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: 12, color: cu.textMuted, width: 130, flexShrink: 0 }}>
            {label}
        </Typography>
        {children}
    </Stack>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <Typography sx={{
        fontSize: 12, fontWeight: 700, color: cu.text, mb: 1,
        textTransform: 'uppercase', letterSpacing: 0.4,
    }}>
        {children}
    </Typography>
);

/**
 * Wartością jest liczba godzin (ułamkowa) — taka trafia do `TaskModel.duration`
 * i taka wyświetla się w polu, żeby to, co widać, było tym, co zapisane.
 * Wpisać można też `2h 30m`; wtedy pole po zatwierdzeniu pokaże `2,5`.
 */
const EstimateInput: React.FC<{
    value?: number;
    onChange: (hours?: number) => void;
}> = ({ value, onChange }) => {
    const [draft, setDraft] = useState(formatHours(value));

    useEffect(() => { setDraft(formatHours(value)); }, [value]);

    const commit = () => {
        const parsed = parseHours(draft);
        setDraft(formatHours(parsed));
        if (parsed !== value) onChange(parsed);
    };

    return (
        <TextField
            size="small"
            variant="standard"
            placeholder="np. 2,5"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            // Parsowanie dopiero po wyjściu z pola: „2,5" w trakcie pisania
            // przechodzi przez „2," — a to nie jest jeszcze żadna liczba.
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            sx={{ width: 120, '& input': { fontSize: 13 } }}
        />
    );
};

/** `2.5` → `2,5`; `8` → `8`. Przecinek, bo po polsku tak się pisze ułamki. */
function formatHours(hours?: number): string {
    if (hours === undefined) return '';
    return String(Math.round(hours * 100) / 100).replace('.', ',');
}

const DependencyGroup: React.FC<{
    label: string;
    items: TaskModel[];
    options: TaskModel[];
    statuses: TaskStatusDef[];
    onOpen: (id: string) => void;
    onAdd: (task: TaskModel) => void;
    onRemove: (task: TaskModel) => void;
}> = ({ label, items, options, statuses, onOpen, onAdd, onRemove }) => {
    const [adding, setAdding] = useState(false);

    return (
        <Box sx={{ mb: 1.5 }}>
            <Typography sx={{ fontSize: 11, color: cu.textMuted, mb: 0.5 }}>{label}</Typography>

            {items.map(item => (
                <Stack key={item.id} direction="row" sx={{
                    alignItems: 'center', gap: 1, py: 0.5,
                    borderBottom: `1px solid ${cu.border}`,
                }}>
                    <Box sx={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        bgcolor: statuses.find(s => s.id === (item.status ?? statuses[0].id))?.color
                            ?? cu.borderStrong,
                    }} />
                    <Typography
                        onClick={() => onOpen(item.id)}
                        sx={{ fontSize: 13, flex: 1, cursor: 'pointer', '&:hover': { color: cu.brand } }}
                    >
                        {item.name}
                    </Typography>
                    <IconButton size="small" onClick={() => onRemove(item)}>
                        <CloseIcon sx={{ fontSize: 14, color: cu.textMuted }} />
                    </IconButton>
                </Stack>
            ))}

            {adding ? (
                <Autocomplete
                    open
                    autoFocus
                    size="small"
                    options={options}
                    getOptionLabel={option => option.name}
                    onChange={(_, option) => { if (option) onAdd(option); setAdding(false); }}
                    onBlur={() => setAdding(false)}
                    renderInput={params => (
                        <TextField {...params} autoFocus variant="standard" placeholder="Znajdź zadanie…" />
                    )}
                    sx={{ mt: 0.5, '& input': { fontSize: 13 } }}
                />
            ) : (
                <Stack
                    direction="row"
                    onClick={() => setAdding(true)}
                    sx={{
                        alignItems: 'center', gap: 0.5, mt: 0.5, cursor: 'pointer',
                        color: cu.textMuted, '&:hover': { color: cu.brand },
                    }}
                >
                    <AddIcon sx={{ fontSize: 14 }} />
                    <Typography sx={{ fontSize: 12 }}>Dodaj</Typography>
                </Stack>
            )}
        </Box>
    );
};

const QuickAdd: React.FC<{ placeholder: string; onAdd: (name: string) => void }> = ({ placeholder, onAdd }) => {
    const [value, setValue] = useState('');
    return (
        <TextField
            fullWidth
            size="small"
            variant="standard"
            placeholder={placeholder}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
                if (e.key === 'Enter' && value.trim()) { onAdd(value.trim()); setValue(''); }
            }}
            sx={{ mt: 1, '& input': { fontSize: 13 } }}
        />
    );
};
