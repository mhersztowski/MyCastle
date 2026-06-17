import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Box,
  Divider,
  Typography,
  IconButton,
  Tooltip,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Alert,
  Menu,
  MenuItem,
  CircularProgress,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import CircleIcon from '@mui/icons-material/Circle';
import AbcIcon from '@mui/icons-material/Abc';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BrokenImageIcon from '@mui/icons-material/BrokenImage';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar';
import ViewListIcon from '@mui/icons-material/ViewList';
import TuneIcon from '@mui/icons-material/Tune';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
// Icon registry
import HomeIcon from '@mui/icons-material/Home';
import SettingsIcon from '@mui/icons-material/Settings';
import PersonIcon from '@mui/icons-material/Person';
import GroupIcon from '@mui/icons-material/Group';
import FavoriteIcon from '@mui/icons-material/Favorite';
import StarIcon from '@mui/icons-material/Star';
import NotificationsIcon from '@mui/icons-material/Notifications';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentIcon from '@mui/icons-material/Assignment';
import EventIcon from '@mui/icons-material/Event';
import ImageIcon from '@mui/icons-material/Image';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CodeIcon from '@mui/icons-material/Code';
import CloudIcon from '@mui/icons-material/Cloud';
import MailIcon from '@mui/icons-material/Mail';
import ShareIcon from '@mui/icons-material/Share';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BuildIcon from '@mui/icons-material/Build';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import StorageIcon from '@mui/icons-material/Storage';
import LockIcon from '@mui/icons-material/Lock';
import PhoneIcon from '@mui/icons-material/Phone';
import MapIcon from '@mui/icons-material/Map';
import ArticleIcon from '@mui/icons-material/Article';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import WifiIcon from '@mui/icons-material/Wifi';
import ReactMarkdown from 'react-markdown';

// ─── Types ───────────────────────────────────────────────────────────────────

type DashValue =
  | string
  | number
  | boolean
  | null
  | DashValue[]
  | { [k: string]: DashValue };

type QFieldType = 'QIcon' | 'QImage' | 'QString' | 'QNumber' | 'QArray' | 'QMap';

const FIELD_TYPES: QFieldType[] = ['QString', 'QNumber', 'QIcon', 'QImage', 'QArray', 'QMap'];

interface FieldDef { name: string; type: string; }

// Base transform — every DashObject has this (like Qt's QWidget geometry)
interface DashTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
  width: number;
  height: number;
}

interface DashObject {
  id: string;
  className: string;
  objectName: string;
  transform: DashTransform;
  customFields?: FieldDef[];
  properties: Record<string, DashValue>;
  showDetails?: boolean;
  showHeader?: boolean;
  zIndex?: number;
}

// Used only when parsing old scenes that stored x/y directly (no transform)
type LegacyDashObject = Omit<DashObject, 'transform'> & { transform?: DashTransform; x?: number; y?: number };

interface DashScene {
  type: 'dash-scene';
  version: 1;
  umlProjectPath?: string;
  umlSources?: Array<{ id: string; path: string }>;
  objects: DashObject[];
}

interface UmlMember { id: string; kind: 'field' | 'method'; text: string; }

interface UmlClassDef {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum';
  fields: FieldDef[];
}

interface UmlSource {
  id: string;
  path: string;
  name: string;
  classes: UmlClassDef[];
}

interface DashObjectNodeData extends Record<string, unknown> {
  objectName: string;
  className: string;
  fields: FieldDef[];
  properties: Record<string, DashValue>;
  transform: DashTransform;
  selected: boolean;
  userName: string;
  isCustom: boolean;
  onPropertyChange: (field: string, value: DashValue) => void;
  onObjectNameChange: (name: string) => void;
  onFieldAdd: (name: string, type: string) => void;
  onFieldRemove: (name: string) => void;
  onFieldTypeChange: (name: string, newType: string) => void;
  onFieldRename: (oldName: string, newName: string) => void;
  onResizeDrag: (width: number, height: number) => void;
  showDetails: boolean;
  showHeader: boolean;
  selectedFieldName: string | null;
  onFieldSelect: (fieldName: string | null) => void;
}

interface DashEditorPanelProps { userName: string; filePath: string; }

// ─── Utilities ───────────────────────────────────────────────────────────────

const detectFieldType = (typeStr: string): QFieldType => {
  const t = typeStr.trim();
  if (t.endsWith('[]')) return 'QArray';
  if (t === 'QIcon') return 'QIcon';
  if (t === 'QImage') return 'QImage';
  if (t === 'QNumber') return 'QNumber';
  if (t === 'QArray') return 'QArray';
  if (t === 'QMap') return 'QMap';
  return 'QString';
};

const defaultForType = (t: QFieldType): DashValue => {
  if (t === 'QNumber') return 0;
  if (t === 'QArray') return [];
  if (t === 'QMap') return {};
  return '';
};

const defaultTransform = (x = 0, y = 0): DashTransform =>
  ({ x, y, rot: 0, scale: 1, width: 0, height: 0 });

// Migration: old scenes had x/y directly on the object
const getTransform = (obj: DashObject & { x?: number; y?: number }): DashTransform =>
  obj.transform ?? defaultTransform(obj.x ?? 0, obj.y ?? 0);

const autoTransform = (count: number): DashTransform => ({
  x: 50 + (count % 4) * 260,
  y: 50 + Math.floor(count / 4) * 220,
  rot: 0,
  scale: 1,
  width: 0,
  height: 0,
});

const apiBase = (userName: string) => `/api/users/${encodeURIComponent(userName)}/vfs`;
const authToken = () => {
  try {
    const raw = localStorage.getItem('minis_current_user');
    if (!raw) return '';
    return (JSON.parse(raw) as { token?: string }).token ?? '';
  } catch { return ''; }
};

// Backend VFS requires absolute paths rooted at /data/Minis/Users/{u}.
// Drive-relative paths (e.g. "uml/foo.dash.json") get expanded here.
const toAbsVfsPath = (userName: string, rel: string): string => {
  if (rel.startsWith('/data/Minis/')) return rel;          // already absolute
  const cleaned = rel.replace(/^\/+|\/+$/g, '');
  return cleaned
    ? `/data/Minis/Users/${userName}/drive/${cleaned}`
    : `/data/Minis/Users/${userName}/drive`;
};

const b64ToText = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
};
const textToB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const vfsRead = async (userName: string, path: string): Promise<string> => {
  const r = await fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`,
    { headers: { Authorization: `Bearer ${authToken()}` } });
  if (!r.ok) throw new Error(`readFile ${r.status}`);
  const j = (await r.json()) as { data?: string };
  return b64ToText(j.data ?? '');
};

const vfsWrite = async (userName: string, path: string, text: string): Promise<void> => {
  const r = await fetch(`${apiBase(userName)}/writeFile?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken()}` },
    body: JSON.stringify({ data: textToB64(text), options: { create: true, overwrite: true } }),
  });
  if (!r.ok) throw new Error(`writeFile ${r.status}`);
};

const vfsReaddir = async (userName: string, path: string): Promise<Array<{ name: string; isDir: boolean }>> => {
  const r = await fetch(`${apiBase(userName)}/readdir?path=${encodeURIComponent(toAbsVfsPath(userName, path))}`,
    { headers: { Authorization: `Bearer ${authToken()}` } });
  const j = (await r.json()) as { entries?: Array<{ name: string; type: number }> };
  return (j.entries ?? [])
    .map((e) => ({ name: e.name, isDir: e.type === 2 }))
    .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
};

const makeId = () => Math.random().toString(36).slice(2, 10);

const parseMemberText = (text: string): FieldDef | null => {
  const stripped = text.replace(/^[+\-#~]\s*/, '');
  const colonIdx = stripped.indexOf(':');
  if (colonIdx === -1) return null;
  const name = stripped.slice(0, colonIdx).trim();
  const rest = stripped.slice(colonIdx + 1).trim();
  const type = rest.split('=')[0].trim();
  if (!name || name.includes('(')) return null;
  return { name, type };
};

const parseUmlProject = (json: string): UmlClassDef[] => {
  try {
    const proj = JSON.parse(json) as {
      diagrams?: Array<{ nodes?: Array<{ data?: { name?: string; kind?: string; members?: UmlMember[] } }> }>;
    };
    const defs: UmlClassDef[] = [];
    for (const diagram of proj.diagrams ?? []) {
      for (const node of diagram.nodes ?? []) {
        const d = node.data;
        if (!d?.name) continue;
        const kind = (d.kind ?? 'class') as UmlClassDef['kind'];
        if (kind === 'interface' || kind === 'enum') continue;
        const fields: FieldDef[] = [];
        for (const m of d.members ?? []) {
          if (m.kind !== 'field') continue;
          const parsed = parseMemberText(m.text);
          if (parsed) fields.push(parsed);
        }
        if (!defs.find((x) => x.name === d.name)) defs.push({ name: d.name, kind, fields });
      }
    }
    return defs;
  } catch { return []; }
};

// ─── Icon registry ────────────────────────────────────────────────────────────

const ICON_REGISTRY: Record<string, React.ElementType> = {
  Home: HomeIcon, Settings: SettingsIcon, Person: PersonIcon, Group: GroupIcon,
  Favorite: FavoriteIcon, Star: StarIcon, Notifications: NotificationsIcon,
  Dashboard: DashboardIcon, Assignment: AssignmentIcon, Event: EventIcon,
  Image: ImageIcon, Camera: CameraAltIcon, Code: CodeIcon, Cloud: CloudIcon,
  Mail: MailIcon, Share: ShareIcon, Edit: EditIcon, Delete: DeleteIcon,
  Build: BuildIcon, Info: InfoIcon, Warning: WarningIcon, CheckCircle: CheckCircleIcon,
  Storage: StorageIcon, Lock: LockIcon, Phone: PhoneIcon, Map: MapIcon,
  Article: ArticleIcon, BarChart: BarChartIcon, Emoji: EmojiEmotionsIcon, Wifi: WifiIcon,
};

const MuiIconPreview: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => {
  const IconComp = ICON_REGISTRY[name] as React.FC<{ sx?: object }> | undefined;
  if (!IconComp) return <BrokenImageIcon sx={{ fontSize: size, color: 'text.disabled' }} />;
  return <IconComp sx={{ fontSize: size }} />;
};

// ─── Built-in classes ─────────────────────────────────────────────────────────

const BUILT_IN_CLASSES: UmlClassDef[] = [
  { name: 'Unknown', kind: 'class', fields: [] },
  {
    name: 'View', kind: 'class',
    fields: [
      { name: 'icon', type: 'QIcon' }, { name: 'thumbnail', type: 'QImage' },
      { name: 'label', type: 'QString' }, { name: 'order', type: 'QNumber' },
      { name: 'tags', type: 'QArray' }, { name: 'metadata', type: 'QMap' },
    ],
  },
  {
    name: 'MarkdownView', kind: 'class',
    fields: [
      { name: 'src', type: 'QString' },
      { name: 'title', type: 'QString' },
    ],
  },
];

const makeDemoScene = (): DashScene => ({
  type: 'dash-scene',
  version: 1,
  objects: [
    {
      id: 'view1', className: 'View', objectName: 'mainView',
      transform: defaultTransform(100, 80),
      properties: { icon: 'Home', thumbnail: '', label: 'Main View', order: 1, tags: ['ui', 'main'], metadata: { version: '1.0' } },
    },
    {
      id: 'unknown1', className: 'Unknown', objectName: 'myObject',
      transform: defaultTransform(430, 80),
      customFields: [{ name: 'title', type: 'QString' }, { name: 'count', type: 'QNumber' }],
      properties: { title: 'Hello', count: 0 },
    },
  ],
});

// ─── Field widgets ────────────────────────────────────────────────────────────

const QStringWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  if (editing) {
    return <TextField size="small" value={draft} autoFocus variant="standard"
      inputProps={{ style: { fontSize: 11, fontFamily: 'monospace' } }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); onChange(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(draft); } if (e.key === 'Escape') { setEditing(false); setDraft(String(value ?? '')); } }}
      sx={{ width: '100%' }} />;
  }
  return <Typography sx={{ fontSize: 11, fontFamily: 'monospace', cursor: 'text', color: value ? 'text.primary' : 'text.disabled', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25 }}
    onClick={() => { setDraft(String(value ?? '')); setEditing(true); }}>{String(value ?? '') || '…'}</Typography>;
};

const fmtNum = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  // Trim to 4 decimal places, strip trailing zeros
  return Number(n.toFixed(4)).toString();
};

const QNumberWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; step?: number }> = ({ value, onChange, step = 1 }) => {
  const numVal = typeof value === 'number' ? value : (Number(value) || 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(fmtNum(numVal)); setEditing(true); };
  const commit = (raw: string) => { setEditing(false); onChange(Number(raw) || 0); };
  const nudge = (dir: 1 | -1) => {
    const next = Math.round((numVal + dir * step) * 10000) / 10000;
    onChange(next);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); nudge(-1); }}
        sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: 1, fontWeight: 400, userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}>
        −
      </Box>
      {editing ? (
        <TextField size="small" type="text" variant="standard" value={draft} autoFocus
          inputProps={{ style: { fontSize: 12, fontFamily: 'monospace', textAlign: 'center' } }}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setDraft(e.target.value); }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commit(draft); }
            if (e.key === 'Escape') setEditing(false);
            if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); setEditing(false); }
            if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); setEditing(false); }
          }}
          sx={{ flex: 1, minWidth: 0, '& .MuiInput-root:after': { borderColor: '#4fc3f7' } }} />
      ) : (
        <Box onPointerDown={(e) => e.stopPropagation()} onClick={startEdit} sx={{
          flex: 1, textAlign: 'center', cursor: 'text',
          bgcolor: 'action.hover', borderRadius: '8px', px: 1, py: '3px',
          fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
          color: 'primary.main', letterSpacing: 0.3,
          border: '1px solid transparent',
          '&:hover': { borderColor: 'divider', bgcolor: 'action.selected' },
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {fmtNum(numVal)}
        </Box>
      )}
      <Box component="span"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); nudge(1); }}
        sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: '6px', cursor: 'pointer', flexShrink: 0, fontSize: 16, lineHeight: 1, fontWeight: 400, userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}>
        +
      </Box>
    </Box>
  );
};

const QIconWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [custom, setCustom] = useState(String(value ?? ''));
  const name = typeof value === 'string' ? value : '';
  useEffect(() => { setCustom(name); }, [name]);
  return (
    <>
      <Box onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget as HTMLElement); setCustom(name); }}
        onPointerDown={(e) => e.stopPropagation()}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', px: 0.5, py: 0.25, borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }}>
        <MuiIconPreview name={name} size={16} />
        <Typography sx={{ fontSize: 11, color: name ? 'text.primary' : 'text.disabled' }}>{name || '(none)'}</Typography>
      </Box>
      <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} PaperProps={{ sx: { p: 1.5, width: 290 } }}>
        <TextField size="small" fullWidth label="Icon name" value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { onChange(custom.trim()); setAnchor(null); } }} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.25 }}>
          {Object.entries(ICON_REGISTRY).map(([iconName, IconComp]) => {
            const IC = IconComp as React.FC<{ sx?: object }>;
            return <Tooltip key={iconName} title={iconName}>
              <IconButton size="small" onClick={() => { onChange(iconName); setAnchor(null); }}
                sx={{ p: 0.5, bgcolor: name === iconName ? 'primary.main' : undefined, color: name === iconName ? 'primary.contrastText' : 'inherit', borderRadius: 0.5 }}>
                <IC sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>;
          })}
        </Box>
      </Popover>
    </>
  );
};

const QImageWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ value, onChange, userName }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const path = typeof value === 'string' ? value : '';
  useEffect(() => { if (!editing) setDraft(path); }, [path, editing]);
  useEffect(() => {
    let revoke: string | null = null;
    if (path && !path.startsWith('http') && !path.startsWith('data:')) {
      fetch(`${apiBase(userName)}/readFile?path=${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${authToken()}` } })
        .then(async (r) => {
          if (!r.ok) return;
          const j = (await r.json()) as { data?: string };
          if (!j.data) return;
          const binary = atob(j.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const url = URL.createObjectURL(new Blob([bytes]));
          revoke = url; setBlobUrl(url);
        }).catch(() => {});
    } else { setBlobUrl(null); }
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [path, userName]);
  const imgSrc = path.startsWith('http') || path.startsWith('data:') ? path : (blobUrl ?? undefined);
  return (
    <Box>
      {path && <Box sx={{ mb: 0.5, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 0.5, overflow: 'hidden' }}>
        {imgSrc ? <img src={imgSrc} alt="" style={{ maxHeight: 48, maxWidth: '100%', objectFit: 'contain' }} />
          : <BrokenImageIcon sx={{ fontSize: 20, color: 'text.disabled' }} />}
      </Box>}
      {editing
        ? <TextField size="small" value={draft} autoFocus variant="standard" placeholder="path or URL"
            inputProps={{ style: { fontSize: 10, fontFamily: 'monospace' } }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { setEditing(false); onChange(draft); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { setEditing(false); onChange(draft); } if (e.key === 'Escape') setEditing(false); }}
            sx={{ width: '100%' }} />
        : <Typography sx={{ fontSize: 10, fontFamily: 'monospace', cursor: 'text', color: path ? 'text.secondary' : 'text.disabled', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25, wordBreak: 'break-all' }}
            onClick={() => { setDraft(path); setEditing(true); }}>{path || '(no image)'}</Typography>}
    </Box>
  );
};

const QArrayWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const items: DashValue[] = Array.isArray(value) ? (value as DashValue[]) : [];
  const [expanded, setExpanded] = useState(false);
  const [newItem, setNewItem] = useState('');
  const addItem = () => { if (!newItem.trim()) return; onChange([...items, newItem.trim()]); setNewItem(''); };
  const moveItem = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>[{items.length} items]</Typography>
      </Box>
      {expanded && <Box sx={{ pl: 1, pt: 0.25 }}>
        {items.map((item, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.125, mb: 0.125 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === 0} onClick={() => moveItem(i, -1)}>
                <ArrowUpwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === items.length - 1} onClick={() => moveItem(i, 1)}>
                <ArrowDownwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{JSON.stringify(item)}</Typography>
            <IconButton size="small" sx={{ p: 0.125 }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5 }}>
          <TextField size="small" variant="standard" placeholder="add item…" value={newItem}
            onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
            inputProps={{ style: { fontSize: 10 } }} sx={{ flex: 1 }} />
          <IconButton size="small" sx={{ p: 0.25 }} disabled={!newItem.trim()} onClick={addItem}><AddIcon sx={{ fontSize: 12 }} /></IconButton>
        </Box>
      </Box>}
    </Box>
  );
};

const QMapWidget: React.FC<{ value: DashValue; onChange: (v: DashValue) => void }> = ({ value, onChange }) => {
  const isObj = value !== null && typeof value === 'object' && !Array.isArray(value);
  const map = isObj ? (value as Record<string, DashValue>) : {};
  const entries = Object.entries(map);
  const [expanded, setExpanded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const addPair = () => { if (!newKey.trim()) return; onChange({ ...map, [newKey.trim()]: newVal }); setNewKey(''); setNewVal(''); };
  const movePair = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= entries.length) return;
    const next = [...entries];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(Object.fromEntries(next));
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 0.5, '&:hover': { bgcolor: 'action.hover' } }} onClick={() => setExpanded((v) => !v)}>
        {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{'{' + entries.length + ' keys}'}</Typography>
      </Box>
      {expanded && <Box sx={{ pl: 1, pt: 0.25 }}>
        {entries.map(([k, v], i) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.125, mb: 0.125 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === 0} onClick={() => movePair(i, -1)}>
                <ArrowUpwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
              <IconButton size="small" sx={{ p: 0, lineHeight: 1 }} disabled={i === entries.length - 1} onClick={() => movePair(i, 1)}>
                <ArrowDownwardIcon sx={{ fontSize: 10 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', color: '#4fc3f7', whiteSpace: 'nowrap', flexShrink: 0 }}>{k}:</Typography>
            <Typography sx={{ fontSize: 10, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{JSON.stringify(v)}</Typography>
            <IconButton size="small" sx={{ p: 0.125 }} onClick={() => { const n = { ...map }; delete n[k]; onChange(n); }}>
              <CloseIcon sx={{ fontSize: 11 }} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mt: 0.5 }}>
          <TextField size="small" variant="standard" placeholder="key" value={newKey} onChange={(e) => setNewKey(e.target.value)}
            inputProps={{ style: { fontSize: 10 } }} sx={{ width: 60, flexShrink: 0 }} />
          <Typography sx={{ fontSize: 10, color: 'text.disabled', flexShrink: 0 }}>:</Typography>
          <TextField size="small" variant="standard" placeholder="value" value={newVal} onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addPair(); }} inputProps={{ style: { fontSize: 10 } }} sx={{ flex: 1 }} />
          <IconButton size="small" sx={{ p: 0.25 }} disabled={!newKey.trim()} onClick={addPair}><AddIcon sx={{ fontSize: 12 }} /></IconButton>
        </Box>
      </Box>}
    </Box>
  );
};

const FieldWidget: React.FC<{ fieldType: QFieldType; value: DashValue; onChange: (v: DashValue) => void; userName: string }> = ({ fieldType, value, onChange, userName }) => {
  switch (fieldType) {
    case 'QIcon':   return <QIconWidget value={value} onChange={onChange} />;
    case 'QImage':  return <QImageWidget value={value} onChange={onChange} userName={userName} />;
    case 'QNumber': return <QNumberWidget value={value} onChange={onChange} />;
    case 'QArray':  return <QArrayWidget value={value} onChange={onChange} />;
    case 'QMap':    return <QMapWidget value={value} onChange={onChange} />;
    default:        return <QStringWidget value={value} onChange={onChange} />;
  }
};

// ─── Unknown mode helpers ─────────────────────────────────────────────────────

const AddFieldRow: React.FC<{ onAdd: (name: string, type: QFieldType) => void }> = ({ onAdd }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<QFieldType>('QString');
  const commit = () => { if (!name.trim()) return; onAdd(name.trim(), type); setName(''); setType('QString'); setOpen(false); };
  if (!open) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.5 }}>
      <Tooltip title="Add field"><IconButton size="small" onClick={() => setOpen(true)} sx={{ opacity: 0.4, '&:hover': { opacity: 1 }, p: 0.25 }}><AddIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
    </Box>
  );
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, pt: 0.5, flexWrap: 'wrap', borderTop: '1px dashed', borderColor: 'divider', mt: 0.5 }}>
      <TextField size="small" variant="standard" placeholder="field name" value={name} autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setOpen(false); }}
        inputProps={{ style: { fontSize: 11 } }} sx={{ width: 90, flexShrink: 0 }} />
      <Select size="small" value={type} onChange={(e) => setType(e.target.value as QFieldType)} variant="standard"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        MenuProps={{ onClick: (e: React.MouseEvent) => e.stopPropagation(), disablePortal: false }}
        sx={{ fontSize: 10, minWidth: 72, flexShrink: 0, '& .MuiSelect-select': { py: 0, fontSize: 10 } }}>
        {FIELD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>{t}</MenuItem>)}
      </Select>
      <IconButton size="small" sx={{ p: 0.25 }} disabled={!name.trim()} onClick={commit}><CheckIcon sx={{ fontSize: 14, color: 'success.main' }} /></IconButton>
      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setOpen(false)}><CloseIcon sx={{ fontSize: 14 }} /></IconButton>
    </Box>
  );
};

const EditableFieldName: React.FC<{ name: string; onRename: (n: string) => void }> = ({ name, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const commit = () => { setEditing(false); if (draft.trim() && draft !== name) onRename(draft.trim()); };
  if (editing) return <TextField size="small" variant="standard" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)}
    onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(name); } }}
    inputProps={{ style: { fontSize: 10, fontFamily: 'monospace', width: 80 } }} />;
  return <Tooltip title="Double-click to rename">
    <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', cursor: 'default', '&:hover': { color: 'text.primary' } }}
      onDoubleClick={() => { setDraft(name); setEditing(true); }}>{name}</Typography>
  </Tooltip>;
};

// ─── VFS file picker ─────────────────────────────────────────────────────────

const VfsFilePicker: React.FC<{ userName: string; filterExt: string; startDir?: string; onSelect: (path: string) => void }> = ({ userName, filterExt, startDir = '/', onSelect }) => {
  const [dir, setDir] = useState(startDir);
  const [entries, setEntries] = useState<Array<{ name: string; isDir: boolean }>>([]);
  const [busy, setBusy] = useState(false);

  const loadDir = useCallback(async (d: string) => {
    setBusy(true);
    try { setEntries(await vfsReaddir(userName, d)); }
    catch { setEntries([]); }
    finally { setBusy(false); }
  }, [userName]);

  useEffect(() => { void loadDir(dir); }, [dir, loadDir]);

  const join = (d: string, name: string) => (d === '/' ? '' : d) + '/' + name;
  const goUp = () => { const p = dir.split('/').slice(0, -1).join('/') || '/'; setDir(p); };

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
        {dir !== '/' && (
          <IconButton size="small" sx={{ p: 0.25 }} onClick={goUp}>
            <ChevronRightIcon sx={{ fontSize: 14, transform: 'rotate(180deg)' }} />
          </IconButton>
        )}
        <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir}</Typography>
        {busy && <CircularProgress size={10} />}
      </Box>
      <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
        {entries.length === 0 && !busy && (
          <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1, fontStyle: 'italic' }}>Empty</Typography>
        )}
        {entries.map((e) => {
          const fullPath = join(dir, e.name);
          const isMatch = !e.isDir && e.name.endsWith(filterExt);
          if (!e.isDir && !isMatch) return null;
          return (
            <ListItemButton key={e.name} sx={{ py: 0.375, px: 1 }}
              onClick={() => { if (e.isDir) setDir(fullPath); else onSelect(fullPath); }}>
              {e.isDir
                ? <ChevronRightIcon sx={{ fontSize: 14, color: 'text.disabled', mr: 0.5, flexShrink: 0 }} />
                : <ArticleIcon sx={{ fontSize: 14, color: '#4fc3f7', mr: 0.5, flexShrink: 0 }} />}
              <Typography sx={{ fontSize: 12 }}>{e.name}</Typography>
            </ListItemButton>
          );
        })}
      </Box>
    </Box>
  );
};

const UmlImportDialog: React.FC<{
  open: boolean; onClose: () => void; userName: string;
  onImport: (path: string) => Promise<void>; loading: boolean; importError: string | null;
}> = ({ open, onClose, userName, onImport, loading, importError }) => {
  const [path, setPath] = useState('');
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 14, py: 1.5 }}>Import UML Types</DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        {importError && <Alert severity="error" sx={{ mb: 1 }}>{importError}</Alert>}
        <TextField fullWidth size="small" label="UML project path" value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && path.trim()) void onImport(path); }}
          placeholder="uml/Project.umlproj.json"
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} />
        <VfsFilePicker userName={userName} filterExt=".umlproj.json" startDir={toAbsVfsPath(userName, 'uml')} onSelect={setPath} />
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!path.trim() || loading}
          onClick={() => void onImport(path)}>
          {loading ? <CircularProgress size={14} /> : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Properties panel ─────────────────────────────────────────────────────────

const TransformField: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step = 1, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { if (!editing) setDraft(String(Math.round(value * 100) / 100)); }, [value, editing]);
  const commit = () => { setEditing(false); onChange(parseFloat(draft) || 0); };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.375 }}>
      <Typography sx={{ fontSize: 10, color: 'text.secondary', width: 38, flexShrink: 0, fontFamily: 'monospace' }}>{label}</Typography>
      {editing
        ? <TextField size="small" variant="standard" value={draft} autoFocus type="number"
            inputProps={{ step, style: { fontSize: 11, fontFamily: 'monospace' } }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            sx={{ flex: 1 }} />
        : <Typography sx={{ fontSize: 11, fontFamily: 'monospace', cursor: 'text', color: 'text.primary', flex: 1, '&:hover': { bgcolor: 'action.hover' }, borderRadius: 0.5, px: 0.25 }}
            onClick={() => { setDraft(String(value)); setEditing(true); }}>{Math.round(value * 100) / 100}</Typography>}
    </Box>
  );
};

const PropertiesPanel: React.FC<{
  object: DashObject | null;
  fields: FieldDef[];
  userName: string;
  onObjectNameChange: (id: string, name: string) => void;
  onTransformChange: (id: string, patch: Partial<DashTransform>) => void;
  onPropertyChange: (id: string, field: string, value: DashValue) => void;
  showDetails: boolean;
  onToggleShowDetails: () => void;
  showHeader: boolean;
  onToggleShowHeader: () => void;
  zIndex: number;
  onZIndexChange: (id: string, v: number) => void;
  selectedFieldDef: FieldDef | null;
  isCustom: boolean;
  onFieldTypeChange: (fieldName: string, newType: string) => void;
}> = ({ object, fields, userName, onObjectNameChange, onTransformChange, onPropertyChange, showDetails, onToggleShowDetails, showHeader, onToggleShowHeader, zIndex, onZIndexChange, selectedFieldDef, isCustom, onFieldTypeChange }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => { setEditingName(false); }, [object?.id]);

  if (!object) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', fontStyle: 'italic' }}>No selection</Typography>
      </Box>
    );
  }

  const t = getTransform(object);
  const commitName = () => { setEditingName(false); if (nameDraft.trim() && nameDraft !== object.objectName) onObjectNameChange(object.id, nameDraft.trim()); };

  return (
    <Box sx={{ p: 1, overflow: 'auto', height: '100%' }}>
      {/* Identity */}
      <Typography sx={{ fontSize: 9, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>«{object.className}»</Typography>
      {editingName
        ? <TextField size="small" value={nameDraft} autoFocus variant="standard" fullWidth
            inputProps={{ style: { fontSize: 13, fontWeight: 700 } }}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            sx={{ mb: 1 }} />
        : <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1, cursor: 'text', borderRadius: 0.5, px: 0.25, '&:hover': { bgcolor: 'action.hover' } }}
            onDoubleClick={() => { setNameDraft(object.objectName); setEditingName(true); }}>
            {object.objectName}
          </Typography>}

      <Divider sx={{ mb: 1 }} />

      {/* Transform */}
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Transform</Typography>
      <TransformField label="X" value={t.x} onChange={(v) => onTransformChange(object.id, { x: v })} />
      <TransformField label="Y" value={t.y} onChange={(v) => onTransformChange(object.id, { y: v })} />
      <TransformField label="Rot" value={t.rot} step={0.1} onChange={(v) => onTransformChange(object.id, { rot: v })} />
      <TransformField label="Scale" value={t.scale} step={0.01} onChange={(v) => onTransformChange(object.id, { scale: v })} />
      <TransformField label="Width" value={t.width} onChange={(v) => onTransformChange(object.id, { width: v })} />
      <TransformField label="Height" value={t.height} onChange={(v) => onTransformChange(object.id, { height: v })} />

      {/* Fields */}
      {fields.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Properties</Typography>
          {fields.map((f) => {
            const qtype = detectFieldType(f.type);
            const val = object.properties[f.name] ?? defaultForType(qtype);
            return (
              <Box key={f.name} sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', mb: 0.25 }}>
                  {f.name}
                  <Typography component="span" sx={{ fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic' }}> : {f.type}</Typography>
                </Typography>
                <FieldWidget fieldType={qtype} value={val} onChange={(v) => onPropertyChange(object.id, f.name, v)} userName={userName} />
              </Box>
            );
          })}
        </>
      )}

      {/* Display */}
      <Divider sx={{ my: 1 }} />
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.5 }}>Display</Typography>
      <TransformField label="Z-Index" value={zIndex} step={1} onChange={(v) => onZIndexChange(object.id, Math.round(v))} />
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show header</Typography>
        <Switch size="small" checked={showHeader} onChange={onToggleShowHeader} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>Show field types</Typography>
        <Switch size="small" checked={showDetails} onChange={onToggleShowDetails} />
      </Box>

      {/* Selected Field */}
      {selectedFieldDef && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', mb: 0.75 }}>Selected Field</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 38, flexShrink: 0 }}>Name</Typography>
            <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: 'text.primary' }}>{selectedFieldDef.name}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: 10, color: 'text.disabled', width: 38, flexShrink: 0 }}>Type</Typography>
            {isCustom ? (
              <Select size="small" value={detectFieldType(selectedFieldDef.type)} variant="standard"
                onChange={(e) => onFieldTypeChange(selectedFieldDef.name, e.target.value)}
                sx={{ fontSize: 11, '& .MuiSelect-select': { py: 0, fontSize: 11, fontFamily: 'monospace', color: '#4fc3f7' } }}>
                {FIELD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>{t}</MenuItem>)}
              </Select>
            ) : (
              <Typography sx={{ fontSize: 11, fontFamily: 'monospace', color: '#4fc3f7', fontStyle: 'italic' }}>{selectedFieldDef.type}</Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
};

// ─── Markdown viewer ──────────────────────────────────────────────────────────

const MarkdownViewContent: React.FC<{ src: string; userName: string }> = ({ src, userName }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const trimmed = src.trim();
  const isPath = trimmed.startsWith('/');

  useEffect(() => {
    if (!trimmed) { setContent(''); setLoadError(null); return; }
    if (!isPath) { setContent(trimmed); setLoadError(null); return; }

    setLoading(true);
    setLoadError(null);
    vfsRead(userName, trimmed)
      .then((text) => { setContent(text); setLoadError(null); })
      .catch((e: unknown) => { setLoadError(`Cannot load: ${(e as Error).message}`); setContent(''); })
      .finally(() => setLoading(false));
  }, [trimmed, isPath, userName]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <CircularProgress size={16} />
      </Box>
    );
  }
  if (loadError) {
    return <Typography sx={{ fontSize: 10, color: 'error.main', p: 1, fontFamily: 'monospace' }}>{loadError}</Typography>;
  }
  if (!content) {
    return (
      <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1, fontStyle: 'italic' }}>
        Set «src» in Properties to a VFS path (starts with /) or inline markdown.
      </Typography>
    );
  }
  return (
    <Box sx={{
      fontSize: 13, lineHeight: 1.6, p: 1,
      '& h1': { fontSize: 17, fontWeight: 700, m: 0, mb: 0.75 },
      '& h2': { fontSize: 14, fontWeight: 700, m: 0, mt: 1.25, mb: 0.5 },
      '& h3': { fontSize: 12, fontWeight: 700, m: 0, mt: 1, mb: 0.375 },
      '& p': { m: 0, mb: 0.75 },
      '& ul, & ol': { pl: 2.5, m: 0, mb: 0.75 },
      '& li': { mb: 0.25 },
      '& code': { fontSize: 11, fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
      '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, fontSize: 11, overflow: 'auto', m: 0, mb: 0.75 },
      '& pre code': { bgcolor: 'transparent', p: 0 },
      '& a': { color: '#4fc3f7', textDecoration: 'underline' },
      '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 1.5, ml: 0, my: 0.5, color: 'text.secondary' },
      '& hr': { border: 'none', borderTop: '1px solid', borderColor: 'divider', my: 1 },
      '& table': { borderCollapse: 'collapse', width: '100%', mb: 0.75, fontSize: 12 },
      '& th, & td': { border: '1px solid', borderColor: 'divider', px: 0.75, py: 0.375 },
      '& th': { bgcolor: 'action.hover', fontWeight: 700 },
      '& img': { maxWidth: '100%' },
    }}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </Box>
  );
};

// ─── ReactFlow node (compact — just fields, no property editing, that's in the panel) ───

const HANDLE_SIZE = 10; // px — square handle size

const DashObjectNode: React.FC<NodeProps<Node<DashObjectNodeData>>> = ({ data }) => {
  const { getZoom } = useReactFlow();
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(data.objectName);
  useEffect(() => { setNameVal(data.objectName); }, [data.objectName]);
  const isUnknown = data.isCustom;
  const isMarkdownView = data.className === 'MarkdownView';
  const t = data.transform;
  const visible = data.selected;

  // Resize handle — pointer capture so ReactFlow cannot steal the drag
  const onResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = t.width > 0 ? t.width : 200;
    const startH = t.height > 0 ? t.height : 0;

    const onMove = (me: PointerEvent) => {
      const zoom = getZoom();
      const dw = (me.clientX - startX) / zoom;
      const dh = (me.clientY - startY) / zoom;
      const newW = Math.max(150, Math.round(startW + dw));
      const newH = startH > 0 ? Math.max(80, Math.round(startH + dh)) : Math.max(80, Math.round(dh));
      data.onResizeDrag(newW, newH);
    };
    const onUp = (me: PointerEvent) => {
      el.releasePointerCapture(me.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }, [t.width, t.height, getZoom, data]);

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: '#4fc3f7',
    border: '2px solid #1a1a1a',
    borderRadius: 2,
    opacity: visible ? 1 : 0,
    transition: 'opacity 0.15s',
    zIndex: 10,
  };

  return (
    <Box sx={{ position: 'relative', minWidth: 190, display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', border: '2px solid', borderColor: data.selected ? '#4fc3f7' : 'divider', borderRadius: 1, boxShadow: data.selected ? '0 0 0 2px #4fc3f755' : 1, userSelect: 'none',
      ...(t.width > 0 ? { width: t.width } : {}),
      ...(t.height > 0 ? { height: t.height } : {}),
      ...(t.rot !== 0 || t.scale !== 1 ? { transform: `${t.rot !== 0 ? `rotate(${t.rot}deg) ` : ''}${t.scale !== 1 ? `scale(${t.scale})` : ''}`.trim() } : {}),
    }}>
      {/* Drag bar — always visible, used as ReactFlow dragHandle */}
      <Box className="dash-drag-handle" title="Drag to move" sx={{
        flexShrink: 0, height: 12, cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: data.selected ? '#4fc3f718' : 'action.hover',
        borderBottom: '1px solid', borderColor: 'divider',
        borderRadius: '2px 2px 0 0',
        '&:active': { cursor: 'grabbing' },
      }}>
        <Box sx={{ display: 'flex', gap: '3px', opacity: 0.35 }}>
          {[0,1,2,3,4].map((i) => <Box key={i} sx={{ width: 3, height: 3, bgcolor: 'text.primary', borderRadius: '50%' }} />)}
        </Box>
      </Box>

      {/* Resize handle — bottom-right */}
      <div
        onPointerDown={onResizePointerDown}
        title="Drag to resize"
        style={{
          ...handleStyle,
          bottom: -HANDLE_SIZE / 2 - 1,
          right: -HANDLE_SIZE / 2 - 1,
          cursor: 'se-resize',
        }}
      />

      <Handle type="source" position={Position.Top}    style={{ width: 8, height: 8, background: '#4fc3f7' }} />
      <Handle type="source" position={Position.Right}  style={{ width: 8, height: 8, background: '#4fc3f7' }} />
      <Handle type="source" position={Position.Bottom} style={{ width: 8, height: 8, background: '#4fc3f7' }} />
      <Handle type="source" position={Position.Left}   style={{ width: 8, height: 8, background: '#4fc3f7' }} />

      {/* Header */}
      {data.showHeader && (
        <Box onPointerDown={(e) => e.stopPropagation()} sx={{ flexShrink: 0, bgcolor: isMarkdownView ? '#4fc3f70a' : isUnknown ? '#ffffff08' : '#4fc3f714', textAlign: 'center', borderBottom: '1px solid', borderColor: 'divider', px: 1, py: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
            {isUnknown && <HelpOutlineIcon sx={{ fontSize: 11, color: 'text.disabled' }} />}
            {isMarkdownView && <ArticleIcon sx={{ fontSize: 11, color: '#4fc3f7' }} />}
            <Typography sx={{ fontSize: 10, fontStyle: 'italic', color: 'text.secondary' }}>«{data.className}»</Typography>
          </Box>
          {editingName
            ? <TextField size="small" value={nameVal} autoFocus variant="standard"
                inputProps={{ style: { fontSize: 12, textAlign: 'center', fontWeight: 700 } }}
                onChange={(e) => setNameVal(e.target.value)}
                onBlur={() => { setEditingName(false); if (nameVal !== data.objectName) data.onObjectNameChange(nameVal); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { setEditingName(false); if (nameVal !== data.objectName) data.onObjectNameChange(nameVal); }
                  if (e.key === 'Escape') { setNameVal(data.objectName); setEditingName(false); }
                }}
                sx={{ width: '100%' }} />
            : <Typography sx={{ fontWeight: 700, color: isUnknown ? 'text.primary' : '#4fc3f7', fontSize: 12, cursor: 'text' }}
                onDoubleClick={() => setEditingName(true)}>{data.objectName}</Typography>}
        </Box>
      )}

      {/* Fields / Markdown content */}
      {isMarkdownView ? (
        <Box onPointerDown={(e) => e.stopPropagation()} sx={{ flex: 1, overflow: 'auto', touchAction: 'pan-y', ...(t.height === 0 ? { height: 400 } : {}) }}>
          <MarkdownViewContent
            src={String(data.properties['src'] ?? '')}
            userName={data.userName}
          />
        </Box>
      ) : (
        <Box onPointerDown={(e) => e.stopPropagation()} sx={{ px: 1, py: 0.25, flex: 1, overflow: 'auto', touchAction: 'pan-y', ...(t.height === 0 ? { maxHeight: 320 } : {}) }}>
          {data.fields.length === 0 && !isUnknown && (
            <Typography sx={{ fontSize: 10, color: 'text.disabled', py: 0.5, fontStyle: 'italic' }}>no fields</Typography>
          )}
          {data.fields.map((f) => {
            const qtype = detectFieldType(f.type);
            const val = data.properties[f.name] ?? defaultForType(qtype);
            const isFieldSelected = data.selectedFieldName === f.name;
            return (
              <Box key={f.name}
                onClick={(e) => { e.stopPropagation(); data.onFieldSelect(f.name); }}
                sx={{
                  py: 0.375, borderBottom: '1px solid', borderColor: 'divider',
                  cursor: 'pointer',
                  bgcolor: isFieldSelected ? 'rgba(79,195,247,0.1)' : 'transparent',
                  borderLeft: isFieldSelected ? '2px solid #4fc3f7' : '2px solid transparent',
                  pl: isFieldSelected ? 0.25 : 0,
                }}>
                {(isUnknown || data.showDetails) && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.125 }}>
                    {isUnknown ? (
                      <>
                        <EditableFieldName name={f.name} onRename={(n) => data.onFieldRename(f.name, n)} />
                        <Select size="small" value={qtype} onChange={(e) => data.onFieldTypeChange(f.name, e.target.value)} variant="standard"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          MenuProps={{ onClick: (e: React.MouseEvent) => e.stopPropagation(), disablePortal: false }}
                          sx={{ fontSize: 9, '& .MuiSelect-select': { py: 0, fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic', fontFamily: 'monospace' } }}>
                          {FIELD_TYPES.map((t) => <MenuItem key={t} value={t} sx={{ fontSize: 11 }}>{t}</MenuItem>)}
                        </Select>
                        <Box sx={{ flex: 1 }} />
                        <IconButton size="small" sx={{ p: 0.125 }} onClick={(e) => { e.stopPropagation(); data.onFieldRemove(f.name); }}>
                          <CloseIcon sx={{ fontSize: 11, color: 'error.main', opacity: 0.5 }} />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <Typography sx={{ fontSize: 10, color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{f.name}</Typography>
                        <Typography sx={{ fontSize: 9, color: '#4fc3f7aa', fontStyle: 'italic', fontFamily: 'monospace' }}>{f.type}</Typography>
                      </>
                    )}
                  </Box>
                )}
                <FieldWidget fieldType={qtype} value={val} onChange={(v) => data.onPropertyChange(f.name, v)} userName={data.userName} />
              </Box>
            );
          })}
          {isUnknown && <AddFieldRow onAdd={(name, type) => data.onFieldAdd(name, type)} />}
        </Box>
      )}
    </Box>
  );
};

const NODE_TYPES = { dashObject: DashObjectNode };

// ─── Main editor ─────────────────────────────────────────────────────────────

const DashEditorInner: React.FC<DashEditorPanelProps> = ({ userName, filePath }) => {
  const { setCenter } = useReactFlow();
  const [scene, setScene] = useState<DashScene>({ type: 'dash-scene', version: 1, objects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umlSources, setUmlSources] = useState<UmlSource[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPathLoading, setImportPathLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sourceCtxMenu, setSourceCtxMenu] = useState<{ mouseX: number; mouseY: number; sourceId: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedField, setSelectedField] = useState<{ objId: string; fieldName: string } | null>(null);
  const [clipboard, setClipboard] = useState<{ objects: DashObject[] } | null>(null);
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);
  const [sceneCtxMenu, setSceneCtxMenu] = useState<{ mouseX: number; mouseY: number; objId: string | null } | null>(null);

  const openSceneCtx = useCallback((e: React.MouseEvent, objId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (objId) setSelectedIds(new Set([objId]));
    setSceneCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, objId });
  }, []);

  const closeSceneCtx = useCallback(() => setSceneCtxMenu(null), []);
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [visiblePanels, setVisiblePanels] = useState<string[]>(['scene', 'properties']);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef<DashScene>({ type: 'dash-scene', version: 1, objects: [] });

  const classes = useMemo<UmlClassDef[]>(() => {
    const allUser = umlSources.flatMap((s) => s.classes);
    const userNames = new Set(allUser.map((c) => c.name));
    return [...BUILT_IN_CLASSES.filter((c) => !userNames.has(c.name)), ...allUser];
  }, [umlSources]);

  const classMap = useMemo(() => {
    const m = new Map<string, UmlClassDef>();
    for (const c of classes) m.set(c.name, c);
    return m;
  }, [classes]);

  const scheduleSave = useCallback((s: DashScene) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      vfsWrite(userName, filePath, JSON.stringify(s, null, 2))
        .catch((e) => console.error('[DashEditor] save failed:', e));
    }, 1500);
  }, [userName, filePath]);

  const updateScene = useCallback((updater: (prev: DashScene) => DashScene) => {
    setScene((prev) => { const next = updater(prev); sceneRef.current = next; scheduleSave(next); return next; });
  }, [scheduleSave]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const text = await vfsRead(userName, filePath);
        const raw = JSON.parse(text) as Omit<DashScene, 'objects'> & { objects: LegacyDashObject[]; umlProjectPath?: string };
        const parsed: DashScene = {
          ...raw,
          objects: raw.objects.map((o): DashObject => ({
            id: o.id, className: o.className, objectName: o.objectName,
            customFields: o.customFields, properties: o.properties,
            transform: o.transform ?? defaultTransform(o.x ?? 0, o.y ?? 0),
          })),
        };
        setScene(parsed);
        sceneRef.current = parsed;
        // Migrate old single-path format + load all sources
        const sourcePaths: Array<{ id: string; path: string }> =
          parsed.umlSources ??
          (raw.umlProjectPath ? [{ id: makeId(), path: raw.umlProjectPath }] : []);
        if (sourcePaths.length > 0) {
          const results = await Promise.all(sourcePaths.map(async (src) => {
            try {
              const clsList = parseUmlProject(await vfsRead(userName, src.path));
              const name = src.path.split('/').pop()?.replace(/\.umlproj\.json$/, '') ?? src.path;
              return { ...src, name, classes: clsList } as UmlSource;
            } catch { return null; }
          }));
          setUmlSources(results.filter((r): r is UmlSource => r !== null));
        }
      } catch {
        const demo = makeDemoScene();
        setScene(demo); sceneRef.current = demo; scheduleSave(demo);
      } finally {
        setLoading(false);
      }
    })();
  }, [userName, filePath, scheduleSave]);

  const importUmlSource = useCallback(async (path: string) => {
    const p = path.trim();
    if (!p) return;
    setImportPathLoading(true);
    setImportError(null);
    try {
      const clsList = parseUmlProject(await vfsRead(userName, p));
      const name = p.split('/').pop()?.replace(/\.umlproj\.json$/, '') ?? p;
      // Compute next outside updater to avoid calling setState inside setState
      const prev = umlSources;
      const existing = prev.find((s) => s.path === p);
      const next: UmlSource[] = existing
        ? prev.map((s) => s.path === p ? { ...s, classes: clsList } : s)
        : [...prev, { id: makeId(), path: p, name, classes: clsList }];
      const newId = existing ? null : next[next.length - 1].id;
      setUmlSources(next);
      updateScene((sc) => ({ ...sc, umlSources: next.map((s) => ({ id: s.id, path: s.path })) }));
      if (newId) setExpandedSources((ex) => { const n = new Set(ex); n.add(newId); return n; });
      setShowImportDialog(false);
    } catch (e) {
      setImportError(`Cannot load: ${(e as Error).message}`);
    } finally {
      setImportPathLoading(false);
    }
  }, [userName, umlSources, updateScene]);

  const reloadUmlSource = useCallback(async (sourceId: string) => {
    const src = umlSources.find((s) => s.id === sourceId);
    if (!src) return;
    try {
      const clsList = parseUmlProject(await vfsRead(userName, src.path));
      setUmlSources((prev) => prev.map((s) => s.id === sourceId ? { ...s, classes: clsList } : s));
    } catch (e) { setError(`Reload failed: ${(e as Error).message}`); }
  }, [umlSources, userName]);

  const removeUmlSource = useCallback((sourceId: string) => {
    setUmlSources((prev) => {
      const next = prev.filter((s) => s.id !== sourceId);
      updateScene((sc) => ({ ...sc, umlSources: next.map((s) => ({ id: s.id, path: s.path })) }));
      return next;
    });
  }, [updateScene]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    void vfsWrite(userName, filePath, JSON.stringify(sceneRef.current, null, 2));
  }, [userName, filePath]);

  const saveRaw = useCallback(() => {
    const raw = sceneRef.current.objects.map((obj) => ({
      objectName: obj.objectName,
      className: obj.className,
      properties: obj.properties,
    }));
    const rawPath = toAbsVfsPath(userName, filePath).replace(/\.[^./]+$/, '') + '.data.json';
    void vfsWrite(userName, rawPath, JSON.stringify(raw, null, 2));
  }, [userName, filePath]);

  const createObject = useCallback((cls: UmlClassDef) => {
    const count = sceneRef.current.objects.length;
    const isCustom = cls.name === 'Unknown';
    const props: Record<string, DashValue> = {};
    for (const f of cls.fields) props[f.name] = defaultForType(detectFieldType(f.type));
    const base = autoTransform(count);
    const transform: DashTransform = cls.name === 'MarkdownView'
      ? { ...base, width: 320, height: 400 }
      : base;
    const obj: DashObject = {
      id: makeId(),
      className: cls.name,
      objectName: `${cls.name.charAt(0).toLowerCase()}${cls.name.slice(1)}${count}`,
      transform,
      ...(isCustom ? { customFields: [] } : {}),
      properties: props,
    };
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, obj] }));
    setSelectedIds(new Set([obj.id]));
  }, [updateScene]);

  const updateProperty = useCallback((objId: string, field: string, value: DashValue) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, properties: { ...o.properties, [field]: value } } : o) }));
  }, [updateScene]);

  const updateObjectName = useCallback((objId: string, name: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id === objId ? { ...o, objectName: name } : o) }));
  }, [updateScene]);

  const updateTransform = useCallback((objId: string, patch: Partial<DashTransform>) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, transform: { ...getTransform(o), ...patch } } : o),
    }));
  }, [updateScene]);

  const addCustomField = useCallback((objId: string, name: string, type: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      if ((o.customFields ?? []).find((f) => f.name === name)) return o;
      return { ...o, customFields: [...(o.customFields ?? []), { name, type }], properties: { ...o.properties, [name]: defaultForType(detectFieldType(type)) } };
    })}));
  }, [updateScene]);

  const removeCustomField = useCallback((objId: string, fieldName: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      const props = { ...o.properties }; delete props[fieldName];
      return { ...o, customFields: (o.customFields ?? []).filter((f) => f.name !== fieldName), properties: props };
    })}));
  }, [updateScene]);

  const changeCustomFieldType = useCallback((objId: string, fieldName: string, newType: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => o.id !== objId ? o : {
      ...o,
      customFields: (o.customFields ?? []).map((f) => f.name === fieldName ? { ...f, type: newType } : f),
      properties: { ...o.properties, [fieldName]: defaultForType(detectFieldType(newType)) },
    })}));
  }, [updateScene]);

  const renameCustomField = useCallback((objId: string, oldName: string, newName: string) => {
    updateScene((prev) => ({ ...prev, objects: prev.objects.map((o) => {
      if (o.id !== objId) return o;
      const props = { ...o.properties, [newName]: o.properties[oldName] }; delete props[oldName];
      return { ...o, customFields: (o.customFields ?? []).map((f) => f.name === oldName ? { ...f, name: newName } : f), properties: props };
    })}));
  }, [updateScene]);

  const toggleShowDetails = useCallback((objId: string) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, showDetails: !o.showDetails } : o),
    }));
  }, [updateScene]);

  const toggleShowHeader = useCallback((objId: string) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, showHeader: !(o.showHeader ?? false) } : o),
    }));
  }, [updateScene]);

  const updateZIndex = useCallback((objId: string, v: number) => {
    updateScene((prev) => ({
      ...prev,
      objects: prev.objects.map((o) => o.id === objId ? { ...o, zIndex: v } : o),
    }));
  }, [updateScene]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.size) return;
    updateScene((prev) => ({ ...prev, objects: prev.objects.filter((o) => !selectedIds.has(o.id)) }));
    setSelectedIds(new Set());
  }, [selectedIds, updateScene]);

  const cutSelected = useCallback(() => {
    const objs = sceneRef.current.objects.filter((o) => selectedIds.has(o.id));
    if (!objs.length) return;
    setClipboard({ objects: objs });
    updateScene((prev) => ({ ...prev, objects: prev.objects.filter((o) => !selectedIds.has(o.id)) }));
    setSelectedIds(new Set());
  }, [selectedIds, updateScene]);

  const copySelected = useCallback(() => {
    const objs = sceneRef.current.objects.filter((o) => selectedIds.has(o.id));
    if (!objs.length) return;
    setClipboard({ objects: objs });
  }, [selectedIds]);

  const paste = useCallback(() => {
    if (!clipboard) return;
    const count = sceneRef.current.objects.length;
    const newObjs = clipboard.objects.map((o, i) => {
      const t = getTransform(o);
      return { ...o, id: makeId(), transform: { ...t, x: autoTransform(count + i).x, y: autoTransform(count + i).y } };
    });
    updateScene((prev) => ({ ...prev, objects: [...prev.objects, ...newObjs] }));
    setSelectedIds(new Set(newObjs.map((o) => o.id)));
  }, [clipboard, updateScene]);

  const objectIds = useMemo(() => new Set(scene.objects.map((o) => o.id)), [scene.objects]);

  const selectedObject = useMemo(() => {
    if (selectedIds.size !== 1) return null;
    const id = [...selectedIds][0];
    return scene.objects.find((o) => o.id === id) ?? null;
  }, [scene.objects, selectedIds]);

  const selectedFields = useMemo((): FieldDef[] => {
    if (!selectedObject) return [];
    const isCustom = selectedObject.className === 'Unknown' || selectedObject.customFields !== undefined;
    return isCustom ? (selectedObject.customFields ?? []) : (classMap.get(selectedObject.className)?.fields ?? []);
  }, [selectedObject, classMap]);

  useEffect(() => { setSelectedField(null); }, [selectedIds]);

  const selectedFieldDef = useMemo((): FieldDef | null => {
    if (!selectedField || !selectedObject) return null;
    if (selectedField.objId !== selectedObject.id) return null;
    return selectedFields.find((f) => f.name === selectedField.fieldName) ?? null;
  }, [selectedField, selectedObject, selectedFields]);

  const rfNodes = useMemo((): Node<DashObjectNodeData>[] =>
    scene.objects.map((obj) => {
      const isCustom = obj.className === 'Unknown' || obj.customFields !== undefined;
      const fields: FieldDef[] = isCustom ? (obj.customFields ?? []) : (classMap.get(obj.className)?.fields ?? []);
      const t = getTransform(obj);
      return {
        id: obj.id, type: 'dashObject',
        position: { x: t.x, y: t.y },
        selected: selectedIds.has(obj.id),
        zIndex: obj.zIndex ?? 0,
        dragHandle: '.dash-drag-handle',
        data: {
          objectName: obj.objectName, className: obj.className, fields, properties: obj.properties,
          transform: t, selected: selectedIds.has(obj.id), userName, isCustom,
          onPropertyChange: (field: string, value: DashValue) => updateProperty(obj.id, field, value),
          onObjectNameChange: (name: string) => updateObjectName(obj.id, name),
          onFieldAdd: (name: string, type: string) => addCustomField(obj.id, name, type),
          onFieldRemove: (name: string) => removeCustomField(obj.id, name),
          onFieldTypeChange: (name: string, newType: string) => changeCustomFieldType(obj.id, name, newType),
          onFieldRename: (oldName: string, newName: string) => renameCustomField(obj.id, oldName, newName),
          onResizeDrag: (width: number, height: number) => updateTransform(obj.id, { width, height }),
          showDetails: obj.showDetails ?? false,
          showHeader: obj.showHeader ?? false,
          selectedFieldName: selectedField?.objId === obj.id ? selectedField.fieldName : null,
          onFieldSelect: (fieldName: string | null) => setSelectedField(fieldName ? { objId: obj.id, fieldName } : null),
        },
      };
    }),
  [scene.objects, classMap, selectedIds, selectedField, userName, updateProperty, updateObjectName, addCustomField, removeCustomField, changeCustomFieldType, renameCustomField, updateTransform]);

  const rfEdges = useMemo((): Edge[] => {
    const edges: Edge[] = [];
    for (const obj of scene.objects) {
      for (const [field, val] of Object.entries(obj.properties)) {
        if (typeof val === 'string' && objectIds.has(val))
          edges.push({ id: `${obj.id}-${field}-${val}`, source: obj.id, target: val, label: field });
      }
    }
    return edges;
  }, [scene.objects, objectIds]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const posChanges = changes.filter(
      (c) => c.type === 'position' && c.position &&
        Number.isFinite(c.position.x) && Number.isFinite(c.position.y),
    );
    if (posChanges.length > 0) {
      updateScene((prev) => ({ ...prev, objects: prev.objects.map((obj) => {
        const pc = posChanges.find((c) => c.type === 'position' && c.id === obj.id);
        if (pc && pc.type === 'position' && pc.position)
          return { ...obj, transform: { ...getTransform(obj), x: pc.position.x, y: pc.position.y } };
        return obj;
      })}));
    }
    const selChanges = changes.filter((c) => c.type === 'select');
    if (selChanges.length > 0) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const c of selChanges) { if (c.type === 'select') { if (c.selected) next.add(c.id); else next.delete(c.id); } }
        return next;
      });
    }
  }, [updateScene]);

  const onEdgesChange = useCallback((_: EdgeChange[]) => {}, []);
  const onConnect = useCallback((_: Connection) => {}, []);

  const filteredObjects = useMemo(() => {
    if (!searchText) return scene.objects;
    const q = searchText.toLowerCase();
    return scene.objects.filter((o) => o.objectName.toLowerCase().includes(q) || o.className.toLowerCase().includes(q));
  }, [scene.objects, searchText]);

  const toggleSelect = useCallback((id: string, multi: boolean) => {
    setSelectedIds((prev) => {
      if (multi) { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }
      return new Set([id]);
    });
  }, []);

  const flyTo = useCallback((objId: string) => {
    const obj = sceneRef.current.objects.find((o) => o.id === objId);
    if (!obj) return;
    const t = getTransform(obj);
    const cx = t.x + (t.width > 0 ? t.width / 2 : 100);
    const cy = t.y + (t.height > 0 ? t.height / 2 : 60);
    setCenter(cx, cy, { zoom: 1.2, duration: 450 });
  }, [setCenter]);

  const showTypes = visiblePanels.includes('types');
  const showScene = visiblePanels.includes('scene');
  const showProperties = visiblePanels.includes('properties');

  if (loading) return <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><CircularProgress size={28} /></Box>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, bgcolor: 'background.paper' }}>
        <ToggleButtonGroup size="small" value={visiblePanels} onChange={(_, val: string[]) => setVisiblePanels(val)}>
          <ToggleButton value="types" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <ViewSidebarIcon sx={{ fontSize: 16, transform: 'scaleX(-1)' }} />
            Types
          </ToggleButton>
          <ToggleButton value="scene" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <ViewListIcon sx={{ fontSize: 16 }} />
            Scene
          </ToggleButton>
          <ToggleButton value="properties" sx={{ px: 1, py: 0.25, gap: 0.5, fontSize: 11 }}>
            <TuneIcon sx={{ fontSize: 16 }} />
            Properties
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" onClick={() => { setImportError(null); setShowImportDialog(true); }}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>Import UML</Button>
        <Button size="small" variant="outlined" onClick={saveNow}
          sx={{ fontSize: 11, py: 0.25, textTransform: 'none' }}>Save</Button>
        <Tooltip title={`Saves only objects + properties to ${filePath.replace(/\.[^./]+$/, '')}.data.json`}>
          <Button size="small" variant="outlined" onClick={saveRaw}
            sx={{ fontSize: 11, py: 0.25, textTransform: 'none', color: 'text.secondary' }}>Save Raw</Button>
        </Tooltip>
      </Box>

      {/* ── Main area ── */}
      <Box sx={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Types ── */}
        {showTypes && (
          <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Types</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {/* Built-in group */}
              <Box sx={{ px: 1, pt: 0.75, pb: 0.25 }}>
                <Typography sx={{ fontSize: 9, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5 }}>Built-in</Typography>
              </Box>
              <List dense disablePadding>
                {BUILT_IN_CLASSES.map((cls) => (
                  <ListItemButton key={cls.name} onClick={() => createObject(cls)} sx={{ py: 0.375, px: 1.5 }}>
                    <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center' }}>
                      {cls.name === 'Unknown' ? <HelpOutlineIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
                        : cls.name === 'MarkdownView' ? <ArticleIcon sx={{ fontSize: 13, color: '#4fc3f7' }} />
                        : <CircleIcon sx={{ fontSize: 9, color: '#4fc3f7' }} />}
                    </Box>
                    <ListItemText
                      primary={cls.name}
                      secondary={cls.name === 'Unknown' ? 'dynamic fields' : cls.name === 'MarkdownView' ? 'renders markdown content' : cls.fields.map((f) => f.name).join(', ')}
                      primaryTypographyProps={{ fontSize: 12 }}
                      secondaryTypographyProps={{ fontSize: 9, noWrap: true, fontStyle: cls.name === 'Unknown' ? 'italic' : 'normal' }}
                    />
                  </ListItemButton>
                ))}
              </List>
              {/* UML sources */}
              {umlSources.map((src) => {
                const expanded = expandedSources.has(src.id);
                return (
                  <Box key={src.id}>
                    <Divider />
                    <ListItemButton
                      onContextMenu={(e) => { e.preventDefault(); setSourceCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, sourceId: src.id }); }}
                      onClick={() => setExpandedSources((prev) => { const n = new Set(prev); expanded ? n.delete(src.id) : n.add(src.id); return n; })}
                      sx={{ py: 0.5, px: 1, gap: 0.5 }}>
                      {expanded ? <ExpandMoreIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} /> : <ChevronRightIcon sx={{ fontSize: 14, color: 'text.secondary', flexShrink: 0 }} />}
                      <AbcIcon sx={{ fontSize: 14, color: '#4fc3f7', flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</Typography>
                    </ListItemButton>
                    {expanded && (
                      <List dense disablePadding>
                        {src.classes.length === 0 && (
                          <Typography sx={{ fontSize: 10, color: 'text.disabled', px: 3, py: 0.5, fontStyle: 'italic' }}>No classes</Typography>
                        )}
                        {src.classes.map((cls) => (
                          <ListItemButton key={cls.name} onClick={() => createObject(cls)} sx={{ py: 0.375, pl: 3, pr: 1 }}>
                            <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center' }}>
                              {cls.kind === 'abstract' ? <AbcIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                                : <CircleIcon sx={{ fontSize: 9, color: '#4fc3f7' }} />}
                            </Box>
                            <ListItemText
                              primary={cls.name}
                              secondary={cls.fields.map((f) => f.name).join(', ')}
                              primaryTypographyProps={{ fontSize: 12 }}
                              secondaryTypographyProps={{ fontSize: 9, noWrap: true }}
                            />
                          </ListItemButton>
                        ))}
                      </List>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* ── Scene ── */}
        {showScene && (
          <Box sx={{ width: 200, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>Scene</Typography>
              <Tooltip title="Search"><IconButton size="small" onClick={() => setShowSearch((v) => !v)}><SearchIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Box>
            {showSearch && (
              <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <TextField size="small" placeholder="Filter…" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                  autoFocus fullWidth inputProps={{ style: { fontSize: 11 } }} />
              </Box>
            )}
            <Box sx={{ flex: 1, overflow: 'auto' }} onContextMenu={(e) => openSceneCtx(e, null)}>
              {filteredObjects.length === 0 && (
                <Typography sx={{ fontSize: 11, color: 'text.disabled', p: 1.5, fontStyle: 'italic' }}>
                  {scene.objects.length === 0 ? 'Right-click to add' : 'No matches'}
                </Typography>
              )}
              <List dense disablePadding>
                {filteredObjects.map((obj) => (
                  <ListItemButton key={obj.id} selected={selectedIds.has(obj.id)}
                    onClick={(e) => toggleSelect(obj.id, e.ctrlKey || e.metaKey)}
                    onDoubleClick={() => flyTo(obj.id)}
                    onContextMenu={(e) => openSceneCtx(e, obj.id)}
                    sx={{ py: 0.5, px: 1.5, '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText' }, '&.Mui-selected:hover': { bgcolor: 'primary.dark' } }}>
                    <ListItemText
                      primary={<Typography component="span" sx={{ fontSize: 12 }}>
                        <strong>{obj.objectName}</strong>
                        <Typography component="span" sx={{ fontSize: 11, color: selectedIds.has(obj.id) ? 'inherit' : 'text.secondary' }}> :{obj.className}</Typography>
                      </Typography>}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          </Box>
        )}

        {/* ── Canvas ── */}
        <Box sx={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}>
          {error && <Alert severity="error" onClose={() => setError(null)} sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10 }}>{error}</Alert>}
          <ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            fitView minZoom={0.2} maxZoom={3} style={{ width: '100%', height: '100%' }}>
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </Box>

        {/* ── Properties ── */}
        {showProperties && (
          <Box sx={{ width: 220, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Properties</Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <PropertiesPanel
                object={selectedObject}
                fields={selectedFields}
                userName={userName}
                onObjectNameChange={updateObjectName}
                onTransformChange={updateTransform}
                onPropertyChange={updateProperty}
                showDetails={selectedObject?.showDetails ?? false}
                onToggleShowDetails={() => { if (selectedObject) toggleShowDetails(selectedObject.id); }}
                showHeader={selectedObject?.showHeader ?? false}
                onToggleShowHeader={() => { if (selectedObject) toggleShowHeader(selectedObject.id); }}
                zIndex={selectedObject?.zIndex ?? 0}
                onZIndexChange={updateZIndex}
                selectedFieldDef={selectedFieldDef}
                isCustom={selectedObject?.className === 'Unknown' || selectedObject?.customFields !== undefined}
                onFieldTypeChange={(fieldName, newType) => { if (selectedObject) changeCustomFieldType(selectedObject.id, fieldName, newType); }}
              />
            </Box>
          </Box>
        )}

      </Box>

      {/* New-object submenu (used from within scene context menu) */}
      <Menu anchorEl={newMenuAnchor} open={Boolean(newMenuAnchor)} onClose={() => setNewMenuAnchor(null)} MenuListProps={{ dense: true }}>
        {classes.map((cls) => (
          <MenuItem key={cls.name} onClick={() => { createObject(cls); setNewMenuAnchor(null); closeSceneCtx(); }} sx={{ fontSize: 13 }}>{cls.name}</MenuItem>
        ))}
      </Menu>

      {/* Scene context menu */}
      <Menu
        open={Boolean(sceneCtxMenu)}
        onClose={closeSceneCtx}
        anchorReference="anchorPosition"
        anchorPosition={sceneCtxMenu ? { top: sceneCtxMenu.mouseY, left: sceneCtxMenu.mouseX } : undefined}
        MenuListProps={{ dense: true }}
      >
        <MenuItem onClick={(e) => { setNewMenuAnchor(e.currentTarget); }} sx={{ fontSize: 13, gap: 1 }}>
          <AddIcon fontSize="small" />New…
        </MenuItem>
        <Divider />
        <MenuItem disabled={!selectedIds.size} onClick={() => { cutSelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentCutIcon fontSize="small" />Cut
        </MenuItem>
        <MenuItem disabled={!selectedIds.size} onClick={() => { copySelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentCopyIcon fontSize="small" />Copy
        </MenuItem>
        <MenuItem disabled={!clipboard} onClick={() => { paste(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1 }}>
          <ContentPasteIcon fontSize="small" />Paste
        </MenuItem>
        <Divider />
        <MenuItem disabled={!selectedIds.size} onClick={() => { deleteSelected(); closeSceneCtx(); }} sx={{ fontSize: 13, gap: 1, color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />Delete
        </MenuItem>
      </Menu>

      {/* UML source context menu */}
      <Menu
        open={Boolean(sourceCtxMenu)}
        onClose={() => setSourceCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={sourceCtxMenu ? { top: sourceCtxMenu.mouseY, left: sourceCtxMenu.mouseX } : undefined}
        MenuListProps={{ dense: true }}
      >
        <MenuItem onClick={() => { if (sourceCtxMenu) { void reloadUmlSource(sourceCtxMenu.sourceId); } setSourceCtxMenu(null); }} sx={{ fontSize: 13, gap: 1 }}>
          <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />Reload
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (sourceCtxMenu) removeUmlSource(sourceCtxMenu.sourceId); setSourceCtxMenu(null); }} sx={{ fontSize: 13, gap: 1, color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" />Remove
        </MenuItem>
      </Menu>

      {/* Import UML dialog */}
      <UmlImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        userName={userName}
        onImport={importUmlSource}
        loading={importPathLoading}
        importError={importError}
      />
    </Box>
  );
};

const DashEditorPanel: React.FC<DashEditorPanelProps> = (props) => (
  <ReactFlowProvider><DashEditorInner {...props} /></ReactFlowProvider>
);

export default DashEditorPanel;
