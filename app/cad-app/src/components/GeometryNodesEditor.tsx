import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import AddIcon from '@mui/icons-material/Add';
import type { GeoNodeGraph, GeoNodeDef, GeoNodeType } from '@mhersztowski/core-scene3d';

// ─── Node category colours ─────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  primitive: '#1565c0',
  transform: '#1b5e20',
  merge: '#1b5e20',
  output: '#b71c1c',
};

function headerColor(type: GeoNodeType): string {
  if (['box', 'sphere', 'cylinder', 'plane', 'cone', 'torus'].includes(type)) return CAT_COLOR.primitive;
  if (type === 'transform' || type === 'merge') return CAT_COLOR.transform;
  return CAT_COLOR.output;
}

// ─── Param definitions per node type ──────────────────────────────

interface ParamDef { key: string; label: string; default: number; step?: number; min?: number }

const PARAMS: Partial<Record<GeoNodeType, ParamDef[]>> = {
  box: [
    { key: 'width', label: 'Width', default: 1, step: 0.1, min: 0.01 },
    { key: 'height', label: 'Height', default: 1, step: 0.1, min: 0.01 },
    { key: 'depth', label: 'Depth', default: 1, step: 0.1, min: 0.01 },
    { key: 'wSeg', label: 'W Segs', default: 1, step: 1, min: 1 },
    { key: 'hSeg', label: 'H Segs', default: 1, step: 1, min: 1 },
    { key: 'dSeg', label: 'D Segs', default: 1, step: 1, min: 1 },
  ],
  sphere: [
    { key: 'radius', label: 'Radius', default: 1, step: 0.1, min: 0.01 },
    { key: 'wSeg', label: 'W Segs', default: 32, step: 1, min: 3 },
    { key: 'hSeg', label: 'H Segs', default: 16, step: 1, min: 2 },
  ],
  cylinder: [
    { key: 'radiusTop', label: 'Radius Top', default: 1, step: 0.1, min: 0 },
    { key: 'radiusBottom', label: 'Radius Bot', default: 1, step: 0.1, min: 0 },
    { key: 'height', label: 'Height', default: 2, step: 0.1, min: 0.01 },
    { key: 'rSeg', label: 'R Segs', default: 32, step: 1, min: 3 },
  ],
  plane: [
    { key: 'width', label: 'Width', default: 1, step: 0.1, min: 0.01 },
    { key: 'height', label: 'Height', default: 1, step: 0.1, min: 0.01 },
    { key: 'wSeg', label: 'W Segs', default: 1, step: 1, min: 1 },
    { key: 'hSeg', label: 'H Segs', default: 1, step: 1, min: 1 },
  ],
  cone: [
    { key: 'radius', label: 'Radius', default: 1, step: 0.1, min: 0.01 },
    { key: 'height', label: 'Height', default: 2, step: 0.1, min: 0.01 },
    { key: 'rSeg', label: 'R Segs', default: 32, step: 1, min: 3 },
  ],
  torus: [
    { key: 'radius', label: 'Radius', default: 1, step: 0.1, min: 0.01 },
    { key: 'tube', label: 'Tube', default: 0.4, step: 0.05, min: 0.01 },
    { key: 'rSeg', label: 'R Segs', default: 16, step: 1, min: 3 },
    { key: 'tSeg', label: 'T Segs', default: 100, step: 1, min: 3 },
  ],
  transform: [
    { key: 'tx', label: 'X', default: 0, step: 0.1 },
    { key: 'ty', label: 'Y', default: 0, step: 0.1 },
    { key: 'tz', label: 'Z', default: 0, step: 0.1 },
    { key: 'rx', label: 'Rot X', default: 0, step: 0.1 },
    { key: 'ry', label: 'Rot Y', default: 0, step: 0.1 },
    { key: 'rz', label: 'Rot Z', default: 0, step: 0.1 },
    { key: 'sx', label: 'Scale X', default: 1, step: 0.1, min: 0.001 },
    { key: 'sy', label: 'Scale Y', default: 1, step: 0.1, min: 0.001 },
    { key: 'sz', label: 'Scale Z', default: 1, step: 0.1, min: 0.001 },
  ],
};

const NODE_LABELS: Record<GeoNodeType, string> = {
  box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder', plane: 'Plane', cone: 'Cone', torus: 'Torus',
  transform: 'Transform', merge: 'Merge', output: 'Output',
};

// ─── ReactFlow custom node component ──────────────────────────────

type GeoFlowNodeData = { geoDef: GeoNodeDef; onParamChange: (id: string, key: string, val: number) => void };

function GeoFlowNode({ data }: NodeProps) {
  const { geoDef, onParamChange } = data as GeoFlowNodeData;
  const { type, params } = geoDef;
  const paramDefs = PARAMS[type] ?? [];
  const hasSingleInput = ['transform', 'output'].includes(type);
  const isOutput = type === 'output';
  const isMerge = type === 'merge';

  return (
    <Box
      sx={{
        minWidth: 180,
        background: '#1e1e1e',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header */}
      <Box sx={{ background: headerColor(type), px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#fff', letterSpacing: '0.04em', flexGrow: 1 }}>
          {NODE_LABELS[type]}
        </Typography>
      </Box>

      {/* Input handles */}
      {hasSingleInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="geo-in"
          style={{ top: '50%', background: '#4fc3f7', width: 10, height: 10, border: '2px solid #1e1e1e' }}
        />
      )}
      {isMerge && (
        <>
          <Handle type="target" position={Position.Left} id="geo-in-0" style={{ top: '30%', background: '#4fc3f7', width: 10, height: 10, border: '2px solid #1e1e1e' }} />
          <Handle type="target" position={Position.Left} id="geo-in-1" style={{ top: '50%', background: '#4fc3f7', width: 10, height: 10, border: '2px solid #1e1e1e' }} />
          <Handle type="target" position={Position.Left} id="geo-in-2" style={{ top: '70%', background: '#4fc3f7', width: 10, height: 10, border: '2px solid #1e1e1e' }} />
        </>
      )}

      {/* Body — params */}
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {paramDefs.map((pd) => (
          <Box key={pd.key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', width: 56, flexShrink: 0 }}>{pd.label}</Typography>
            <TextField
              size="small"
              type="number"
              value={params[pd.key] ?? pd.default}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onParamChange(geoDef.id, pd.key, v);
              }}
              inputProps={{ step: pd.step ?? 1, min: pd.min }}
              sx={{
                flex: 1,
                '& .MuiInputBase-input': { fontSize: '0.65rem', px: 0.75, py: 0.4, textAlign: 'right' },
                '& .MuiOutlinedInput-root': { borderRadius: 0.5 },
              }}
            />
          </Box>
        ))}
        {type === 'merge' && (
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>Connects up to 3 inputs</Typography>
        )}
        {type === 'output' && paramDefs.length === 0 && (
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic' }}>Scene output</Typography>
        )}
      </Box>

      {/* Output handle */}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="geo-out"
          style={{ top: '50%', background: '#a5d6a7', width: 10, height: 10, border: '2px solid #1e1e1e' }}
        />
      )}
    </Box>
  );
}

const nodeTypes = { geoNode: GeoFlowNode };

// ─── Conversion: GeoNodeGraph ↔ ReactFlow nodes/edges ─────────────

function toFlowNodes(graph: GeoNodeGraph, onParamChange: GeoFlowNodeData['onParamChange']): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: 'geoNode',
    position: { x: n.x, y: n.y },
    data: { geoDef: n, onParamChange } as GeoFlowNodeData,
  }));
}

function toFlowEdges(graph: GeoNodeGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle,
    target: e.target,
    targetHandle: e.targetHandle,
    style: { stroke: '#4fc3f7', strokeWidth: 2 },
    animated: false,
  }));
}

function fromFlowNodes(flowNodes: Node[], graph: GeoNodeGraph): GeoNodeDef[] {
  return flowNodes.map((fn) => {
    const existing = graph.nodes.find((n) => n.id === fn.id);
    return existing
      ? { ...existing, x: fn.position.x, y: fn.position.y }
      : { id: fn.id, type: (fn.data as GeoFlowNodeData).geoDef.type, x: fn.position.x, y: fn.position.y, params: {} };
  });
}

// ─── Add-node menu options ─────────────────────────────────────────

const ADD_MENU: { type: GeoNodeType; label: string; group: string }[] = [
  { type: 'box', label: 'Box', group: 'Primitives' },
  { type: 'sphere', label: 'Sphere', group: 'Primitives' },
  { type: 'cylinder', label: 'Cylinder', group: 'Primitives' },
  { type: 'plane', label: 'Plane', group: 'Primitives' },
  { type: 'cone', label: 'Cone', group: 'Primitives' },
  { type: 'torus', label: 'Torus', group: 'Primitives' },
  { type: 'transform', label: 'Transform', group: 'Operations' },
  { type: 'merge', label: 'Merge', group: 'Operations' },
];

let _uid = 0;
function uid() { return `n${++_uid}_${Date.now()}`; }

// ─── Main component ────────────────────────────────────────────────

interface GeometryNodesEditorProps {
  graph: GeoNodeGraph;
  onChange: (graph: GeoNodeGraph) => void;
}

export function GeometryNodesEditor({ graph, onChange }: GeometryNodesEditorProps) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleParamChange = useCallback(
    (nodeId: string, key: string, val: number) => {
      const updated: GeoNodeGraph = {
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === nodeId ? { ...n, params: { ...n.params, [key]: val } } : n,
        ),
      };
      onChange(updated);
    },
    [graph, onChange],
  );

  const flowNodes = useMemo(() => toFlowNodes(graph, handleParamChange), [graph, handleParamChange]);
  const flowEdges = useMemo(() => toFlowEdges(graph), [graph]);

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, flowNodes);
      // Only propagate position/remove changes back; data changes are handled separately
      const hasMeaningful = changes.some((c) => c.type === 'position' || c.type === 'remove');
      if (!hasMeaningful) return;
      const newNodes = fromFlowNodes(updated, graph);
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id));
      onChange({
        nodes: newNodes.filter((n) => !removedIds.has(n.id)),
        edges: graph.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
      });
    },
    [flowNodes, graph, onChange],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updated = applyEdgeChanges(changes, flowEdges);
      onChange({
        ...graph,
        edges: updated.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle ?? 'geo-out',
          target: e.target,
          targetHandle: e.targetHandle ?? 'geo-in',
        })),
      });
    },
    [flowEdges, graph, onChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        ...connection,
        id: `e${uid()}`,
        style: { stroke: '#4fc3f7', strokeWidth: 2 },
      } as Edge;
      const updated = addEdge(newEdge, flowEdges);
      onChange({
        ...graph,
        edges: updated.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle ?? 'geo-out',
          target: e.target,
          targetHandle: e.targetHandle ?? 'geo-in',
        })),
      });
    },
    [flowEdges, graph, onChange],
  );

  const handleAddNode = useCallback(
    (type: GeoNodeType) => {
      setAnchorEl(null);
      const defaultParams: Record<string, number> = {};
      (PARAMS[type] ?? []).forEach((p) => { defaultParams[p.key] = p.default; });
      const newNode: GeoNodeDef = {
        id: uid(),
        type,
        x: 200 + Math.random() * 100,
        y: 100 + Math.random() * 100,
        params: defaultParams,
      };
      onChange({ ...graph, nodes: [...graph.nodes, newNode] });
    },
    [graph, onChange],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof ADD_MENU>();
    ADD_MENU.forEach((item) => {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    });
    return [...map.entries()];
  }, []);

  return (
    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#141414' }}>
      {/* Toolbar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1a1a1a' }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'text.secondary', mr: 'auto', letterSpacing: '0.05em' }}>
          GEOMETRY NODES
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{ fontSize: '0.7rem', textTransform: 'none', color: 'primary.main', minWidth: 0, px: 1 }}
        >
          Add Node
        </Button>
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
          slotProps={{ paper: { sx: { background: '#252526', border: '1px solid rgba(255,255,255,0.12)', minWidth: 160 } } }}>
          {groups.map(([group, items]) => [
            <MenuItem key={`${group}-header`} disabled sx={{ fontSize: '0.65rem', color: 'text.disabled', opacity: '1 !important', py: 0.25 }}>
              {group}
            </MenuItem>,
            ...items.map((item) => (
              <MenuItem key={item.type} onClick={() => handleAddNode(item.type)}
                sx={{ fontSize: '0.72rem', py: 0.5, pl: 2, '&:hover': { background: 'rgba(79,195,247,0.08)' } }}>
                {item.label}
              </MenuItem>
            )),
          ])}
        </Menu>
        <IconButton size="small" sx={{ fontSize: '0.6rem', color: 'text.disabled', ml: 0.5 }}
          title="Delete selected node with the Delete key on keyboard"
          disabled>
          DEL
        </IconButton>
      </Box>

      {/* ReactFlow canvas */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          fitView
          deleteKeyCode="Delete"
          colorMode="dark"
          style={{ background: '#141414' }}
        >
          <Background color="#333" gap={20} />
          <Controls style={{ background: '#252526', border: '1px solid rgba(255,255,255,0.12)' }} />
          <MiniMap
            nodeColor={(n) => headerColor((n.data as GeoFlowNodeData).geoDef.type)}
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)' }}
          />
        </ReactFlow>
      </Box>
    </Box>
  );
}
