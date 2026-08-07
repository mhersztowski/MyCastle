/**
 * Dolny panel: monitor portu, zdarzenia i podgląd symulacji.
 *
 * Rozbiór wierszy i bufory siedzą w rdzeniu — tutaj jest tylko widok. Bufor
 * cykliczny ma stałą pojemność, bo urządzenie potrafi mówić szybciej, niż
 * człowiek czyta, a lista bez ograniczenia zatrzymuje przeglądarkę po kilku
 * minutach pracy. Licznik odrzuconych wierszy jest widoczny: „widzę 500
 * wierszy" musi dać się odróżnić od „widzę wszystkie".
 */

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
    LOG_LEVELS, filterLogs, sampleSource, sourcesFrom,
    type LogLevel, type LogLine,
} from '../model';

export interface MonitorPanelProps {
    lines: readonly LogLine[];
    /** Ile wierszy przepadło z powodu zapełnienia bufora. */
    dropped?: number;
    /** Model pliku projektu — z niego biorą się źródła symulacji. */
    model?: unknown;
    /** Chwila symulacji w mikrosekundach. */
    simulationTime?: number;
}

const LEVEL_COLORS: Record<string, string> = {
    trace: '#64748b', debug: '#94a3b8', info: '#e2e8f0',
    warn: '#d97706', error: '#dc2626',
};

export function MonitorPanel({ lines, dropped = 0, model, simulationTime = 0 }: MonitorPanelProps) {
    const [tab, setTab] = useState(0);
    const [level, setLevel] = useState<LogLevel>('trace');
    const [query, setQuery] = useState('');

    const visible = useMemo(() => filterLogs(lines, { minLevel: level, query }),
                            [lines, level, query]);

    const sources = useMemo(() => sourcesFrom(model), [model]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, borderBottom: 1,
                                                     borderColor: 'divider' }}>
                <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ minHeight: 34 }}>
                    <Tab label="Monitor" sx={{ minHeight: 34, py: 0 }} />
                    <Tab label="Symulacja" sx={{ minHeight: 34, py: 0 }} />
                </Tabs>
                <Box sx={{ flex: 1 }} />
                {dropped > 0 && (
                    <Chip size="small" color="warning" sx={{ height: 18 }}
                          label={`pominięto ${dropped}`} />
                )}
            </Stack>

            {tab === 0 && (
                <>
                    <Stack direction="row" spacing={1} sx={{ p: 0.75, alignItems: 'center' }}>
                        <TextField select size="small" value={level} sx={{ width: 110 }}
                                   onChange={(e) => setLevel(e.target.value as LogLevel)}>
                            {LOG_LEVELS.map((name) => (
                                <MenuItem key={name} value={name} sx={{ fontSize: 12 }}>{name}</MenuItem>
                            ))}
                        </TextField>
                        <Paper variant="outlined" sx={{ flex: 1, px: 1 }}>
                            <InputBase fullWidth placeholder="Filtruj po treści albo module…"
                                       value={query} onChange={(e) => setQuery(e.target.value)}
                                       sx={{ fontSize: 12 }} />
                        </Paper>
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>
                            {visible.length}/{lines.length}
                        </Typography>
                    </Stack>

                    <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1, fontFamily: 'monospace' }}>
                        {visible.length === 0 && (
                            <Typography variant="caption" sx={{ opacity: 0.6 }}>
                                {lines.length === 0 ? 'Brak połączenia z urządzeniem.'
                                                    : 'Nic nie pasuje do filtru.'}
                            </Typography>
                        )}
                        {visible.map((line, index) => (
                            <Box key={index} sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45,
                                                   color: LEVEL_COLORS[line.level ?? ''] ?? '#cbd5e1' }}>
                                {line.module && (
                                    <span style={{ opacity: 0.55 }}>{line.module}&nbsp;</span>
                                )}
                                {line.text}
                            </Box>
                        ))}
                    </Box>
                </>
            )}

            {tab === 1 && (
                <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                    <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 1 }}>
                        t = {(simulationTime / 1_000_000).toFixed(3)} s — wartości wyliczone
                        z sekcji <code>simulation.sources</code>. Ten sam czas zawsze daje tę samą
                        wartość, więc przebieg da się odtworzyć.
                    </Typography>

                    {Object.keys(sources).length === 0 && (
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>
                            Projekt nie opisuje źródeł symulacji.
                        </Typography>
                    )}

                    {Object.entries(sources).map(([name, source]) => (
                        <Stack key={name} direction="row" spacing={1}
                               sx={{ alignItems: 'center', py: 0.25 }}>
                            <Typography variant="caption" sx={{ width: 120, opacity: 0.8 }}>
                                {name}
                            </Typography>
                            <Chip size="small" label={source.model} sx={{ height: 18 }} />
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {sampleSource(source, simulationTime, { seed: 1 })
                                    .map((value) => value.toFixed(2)).join('  ')}
                            </Typography>
                        </Stack>
                    ))}
                </Box>
            )}
        </Box>
    );
}
