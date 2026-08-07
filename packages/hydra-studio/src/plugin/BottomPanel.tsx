/**
 * Panel dolny: kompilacja, monitor, magistrala zdarzeń, problemy, farma.
 *
 * Zakładki odpowiadają mockupowi. Cała logika — rozbiór wierszy, filtrowanie,
 * bufory, odczyt zajętości pamięci — siedzi w rdzeniu i ma testy; tutaj jest
 * widok i sterowanie symulacją.
 */

import { useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import {
    LOG_LEVELS, SPEEDS, checkHil, filterLogs, formatUsage, hilConfigFrom,
    injectCommand, parseCompilerMessages, sampleSource, sourcesFrom, topicsSeen,
    type BuildSummary, type BusEvent, type Diagnostic, type LogLevel, type LogLine,
    type Speed,
} from '../model';

export interface BottomPanelProps {
    lines: readonly LogLine[];
    events: readonly BusEvent[];
    droppedLines?: number | undefined;
    /** Model pliku projektu. */
    model?: unknown;
    /** Zgłoszenia walidatora i reguł elektrycznych. */
    diagnostics?: readonly Diagnostic[] | undefined;
    /** Surowe wyjście ostatniej budowy. */
    buildOutput?: string | undefined;
    buildSummary?: BuildSummary | undefined;
    /** Stan zegara symulacji. */
    simulation?: { t_us: number; running: boolean; speed: Speed; skipped: number } | undefined;
    onSimulation?: ((action: 'start' | 'stop' | 'reset' | 'record', speed?: Speed) => void) | undefined;
    /** Wysłanie polecenia do urządzenia — tą samą drogą co polecenia shella. */
    onCommand?: ((command: string) => void) | undefined;
    onRunSuite?: ((suite: string) => void) | undefined;
}

const LEVEL_COLORS: Record<string, string> = {
    trace: '#64748b', debug: '#94a3b8', info: '#e2e8f0', warn: '#d97706', error: '#dc2626',
};

export function BottomPanel(props: BottomPanelProps) {
    const [tab, setTab] = useState(0);
    const problems = props.diagnostics ?? [];
    const compiler = useMemo(() => parseCompilerMessages(props.buildOutput ?? ''),
                             [props.buildOutput]);

    const tabs = [
        { label: 'Kompilacja', badge: compiler.filter((m) => m.severity === 'error').length },
        { label: 'Monitor', badge: 0 },
        { label: 'EventBus', badge: 0 },
        { label: 'Problemy', badge: problems.filter((d) => d.severity === 'error').length },
        { label: 'Symulacja', badge: 0 },
        { label: 'Farma', badge: 0 },
    ];

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 12 }}>
            <Stack direction="row" sx={{ alignItems: 'center', px: 1, borderBottom: 1,
                                         borderColor: 'divider' }}>
                <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ minHeight: 34 }}
                      variant="scrollable">
                    {tabs.map((entry) => (
                        <Tab key={entry.label} sx={{ minHeight: 34, py: 0 }}
                             label={
                                 <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                                     <span>{entry.label}</span>
                                     {entry.badge > 0 && (
                                         <Chip size="small" color="error" label={entry.badge}
                                               sx={{ height: 15, fontSize: 10 }} />
                                     )}
                                 </Stack>
                             } />
                    ))}
                </Tabs>
                <Box sx={{ flex: 1 }} />
                {props.buildSummary && (
                    <Stack direction="row" spacing={1}>
                        <Chip size="small" sx={{ height: 18 }}
                              label={formatUsage('Flash', props.buildSummary.flash)} />
                        <Chip size="small" sx={{ height: 18 }}
                              label={formatUsage('RAM', props.buildSummary.ram)} />
                    </Stack>
                )}
            </Stack>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {tab === 0 && <BuildTab output={props.buildOutput} summary={props.buildSummary} />}
                {tab === 1 && <MonitorTab lines={props.lines} dropped={props.droppedLines ?? 0} />}
                {tab === 2 && <EventsTab events={props.events} onCommand={props.onCommand} />}
                {tab === 3 && <ProblemsTab diagnostics={problems} compiler={compiler} />}
                {tab === 4 && <SimulationTab model={props.model} simulation={props.simulation}
                                             onSimulation={props.onSimulation} />}
                {tab === 5 && <HilTab model={props.model} onRunSuite={props.onRunSuite} />}
            </Box>
        </Box>
    );
}

function BuildTab({ output, summary }: {
    output?: string | undefined;
    summary?: BuildSummary | undefined;
}) {
    if (!output) {
        return <Empty text="Nie uruchomiono jeszcze budowy." />;
    }
    return (
        <Box sx={{ height: '100%', overflowY: 'auto', p: 1, fontFamily: 'monospace',
                   whiteSpace: 'pre-wrap', fontSize: 11 }}>
            {summary && (
                <Alert severity={summary.ok ? 'success' : 'error'} variant="outlined"
                       sx={{ mb: 1, py: 0 }}>
                    <Typography variant="caption">
                        {summary.ok ? 'Budowa zakończona' : 'Budowa nieudana'}
                        {summary.environment ? ` — ${summary.environment}` : ''}
                        {summary.durationMs ? ` (${(summary.durationMs / 1000).toFixed(1)} s)` : ''}
                    </Typography>
                </Alert>
            )}
            {output}
        </Box>
    );
}

function MonitorTab({ lines, dropped }: { lines: readonly LogLine[]; dropped: number }) {
    const [level, setLevel] = useState<LogLevel>('trace');
    const [query, setQuery] = useState('');
    const visible = useMemo(() => filterLogs(lines, { minLevel: level, query }),
                            [lines, level, query]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" spacing={1} sx={{ p: 0.75, alignItems: 'center' }}>
                <TextField select size="small" value={level} sx={{ width: 100 }}
                           onChange={(e) => setLevel(e.target.value as LogLevel)}>
                    {LOG_LEVELS.map((name) => (
                        <MenuItem key={name} value={name} sx={{ fontSize: 12 }}>{name}</MenuItem>
                    ))}
                </TextField>
                <Paper variant="outlined" sx={{ flex: 1, px: 1 }}>
                    <InputBase fullWidth placeholder="Filtruj po treści albo module…" value={query}
                               onChange={(e) => setQuery(e.target.value)} sx={{ fontSize: 12 }} />
                </Paper>
                <Typography variant="caption" sx={{ opacity: 0.6 }}>
                    {visible.length}/{lines.length}
                </Typography>
                {/* „Widzę 500 wierszy" musi dać się odróżnić od „widzę wszystkie". */}
                {dropped > 0 && (
                    <Chip size="small" color="warning" sx={{ height: 18 }}
                          label={`pominięto ${dropped}`} />
                )}
            </Stack>
            <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1, fontFamily: 'monospace' }}>
                {visible.length === 0 && <Empty text="Brak połączenia z urządzeniem." />}
                {visible.map((line, index) => (
                    <Box key={index} sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.45,
                                           color: LEVEL_COLORS[line.level ?? ''] ?? '#cbd5e1' }}>
                        {line.module && <span style={{ opacity: 0.55 }}>{line.module}&nbsp;</span>}
                        {line.text}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function EventsTab({ events, onCommand }: {
    events: readonly BusEvent[];
    onCommand?: ((command: string) => void) | undefined;
}) {
    const [topic, setTopic] = useState('');
    const [payload, setPayload] = useState('');

    const values = payload.split(/\s+/).map(Number).filter((v) => Number.isFinite(v));
    const command = injectCommand(topic, values);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" spacing={1} sx={{ p: 0.75, alignItems: 'center' }}>
                <TextField select={topicsSeen(events).length > 0} size="small" value={topic}
                           label="temat" sx={{ width: 200 }}
                           onChange={(e) => setTopic(e.target.value)}>
                    {topicsSeen(events).map((name) => (
                        <MenuItem key={name} value={name} sx={{ fontSize: 12 }}>{name}</MenuItem>
                    ))}
                </TextField>
                <TextField size="small" value={payload} label="wartości" sx={{ width: 160 }}
                           onChange={(e) => setPayload(e.target.value)} />
                {/* Wstrzyknięcie idzie tą samą drogą co polecenia shella — nie ma
                    osobnego kanału, który działałby na stanowisku, a nie w terenie. */}
                <Button size="small" disabled={!command || !onCommand}
                        onClick={() => command && onCommand?.(command)}>
                    Wstrzyknij
                </Button>
                {topic !== '' && !command && (
                    <Typography variant="caption" color="error">
                        temat nie może zawierać spacji
                    </Typography>
                )}
            </Stack>

            <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1, fontFamily: 'monospace' }}>
                {events.length === 0 && <Empty text="Urządzenie nie wysłało jeszcze zdarzeń." />}
                {events.map((event, index) => (
                    <Box key={index} sx={{ display: 'flex', gap: 1, lineHeight: 1.5 }}>
                        <span style={{ opacity: 0.5, width: 64 }}>
                            {(event.at % 100000) / 1000}s
                        </span>
                        <span style={{ color: '#93c5fd', minWidth: 140 }}>{event.topic}</span>
                        <span>{event.payload}</span>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function ProblemsTab({ diagnostics, compiler }: {
    diagnostics: readonly Diagnostic[];
    compiler: readonly { file: string; line: number; severity: string; text: string }[];
}) {
    if (diagnostics.length === 0 && compiler.length === 0) {
        return <Empty text="Bez zastrzeżeń." />;
    }
    return (
        <Box sx={{ height: '100%', overflowY: 'auto', p: 0.75 }}>
            {diagnostics.map((d, index) => (
                <Alert key={`d${index}`} variant="outlined" sx={{ py: 0, mb: 0.5 }}
                       severity={d.severity === 'error' ? 'error'
                                 : d.severity === 'warning' ? 'warning' : 'info'}>
                    <Typography variant="caption" component="div">
                        <strong>{d.path}</strong> — {d.message}
                    </Typography>
                    {d.hint && (
                        <Typography variant="caption" component="div" sx={{ opacity: 0.75 }}>
                            → {d.hint}
                        </Typography>
                    )}
                </Alert>
            ))}
            {compiler.map((message, index) => (
                <Alert key={`c${index}`} variant="outlined" sx={{ py: 0, mb: 0.5 }}
                       severity={message.severity === 'error' ? 'error' : 'warning'}>
                    <Typography variant="caption">
                        <strong>{message.file}:{message.line}</strong> — {message.text}
                    </Typography>
                </Alert>
            ))}
        </Box>
    );
}

function SimulationTab({ model, simulation, onSimulation }: {
    model?: unknown;
    simulation?: BottomPanelProps['simulation'] | undefined;
    onSimulation?: BottomPanelProps['onSimulation'] | undefined;
}) {
    const sources = useMemo(() => sourcesFrom(model), [model]);
    const t = simulation?.t_us ?? 0;

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', p: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                <Button size="small" variant="outlined"
                        onClick={() => onSimulation?.(simulation?.running ? 'stop' : 'start')}>
                    {simulation?.running ? 'Zatrzymaj' : 'Uruchom'}
                </Button>
                <Button size="small" onClick={() => onSimulation?.('reset')}>Od nowa</Button>

                <ToggleButtonGroup size="small" exclusive value={simulation?.speed ?? 1}
                                   onChange={(_, speed: Speed | null) =>
                                       speed && onSimulation?.('start', speed)}>
                    {SPEEDS.map((speed) => (
                        <ToggleButton key={speed} value={speed} sx={{ px: 1, py: 0, fontSize: 11 }}>
                            {speed}×
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>

                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    t = {(t / 1_000_000).toFixed(3)} s
                </Typography>
                <Button size="small" onClick={() => onSimulation?.('record')}>Zapisz VCD</Button>

                {/* Pominięte kroki znaczą, że karta była uśpiona — bez tej
                    informacji przebieg wyglądałby na ciągły, a nie jest. */}
                {(simulation?.skipped ?? 0) > 0 && (
                    <Chip size="small" color="warning" sx={{ height: 18 }}
                          label={`pominięto ${simulation!.skipped} kroków`} />
                )}
            </Stack>

            {Object.keys(sources).length === 0 && (
                <Empty text="Projekt nie opisuje źródeł symulacji (sekcja simulation.sources)." />
            )}
            {Object.entries(sources).map(([name, source]) => (
                <Stack key={name} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25 }}>
                    <Typography variant="caption" sx={{ width: 130, opacity: 0.8 }}>{name}</Typography>
                    <Chip size="small" label={source.model} sx={{ height: 18 }} />
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {sampleSource(source, t, { seed: 1 }).map((v) => v.toFixed(2)).join('  ')}
                    </Typography>
                </Stack>
            ))}
        </Box>
    );
}

function HilTab({ model, onRunSuite }: {
    model?: unknown;
    onRunSuite?: ((suite: string) => void) | undefined;
}) {
    const config = useMemo(() => hilConfigFrom(model), [model]);
    const targets = useMemo(() => {
        const record = (model as { targets?: Record<string, unknown> } | undefined)?.targets ?? {};
        return Object.keys(record).filter((key) => key !== 'default');
    }, [model]);

    if (!config) return <Empty text="Projekt nie opisuje farmy testowej (sekcja test.hil)." />;
    const problems = checkHil(config, targets);

    return (
        <Box sx={{ height: '100%', overflowY: 'auto', p: 1 }}>
            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 1 }}>
                Runner: {config.runner ?? '—'}. Studio pokazuje konfigurację i zleca przebieg;
                testy prowadzi <code>tools/hil_run.py</code> na maszynie, która ma fizyczny
                dostęp do płytek.
            </Typography>

            {problems.map((d, index) => (
                <Alert key={index} variant="outlined" sx={{ py: 0, mb: 0.5 }}
                       severity={d.severity === 'error' ? 'error' : 'warning'}>
                    <Typography variant="caption">{d.message}</Typography>
                </Alert>
            ))}

            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mt: 1 }}>
                Stanowiska
            </Typography>
            {config.fixtures.map((fixture) => (
                <Stack key={fixture.target} direction="row" spacing={1}
                       sx={{ alignItems: 'center', py: 0.25 }}>
                    <Typography variant="caption" sx={{ width: 130 }}>{fixture.target}</Typography>
                    {fixture.probe && <Chip size="small" label={fixture.probe} sx={{ height: 18 }} />}
                    {fixture.shield && <Chip size="small" variant="outlined" label={fixture.shield}
                                             sx={{ height: 18 }} />}
                </Stack>
            ))}

            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mt: 1.5 }}>
                Zestawy
            </Typography>
            {config.suites.map((suite) => (
                <Stack key={suite.name} direction="row" spacing={1}
                       sx={{ alignItems: 'center', py: 0.25 }}>
                    <Typography variant="caption" sx={{ width: 130 }}>{suite.name}</Typography>
                    <Chip size="small" label={suite.on ?? 'ręcznie'} sx={{ height: 18 }} />
                    <Typography variant="caption" sx={{ opacity: 0.6 }}>
                        {suite.timeoutS ? `${suite.timeoutS}s` : suite.durationH ? `${suite.durationH}h` : ''}
                    </Typography>
                    <Button size="small" disabled={!onRunSuite}
                            onClick={() => onRunSuite?.(suite.name)}>Uruchom</Button>
                </Stack>
            ))}
        </Box>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <Box sx={{ p: 1.5 }}>
            <Typography variant="caption" sx={{ opacity: 0.6 }}>{text}</Typography>
        </Box>
    );
}
