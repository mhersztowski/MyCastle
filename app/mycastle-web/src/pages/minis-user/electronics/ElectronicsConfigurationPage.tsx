import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Connection,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  TextField,
  Typography,
  MenuItem,
} from '@mui/material';
import {
  Wifi as WifiIcon,
  DeviceHub as DeviceHubIcon,
  WifiTethering as WifiTetheringIcon,
  Cable as CableIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { minisApi } from '../../../services/MinisApiService';
import type { MinisDeviceModel } from '@mhersztowski/core';

// ─── Data model ───────────────────────────────────────────────────────────────

type DeviceNodeType = 'wifi-device' | 'wifi-uart-bridge' | 'wifi-switch' | 'uart-device';

interface DeviceNodeData extends Record<string, unknown> {
  nodeType: DeviceNodeType;
  label: string;
  serialNumber: string;
  /** For wifi-device / wifi-uart-bridge: SSID to connect to.
   *  For wifi-switch: SSID of the network it provides. */
  wifiSsid: string;
  wifiPassword: string;
  uartBaudRate: number;
}

type DeviceNode = Node<DeviceNodeData>;

export interface IotArchitecture {
  nodes: DeviceNode[];
  edges: Edge[];
  updatedAt: number;
}

// ─── Shared node box style ────────────────────────────────────────────────────

function nodeBoxSx(bgColor: string, darkColor: string, selected?: boolean) {
  return {
    bgcolor: selected ? darkColor : bgColor,
    color: '#fff',
    borderRadius: 2,
    p: 1.5,
    minWidth: 170,
    border: '2px solid',
    borderColor: selected ? 'warning.main' : 'transparent',
    cursor: 'grab',
    userSelect: 'none' as const,
    boxShadow: selected ? 4 : 1,
  };
}

// ─── Custom node: WiFi End Device (blue) ─────────────────────────────────────

function WifiDeviceNode({ data, selected }: { data: DeviceNodeData; selected?: boolean }) {
  return (
    <Box sx={nodeBoxSx('#1976d2', '#1565c0', selected)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <WifiIcon fontSize="small" />
        <Typography variant="body2" fontWeight="bold" noWrap sx={{ maxWidth: 140 }}>
          {data.label || 'WiFi Device'}
        </Typography>
      </Box>
      {data.serialNumber && (
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          SN: {data.serialNumber}
        </Typography>
      )}
      {data.wifiSsid && (
        <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
          📶 {data.wifiSsid}
        </Typography>
      )}
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}

// ─── Custom node: WiFi/UART Bridge (purple) ───────────────────────────────────

function BridgeNode({ data, selected }: { data: DeviceNodeData; selected?: boolean }) {
  return (
    <Box sx={nodeBoxSx('#7b1fa2', '#6a1b9a', selected)}>
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <DeviceHubIcon fontSize="small" />
        <Typography variant="body2" fontWeight="bold" noWrap sx={{ maxWidth: 155 }}>
          {data.label || 'WiFi/UART Bridge'}
        </Typography>
      </Box>
      {data.serialNumber && (
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          SN: {data.serialNumber}
        </Typography>
      )}
      {data.wifiSsid && (
        <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
          📶 {data.wifiSsid}
        </Typography>
      )}
      {data.uartBaudRate > 0 && (
        <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
          UART {data.uartBaudRate} baud
        </Typography>
      )}
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}

// ─── Custom node: WiFi Switch (green) ────────────────────────────────────────

function WifiSwitchNode({ data, selected }: { data: DeviceNodeData; selected?: boolean }) {
  return (
    <Box sx={{ ...nodeBoxSx('#2e7d32', '#1b5e20', selected), minWidth: 190 }}>
      {/* All 4 sides accept connections — devices plug in from any direction */}
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Right} />
      <Handle type="target" position={Position.Bottom} />
      <Handle type="source" position={Position.Left} id="src-left" style={{ top: '70%' }} />
      <Handle type="source" position={Position.Right} id="src-right" style={{ top: '70%' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <WifiTetheringIcon fontSize="small" />
        <Typography variant="body2" fontWeight="bold" noWrap sx={{ maxWidth: 155 }}>
          {data.label || 'WiFi Switch'}
        </Typography>
      </Box>
      {data.serialNumber && (
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          SN: {data.serialNumber}
        </Typography>
      )}
      {data.wifiSsid ? (
        <Typography variant="caption" sx={{ opacity: 0.9, display: 'block', fontWeight: 'bold' }}>
          📡 {data.wifiSsid}
        </Typography>
      ) : (
        <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', fontStyle: 'italic' }}>
          no SSID set
        </Typography>
      )}
    </Box>
  );
}

// ─── Custom node: UART Device (orange) ───────────────────────────────────────

function UartDeviceNode({ data, selected }: { data: DeviceNodeData; selected?: boolean }) {
  return (
    <Box sx={nodeBoxSx('#e65100', '#bf360c', selected)}>
      {/* Can connect to/from any device */}
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
        <CableIcon fontSize="small" />
        <Typography variant="body2" fontWeight="bold" noWrap sx={{ maxWidth: 140 }}>
          {data.label || 'UART Device'}
        </Typography>
      </Box>
      {data.serialNumber && (
        <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
          SN: {data.serialNumber}
        </Typography>
      )}
      {data.uartBaudRate > 0 && (
        <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
          {data.uartBaudRate} baud
        </Typography>
      )}
    </Box>
  );
}

const NODE_TYPES = {
  'wifi-device':      WifiDeviceNode,
  'wifi-uart-bridge': BridgeNode,
  'wifi-switch':      WifiSwitchNode,
  'uart-device':      UartDeviceNode,
};

// ─── Config panel ─────────────────────────────────────────────────────────────

interface DeviceOption {
  label: string;  // "name (SN)" for display
  sn: string;     // actual serial number — used as the serialNumber in node data
}

interface ConfigPanelProps {
  node: DeviceNode;
  parentSwitch: DeviceNode | null;
  deviceOptions: DeviceOption[];
  onUpdate: (field: keyof DeviceNodeData, value: string | number) => void;
  onDelete: () => void;
}

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

const NODE_META: Record<DeviceNodeType, { label: string; color: string; icon: React.ReactNode }> = {
  'wifi-device':      { label: 'WiFi End Device',    color: '#1976d2', icon: <WifiIcon /> },
  'wifi-uart-bridge': { label: 'WiFi/UART Bridge',   color: '#7b1fa2', icon: <DeviceHubIcon /> },
  'wifi-switch':      { label: 'WiFi Switch',         color: '#2e7d32', icon: <WifiTetheringIcon /> },
  'uart-device':      { label: 'UART Device',         color: '#e65100', icon: <CableIcon /> },
};

function ConfigPanel({ node, parentSwitch, deviceOptions, onUpdate, onDelete }: ConfigPanelProps) {
  const { data } = node;
  const meta      = NODE_META[data.nodeType];
  const showWifi  = data.nodeType !== 'uart-device';
  const showUart  = data.nodeType === 'wifi-uart-bridge' || data.nodeType === 'uart-device';
  const isSwitch  = data.nodeType === 'wifi-switch';
  // WiFi fields are inherited (locked) when a non-switch node is connected to a switch
  const inherited = !isSwitch && parentSwitch !== null;

  return (
    <Paper
      elevation={2}
      square
      sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', p: 2, gap: 2, overflowY: 'auto', zIndex: 1 }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ color: meta.color, display: 'flex' }}>{meta.icon}</Box>
        <Typography variant="subtitle1" fontWeight="bold">{meta.label}</Typography>
        <IconButton size="small" onClick={onDelete} sx={{ ml: 'auto', color: 'error.main' }} title="Delete node">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Inherited banner */}
      {inherited && (
        <Box sx={{ bgcolor: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 1, px: 1.5, py: 0.75 }}>
          <Typography variant="caption" sx={{ color: '#2e7d32', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WifiTetheringIcon sx={{ fontSize: 14 }} />
            WiFi inherited from <strong>&nbsp;{parentSwitch!.data.label || 'WiFi Switch'}</strong>
          </Typography>
        </Box>
      )}

      <Divider />

      <TextField
        label="Label"
        value={data.label}
        onChange={(e) => onUpdate('label', e.target.value)}
        size="small"
        fullWidth
      />

      <Autocomplete
        freeSolo
        options={deviceOptions}
        getOptionLabel={(opt) => typeof opt === 'string' ? opt : opt.label}
        value={data.serialNumber}
        onChange={(_e, newValue) => {
          if (newValue && typeof newValue !== 'string') {
            onUpdate('serialNumber', newValue.sn);
          }
        }}
        onInputChange={(_e, newValue, reason) => {
          if (reason === 'input') onUpdate('serialNumber', newValue);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Serial Number"
            size="small"
            placeholder="Select device or type SN"
            helperText="Select a device (sets SN) or type SN manually"
          />
        )}
      />

      {showWifi && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
            {isSwitch ? 'Provided Network' : 'WiFi Connection'}
          </Typography>

          <TextField
            label={isSwitch ? 'Network SSID (provided)' : 'WiFi SSID'}
            value={data.wifiSsid}
            onChange={(e) => onUpdate('wifiSsid', e.target.value)}
            size="small"
            fullWidth
            disabled={inherited}
            placeholder={isSwitch ? 'SSID this switch broadcasts' : 'Network name'}
            helperText={
              isSwitch
                ? 'Connected devices inherit this SSID automatically'
                : inherited
                  ? `Inherited from "${parentSwitch!.data.label || 'WiFi Switch'}"`
                  : undefined
            }
          />

          <TextField
            label={isSwitch ? 'Network Password' : 'WiFi Password'}
            type="password"
            value={data.wifiPassword}
            onChange={(e) => onUpdate('wifiPassword', e.target.value)}
            size="small"
            fullWidth
            disabled={inherited}
            placeholder="Network password"
            autoComplete="new-password"
            helperText={inherited ? 'Inherited — change on the WiFi Switch' : undefined}
          />
        </>
      )}

      {showUart && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>UART</Typography>
          <TextField
            label="Baud Rate"
            select
            value={data.uartBaudRate || 115200}
            onChange={(e) => onUpdate('uartBaudRate', Number(e.target.value))}
            size="small"
            fullWidth
          >
            {BAUD_RATES.map((baud) => (
              <MenuItem key={baud} value={baud}>{baud}</MenuItem>
            ))}
          </TextField>
        </>
      )}

      <Box sx={{ mt: 'auto', pt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Node ID: {node.id}
        </Typography>
      </Box>
    </Paper>
  );
}

// ─── Default data per node type ───────────────────────────────────────────────

const DEFAULT_DATA: Record<DeviceNodeType, Omit<DeviceNodeData, 'nodeType'>> = {
  'wifi-device':      { label: 'WiFi Device',      serialNumber: '', wifiSsid: '', wifiPassword: '', uartBaudRate: 0 },
  'wifi-uart-bridge': { label: 'WiFi/UART Bridge', serialNumber: '', wifiSsid: '', wifiPassword: '', uartBaudRate: 115200 },
  'wifi-switch':      { label: 'WiFi Switch',       serialNumber: '', wifiSsid: '', wifiPassword: '', uartBaudRate: 0 },
  'uart-device':      { label: 'UART Device',       serialNumber: '', wifiSsid: '', wifiPassword: '', uartBaudRate: 115200 },
};

// ─── Editor (inside ReactFlowProvider) ───────────────────────────────────────

function ArchitectureEditor({ userName }: { userName: string }) {
  const [nodes, setNodes] = useState<DeviceNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
  const nodeCounter = useRef(0);
  const edgesRef = useRef<Edge[]>(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // ── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [arch, devices] = await Promise.all([
        minisApi.getIotArchitecture(userName),
        minisApi.getUserDevices(userName),
      ]);
      if (arch) {
        setNodes((arch.nodes ?? []) as unknown as DeviceNode[]);
        setEdges((arch.edges ?? []) as unknown as Edge[]);
      }
      setDeviceOptions(
        devices
          .filter((d: MinisDeviceModel) => d.sn)
          .map((d: MinisDeviceModel) => ({ label: `${d.name} (${d.sn})`, sn: d.sn }))
      );
    } catch {
      // 404 = no architecture yet, start fresh
    } finally {
      setLoading(false);
    }
  }, [userName]);

  useEffect(() => { load(); }, [load]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await minisApi.saveIotArchitecture(userName, { nodes, edges, updatedAt: Date.now() });
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [userName, nodes, edges]);

  // ── ReactFlow handlers ──────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as DeviceNode[]);
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions')) setDirty(true);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setDirty(true);
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({ ...connection, id: `e-${Date.now()}`, animated: true }, eds));

    // Propagate SSID/password from WiFi Switch to the newly connected node
    setNodes((nds) => {
      const src = nds.find((n) => n.id === connection.source);
      const tgt = nds.find((n) => n.id === connection.target);
      let sw: DeviceNode | undefined;
      let dev: DeviceNode | undefined;
      if (src?.data.nodeType === 'wifi-switch') { sw = src; dev = tgt; }
      else if (tgt?.data.nodeType === 'wifi-switch') { sw = tgt; dev = src; }
      if (!sw || !dev || dev.data.nodeType === 'wifi-switch') return nds;
      return nds.map((n) =>
        n.id === dev!.id
          ? { ...n, data: { ...n.data, wifiSsid: sw!.data.wifiSsid, wifiPassword: sw!.data.wifiPassword } }
          : n,
      );
    });

    setDirty(true);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedId(null);
  }, []);

  // ── Add node ────────────────────────────────────────────────────────────────
  const addNode = useCallback((type: DeviceNodeType) => {
    const id = `node-${Date.now()}-${++nodeCounter.current}`;
    const newNode: DeviceNode = {
      id,
      type,
      position: { x: 180 + Math.random() * 250, y: 120 + Math.random() * 200 },
      data: { nodeType: type, ...DEFAULT_DATA[type] } as DeviceNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(id);
    setDirty(true);
  }, []);

  // ── Delete selected ─────────────────────────────────────────────────────────
  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }, [selectedId]);

  // ── Update selected node data ───────────────────────────────────────────────
  const updateSelectedData = useCallback((field: keyof DeviceNodeData, value: string | number) => {
    if (!selectedId) return;
    setNodes((nds) => {
      const updated = nds.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, [field]: value } } : n,
      );
      // When SSID or password changes on a WiFi Switch, propagate to all connected nodes
      const sel = updated.find((n) => n.id === selectedId);
      if (sel?.data.nodeType === 'wifi-switch' && (field === 'wifiSsid' || field === 'wifiPassword')) {
        const currentEdges = edgesRef.current;
        const connectedIds = new Set(
          currentEdges
            .filter((e) => e.source === selectedId || e.target === selectedId)
            .map((e) => (e.source === selectedId ? e.target : e.source)),
        );
        return updated.map((n) =>
          connectedIds.has(n.id) && n.data.nodeType !== 'wifi-switch'
            ? { ...n, data: { ...n.data, [field]: value } }
            : n,
        );
      }
      return updated;
    });
    setDirty(true);
  }, [selectedId]);

  // ── Derive parent switch for selected node ────────────────────────────────
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const parentSwitch: DeviceNode | null = selectedNode
    ? (() => {
        for (const edge of edges) {
          if (edge.source === selectedId || edge.target === selectedId) {
            const otherId = edge.source === selectedId ? edge.target : edge.source;
            const other = nodes.find((n) => n.id === otherId);
            if (other?.data.nodeType === 'wifi-switch') return other;
          }
        }
        return null;
      })()
    : null;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Left palette ─────────────────────────────────────────────────── */}
      <Paper
        elevation={3}
        square
        sx={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1.5, p: 2, overflowY: 'auto', zIndex: 2 }}
      >
        <Typography variant="h6">IoT Architecture</Typography>

        {error && (
          <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        )}

        <Typography variant="overline" color="text.secondary">Add Node</Typography>

        <Button variant="outlined" startIcon={<WifiTetheringIcon />}
          onClick={() => addNode('wifi-switch')} fullWidth size="small"
          sx={{ color: '#2e7d32', borderColor: '#2e7d32', '&:hover': { borderColor: '#1b5e20', bgcolor: '#f1f8e9' } }}>
          WiFi Switch
        </Button>

        <Button variant="outlined" startIcon={<WifiIcon />}
          onClick={() => addNode('wifi-device')} fullWidth size="small" color="primary">
          WiFi End Device
        </Button>

        <Button variant="outlined" startIcon={<DeviceHubIcon />}
          onClick={() => addNode('wifi-uart-bridge')} fullWidth size="small"
          sx={{ color: '#7b1fa2', borderColor: '#7b1fa2', '&:hover': { borderColor: '#6a1b9a', bgcolor: '#f3e5f5' } }}>
          WiFi/UART Bridge
        </Button>

        <Button variant="outlined" startIcon={<CableIcon />}
          onClick={() => addNode('uart-device')} fullWidth size="small"
          sx={{ color: '#e65100', borderColor: '#e65100', '&:hover': { borderColor: '#bf360c', bgcolor: '#fff3e0' } }}>
          UART Device
        </Button>

        <Divider />

        <Button
          variant="contained" fullWidth size="small"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : dirty ? 'Save *' : 'Saved'}
        </Button>

        <Divider />

        {/* Legend */}
        <Typography variant="overline" color="text.secondary">Legend</Typography>
        {(Object.entries(NODE_META) as [DeviceNodeType, typeof NODE_META[DeviceNodeType]][]).map(([type, meta]) => (
          <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: meta.color, flexShrink: 0 }} />
            <Typography variant="caption">{meta.label}</Typography>
          </Box>
        ))}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 'auto', pt: 2 }}>
          Click a node to configure. Drag between handles to connect. Delete key removes selected.
        </Typography>
      </Paper>

      {/* ── Canvas ───────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          deleteKeyCode="Delete"
        >
          <Controls />
          <MiniMap zoomable pannable />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      </Box>

      {/* ── Config panel ─────────────────────────────────────────────────── */}
      {selectedNode && (
        <ConfigPanel
          node={selectedNode}
          parentSwitch={parentSwitch}
          deviceOptions={deviceOptions}
          onUpdate={updateSelectedData}
          onDelete={deleteSelected}
        />
      )}
    </Box>
  );
}

// ─── Page (wraps with ReactFlowProvider) ─────────────────────────────────────

function ElectronicsConfigurationPage() {
  const { userName } = useParams<{ userName: string }>();
  if (!userName) return null;

  return (
    <ReactFlowProvider>
      <ArchitectureEditor userName={userName} />
    </ReactFlowProvider>
  );
}

export default ElectronicsConfigurationPage;
