/**
 * Pojedyncze pola zadania, w wersji, w jakiej ClickUp pokazuje je w wierszu:
 * wartość wygląda jak etykieta, a nie jak formularz, i dopiero kliknięcie
 * otwiera wybór. Dzięki temu gęsta lista da się czytać, a edycja jest jednym
 * kliknięciem — bez trybu edycji dla całego wiersza.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
    Avatar, Box, Chip, IconButton, Menu, MenuItem, Popover, Stack,
    TextField, Tooltip, Typography, Checkbox,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import OutlinedFlagIcon from '@mui/icons-material/OutlinedFlag';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import CloseIcon from '@mui/icons-material/Close';
import type { TaskPriority, TaskStatusDef } from '@mhersztowski/core';
import {
    avatarColor, cu, formatDate, formatMinutes, isOverdue, PRIORITIES, priorityDef, toDateInput,
} from './clickup';

export interface PersonOption { id: string; name: string; initials: string }

// --- status ----------------------------------------------------------------

export const StatusPill: React.FC<{
    statuses: TaskStatusDef[];
    value?: string;
    onChange: (id: string) => void;
    compact?: boolean;
}> = ({ statuses, value, onChange, compact }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const current = statuses.find(s => s.id === value) ?? statuses[0];

    return (
        <>
            <Box
                onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}
                sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.75, cursor: 'pointer',
                    px: compact ? 0 : 1, py: 0.25, borderRadius: 1,
                    '&:hover': { bgcolor: compact ? 'transparent' : cu.hover },
                }}
            >
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: current.color, flexShrink: 0 }} />
                {!compact && (
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: cu.text, whiteSpace: 'nowrap' }}>
                        {current.name}
                    </Typography>
                )}
            </Box>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {statuses.map(status => (
                    <MenuItem
                        key={status.id}
                        selected={status.id === current.id}
                        onClick={() => { onChange(status.id); setAnchor(null); }}
                        sx={{ fontSize: 13, gap: 1 }}
                    >
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: status.color }} />
                        {status.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

// --- priorytet -------------------------------------------------------------

export const PriorityFlag: React.FC<{
    value?: TaskPriority;
    onChange: (value?: TaskPriority) => void;
}> = ({ value, onChange }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const def = priorityDef(value);

    return (
        <>
            <Tooltip title={def ? `Priorytet: ${def.label}` : 'Ustaw priorytet'}>
                <IconButton size="small" onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
                    {def
                        ? <FlagIcon sx={{ fontSize: 16, color: def.color }} />
                        : <OutlinedFlagIcon sx={{ fontSize: 16, color: cu.textMuted }} />}
                </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {PRIORITIES.map(priority => (
                    <MenuItem
                        key={priority.id}
                        onClick={() => { onChange(priority.id); setAnchor(null); }}
                        sx={{ fontSize: 13, gap: 1 }}
                    >
                        <FlagIcon sx={{ fontSize: 16, color: priority.color }} />
                        {priority.label}
                    </MenuItem>
                ))}
                <MenuItem onClick={() => { onChange(undefined); setAnchor(null); }} sx={{ fontSize: 13, gap: 1 }}>
                    <CloseIcon sx={{ fontSize: 16, color: cu.textMuted }} />
                    Wyczyść
                </MenuItem>
            </Menu>
        </>
    );
};

// --- osoby -----------------------------------------------------------------

export const Assignees: React.FC<{
    people: PersonOption[];
    value?: string[];
    onChange: (ids: string[]) => void;
}> = ({ people, value, onChange }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const selected = value ?? [];

    const toggle = (id: string) => {
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
    };

    return (
        <>
            <Box
                onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}
                sx={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
            >
                {selected.length === 0 ? (
                    <Avatar sx={{
                        width: 24, height: 24, bgcolor: 'transparent',
                        border: `1px dashed ${cu.borderStrong}`,
                    }}>
                        <PersonAddAltIcon sx={{ fontSize: 13, color: cu.textMuted }} />
                    </Avatar>
                ) : (
                    <Stack direction="row" sx={{ '& > *': { ml: '-6px' }, '& > *:first-of-type': { ml: 0 } }}>
                        {selected.slice(0, 3).map(id => {
                            const person = people.find(p => p.id === id);
                            return (
                                <Tooltip key={id} title={person?.name ?? id}>
                                    <Avatar sx={{
                                        width: 24, height: 24, fontSize: 10, fontWeight: 600,
                                        bgcolor: avatarColor(id), border: '2px solid #fff',
                                    }}>
                                        {person?.initials ?? '??'}
                                    </Avatar>
                                </Tooltip>
                            );
                        })}
                        {selected.length > 3 && (
                            <Avatar sx={{
                                width: 24, height: 24, fontSize: 10, bgcolor: cu.borderStrong,
                                color: cu.text, border: '2px solid #fff',
                            }}>
                                +{selected.length - 3}
                            </Avatar>
                        )}
                    </Stack>
                )}
            </Box>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {people.length === 0 && (
                    <MenuItem disabled sx={{ fontSize: 13 }}>Brak osób w PIM/Persons</MenuItem>
                )}
                {people.map(person => (
                    <MenuItem key={person.id} onClick={() => toggle(person.id)} sx={{ fontSize: 13, gap: 1 }}>
                        <Checkbox size="small" checked={selected.includes(person.id)} sx={{ p: 0 }} />
                        <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: avatarColor(person.id) }}>
                            {person.initials}
                        </Avatar>
                        {person.name}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};

// --- data ------------------------------------------------------------------

export const DateField: React.FC<{
    value?: string;
    onChange: (iso?: string) => void;
    placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const overdue = isOverdue(value);

    return (
        <>
            <Box
                onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}
                sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                    px: 0.75, py: 0.25, borderRadius: 1, minWidth: 0,
                    color: overdue ? cu.danger : cu.textMuted,
                    '&:hover': { bgcolor: cu.hover },
                }}
            >
                <CalendarTodayIcon sx={{ fontSize: 13 }} />
                <Typography sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {value ? formatDate(value) : (placeholder ?? '')}
                </Typography>
            </Box>
            <Popover
                anchorEl={anchor}
                open={!!anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            >
                <Stack sx={{ p: 1.5, gap: 1 }}>
                    <TextField
                        type="date"
                        size="small"
                        autoFocus
                        value={toDateInput(value)}
                        onChange={e => onChange(e.target.value || undefined)}
                    />
                    <Typography
                        onClick={() => { onChange(undefined); setAnchor(null); }}
                        sx={{ fontSize: 12, color: cu.textMuted, cursor: 'pointer', '&:hover': { color: cu.danger } }}
                    >
                        Wyczyść datę
                    </Typography>
                </Stack>
            </Popover>
        </>
    );
};

// --- tagi ------------------------------------------------------------------

export const TagList: React.FC<{
    value?: string[];
    known: string[];
    onChange: (tags: string[]) => void;
    /** Na liście brak miejsca na przycisk dodawania — tam pokazujemy same tagi. */
    readOnly?: boolean;
}> = ({ value, known, onChange, readOnly }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState('');
    const tags = value ?? [];

    const add = (tag: string) => {
        const clean = tag.trim();
        if (clean && !tags.includes(clean)) onChange([...tags, clean]);
        setDraft('');
    };

    return (
        <Stack direction="row" sx={{ gap: 0.5, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            {tags.map(tag => (
                <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={readOnly ? undefined : () => onChange(tags.filter(t => t !== tag))}
                    sx={{
                        height: 20, fontSize: 11, bgcolor: cu.brandSoft, color: cu.brand,
                        '& .MuiChip-deleteIcon': { fontSize: 13, color: cu.brand },
                    }}
                />
            ))}
            {!readOnly && (
                <>
                    <IconButton size="small" onClick={e => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
                        <LocalOfferIcon sx={{ fontSize: 14, color: cu.textMuted }} />
                    </IconButton>
                    <Popover
                        anchorEl={anchor}
                        open={!!anchor}
                        onClose={() => setAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                    >
                        <Stack sx={{ p: 1.5, gap: 1, minWidth: 200 }}>
                            <TextField
                                size="small"
                                autoFocus
                                placeholder="Nowy tag"
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') add(draft); }}
                            />
                            {known.filter(t => !tags.includes(t)).map(tag => (
                                <Chip
                                    key={tag}
                                    label={tag}
                                    size="small"
                                    onClick={() => add(tag)}
                                    sx={{ height: 22, fontSize: 11, justifyContent: 'flex-start' }}
                                />
                            ))}
                        </Stack>
                    </Popover>
                </>
            )}
        </Stack>
    );
};

// --- czas ------------------------------------------------------------------

/**
 * Odświeżanie co sekundę tylko wtedy, gdy licznik faktycznie biegnie —
 * bez tego warunku każda lista zadań przerysowywałaby się raz na sekundę.
 */
export function useTicker(active: boolean): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!active) return;
        const handle = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(handle);
    }, [active]);
    return tick;
}

export const TimeCell: React.FC<{
    trackedMinutes: number;
    estimateMinutes?: number;
    tracking: boolean;
    onToggle: () => void;
}> = ({ trackedMinutes, estimateMinutes, tracking, onToggle }) => (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        <Tooltip title={tracking ? 'Zatrzymaj pomiar' : 'Zacznij mierzyć czas'}>
            <IconButton size="small" onClick={e => { e.stopPropagation(); onToggle(); }}>
                {tracking
                    ? <StopIcon sx={{ fontSize: 16, color: cu.danger }} />
                    : <PlayArrowIcon sx={{ fontSize: 16, color: cu.textMuted }} />}
            </IconButton>
        </Tooltip>
        <Typography sx={{
            fontSize: 12, whiteSpace: 'nowrap',
            color: tracking ? cu.danger : cu.textMuted,
            fontWeight: tracking ? 600 : 400,
        }}>
            {formatMinutes(trackedMinutes) || (estimateMinutes ? '0m' : '')}
            {estimateMinutes ? ` / ${formatMinutes(estimateMinutes)}` : ''}
        </Typography>
    </Stack>
);

/** Nazwa zadania edytowana w miejscu — bez otwierania panelu. */
export const InlineName: React.FC<{
    value: string;
    onChange: (value: string) => void;
    strike?: boolean;
    bold?: boolean;
}> = ({ value, onChange, strike, bold }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const ref = useRef<HTMLInputElement>(null);

    useEffect(() => { setDraft(value); }, [value]);

    const commit = () => {
        setEditing(false);
        const clean = draft.trim();
        if (clean && clean !== value) onChange(clean);
        else setDraft(value);
    };

    if (editing) {
        return (
            <TextField
                inputRef={ref}
                autoFocus
                size="small"
                variant="standard"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') commit();
                    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
                }}
                onClick={e => e.stopPropagation()}
                sx={{ flex: 1, '& input': { fontSize: 13, py: 0 } }}
            />
        );
    }

    return (
        <Typography
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
            sx={{
                fontSize: 13, flex: 1, minWidth: 0, cursor: 'pointer',
                fontWeight: bold ? 600 : 400,
                color: strike ? cu.textMuted : cu.text,
                textDecoration: strike ? 'line-through' : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
        >
            {value}
        </Typography>
    );
};
