/**
 * Hydra Studio — widok projektu w zakładce edytora.
 *
 * Świadomie **nie** rysuje własnego paska menu, paska narzędzi, paska
 * aktywności ani paska stanu. Edytor już je ma, użytkownik zna ich zachowanie,
 * a drugi komplet obok oznaczałby dwa paski stanu jeden nad drugim i dwa
 * miejsca, w których szuka się przycisku „Buduj".
 *
 * Wszystko, co w projekcie interfejsu jest chromem, trafia do slotów
 * gospodarza — pasek narzędzi, pasek stanu, panele boczne, paleta poleceń.
 * Tutaj zostaje to, czego edytor nie ma: widok projektu, inspektor i płótno
 * schematu. Poza zasięgiem Studia są tylko „Plik" i „Edycja", bo dotyczą
 * pliku i edycji, a nie projektu.
 */

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
    HydraDocument, buildPlan, validate,
    type ComponentDefinition, type PackManifest, type PathSegment, type Schematic,
} from '../model';

import { HydraStudioPanel } from './HydraStudioPanel';
import { SchematicCanvas } from './SchematicCanvas';

export interface HydraStudioIdeProps {
    source: string;
    fileName?: string | undefined;
    onEdit(path: PathSegment[], value: string | number | boolean): boolean;

    packs?: readonly PackManifest[];
    definitions?: Readonly<Record<string, ComponentDefinition>> | undefined;
    schematic?: Schematic | undefined;
    configSchemas?: Readonly<Record<string, unknown>> | undefined;

    /** Cel wybrany na pasku narzędzi gospodarza. */
    target?: string | undefined;

    /** Wiersze wyniku budowania lub monitora portu — dostarcza je host. */
    log?: readonly string[] | undefined;
}

type CenterTab = 'project' | 'schematic';
type BottomTab = 'build' | 'monitor' | 'problems';

/**
 * Ciemny motyw dla wnętrza zakładki.
 *
 * Chrom edytora jest ciemny na stałe, ale komponenty MUI dostają domyślny
 * motyw jasny — i renderują niemal czarny tekst na ciemnym tle, przez co
 * formularz jest nieczytelny. Motyw musi więc jawnie zgadzać się z otoczeniem;
 * kolory dobrane pod paletę edytora, nie pod domyślną paletę MUI.
 */
const studioTheme = createTheme({
    palette: {
        mode: 'dark',
        background: { paper: '#1e1e1e', default: '#1e1e1e' },
        text: { primary: '#cccccc', secondary: '#9d9d9d' },
        divider: '#3c3c3c',
        primary: { main: '#4daafc' },
    },
    typography: { fontSize: 13 },
});

export function HydraStudioIde(props: HydraStudioIdeProps) {
    const [tab, setTab] = useState<CenterTab>('project');
    const [bottom, setBottom] = useState<BottomTab>('build');
    const [selection, setSelection] = useState<PathSegment[]>(['project']);

    const { diagnostics, plan } = useMemo(() => {
        const doc = HydraDocument.parse(props.source);
        return { diagnostics: validate(doc), plan: buildPlan(doc.toJS()) };
    }, [props.source]);

    const targetPlan = plan.targets.find((t) => t.name === (props.target ?? plan.defaultTarget))
        ?? plan.targets[0];

    return (
        <ThemeProvider theme={studioTheme}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
                   fontSize: 13, bgcolor: 'background.default', color: 'text.primary' }}>
            <Stack direction="row" sx={{ borderBottom: 1, borderColor: 'divider', px: 0.5 }}>
                {([['project', props.fileName ?? 'projekt'],
                   ['schematic', 'schemat']] as [CenterTab, string][]).map(([id, label]) => (
                    <Button key={id} size="small"
                            disabled={id === 'schematic' && props.schematic === undefined}
                            onClick={() => setTab(id)}
                            sx={{ textTransform: 'none', fontSize: 12, py: 0.25, px: 1.5, borderRadius: 0,
                                  borderBottom: 2,
                                  borderColor: tab === id ? 'primary.main' : 'transparent',
                                  color: tab === id ? 'text.primary' : 'text.secondary' }}>
                        {label}
                    </Button>
                ))}
            </Stack>

            <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    {tab === 'project' ? (
                        <HydraStudioPanel
                            source={props.source}
                            onEdit={props.onEdit}
                            fileName={props.fileName}
                            packs={props.packs ?? []}
                            configSchemas={(props.configSchemas ?? {}) as never}
                        />
                    ) : props.schematic ? (
                        <SchematicCanvas
                            schematic={props.schematic}
                            definitions={props.definitions ?? {}}
                            onSelect={(reference) => setSelection(['hardware', 'components', reference])}
                        />
                    ) : (
                        <Empty text="Projekt nie wskazuje schematu (pole hardware.schematic)." />
                    )}
                </Box>

                {/* Inspektor — jedyny panel, którego edytor nie ma. */}
                <Box sx={{ width: 280, borderLeft: 1, borderColor: 'divider', overflowY: 'auto', p: 1 }}>
                    {targetPlan ? (
                        <>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Inspektor</Typography>

                            <Section title="Cel">
                                <Row k="nazwa" v={targetPlan.name} />
                                <Row k="układ" v={targetPlan.mcu + (targetPlan.hasFpu ? '' : '  (bez FPU — Q16.16)')} />
                                <Row k="płytka" v={targetPlan.board} />
                                {targetPlan.boardHeader && <Row k="piny" v={targetPlan.boardHeader} />}
                            </Section>

                            <Section title="Moduły">
                                {targetPlan.modules.length === 0
                                    ? <Row k="—" v="tylko rdzeń" />
                                    : targetPlan.modules.map((m) => <Row key={m} k={m} v="włączony" />)}
                            </Section>

                            <Section title={`Możliwości  [${targetPlan.capabilitiesDeclared ? 'z pliku' : 'z profilu układu'}]`}>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4 }}>
                                    {targetPlan.capabilities.map((c) => (
                                        <Chip key={c} size="small" label={c} sx={{ height: 17, fontSize: 10 }} />
                                    ))}
                                </Box>
                            </Section>

                            <Section title="Generowane pliki">
                                <Row k="platformio.ini" v={`[env:${targetPlan.name}]`} />
                                <Row k="CMakeLists.txt" v={`HYDRA_TARGET=${targetPlan.name}`} />
                                {targetPlan.boardHeader && <Row k="nagłówek" v={targetPlan.boardHeader} />}
                            </Section>

                            {(() => {
                                const own = diagnostics.filter((d) => d.path.startsWith(selection.join('.')));
                                return own.length === 0 ? null : (
                                    <Section title="Zgłoszenia dla zaznaczenia">
                                        {own.slice(0, 5).map((d, i) => (
                                            <Typography key={i} variant="caption" sx={{ display: 'block', opacity: 0.8 }}>
                                                {d.severity === 'error' ? '✗' : '⚠'} {d.message}
                                            </Typography>
                                        ))}
                                    </Section>
                                );
                            })()}

                            <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', mt: 1 }}>
                                {plan.projectName} {plan.projectVersion}
                            </Typography>
                        </>
                    ) : (
                        <Empty text="Plik projektu nie definiuje żadnego celu." />
                    )}
                </Box>
            </Box>

            {/* Panel dolny: wynik budowania, monitor portu, zgłoszenia.
                Edytor nie ma slotu na dolny panel, a bez tego nie widać ani
                przebiegu kompilacji, ani tego, co urządzenie wypisuje. */}
            <Box sx={{ height: 168, flexShrink: 0, borderTop: 1, borderColor: 'divider',
                       display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" sx={{ px: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                    {([['build', 'Kompilacja'],
                       ['monitor', 'Monitor portu'],
                       ['problems', `Zgłoszenia (${diagnostics.length})`]] as [BottomTab, string][])
                        .map(([id, label]) => (
                        <Button key={id} size="small" onClick={() => setBottom(id)}
                                sx={{ textTransform: 'none', fontSize: 11, py: 0.2, px: 1.25,
                                      borderRadius: 0, minWidth: 0,
                                      borderBottom: 2,
                                      borderColor: bottom === id ? 'primary.main' : 'transparent',
                                      color: bottom === id ? 'text.primary' : 'text.secondary' }}>
                            {label}
                        </Button>
                    ))}
                </Stack>

                <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1.25, py: 0.75,
                           fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                           fontSize: 11.5, whiteSpace: 'pre-wrap' }}>
                    {bottom === 'problems' ? (
                        diagnostics.length === 0
                            ? <Typography variant="caption" sx={{ opacity: 0.6 }}>Bez zgłoszeń.</Typography>
                            : diagnostics.map((d, i) => (
                                <Box key={i} sx={{ py: 0.15,
                                                   color: d.severity === 'error' ? '#f48771' : '#cca700' }}>
                                    {d.severity === 'error' ? '✗' : '⚠'} {d.path}: {d.message}
                                </Box>
                            ))
                    ) : (props.log ?? []).length === 0 ? (
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>
                            {bottom === 'build'
                                ? 'Uruchom „Buduj" z paska narzędzi albo palety poleceń.'
                                : 'Monitor portu nieaktywny.'}
                        </Typography>
                    ) : (
                        (props.log ?? []).map((line, i) => <Box key={i}>{line}</Box>)
                    )}
                </Box>
            </Box>
        </Box>
        </ThemeProvider>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <Box sx={{ mb: 1.25 }}>
            <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mb: 0.25 }}>
                {title}
            </Typography>
            {children}
        </Box>
    );
}

function Row({ k, v }: { k: string; v?: string | undefined }) {
    return (
        <Stack direction="row" sx={{ py: 0.1 }}>
            <Typography variant="caption" sx={{ width: 96, opacity: 0.7 }}>{k}</Typography>
            <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all' }}>{v ?? '—'}</Typography>
        </Stack>
    );
}

function Empty({ text }: { text: string }) {
    return (
        <Box sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ opacity: 0.6 }}>{text}</Typography>
        </Box>
    );
}
