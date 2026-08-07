/**
 * Płótno schematu.
 *
 * Rysuje to, co wyliczyła warstwa układu (`layoutSchematic`) — sam widok nie
 * podejmuje żadnych decyzji o rozmieszczeniu ani o tym, co z czym jest
 * połączone. Dzięki temu logika ma testy, a komponent zostaje tym, czym
 * powinien być: rysunkiem.
 *
 * Przesunięcie symbolu zapisuje nowe położenie do pliku — jednym przedziałem
 * tekstu, jak każda inna zmiana. Reszta schematu zostaje nietknięta, więc
 * historia zmian pokazuje „przesunięto U2", a nie przebudowany plik.
 */

import { useCallback, useMemo } from 'react';

import {
    Background, Controls, MiniMap, ReactFlow,
    type Edge, type Node, type NodeChange,
} from '@xyflow/react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
    checkSchematic, layoutSchematic,
    type ComponentDefinition, type Diagnostic, type LayoutNode, type Schematic,
} from '../model';

export interface SchematicCanvasProps {
    schematic: Schematic;
    definitions: Readonly<Record<string, ComponentDefinition>>;
    /** Magistrale z zadeklarowanym podciągnięciem — wycisza część ostrzeżeń. */
    externalPullups?: readonly string[];
    /** Zapis nowego położenia symbolu; `false` oznacza nieudany zapis. */
    onMove?(reference: string, x: number, y: number): boolean;
    /** Kliknięcie w symbol — Studio pokazuje wtedy jego konfigurację. */
    onSelect?(reference: string): void;
}

/** Kolory klas sieci — masa i zasilanie odróżniają się od sygnałów. */
const NET_COLORS: Record<string, string> = {
    ground: '#6b7280',
    power: '#dc2626',
    bus: '#2563eb',
    analog: '#7c3aed',
};

/** Ten sam przelicznik co w warstwie układu: położenia w pliku są w milimetrach. */
const SCALE = 4;

export function SchematicCanvas({
    schematic, definitions, externalPullups, onMove, onSelect,
}: SchematicCanvasProps) {
    const layout = useMemo(() => layoutSchematic(schematic, { definitions, scale: SCALE }),
                           [schematic, definitions]);

    const erc = useMemo(() => checkSchematic(schematic, {
        definitions,
        ...(externalPullups ? { externalPullups } : {}),
    }), [schematic, definitions, externalPullups]);

    /** Zgłoszenia przypisane do symboli — obwódka na tych, których dotyczą. */
    const troubled = useMemo(() => {
        const map = new Map<string, Diagnostic[]>();
        for (const d of erc) {
            const match = /^(components|nets)\.(.+)$/.exec(d.path);
            if (!match) continue;
            const key = match[1] === 'nets' ? `net:${match[2]}` : match[2]!;
            map.set(key, [...(map.get(key) ?? []), d]);
        }
        return map;
    }, [erc]);

    const nodes: Node[] = useMemo(() => layout.nodes.map((node) => {
        const problems = troubled.get(node.id) ?? [];
        const severity = problems.some((p) => p.severity === 'error') ? 'error'
                       : problems.length > 0 ? 'warning' : undefined;

        return {
            id: node.id,
            position: { x: node.x, y: node.y },
            data: { label: renderNode(node, severity, problems) },
            style: node.kind === 'net'
                ? {
                      background: 'transparent',
                      border: `1px dashed ${NET_COLORS[node.netClass ?? ''] ?? '#94a3b8'}`,
                      borderRadius: 12, padding: '2px 8px', fontSize: 11,
                  }
                : {
                      border: `1px solid ${severity === 'error' ? '#dc2626'
                                          : severity === 'warning' ? '#d97706' : '#475569'}`,
                      borderRadius: 6, padding: 6, minWidth: 130, fontSize: 11,
                  },
            // Sieci nie mają położenia w pliku, więc ich przeciąganie niczego
            // by nie zapisało — lepiej nie kusić.
            draggable: node.kind === 'component',
        };
    }), [layout.nodes, troubled]);

    const edges: Edge[] = useMemo(() => layout.edges.map((edge) => {
        const net = layout.nodes.find((n) => n.id === edge.to);
        return {
            id: edge.id,
            source: edge.from,
            target: edge.to,
            label: edge.label,
            style: { stroke: NET_COLORS[net?.netClass ?? ''] ?? '#94a3b8', strokeWidth: 1.2 },
            labelStyle: { fontSize: 9, fill: '#94a3b8' },
        };
    }), [layout.edges, layout.nodes]);

    const handleChanges = useCallback((changes: NodeChange[]) => {
        if (!onMove) return;
        for (const change of changes) {
            // Zapisujemy dopiero po puszczeniu symbolu: zapis przy każdej
            // klatce przeciągania zasypałby historię zmian.
            if (change.type !== 'position' || change.dragging !== false) continue;
            const node = layout.nodes.find((n) => n.id === change.id);
            if (!node || node.kind !== 'component' || !change.position) continue;
            onMove(change.id, Math.round(change.position.x / SCALE),
                   Math.round(change.position.y / SCALE));
        }
    }, [layout.nodes, onMove]);

    const errors = erc.filter((d) => d.severity === 'error').length;
    const warnings = erc.length - errors;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Stack direction="row" spacing={1}
                   sx={{ px: 1, py: 0.5, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="caption">{schematic.sheet?.name ?? 'schemat'}</Typography>
                <Chip size="small" sx={{ height: 18 }}
                      label={`${Object.keys(schematic.components).length} układów`} />
                <Chip size="small" sx={{ height: 18 }}
                      label={`${Object.keys(schematic.nets).length} sieci`} />
                <Box sx={{ flex: 1 }} />
                <Tooltip title={erc.map((d) => `${d.path}: ${d.message}`).join('\n') || 'bez zastrzeżeń'}>
                    <Chip size="small" sx={{ height: 18 }}
                          color={errors > 0 ? 'error' : warnings > 0 ? 'warning' : 'success'}
                          label={errors > 0 ? `ERC: ${errors} ✗`
                                 : warnings > 0 ? `ERC: ${warnings} ⚠` : 'ERC ✓'} />
                </Tooltip>
            </Stack>

            <Box sx={{ flex: 1, minHeight: 0 }}>
                <ReactFlow nodes={nodes} edges={edges} fitView
                           onNodesChange={handleChanges}
                           onNodeClick={(_, node) => {
                               if (!node.id.startsWith('net:')) onSelect?.(node.id);
                           }}>
                    <Background gap={16} />
                    <Controls showInteractive={false} />
                    <MiniMap pannable zoomable />
                </ReactFlow>
            </Box>
        </Box>
    );
}

function renderNode(node: LayoutNode, severity: string | undefined,
                    problems: readonly Diagnostic[]) {
    const mark = severity === 'error' ? ' ✗' : severity ? ' ⚠' : '';
    const title = problems.map((p) => `${p.message}${p.hint ? `\n→ ${p.hint}` : ''}`).join('\n\n');

    if (node.kind === 'net') {
        return (
            <Tooltip title={title} disableHoverListener={problems.length === 0}>
                <span>{node.label}{mark}</span>
            </Tooltip>
        );
    }

    const left = node.ports?.filter((p) => p.side === 'left').map((p) => p.name) ?? [];
    const right = node.ports?.filter((p) => p.side === 'right').map((p) => p.name) ?? [];

    return (
        <Tooltip title={title} disableHoverListener={problems.length === 0}>
            <Box sx={{ textAlign: 'left' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                    {node.label}{mark}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', fontSize: 9 }}>
                    {node.sublabel}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, fontSize: 9, opacity: 0.75 }}>
                    <span>{left.join(' · ')}</span>
                    <Box sx={{ flex: 1 }} />
                    <span>{right.join(' · ')}</span>
                </Stack>
            </Box>
        </Tooltip>
    );
}
