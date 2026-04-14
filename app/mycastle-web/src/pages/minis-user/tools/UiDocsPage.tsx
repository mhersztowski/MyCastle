import { useState, useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  PhotoCamera as PhotoCameraIcon,
  Search as SearchIcon,
  ZoomIn as ZoomInIcon,
} from '@mui/icons-material';
import { minisApi } from '../../../services/MinisApiService';
import { useAuth } from '../../../modules/auth';

interface Callout {
  n: number;
  x: number; // % from left
  y: number; // % from top
  label: string;
  description: string;
}

interface ScreenshotEntry {
  file: string;
  title: string;
  section: string;
  description: string;
  callouts?: Callout[];
}

const SCREENSHOTS: ScreenshotEntry[] = [
  {
    file: '01-home-page',
    title: 'Home Page',
    section: 'Auth',
    description: `Entry point of MyCastle. Shows a card grid of registered users.`,
    callouts: [
      { n: 1, x: 50, y: 15, label: 'Title', description: 'MyCastle logo and application title.' },
      { n: 2, x: 50, y: 50, label: 'User cards', description: 'Grid of registered users. Click a card to navigate to that user\'s login page.' },
      { n: 3, x: 92, y: 8, label: 'Theme toggle', description: 'Switch between dark and light mode. Preference is saved in localStorage.' },
    ],
  },
  {
    file: '02-login-page',
    title: 'Login Page',
    section: 'Auth',
    description: `Password entry for a specific user (URL-embedded username).`,
    callouts: [
      { n: 1, x: 50, y: 35, label: 'Username', description: 'Read-only, taken from the URL path (/login/:userName).' },
      { n: 2, x: 50, y: 50, label: 'Password field', description: 'Enter the user password. Submit with Enter or the Login button.' },
      { n: 3, x: 50, y: 65, label: 'Login button', description: 'Validates credentials against the backend. On success, stores JWT in sessionStorage.' },
    ],
  },
  {
    file: '03-admin-dashboard',
    title: 'Admin Dashboard',
    section: 'Admin',
    description: `Home screen for admin users.`,
    callouts: [
      { n: 1, x: 10, y: 50, label: 'Navigation drawer', description: 'Left sidebar with sections: Users, Scripts, GitHub Import, App Sessions.' },
      { n: 2, x: 90, y: 5, label: 'Account menu', description: 'Access theme toggle, global windows (API Docs, RPC, MQTT Explorer, Terminal), and logout.' },
      { n: 3, x: 50, y: 50, label: 'Dashboard content', description: 'Overview cards and quick stats for the admin.' },
    ],
  },
  {
    file: '04-admin-users',
    title: 'Users Management',
    section: 'Admin',
    description: `Lists all registered users. Admins can create, edit, and delete accounts.`,
    callouts: [
      { n: 1, x: 90, y: 12, label: 'Add user', description: 'Opens a dialog to create a new user with username, password, and role.' },
      { n: 2, x: 50, y: 50, label: 'Users table', description: 'Columns: Username, Role (admin/user), Actions (edit password/role, delete, impersonate).' },
      { n: 3, x: 80, y: 50, label: 'Impersonate', description: 'Log in as that user without knowing their password. A banner shows the impersonation state.' },
    ],
  },
  {
    file: '05-admin-device-defs',
    title: 'Device Definitions',
    section: 'Admin',
    description: `Manages board/hardware profiles referenced by Arduino and uPython projects.`,
    callouts: [
      { n: 1, x: 50, y: 30, label: 'Device def list', description: 'Each entry defines a board profile: name, Arduino FQBN, platform.' },
      { n: 2, x: 90, y: 12, label: 'Add definition', description: 'Create a new hardware profile with FQBN and platform settings.' },
    ],
  },
  {
    file: '06-user-dashboard',
    title: 'User Dashboard',
    section: 'User',
    description: `Home screen for regular users.`,
    callouts: [
      { n: 1, x: 10, y: 50, label: 'Navigation', description: 'Sidebar with sections: Electronics, IoT, PIM, Server, Tools.' },
      { n: 2, x: 50, y: 40, label: 'Quick stats', description: 'Summary of devices, projects, and IoT status.' },
    ],
  },
  {
    file: '07-electronics-devices',
    title: 'Electronics — Devices',
    section: 'Electronics',
    description: `Lists all electronics devices registered to this user.`,
    callouts: [
      { n: 1, x: 50, y: 30, label: 'Devices table', description: 'Columns: name, description, localization, last build (platform, success/fail, timestamp).' },
      { n: 2, x: 90, y: 12, label: 'Add device', description: 'Create a new device: name, description, assign a device definition.' },
      { n: 3, x: 75, y: 50, label: 'IoT link', description: 'Opens the IoT detail page for this device.' },
    ],
  },
  {
    file: '08-electronics-arduino',
    title: 'Electronics — Arduino Projects',
    section: 'Electronics',
    description: `Lists Arduino (C++) projects. Compile via Docker arduino-cli, flash via Web Serial API.`,
    callouts: [
      { n: 1, x: 50, y: 30, label: 'Projects list', description: 'Each row: project name, assigned device, board profile, last build status.' },
      { n: 2, x: 90, y: 12, label: 'Add project', description: 'Create a project with name, board profile key, and device assignment.' },
      { n: 3, x: 70, y: 50, label: 'Open editor', description: 'Opens the Arduino Blockly + Monaco Code split editor for this project.' },
    ],
  },
  {
    file: '09-electronics-upython',
    title: 'Electronics — MicroPython Projects',
    section: 'Electronics',
    description: `Lists MicroPython projects. Deploy .py files to device via mpremote or WebREPL.`,
    callouts: [
      { n: 1, x: 50, y: 35, label: 'Projects list', description: 'Each row shows project name, assigned device, and last deploy status.' },
      { n: 2, x: 90, y: 12, label: 'Add project', description: 'Create a MicroPython project linked to a device definition.' },
      { n: 3, x: 70, y: 50, label: 'Open editor', description: 'Opens the uPython Blockly + Monaco Code split editor.' },
    ],
  },
  {
    file: '10-electronics-pygame',
    title: 'Electronics — Pygame Projects',
    section: 'Electronics',
    description: `Lists Pygame (Python) projects. Build via pygbag to WebAssembly.`,
    callouts: [
      { n: 1, x: 50, y: 35, label: 'Projects list', description: 'Pygame projects with native/web mode indicator.' },
      { n: 2, x: 70, y: 50, label: 'Open editor', description: 'Pygame Blockly + Monaco Code split editor with mode toggle.' },
      { n: 3, x: 80, y: 50, label: 'Web preview', description: 'Opens the pygbag-built WebAssembly app in an iframe.' },
    ],
  },
  {
    file: '11-iot-dashboard',
    title: 'IoT Dashboard',
    section: 'IoT',
    description: `Real-time overview of all IoT devices with telemetry and status.`,
    callouts: [
      { n: 1, x: 50, y: 20, label: 'Device cards', description: 'Per-device card: online/offline indicator based on MQTT heartbeat, last-seen timestamp.' },
      { n: 2, x: 50, y: 55, label: 'Telemetry values', description: 'Latest metric readings per device (temperature, humidity, etc.).' },
      { n: 3, x: 85, y: 20, label: 'Send command', description: 'Opens a dialog to send a named command with optional JSON payload to a device.' },
    ],
  },
  {
    file: '12-iot-devices-list',
    title: 'IoT Devices List',
    section: 'IoT',
    description: `Table of all IoT devices with current status and action links.`,
    callouts: [
      { n: 1, x: 50, y: 35, label: 'Devices table', description: 'Status column: online (green) / offline (grey). Last-seen timestamp.' },
      { n: 2, x: 70, y: 50, label: 'Detail link', description: 'Opens the device detail page with telemetry history and entity list.' },
      { n: 3, x: 78, y: 50, label: 'Smart Display', description: 'Visible when smart-display extension is active. Opens the Smart Display config page.' },
      { n: 4, x: 85, y: 50, label: 'Virtual Display', description: 'Visible when display extension is active. Shows live video frames from device over MQTT.' },
    ],
  },
  {
    file: '13-electronics-config',
    title: 'Network Configuration',
    section: 'Electronics',
    description: `ReactFlow visual editor for IoT network topology.`,
    callouts: [
      { n: 1, x: 50, y: 50, label: 'Network graph', description: 'Drag-and-drop nodes: wifi-device, wifi-uart-bridge, wifi-switch, uart-device.' },
      { n: 2, x: 15, y: 50, label: 'Config panel', description: 'Select a node to edit its WiFi credentials, serial number, and other settings.' },
      { n: 3, x: 85, y: 10, label: 'Save', description: 'Persists the topology via PUT /api/users/{user}/electronics/configuration.' },
    ],
  },
  {
    file: '14-pim-calendar',
    title: 'PIM — Calendar',
    section: 'PIM',
    description: `Personal calendar with monthly/weekly view.`,
    callouts: [
      { n: 1, x: 50, y: 15, label: 'Month/week toggle', description: 'Switch between monthly grid and weekly detail view.' },
      { n: 2, x: 50, y: 55, label: 'Event grid', description: 'Click a day to add an event. Click an event to edit or delete it.' },
      { n: 3, x: 90, y: 12, label: 'Add event', description: 'Quick-add button: opens a dialog with title, date/time, and duration fields.' },
    ],
  },
  {
    file: '15-pim-todolist',
    title: 'PIM — Todo List',
    section: 'PIM',
    description: `Hierarchical task manager with nested tasks and priorities.`,
    callouts: [
      { n: 1, x: 50, y: 35, label: 'Task tree', description: 'Nested task list with expand/collapse. Inline add/edit/delete.' },
      { n: 2, x: 10, y: 50, label: 'Checkbox', description: 'Check a task to mark it complete. Completed tasks are visually struck through.' },
      { n: 3, x: 80, y: 50, label: 'Priority badge', description: 'Color-coded priority (low/medium/high) and optional due date.' },
    ],
  },
  {
    file: '16-workspace-editor',
    title: 'Workspace Editor',
    section: 'PIM',
    description: `VS Code-like multi-file editor with VFS browser and AI agent panel.`,
    callouts: [
      { n: 1, x: 3, y: 50, label: 'Activity bar', description: 'Vertical bar: Explorer, Search, Extensions icons switch the sidebar panel.' },
      { n: 2, x: 15, y: 50, label: 'Sidebar / VFS tree', description: 'File browser with context menu (rename, delete, new file/folder). Mounts /home and /server.' },
      { n: 3, x: 55, y: 10, label: 'Editor tabs', description: 'Open files appear as tabs. Ctrl+W closes, middle-click closes. Unsaved changes shown with dot.' },
      { n: 4, x: 55, y: 55, label: 'Monaco editor', description: 'Full Monaco editor per tab. Ctrl+S saves to VFS. Split editor supported.' },
      { n: 5, x: 55, y: 98, label: 'Status bar', description: 'Shows cursor position, language mode, encoding, and editor group info.' },
      { n: 6, x: 88, y: 50, label: 'AI agent panel', description: 'Chat with Claude. Agent can read/write VFS files using tool calling.' },
    ],
  },
  {
    file: '17-automate-designer',
    title: 'Automate Designer',
    section: 'Server',
    description: `Node-based visual flow designer (NodeRED-like).`,
    callouts: [
      { n: 1, x: 12, y: 50, label: 'Node palette', description: 'Drag nodes onto canvas: Trigger, Condition, HTTP, MQTT, Transform, Merge, Action…' },
      { n: 2, x: 55, y: 50, label: 'Canvas', description: 'Connect nodes by dragging from output port to input port.' },
      { n: 3, x: 88, y: 50, label: 'Properties panel', description: 'Click a node to configure its parameters (URL, condition expression, payload template, etc.).' },
      { n: 4, x: 88, y: 10, label: 'Run / Save', description: 'Run executes the flow immediately. Save persists it to the server.' },
    ],
  },
  {
    file: '18-agent-chat',
    title: 'AI Agent Chat',
    section: 'PIM',
    description: `Conversational Claude AI assistant with tool calling and VFS access.`,
    callouts: [
      { n: 1, x: 50, y: 20, label: 'Chat history', description: 'Messages rendered with markdown, code blocks, and image previews.' },
      { n: 2, x: 50, y: 88, label: 'Input box', description: 'Type a prompt and press Enter (or Shift+Enter for newline). Attach images via paperclip.' },
      { n: 3, x: 90, y: 5, label: 'Model selector', description: 'Choose provider (Anthropic, OpenAI, Ollama) and model. Config stored in ai_config.json.' },
      { n: 4, x: 10, y: 88, label: 'Abort', description: 'Stop button cancels the current AI response mid-stream.' },
    ],
  },
  {
    file: '19-api-keys',
    title: 'API Keys',
    section: 'Tools',
    description: `Create and manage API keys for programmatic access.`,
    callouts: [
      { n: 1, x: 90, y: 12, label: 'Generate key', description: 'Creates a new key with prefix minis_. The full key is shown once — copy it immediately.' },
      { n: 2, x: 50, y: 50, label: 'Keys table', description: 'Shows key prefix, creation date, and last-used timestamp. Full key is hashed (SHA-256) server-side.' },
      { n: 3, x: 80, y: 50, label: 'Delete', description: 'Revoke a key permanently. IoT devices using it will lose MQTT access.' },
    ],
  },
  {
    file: '20-iot-alerts',
    title: 'IoT Alerts',
    section: 'IoT',
    description: `Define alert rules triggered by device telemetry thresholds.`,
    callouts: [
      { n: 1, x: 90, y: 12, label: 'Add rule', description: 'Set device + metric + operator (>/</>=/<=) + threshold value.' },
      { n: 2, x: 50, y: 40, label: 'Rules list', description: 'Active alert rules evaluated against each incoming telemetry reading.' },
      { n: 3, x: 50, y: 70, label: 'Alert log', description: 'History of triggered alerts with timestamp and value at trigger time.' },
    ],
  },
  {
    file: '21-iot-emulator',
    title: 'IoT Emulator',
    section: 'IoT',
    description: `Simulates virtual IoT devices publishing MQTT telemetry and heartbeats.`,
    callouts: [
      { n: 1, x: 20, y: 30, label: 'Preset selector', description: 'Choose a device profile (temperature sensor, switch, etc.) to pre-fill settings.' },
      { n: 2, x: 50, y: 50, label: 'Start / Stop', description: 'Toggle telemetry publishing. Interval and value generator (random-walk/sine/fixed) configurable.' },
      { n: 3, x: 50, y: 75, label: 'Activity log', description: 'Real-time log of published MQTT messages with timestamps.' },
    ],
  },
  {
    file: '22-rpc-explorer',
    title: 'RPC Explorer',
    section: 'Tools',
    description: `Interactive UI for calling backend RPC methods.`,
    callouts: [
      { n: 1, x: 20, y: 30, label: 'Method list', description: 'Available RPC methods: ping, getDeviceStatuses, sendCommand, getLatestTelemetry.' },
      { n: 2, x: 55, y: 50, label: 'Input form', description: 'Auto-generated from Zod schema. Autocomplete for userName/deviceName fields.' },
      { n: 3, x: 55, y: 80, label: 'Response panel', description: 'Formatted JSON response from the backend.' },
    ],
  },
];

const SECTION_COLOR: Record<string, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error'> = {
  Auth: 'default',
  Admin: 'error',
  Electronics: 'warning',
  IoT: 'success',
  PIM: 'info',
  Server: 'secondary',
  Tools: 'primary',
  User: 'default',
};

function CalloutBadge({ n, active, onClick }: { n: number; active: boolean; onClick: () => void }) {
  return (
    <Box
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      sx={{
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: '50%',
        bgcolor: active ? 'primary.main' : 'rgba(25,118,210,0.85)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
        border: '2px solid #fff',
        boxShadow: active ? '0 0 0 3px rgba(25,118,210,0.4)' : '0 1px 4px rgba(0,0,0,0.5)',
        transform: 'translate(-50%, -50%)',
        zIndex: 10,
        transition: 'all 0.15s',
        '&:hover': { bgcolor: 'primary.dark', transform: 'translate(-50%,-50%) scale(1.15)' },
      }}
    >
      {n}
    </Box>
  );
}

function AnnotatedImage({
  file,
  title,
  callouts,
  activeCallout,
  onCalloutClick,
  imgError,
  onImgError,
}: {
  file: string;
  title: string;
  callouts?: Callout[];
  activeCallout: number | null;
  onCalloutClick: (n: number) => void;
  imgError: boolean;
  onImgError: () => void;
}) {
  return (
    <Box sx={{ position: 'relative', lineHeight: 0, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
      {imgError ? (
        <Box sx={{ height: 400, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography color="text.disabled">
            Screenshot not yet generated.
          </Typography>
        </Box>
      ) : (
        <img
          src={`/screenshots/${file}.png`}
          alt={title}
          style={{ width: '100%', display: 'block' }}
          onError={onImgError}
        />
      )}
      {!imgError && callouts?.map((c) => (
        <Box
          key={c.n}
          sx={{ position: 'absolute', left: `${c.x}%`, top: `${c.y}%` }}
        >
          <CalloutBadge
            n={c.n}
            active={activeCallout === c.n}
            onClick={() => onCalloutClick(c.n)}
          />
        </Box>
      ))}
    </Box>
  );
}

function DetailView({ entry, onClose }: { entry: ScreenshotEntry; onClose: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  const [imgError, setImgError] = useState(false);

  const handleCalloutClick = (n: number) => {
    setActive((prev) => (prev === n ? null : n));
    const el = document.getElementById(`callout-desc-${n}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, bgcolor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
      onClick={onClose}
    >
      <Paper
        sx={{ maxWidth: 1100, width: '100%', maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Chip label={entry.section} size="small" color={SECTION_COLOR[entry.section] ?? 'default'} />
          <Typography variant="h6" sx={{ flexGrow: 1 }}>{entry.title}</Typography>
          <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
        </Box>

        {/* Body */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Screenshot with callouts */}
          <Box sx={{ flex: '1 1 0', overflow: 'auto', p: 2 }}>
            <AnnotatedImage
              file={entry.file}
              title={entry.title}
              callouts={entry.callouts}
              activeCallout={active}
              onCalloutClick={handleCalloutClick}
              imgError={imgError}
              onImgError={() => setImgError(true)}
            />
          </Box>

          {/* Callout descriptions */}
          <Box sx={{ flex: '0 0 300px', borderLeft: 1, borderColor: 'divider', overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {entry.description}
            </Typography>
            {entry.callouts && entry.callouts.length > 0 ? (
              <>
                <Divider />
                {entry.callouts.map((c) => (
                  <Box
                    key={c.n}
                    id={`callout-desc-${c.n}`}
                    onClick={() => setActive((prev) => (prev === c.n ? null : c.n))}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      alignItems: 'flex-start',
                      p: 1,
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: active === c.n ? 'action.selected' : 'transparent',
                      border: '1px solid',
                      borderColor: active === c.n ? 'primary.main' : 'transparent',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    {/* Badge */}
                    <Box
                      sx={{
                        flexShrink: 0,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: active === c.n ? 'primary.main' : 'primary.dark',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        mt: 0.2,
                      }}
                    >
                      {c.n}
                    </Box>
                    <Box>
                      <Typography variant="subtitle2">{c.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{c.description}</Typography>
                    </Box>
                  </Box>
                ))}
              </>
            ) : (
              <Typography variant="caption" color="text.disabled">No callouts defined for this screenshot.</Typography>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

function GenerateScreenshotsDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { currentUser } = useAuth();
  const [user, setUser] = useState(currentUser?.name ?? '');
  const [pass, setPass] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; output: string } | null>(null);
  const [outputOpen, setOutputOpen] = useState(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setResult(null);
    try {
      const res = await minisApi.generateScreenshots({ user, pass, base: window.location.origin });
      const output = [res.stdout, res.stderr].filter(Boolean).join('\n');
      setResult({ success: res.exitCode === 0, output });
      setOutputOpen(true);
      if (res.exitCode === 0) onDone();
    } catch (err) {
      setResult({ success: false, output: err instanceof Error ? err.message : String(err) });
      setOutputOpen(true);
    } finally {
      setGenerating(false);
    }
  }, [user, pass, onDone]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Generate Screenshots</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Playwright will log in as the specified user and capture screenshots of all pages.
          Both dev servers must be running (ports 1894 and 1895).
        </Typography>
        <TextField label="Username" size="small" value={user} onChange={(e) => setUser(e.target.value)} />
        <TextField label="Password" size="small" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        {result && (
          <Alert
            severity={result.success ? 'success' : 'error'}
            action={
              result.output ? (
                <IconButton size="small" onClick={() => setOutputOpen((v) => !v)}>
                  {outputOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              ) : undefined
            }
          >
            {result.success ? 'Screenshots generated successfully.' : 'Generation failed.'}
          </Alert>
        )}
        <Collapse in={outputOpen && !!result?.output}>
          <Box
            component="pre"
            sx={{ p: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, fontSize: '0.7rem', overflowX: 'auto', maxHeight: 200, overflowY: 'auto', fontFamily: 'monospace' }}
          >
            {result?.output ?? ''}
          </Box>
        </Collapse>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={generating ? <CircularProgress size={14} color="inherit" /> : <PhotoCameraIcon />}
          onClick={handleGenerate}
          disabled={generating || !user || !pass}
        >
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UiDocsPage() {
  const { isAdmin, impersonating } = useAuth();
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ScreenshotEntry | null>(null);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});
  const [genDialogOpen, setGenDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dynamicScreenshots, setDynamicScreenshots] = useState<ScreenshotEntry[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const loadDocsJson = useCallback(() => {
    fetch(`/screenshots/docs.json?v=${Date.now()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { generatedAt: string; entries: ScreenshotEntry[] } | null) => {
        if (data?.entries) {
          setDynamicScreenshots(data.entries);
          setGeneratedAt(data.generatedAt);
        }
      })
      .catch(() => {/* fallback to static */});
  }, []);

  useEffect(() => { loadDocsJson(); }, [loadDocsJson]);

  const screenshots = dynamicScreenshots ?? SCREENSHOTS;

  const sections = ['All', ...Array.from(new Set(screenshots.map((s) => s.section)))];

  const visible = screenshots.filter((s) => {
    const matchSection = filter === 'All' || s.section === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.section.toLowerCase().includes(q);
    return matchSection && matchSearch;
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          UI Documentation
        </Typography>
        {isAdmin && !impersonating && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<PhotoCameraIcon fontSize="small" />}
            onClick={() => setGenDialogOpen(true)}
          >
            Generate Screenshots
          </Button>
        )}
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Click any screenshot to see annotated callouts explaining each UI element.
        {generatedAt && (
          <> Last generated: <strong>{new Date(generatedAt).toLocaleString()}</strong>
          {dynamicScreenshots && <> · <em>AI-generated descriptions</em></>}.</>
        )}
      </Typography>
      <GenerateScreenshotsDialog
        open={genDialogOpen}
        onClose={() => setGenDialogOpen(false)}
        onDone={() => { setRefreshKey((k) => k + 1); setImgError({}); loadDocsJson(); }}
      />

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, alignItems: 'center' }}>
        {sections.map((s) => (
          <Chip
            key={s}
            label={s}
            clickable
            variant={filter === s ? 'filled' : 'outlined'}
            color={s === 'All' ? 'default' : SECTION_COLOR[s] ?? 'default'}
            onClick={() => setFilter(s)}
          />
        ))}
        <TextField
          size="small"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ ml: 'auto', width: 200 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          }}
        />
      </Box>

      <Divider sx={{ mb: 3 }} />

      {visible.length === 0 && (
        <Typography color="text.secondary">No screenshots match your filter.</Typography>
      )}

      <Grid container spacing={2}>
        {visible.map((entry) => (
          <Grid item key={entry.file} xs={12} sm={6} md={4} lg={3}>
            <Card
              sx={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
              onClick={() => setSelected(entry)}
            >
              {imgError[entry.file] ? (
                <Box sx={{ height: 160, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                  <ZoomInIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                  <Typography variant="caption" color="text.disabled">Screenshot not generated yet</Typography>
                </Box>
              ) : (
                <CardMedia
                  component="img"
                  image={`/screenshots/${entry.file}.png?v=${refreshKey}`}
                  alt={entry.title}
                  sx={{ height: 160, objectFit: 'cover', objectPosition: 'top' }}
                  onError={() => setImgError((prev) => ({ ...prev, [entry.file]: true }))}
                />
              )}
              <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Chip label={entry.section} size="small" color={SECTION_COLOR[entry.section] ?? 'default'} />
                  {entry.callouts && (
                    <Chip label={`${entry.callouts.length} callouts`} size="small" variant="outlined" />
                  )}
                </Box>
                <Typography variant="subtitle2" gutterBottom>{entry.title}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {entry.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {selected && <DetailView entry={selected} onClose={() => setSelected(null)} />}
    </Box>
  );
}
