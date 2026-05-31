import { useState, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StorageIcon from '@mui/icons-material/Storage';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import PentagonOutlinedIcon from '@mui/icons-material/PentagonOutlined';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import Looks3OutlinedIcon from '@mui/icons-material/Looks3Outlined';
import ElectricalServicesIcon from '@mui/icons-material/ElectricalServices';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CancelIcon from '@mui/icons-material/Cancel';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateMode = 'cad' | 'cad3d' | 'scene3d' | 'electronics';

export interface CadTemplateEntry {
  id: string;
  name: string;
  description?: string;
  cadFile?: string;
  sceneFile?: string;
  thumbnail?: string;
}

export interface ActiveTemplate extends CadTemplateEntry {
  projectId: string;
  rawBase: string;
  mode: TemplateMode;
}

export interface CadProjectEntry {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
  cadFile?: string;
  sceneFile?: string;
  readme?: string;
  thumbnail?: string;
  templates?: Partial<Record<TemplateMode, CadTemplateEntry[]>>;
}

interface CadRepositoryManifest {
  version?: string;
  rawBase: string;
  projects: CadProjectEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildManifestUrl(input: string): string {
  const s = input.trim();
  if (!s) return '';
  if (s.startsWith('https://raw.githubusercontent.com')) return s;
  const m = s.match(/github\.com\/([^/\s]+)\/([^/\s?#]+)(?:\/tree\/([^/\s?#]+))?/);
  if (m) {
    const [, owner, repo, branch = 'main'] = m;
    return `https://raw.githubusercontent.com/${owner}/${repo.replace(/\.git$/, '')}/${branch}/cad-catalog.json`;
  }
  return s;
}

function resolveUrl(rawBase: string, path: string): string {
  if (path.startsWith('http')) return path;
  return `${rawBase.replace(/\/$/, '')}/${path}`;
}

function groupByCategory(projects: CadProjectEntry[]): [string, CadProjectEntry[]][] {
  const map = new Map<string, CadProjectEntry[]>();
  for (const p of projects) {
    const cat = p.tags?.[0] ?? 'Uncategorized';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  return Array.from(map.entries());
}

// ─── ProjectCard ──────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  onClick,
}: {
  project: CadProjectEntry;
  onClick: () => void;
}) {
  return (
    <Box
      onClick={onClick}
      sx={{
        width: 200,
        p: 1.5,
        bgcolor: 'background.paper',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 1,
        cursor: 'pointer',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        transition: 'border-color 0.15s, background-color 0.15s',
        '&:hover': { borderColor: 'primary.main', bgcolor: 'rgba(79,195,247,0.05)' },
      }}
    >
      {project.thumbnail && (
        <Box
          component="img"
          src={project.thumbnail}
          alt={project.name}
          sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 0.5, mb: 0.5 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <Typography variant="body2" fontWeight={600} noWrap>
        {project.name}
      </Typography>
      {project.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}
        >
          {project.description}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 'auto', pt: 0.5 }}>
        {project.version && (
          <Chip label={`v${project.version}`} size="small" sx={{ height: 16, fontSize: 9, px: 0.25 }} />
        )}
        {project.cadFile && (
          <Chip
            icon={<PentagonOutlinedIcon sx={{ fontSize: 9 }} />}
            label="CAD"
            size="small"
            color="primary"
            variant="outlined"
            sx={{ height: 16, fontSize: 9, px: 0.25 }}
          />
        )}
        {project.sceneFile && (
          <Chip
            icon={<ViewInArIcon sx={{ fontSize: 9 }} />}
            label="3D"
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ height: 16, fontSize: 9, px: 0.25 }}
          />
        )}
      </Box>
    </Box>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  mode,
  onInsert,
  loading,
  isArmed,
  onArm,
}: {
  template: CadTemplateEntry;
  mode: TemplateMode;
  onInsert: () => void;
  loading: boolean;
  isArmed?: boolean;
  onArm?: () => void;
}) {
  const hasFile = mode === 'scene3d' ? !!template.sceneFile : !!template.cadFile;

  return (
    <Box
      sx={{
        width: 200,
        p: 1.5,
        bgcolor: isArmed ? 'rgba(79,195,247,0.08)' : 'background.paper',
        border: isArmed ? '1px solid rgba(79,195,247,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 1,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {template.thumbnail && (
        <Box
          component="img"
          src={template.thumbnail}
          alt={template.name}
          sx={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 0.5, mb: 0.5 }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      {!template.thumbnail && (
        <Box sx={{ width: '100%', height: 60, borderRadius: 0.5, mb: 0.5, bgcolor: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StorageIcon sx={{ fontSize: 24, color: 'text.disabled' }} />
        </Box>
      )}
      <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: 11 }}>
        {template.name || <em style={{ color: 'gray' }}>Unnamed</em>}
      </Typography>
      {template.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4, fontSize: 10 }}
        >
          {template.description}
        </Typography>
      )}
      <Box sx={{ mt: 'auto', display: 'flex', gap: 0.5 }}>
        <Button
          size="small"
          variant="contained"
          startIcon={loading ? <CircularProgress size={11} color="inherit" /> : <AddIcon sx={{ fontSize: 13 }} />}
          disabled={!hasFile || loading}
          onClick={onInsert}
          sx={{ flex: 1, fontSize: 10, py: 0.25 }}
        >
          Insert
        </Button>
        <Tooltip title={isArmed ? 'Stop placing' : 'Place repeatedly by clicking in scene'}>
          <span>
            <IconButton
              size="small"
              disabled={!hasFile}
              onClick={onArm}
              color={isArmed ? 'primary' : 'default'}
              sx={{ border: isArmed ? '1px solid' : '1px solid rgba(255,255,255,0.12)', borderRadius: 0.5, p: 0.5 }}
            >
              <TouchAppIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}

// ─── DetailView ───────────────────────────────────────────────────────────────

function DetailView({
  project,
  rawBase,
  onBack,
  onOpenCad,
  onOpenScene,
  isAdded,
  onAdd,
  onRemove,
}: {
  project: CadProjectEntry;
  rawBase: string;
  onBack: () => void;
  onOpenCad?: () => Promise<void>;
  onOpenScene?: () => Promise<void>;
  isAdded?: boolean;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const [readme, setReadme] = useState<string | null>(null);
  const [readmeLoading, setReadmeLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'cad' | 'scene' | null>(null);
  const hasTemplates = project.templates && Object.values(project.templates).some(arr => arr && arr.length > 0);

  useEffect(() => {
    if (!project.readme) return;
    setReadme(null);
    setReadmeLoading(true);
    fetch(resolveUrl(rawBase, project.readme))
      .then(r => (r.ok ? r.text() : null))
      .then(text => { setReadme(text); setReadmeLoading(false); })
      .catch(() => setReadmeLoading(false));
  }, [project.readme, rawBase]);

  const handleCad = useCallback(async () => {
    if (!onOpenCad || actionLoading) return;
    setActionLoading('cad');
    await onOpenCad();
    setActionLoading(null);
  }, [onOpenCad, actionLoading]);

  const handleScene = useCallback(async () => {
    if (!onOpenScene || actionLoading) return;
    setActionLoading('scene');
    await onOpenScene();
    setActionLoading(null);
  }, [onOpenScene, actionLoading]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <Tooltip title="Back to list">
          <IconButton size="small" onClick={onBack}>
            <ArrowBackIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{project.name}</Typography>
          {project.version && (
            <Typography variant="caption" color="text.secondary">v{project.version}</Typography>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1, px: 1.5, py: 1, flexShrink: 0, flexWrap: 'wrap' }}>
        {hasTemplates && (
          isAdded ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<RemoveCircleOutlineIcon sx={{ fontSize: 14 }} />}
              onClick={onRemove}
              sx={{ fontSize: 11 }}
            >
              Remove Templates
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              color="success"
              startIcon={<LibraryAddIcon sx={{ fontSize: 14 }} />}
              onClick={onAdd}
              sx={{ fontSize: 11 }}
            >
              Add Templates
            </Button>
          )
        )}
        {project.cadFile && (
          <Button
            size="small"
            variant="contained"
            disabled={!!actionLoading}
            onClick={handleCad}
            startIcon={
              actionLoading === 'cad'
                ? <CircularProgress size={11} color="inherit" />
                : <PentagonOutlinedIcon sx={{ fontSize: 14 }} />
            }
            sx={{ fontSize: 11 }}
          >
            Open in CAD
          </Button>
        )}
        {project.sceneFile && (
          <Button
            size="small"
            variant="outlined"
            disabled={!!actionLoading}
            onClick={handleScene}
            startIcon={
              actionLoading === 'scene'
                ? <CircularProgress size={11} color="inherit" />
                : <ViewInArIcon sx={{ fontSize: 14 }} />
            }
            sx={{ fontSize: 11 }}
          >
            Open in Scene 3D
          </Button>
        )}
      </Box>

      {/* Tags */}
      {project.tags && project.tags.length > 0 && (
        <Box sx={{ display: 'flex', gap: 0.5, px: 1.5, pb: 1, flexWrap: 'wrap', flexShrink: 0 }}>
          {project.tags.map(t => (
            <Chip key={t} label={t} size="small" sx={{ height: 18, fontSize: 10 }} />
          ))}
        </Box>
      )}

      {/* Description */}
      {project.description && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, pb: 1, flexShrink: 0 }}>
          {project.description}
        </Typography>
      )}

      {/* README */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1.5, pb: 2 }}>
        {readmeLoading && <CircularProgress size={20} sx={{ mt: 2, display: 'block' }} />}
        {readme && (
          <Box
            component="pre"
            sx={{
              fontSize: 11,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'text.secondary',
              m: 0,
              mt: 1,
              lineHeight: 1.7,
            }}
          >
            {readme}
          </Box>
        )}
        {!readmeLoading && !readme && !project.readme && (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 2, display: 'block', fontStyle: 'italic' }}>
            No README available.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

// ─── RepositoryPanel ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'cad-repo-url';
const DEFAULT_REPO_URL = 'https://github.com/platform-minis/CadProjects';

export function RepositoryPanel({
  onOpenCadProject,
  onOpenSceneProject,
  addedProjectIds = new Set(),
  onAddProjectTemplates,
  onRemoveProjectTemplates,
  armedTemplateId,
  onArm,
}: {
  onOpenCadProject: (jsonText: string) => void;
  onOpenSceneProject: (jsonText: string) => void;
  addedProjectIds?: Set<string>;
  onAddProjectTemplates?: (project: CadProjectEntry, rawBase: string) => void;
  onRemoveProjectTemplates?: (projectId: string) => void;
  armedTemplateId?: string | null;
  onArm?: (t: ActiveTemplate | null) => void;
}) {
  const [urlInput, setUrlInput] = useState(() => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_REPO_URL);
  const [manifest, setManifest] = useState<CadRepositoryManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<CadProjectEntry | null>(null);
  const [panelView, setPanelView] = useState<'projects' | 'templates'>('projects');
  const [templateMode, setTemplateMode] = useState<TemplateMode>('cad');
  const [insertingId, setInsertingId] = useState<string | null>(null);

  const handleFetch = useCallback(async (urlOverride?: string) => {
    const url = urlOverride ?? urlInput;
    const manifestUrl = buildManifestUrl(url);
    if (!manifestUrl) return;
    setLoading(true);
    setError(null);
    setSelectedProject(null);
    setManifest(null);
    try {
      const resp = await fetch(manifestUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      const data = (await resp.json()) as CadRepositoryManifest;
      if (!Array.isArray(data.projects)) throw new Error('Invalid manifest: missing "projects" array');
      setManifest(data);
      localStorage.setItem(STORAGE_KEY, url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [urlInput]);

  const handleOpenCad = useCallback(async (project: CadProjectEntry) => {
    if (!manifest || !project.cadFile) return;
    const url = resolveUrl(manifest.rawBase, project.cadFile);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    onOpenCadProject(text);
  }, [manifest, onOpenCadProject]);

  const handleOpenScene = useCallback(async (project: CadProjectEntry) => {
    if (!manifest || !project.sceneFile) return;
    const url = resolveUrl(manifest.rawBase, project.sceneFile);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    onOpenSceneProject(text);
  }, [manifest, onOpenSceneProject]);

  const handleInsertTemplate = useCallback(async (template: CadTemplateEntry, mode: TemplateMode) => {
    if (!manifest || insertingId) return;
    const fileUrl = mode === 'scene3d' ? template.sceneFile : template.cadFile;
    if (!fileUrl) return;
    setInsertingId(template.id);
    try {
      const resp = await fetch(resolveUrl(manifest.rawBase, fileUrl));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      if (mode === 'scene3d') {
        onOpenSceneProject(text);
      } else {
        onOpenCadProject(text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInsertingId(null);
    }
  }, [manifest, insertingId, onOpenCadProject, onOpenSceneProject]);

  const allProjects = manifest?.projects ?? [];
  const hasTemplates = allProjects.some(p => p.templates && Object.keys(p.templates).length > 0);
  const activeTemplates: CadTemplateEntry[] = allProjects.flatMap(p => p.templates?.[templateMode] ?? []);

  const filtered = allProjects.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      (p.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  });

  const categories = groupByCategory(filtered);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* URL bar */}
      <Box sx={{ display: 'flex', gap: 1, p: 1, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="https://github.com/owner/repo  or raw manifest URL…"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
          InputProps={{ sx: { fontSize: 11 } }}
        />
        <Tooltip title="Fetch repository">
          <span>
            <IconButton
              size="small"
              color="primary"
              disabled={loading || !urlInput.trim()}
              onClick={() => handleFetch()}
            >
              {loading ? <CircularProgress size={16} /> : <SyncIcon sx={{ fontSize: 16 }} />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Error */}
      {error && (
        <Typography variant="caption" color="error.main" sx={{ px: 1.5, py: 0.75, flexShrink: 0 }}>
          {error}
        </Typography>
      )}

      {/* Projects / Templates tab switcher */}
      {manifest && !selectedProject && (
        <Tabs
          value={panelView}
          onChange={(_, v) => setPanelView(v)}
          sx={{ minHeight: 32, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 11, minWidth: 0, flex: 1 } }}
        >
          <Tab value="projects" label="Projects" />
          <Tab value="templates" label="Templates" disabled={!hasTemplates} />
        </Tabs>
      )}

      {/* Empty state */}
      {!manifest && !loading && !error && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1.5, p: 4 }}>
          <StorageIcon sx={{ fontSize: 52, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary" align="center">
            Enter a GitHub repository URL to browse CAD projects.
          </Typography>
          <Typography variant="caption" color="text.disabled" align="center" sx={{ maxWidth: 300 }}>
            The repo should have a <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3 }}>cad-catalog.json</code> manifest file at its root.
          </Typography>
        </Box>
      )}

      {/* Project list */}
      {manifest && !selectedProject && panelView === 'projects' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search */}
          <Box sx={{ px: 1, pt: 0.5, flexShrink: 0 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.disabled' }} />,
                sx: { fontSize: 11 },
              }}
            />
          </Box>
          <Typography variant="caption" color="text.disabled" sx={{ px: 1.5, py: 0.5, flexShrink: 0 }}>
            {filtered.length} project{filtered.length !== 1 ? 's' : ''}
          </Typography>

          {/* Cards by category */}
          <Box sx={{ flex: 1, overflow: 'auto', px: 1, pb: 2 }}>
            {categories.length === 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ p: 2, display: 'block', fontStyle: 'italic' }}>
                No projects match your search.
              </Typography>
            )}
            {categories.map(([cat, projects]) => (
              <Box key={cat} sx={{ mb: 2.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    px: 0.5,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  {cat} ({projects.length})
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {projects.map(p => (
                    <ProjectCard key={p.id} project={p} onClick={() => setSelectedProject(p)} />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {/* Templates */}
      {manifest && panelView === 'templates' && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Mode tabs */}
          <Tabs
            value={templateMode}
            onChange={(_, v) => setTemplateMode(v)}
            sx={{ minHeight: 30, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, '& .MuiTab-root': { minHeight: 30, py: 0, fontSize: 10, minWidth: 0, flex: 1 } }}
          >
            <Tab value="cad" label="CAD" icon={<PentagonOutlinedIcon sx={{ fontSize: 12 }} />} iconPosition="start" />
            <Tab value="cad3d" label="CAD 3D" icon={<Looks3OutlinedIcon sx={{ fontSize: 12 }} />} iconPosition="start" />
            <Tab value="scene3d" label="Scene 3D" icon={<ViewInArIcon sx={{ fontSize: 12 }} />} iconPosition="start" />
            <Tab value="electronics" label="Electronics" icon={<ElectricalServicesIcon sx={{ fontSize: 12 }} />} iconPosition="start" />
          </Tabs>

          {/* Armed placement banner */}
          {armedTemplateId && (
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, flexShrink: 0,
              bgcolor: 'rgba(79,195,247,0.1)', borderBottom: '1px solid rgba(79,195,247,0.25)',
            }}>
              <TouchAppIcon sx={{ fontSize: 13, color: 'primary.main', flexShrink: 0 }} />
              <Typography variant="caption" sx={{ color: 'primary.main', fontSize: 10, flex: 1 }}>
                Placing — click in scene to stamp, Esc to cancel
              </Typography>
              <Tooltip title="Cancel placement">
                <IconButton size="small" sx={{ p: 0.25 }} onClick={() => onArm?.(null)}>
                  <CancelIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {/* Template cards */}
          <Box sx={{ flex: 1, overflow: 'auto', p: 1 }}>
            {activeTemplates.length === 0 ? (
              <Typography variant="caption" color="text.disabled" sx={{ p: 2, display: 'block', fontStyle: 'italic' }}>
                No templates defined for this mode.
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {activeTemplates.map(t => {
                  const armed = armedTemplateId === t.id;
                  return (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      mode={templateMode}
                      loading={insertingId === t.id}
                      onInsert={() => handleInsertTemplate(t, templateMode)}
                      isArmed={armed}
                      onArm={() => {
                        if (!manifest) return;
                        if (armed) { onArm?.(null); return; }
                        onArm?.({ ...t, projectId: '', rawBase: manifest.rawBase, mode: templateMode });
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Detail view */}
      {manifest && selectedProject && (
        <Box sx={{ flex: 1, overflow: 'hidden' }}>
          <DetailView
            project={selectedProject}
            rawBase={manifest.rawBase}
            onBack={() => setSelectedProject(null)}
            onOpenCad={selectedProject.cadFile ? () => handleOpenCad(selectedProject) : undefined}
            onOpenScene={selectedProject.sceneFile ? () => handleOpenScene(selectedProject) : undefined}
            isAdded={addedProjectIds.has(selectedProject.id)}
            onAdd={() => onAddProjectTemplates?.(selectedProject, manifest.rawBase)}
            onRemove={() => onRemoveProjectTemplates?.(selectedProject.id)}
          />
        </Box>
      )}
    </Box>
  );
}
