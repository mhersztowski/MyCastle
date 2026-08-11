/**
 * PIM/Projects2 — widok projektów i zadań w układzie ClickUpa.
 *
 * Dane są te same, co w PIM/Projects (`data/projects.json` + `data/tasks.json`);
 * ta strona różni się wyłącznie tym, co z nimi robi. Zadania bez projektu mają
 * własną pozycję na liście, bo inaczej byłyby niewidoczne — a to właśnie one
 * najczęściej wpadają z innych miejsc systemu.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box, CircularProgress, IconButton, InputBase, Menu, MenuItem, Stack, Tooltip, Typography,
} from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InboxIcon from '@mui/icons-material/Inbox';
import { cu, statusesOf } from './clickup';
import { flattenProjects, useProjectsStore } from './useProjectsStore';
import { ListView } from './ListView';
import { BoardView } from './BoardView';
import { TaskPanel } from './TaskPanel';
import { TaskDocDialog } from './TaskDocDialog';
import { useAuth } from '../../modules/auth';

type ViewMode = 'list' | 'board';
/** Jak karty na tablicy pokazują termin: konkretną datą czy numerem tygodnia. */
type DateMode = 'normal' | 'week';
/** Pozycja „bez projektu" nie ma id w danych — potrzebuje własnego znacznika. */
const UNASSIGNED = '__unassigned__';

const Projects2Page: React.FC = () => {
    const store = useProjectsStore();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [view, setView] = useState<ViewMode>('list');
    const [dateMode, setDateMode] = useState<DateMode>('normal');
    const [query, setQuery] = useState('');
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);
    const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    const rows = useMemo(() => flattenProjects(store.projects), [store.projects]);

    // Pierwszy projekt wchodzi sam, żeby strona nie otwierała się pusta.
    const activeId = selectedId ?? rows[0]?.project.id ?? UNASSIGNED;
    const activeProject = rows.find(r => r.project.id === activeId)?.project;
    const statuses = statusesOf(activeProject);

    const visibleTasks = useMemo(() => {
        const inScope = activeId === UNASSIGNED
            ? store.tasks.filter(t => !t.projectId)
            : store.tasks.filter(t => t.projectId === activeId);
        if (!query.trim()) return inScope;
        const needle = query.toLowerCase();
        return inScope.filter(task =>
            task.name.toLowerCase().includes(needle) ||
            task.description?.toLowerCase().includes(needle) ||
            task.tags?.some(tag => tag.toLowerCase().includes(needle))
        );
    }, [store.tasks, activeId, query]);

    const openTask = store.tasks.find(t => t.id === openTaskId) ?? null;

    /*
     * `?task=<id>` otwiera panel na wskazanym zadaniu — tą drogą wchodzi się
     * z karty zadania w notatce.
     *
     * Przełączamy też projekt, bo zadanie spoza aktywnego nie mieściłoby się
     * w `visibleTasks` i panel otworzyłby się nad listą, na której go nie widać.
     *
     * Parametr zdejmujemy po zadziałaniu. Zostawiony wracałby przy każdym
     * odświeżeniu i nie dałoby się zamknąć panelu na stałe — a to wygląda jak
     * usterka, nie jak funkcja.
     */
    const requestedTaskId = searchParams.get('task');
    useEffect(() => {
        if (!requestedTaskId || !store.isDataLoaded) return;

        const target = store.tasks.find(t => t.id === requestedTaskId);
        if (target) {
            setSelectedId(target.projectId ?? UNASSIGNED);
            setOpenTaskId(target.id);
        }

        const next = new URLSearchParams(searchParams);
        next.delete('task');
        setSearchParams(next, { replace: true });
    }, [requestedTaskId, store.isDataLoaded, store.tasks, searchParams, setSearchParams]);

    // Haki muszą stać PRZED wczesnym `return` niżej. Postawione za nim znikają
    // z renderu, dopóki dane się ładują, a po ich wczytaniu dochodzą — React
    // widzi wtedy inną liczbę haków niż poprzednio i wywraca komponent.
    // Objaw: strona „resetuje się" zamiast otworzyć.
    const { currentUser, token } = useAuth();
    const [docTaskId, setDocTaskId] = useState<string | null>(null);

    if (!store.isDataLoaded) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                <CircularProgress />
            </Box>
        );
    }

    const actions = {
        onUpdate: store.updateTask,
        onMutate: store.mutateTask,
        onAdd: store.addTask,
        onRemove: store.removeTask,
        onOpen: setOpenTaskId,
        onOpenDoc: setDocTaskId,
    };

    // Notatka otwiera się na cały ekran ponad wszystkim, więc jej stan siedzi
    // tutaj, a nie w wierszu listy — inaczej zwinięcie wiersza zamykałoby
    // dokument w trakcie pisania.
    const docTask = docTaskId ? store.tasks.find(t => t.id === docTaskId) ?? null : null;

    return (
        // `height: 100%`, a nie `calc(100vh - 64px)`: trasa montuje stronę pod
        // `Layout fullBleed`, który już oddaje dokładnie tyle, ile zostało po
        // górnym pasku. Odejmowanie na własną rękę przestrzeliwuje viewport —
        // ta sama pułapka, którą opisuje komentarz przy trasie Drive.
        <Box sx={{ display: 'flex', height: '100%', minHeight: 0, bgcolor: cu.bg, color: cu.text }}>
            {/* --- panel boczny z projektami --- */}
            <Stack sx={{
                width: 248, flexShrink: 0, bgcolor: cu.sidebar,
                borderRight: `1px solid ${cu.border}`, overflow: 'auto',
            }}>
                <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1.5, gap: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1 }}>Projekty</Typography>
                    <Tooltip title="Nowy projekt">
                        <IconButton
                            size="small"
                            onClick={() => {
                                const created = store.addProject('Nowy projekt');
                                setSelectedId(created.id);
                            }}
                        >
                            <AddIcon sx={{ fontSize: 16, color: cu.textMuted }} />
                        </IconButton>
                    </Tooltip>
                </Stack>

                {rows.filter(row => !row.project.archived).map(({ project, depth }) => {
                    const count = store.tasks.filter(t => t.projectId === project.id).length;
                    const active = project.id === activeId;
                    return (
                        <Stack
                            key={project.id}
                            direction="row"
                            onClick={() => setSelectedId(project.id)}
                            sx={{
                                alignItems: 'center', gap: 1, cursor: 'pointer',
                                px: 2, py: 0.75, pl: 2 + depth * 1.5,
                                bgcolor: active ? cu.brandSoft : 'transparent',
                                borderLeft: `3px solid ${active ? cu.brand : 'transparent'}`,
                                '&:hover': { bgcolor: active ? cu.brandSoft : cu.hover },
                            }}
                        >
                            <Box sx={{
                                width: 8, height: 8, borderRadius: '2px', flexShrink: 0,
                                bgcolor: project.color ?? cu.brand,
                            }} />
                            <Typography sx={{
                                fontSize: 13, flex: 1, minWidth: 0,
                                fontWeight: active ? 600 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {project.name}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: cu.textMuted }}>{count}</Typography>
                        </Stack>
                    );
                })}

                <Stack
                    direction="row"
                    onClick={() => setSelectedId(UNASSIGNED)}
                    sx={{
                        alignItems: 'center', gap: 1, cursor: 'pointer', px: 2, py: 0.75, mt: 1,
                        borderTop: `1px solid ${cu.border}`,
                        bgcolor: activeId === UNASSIGNED ? cu.brandSoft : 'transparent',
                        borderLeft: `3px solid ${activeId === UNASSIGNED ? cu.brand : 'transparent'}`,
                        '&:hover': { bgcolor: activeId === UNASSIGNED ? cu.brandSoft : cu.hover },
                    }}
                >
                    <InboxIcon sx={{ fontSize: 15, color: cu.textMuted }} />
                    <Typography sx={{ fontSize: 13, flex: 1 }}>Bez projektu</Typography>
                    <Typography sx={{ fontSize: 11, color: cu.textMuted }}>
                        {store.tasks.filter(t => !t.projectId).length}
                    </Typography>
                </Stack>
            </Stack>

            {/* --- treść --- */}
            <Stack sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" sx={{
                    alignItems: 'center', gap: 1, px: 2, py: 1.5,
                    borderBottom: `1px solid ${cu.border}`,
                }}>
                    <Typography sx={{ fontSize: 17, fontWeight: 700 }}>
                        {activeId === UNASSIGNED ? 'Bez projektu' : (activeProject?.name ?? 'Projekty')}
                    </Typography>

                    {activeProject && (
                        <>
                            <IconButton size="small" onClick={e => setMenuAnchor(e.currentTarget)}>
                                <MoreHorizIcon sx={{ fontSize: 18, color: cu.textMuted }} />
                            </IconButton>
                            <Menu
                                anchorEl={menuAnchor}
                                open={!!menuAnchor}
                                onClose={() => setMenuAnchor(null)}
                            >
                                <MenuItem
                                    sx={{ fontSize: 13 }}
                                    onClick={() => {
                                        const name = window.prompt('Nazwa projektu', activeProject.name);
                                        if (name?.trim()) store.updateProject(activeProject.id, { name: name.trim() });
                                        setMenuAnchor(null);
                                    }}
                                >
                                    Zmień nazwę
                                </MenuItem>
                                <MenuItem
                                    sx={{ fontSize: 13 }}
                                    onClick={() => {
                                        store.addProject('Podprojekt', activeProject.id);
                                        setMenuAnchor(null);
                                    }}
                                >
                                    Dodaj podprojekt
                                </MenuItem>
                                <MenuItem
                                    sx={{ fontSize: 13 }}
                                    onClick={() => {
                                        store.updateProject(activeProject.id, { archived: true });
                                        setSelectedId(null);
                                        setMenuAnchor(null);
                                    }}
                                >
                                    Archiwizuj
                                </MenuItem>
                                <MenuItem
                                    sx={{ fontSize: 13, color: cu.danger }}
                                    onClick={() => {
                                        if (window.confirm(`Usunąć projekt „${activeProject.name}"? Zadania zostaną bez projektu.`)) {
                                            store.removeProject(activeProject.id);
                                            setSelectedId(null);
                                        }
                                        setMenuAnchor(null);
                                    }}
                                >
                                    Usuń projekt
                                </MenuItem>
                            </Menu>
                        </>
                    )}

                    <Box sx={{ flex: 1 }} />

                    <Stack direction="row" sx={{
                        alignItems: 'center', gap: 0.5, px: 1, py: 0.25,
                        border: `1px solid ${cu.border}`, borderRadius: 1,
                    }}>
                        <SearchIcon sx={{ fontSize: 15, color: cu.textMuted }} />
                        <InputBase
                            placeholder="Szukaj"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            sx={{ fontSize: 13, width: 150 }}
                        />
                    </Stack>

                    <SaveIndicator state={store.saveState} />
                </Stack>

                <Stack direction="row" sx={{
                    alignItems: 'center', gap: 0.5, px: 2,
                    borderBottom: `1px solid ${cu.border}`,
                }}>
                    <ViewTab
                        active={view === 'list'}
                        icon={<ViewListIcon sx={{ fontSize: 15 }} />}
                        label="Lista"
                        onClick={() => setView('list')}
                    />
                    <ViewTab
                        active={view === 'board'}
                        icon={<ViewKanbanIcon sx={{ fontSize: 15 }} />}
                        label="Tablica"
                        onClick={() => setView('board')}
                    />

                    {/*
                      * Przełącznik dotyczy wyłącznie kart na tablicy, więc na
                      * liście go nie ma — przycisk bez skutku myli bardziej,
                      * niż pomaga.
                      */}
                    {view === 'board' && (
                        <Stack
                            direction="row"
                            onClick={() => setDateMode(m => (m === 'normal' ? 'week' : 'normal'))}
                            sx={{
                                alignItems: 'center', gap: 0.5, ml: 'auto', px: 1.25, py: 0.5,
                                cursor: 'pointer', color: cu.textMuted,
                                '&:hover': { color: cu.text },
                            }}
                        >
                            <EventIcon sx={{ fontSize: 15 }} />
                            <Typography sx={{ fontSize: 13 }}>
                                Daty: {dateMode === 'normal' ? 'Normalne' : 'Tygodniowe'}
                            </Typography>
                        </Stack>
                    )}
                </Stack>

                {view === 'list' ? (
                    <ListView
                        tasks={visibleTasks}
                        statuses={statuses}
                        knownTags={store.knownTags}
                        projectId={activeId === UNASSIGNED ? undefined : activeId}
                        {...actions}
                    />
                ) : (
                    <BoardView
                        tasks={visibleTasks}
                        statuses={statuses}
                        people={store.persons}
                        dateMode={dateMode}
                        projectId={activeId === UNASSIGNED ? undefined : activeId}
                        {...actions}
                    />
                )}
            </Stack>

            {docTask?.docPath && (
                <TaskDocDialog
                    open
                    userName={currentUser?.name ?? ''}
                    token={token ?? undefined}
                    path={docTask.docPath}
                    taskName={docTask.name}
                    onClose={() => setDocTaskId(null)}
                />
            )}

            <TaskPanel
                task={openTask}
                allTasks={store.tasks}
                statuses={statuses}
                people={store.persons}
                knownTags={store.knownTags}
                onClose={() => setOpenTaskId(null)}
                {...actions}
            />
        </Box>
    );
};

const ViewTab: React.FC<{
    active: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
    <Stack
        direction="row"
        onClick={onClick}
        sx={{
            alignItems: 'center', gap: 0.5, px: 1.25, py: 1, cursor: 'pointer',
            color: active ? cu.text : cu.textMuted,
            fontWeight: active ? 600 : 400,
            borderBottom: `2px solid ${active ? cu.brand : 'transparent'}`,
            '&:hover': { color: cu.text },
        }}
    >
        {icon}
        <Typography sx={{ fontSize: 13, fontWeight: 'inherit' }}>{label}</Typography>
    </Stack>
);

const SaveIndicator: React.FC<{ state: string }> = ({ state }) => {
    if (state === 'idle') return null;
    const map: Record<string, { icon: React.ReactNode; text: string; color: string }> = {
        dirty:  { icon: <CloudUploadIcon sx={{ fontSize: 14 }} />, text: 'Zmiany…',  color: cu.textMuted },
        saving: { icon: <CloudUploadIcon sx={{ fontSize: 14 }} />, text: 'Zapisuję', color: cu.textMuted },
        saved:  { icon: <CloudDoneIcon sx={{ fontSize: 14 }} />,   text: 'Zapisano', color: '#2ecd6f' },
        error:  { icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} />, text: 'Błąd zapisu', color: cu.danger },
    };
    const entry = map[state];
    if (!entry) return null;
    return (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, color: entry.color }}>
            {entry.icon}
            <Typography sx={{ fontSize: 11 }}>{entry.text}</Typography>
        </Stack>
    );
};

export default Projects2Page;
