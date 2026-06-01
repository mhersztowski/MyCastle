import React, { useCallback, useEffect, useState } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import EditIcon from '@mui/icons-material/Edit';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ViewInArOutlinedIcon from '@mui/icons-material/ViewInArOutlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';

// ── Types ────────────────────────────────────────────────────────────────────

export type CadViewMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics';

const MODE_LABELS: Record<CadViewMode, string> = {
  cad: 'CAD 2D',
  cad3d: 'CAD 3D',
  scene3d: 'Scene 3D',
  electronics: 'Electronics',
};

const MODE_ICONS: Record<CadViewMode, React.ReactNode> = {
  cad: <PentagonOutlinedIcon sx={{ fontSize: 16 }} />,
  cad3d: <ViewInArOutlinedIcon sx={{ fontSize: 16 }} />,
  scene3d: <ViewInArIcon sx={{ fontSize: 16 }} />,
  electronics: <ElectricalServicesIcon sx={{ fontSize: 16 }} />,
};

// ── Global CAD base URL (configured once, persisted in localStorage) ─────────

const CAD_URL_KEY = 'cad_base_url';
const DEFAULT_CAD_URL = 'http://localhost:1898';

function getCadBaseUrl(): string {
  return localStorage.getItem(CAD_URL_KEY) || DEFAULT_CAD_URL;
}

function setCadBaseUrl(url: string) {
  localStorage.setItem(CAD_URL_KEY, url);
}

// ── Project fetcher ──────────────────────────────────────────────────────────

interface ProjectEntry {
  name: string;   // display label
  path: string;   // full VFS path (without extension) — stored in embed attrs
}

const ELEC_EXT = '.elec.json';
const CAD_EXT  = '.cad.json';

async function fetchProjects(mode: CadViewMode): Promise<ProjectEntry[]> {
  const base = getCadBaseUrl().replace(/\/$/, '');
  const userId = 'default';
  try {
    if (mode === 'scene3d') {
      // Flat list: project/file — each JSON file is a separate entry
      const projRes = await fetch(`${base}/api/scene3d/projects?user=${userId}`, { signal: AbortSignal.timeout(4000) });
      if (!projRes.ok) return [];
      const projData = (await projRes.json()) as { projects?: { name: string }[] };
      const projects = projData.projects ?? [];
      const entries: ProjectEntry[] = [];
      await Promise.all(projects.map(async proj => {
        try {
          const fileRes = await fetch(`${base}/api/scene3d/projects/${encodeURIComponent(proj.name)}?user=${userId}`, { signal: AbortSignal.timeout(4000) });
          if (!fileRes.ok) return;
          const fileData = (await fileRes.json()) as { files?: { name: string }[] };
          for (const f of fileData.files ?? []) {
            entries.push({
              name: `${proj.name} / ${f.name}`,
              path: `users/${userId}/scene3d/${proj.name}/${f.name}`,
            });
          }
        } catch { /* skip project on error */ }
      }));
      return entries;
    } else {
      const ext = mode === 'electronics' ? ELEC_EXT : CAD_EXT;
      const res = await fetch(`${base}/api/vfs/readdir?path=/users/${userId}/projects`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return [];
      const data = (await res.json()) as { entries: { name: string; type: number }[] };
      return (data.entries ?? [])
        .filter(e => e.name.endsWith(ext))
        .map(e => ({ name: e.name.slice(0, -ext.length), path: `users/${userId}/projects/${e.name.slice(0, -ext.length)}` }));
    }
  } catch {
    return [];
  }
}

// ── Viewer URL builder (used only by the picker on confirm) ─────────────────

function buildViewerUrl(mode: CadViewMode, vfsPath: string): string {
  const base = getCadBaseUrl().replace(/\/$/, '');
  return `${base}/viewer/${mode}/${vfsPath}`;
}

// ── Settings dialog ──────────────────────────────────────────────────────────

function SettingsDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [url, setUrl] = useState(getCadBaseUrl);

  const handleSave = () => { setCadBaseUrl(url.trim() || DEFAULT_CAD_URL); onClose(); };

  return (
    <Dialog open={open} onClose={handleSave} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography fontWeight={600}>CAD App Settings</Typography>
        <IconButton size="small" onClick={handleSave}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <TextField
          label="CAD App base URL"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          size="small"
          fullWidth
          placeholder={DEFAULT_CAD_URL}
          helperText="Deployed URL of the CAD app — used by all CAD embeds in this browser."
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Project picker dialog ────────────────────────────────────────────────────

interface PickerProps {
  open: boolean;
  initialMode: CadViewMode;
  initialUrl: string;
  onClose(): void;
  /** url is the full viewer URL (includes server+port) */
  onConfirm(mode: CadViewMode, url: string): void;
}

function ProjectPickerDialog({ open, initialMode, initialUrl, onClose, onConfirm }: PickerProps) {
  const [mode, setMode] = useState<CadViewMode>(initialMode);
  const [projects, setProjects] = useState<ProjectEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchProjects(mode).then(setProjects).finally(() => setLoading(false));
  }, [open, mode]);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={600}>Select CAD Project</Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="CAD app URL settings">
              <IconButton size="small" onClick={() => setSettingsOpen(true)}><SettingsIcon fontSize="small" /></IconButton>
            </Tooltip>
            <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Fetching from: <strong>{getCadBaseUrl()}</strong>
          </Typography>
          <Tabs
            value={mode}
            onChange={(_, v: CadViewMode) => setMode(v)}
            variant="fullWidth"
            sx={{ mb: 1.5, '& .MuiTab-root': { minHeight: 32, fontSize: 11, px: 0.5 } }}
          >
            {(Object.keys(MODE_LABELS) as CadViewMode[]).map(m => (
              <Tab key={m} value={m} label={MODE_LABELS[m]} icon={MODE_ICONS[m] as React.ReactElement} iconPosition="start" />
            ))}
          </Tabs>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              {projects.length === 0 ? (
                <ListItemButton disabled>
                  <ListItemText primary="No projects found" secondary="Check the CAD app URL in settings" />
                </ListItemButton>
              ) : projects.map(p => {
                const url = buildViewerUrl(mode, p.path);
                return (
                  <ListItemButton
                    key={p.path}
                    selected={url === initialUrl}
                    onClick={() => { onConfirm(mode, url); onClose(); }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>{MODE_ICONS[mode]}</ListItemIcon>
                    <ListItemText primary={p.name} secondary={url} secondaryTypographyProps={{ sx: { fontSize: 9, opacity: 0.5 } }} />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </DialogContent>
      </Dialog>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

// ── Node view ────────────────────────────────────────────────────────────────

function CadViewNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const mode = (node.attrs.mode as CadViewMode) || 'scene3d';
  const url: string = node.attrs.url || '';
  const [pickerOpen, setPickerOpen] = useState(!url);

  // Display name: last path segment of the viewer URL
  const label = url ? decodeURIComponent(url.split('/').pop() ?? url) : '';

  const handleConfirm = useCallback((m: CadViewMode, viewerUrl: string) => {
    updateAttributes({ mode: m, url: viewerUrl });
  }, [updateAttributes]);

  const isEditable = editor.isEditable;

  return (
    <NodeViewWrapper>
      <Box
        contentEditable={false}
        sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', my: 1, bgcolor: 'background.paper' }}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, bgcolor: 'background.default', borderBottom: '1px solid', borderColor: 'divider' }}>
          {MODE_ICONS[mode]}
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
            {label || <em style={{ opacity: 0.5 }}>No project selected</em>}
          </Typography>
          <Chip label={MODE_LABELS[mode]} size="small" sx={{ fontSize: 10, height: 18 }} />
          {isEditable && (
            <Tooltip title="Change project">
              <IconButton size="small" onClick={() => setPickerOpen(true)}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
          {url && (
            <Tooltip title="Open in CAD app">
              <IconButton size="small" component="a" href={url} target="_blank" rel="noopener noreferrer">
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Content */}
        {url ? (
          <Box component="iframe" src={url} sx={{ display: 'block', width: '100%', height: 360, border: 'none' }} title={`${MODE_LABELS[mode]}: ${label}`} />
        ) : (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Click the edit icon to select a project.
            </Typography>
          </Box>
        )}
      </Box>

      <ProjectPickerDialog
        open={pickerOpen}
        initialMode={mode}
        initialUrl={url}
        onClose={() => setPickerOpen(false)}
        onConfirm={handleConfirm}
      />
    </NodeViewWrapper>
  );
}

// ── TipTap node ──────────────────────────────────────────────────────────────

export const CadViewEmbed = Node.create({
  name: 'cadViewEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      mode: { default: 'scene3d' },
      url:  { default: '' },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-type="cad-view-embed"]',
      getAttrs(node) {
        if (typeof node === 'string') return false;
        const el = node as HTMLElement;
        return {
          mode: el.getAttribute('data-mode') || 'scene3d',
          url:  el.getAttribute('data-url')  || '',
        };
      },
    }];
  },

  renderHTML({ node }) {
    return ['div', { 'data-type': 'cad-view-embed', 'data-mode': node.attrs.mode, 'data-url': node.attrs.url }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CadViewNodeView);
  },

  addCommands() {
    return {
      insertCadView: (mode: CadViewMode = 'scene3d', url = '') => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { mode, url } }),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cadViewEmbed: {
      insertCadView: (mode?: CadViewMode, url?: string) => ReturnType;
    };
  }
}

export default CadViewEmbed;
