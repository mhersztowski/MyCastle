import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowBack,
  CloudDownload,
  Code,
  GetApp,
  Refresh,
  SportsEsports,
  Terminal as TerminalIcon,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams } from 'react-router-dom';
import { minisApi } from '../../../services/MinisApiService';
import type { GithubProjectEntry, GithubModuleEntry } from '../../../services/MinisApiService';

const REPO_URL = 'https://github.com/platform-minis/MinisProjects';

// Colours per platform
const PLATFORM_META: Record<string, { label: string; color: 'primary' | 'secondary' | 'success'; icon: React.ReactNode }> = {
  Arduino: { label: 'Arduino', color: 'primary', icon: <Code sx={{ fontSize: 14 }} /> },
  uPython: { label: 'uPython', color: 'success', icon: <TerminalIcon sx={{ fontSize: 14 }} /> },
  pygame: { label: 'Pygame', color: 'secondary', icon: <SportsEsports sx={{ fontSize: 14 }} /> },
};

function platformMeta(platform: string | null) {
  return PLATFORM_META[platform ?? 'Arduino'] ?? PLATFORM_META['Arduino'];
}

/** Compare two semver strings, descending (newest first). Returns negative when a > b. */
function semverDesc(a: string, b: string): number {
  const parse = (s: string) => s.split('.').map((n) => parseInt(n, 10) || 0);
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (bMaj !== aMaj) return bMaj - aMaj;
  if (bMin !== aMin) return bMin - aMin;
  return bPatch - aPatch;
}

/** Group projects by the first tag (or "Other" when no tags). Returns ordered [category, projects[]] */
function groupByCategory(projects: GithubProjectEntry[]): [string, GithubProjectEntry[]][] {
  const map = new Map<string, GithubProjectEntry[]>();
  for (const p of projects) {
    const cat = p.tags?.[0] ?? 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(p);
  }
  // Sort each group newest first
  for (const list of map.values()) list.sort((a, b) => semverDesc(a.version ?? '0', b.version ?? '0'));
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

// ---

interface ImportDialogProps {
  open: boolean;
  project: GithubProjectEntry | null;
  repoUrl: string;
  modules: GithubModuleEntry[];
  userName: string;
  onClose: () => void;
  onImported: (projectId: string, platform: string) => void;
}

function ImportDialog({ open, project, repoUrl, modules, userName, onClose, onImported }: ImportDialogProps) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) setName(project.name.replace(/[^a-zA-Z0-9_-]/g, '_'));
  }, [project]);

  const handleImport = async () => {
    if (!project || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const moduleId = project.moduleId ?? undefined;
      const boardProfileKey = moduleId
        ? modules.find((m) => m.id === moduleId)?.boardProfileKey
        : undefined;
      const platform = project.softwarePlatform ?? 'Arduino';
      const created = await minisApi.createUserProject(userName, {
        name: name.trim(),
        githubProjectId: project.id,
        githubRepoUrl: repoUrl,
        softwarePlatform: platform,
        moduleId,
        boardProfileKey,
        libraries: project.libraries ?? [],
      });
      const sketches = project.sketches ?? [];
      const readmePath = project.readmePath ?? null;
      const libraries = project.libraries?.length ? project.libraries : undefined;
      if (sketches.length > 0 || readmePath || libraries || project.projectScriptPath) {
        await minisApi.cloneProjectFromGithub(userName, created.name, repoUrl, sketches, readmePath, libraries, project.projectScriptPath ?? undefined);
      }
      onImported(created.id, platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Import "{project?.name}"</DialogTitle>
      <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          autoFocus
          fullWidth
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleImport(); }}
          helperText="Name used locally in your project list"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CloudDownload />}
          onClick={handleImport}
          disabled={busy || !name.trim()}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---

interface DetailViewProps {
  project: GithubProjectEntry;
  rawBase: string;
  modules: GithubModuleEntry[];
  userName: string;
  repoUrl: string;
  onBack: () => void;
}

function DetailView({ project, rawBase, modules, userName, repoUrl, onBack }: DetailViewProps) {
  const navigate = useNavigate();
  const [md, setMd] = useState<string | null>(null);
  const [mdLoading, setMdLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const meta = platformMeta(project.softwarePlatform);

  useEffect(() => {
    if (!project.hasDocs) return;
    setMdLoading(true);
    fetch(`${rawBase}/${project.path}/docs/welcome.md`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setMd)
      .catch(() => setMd(null))
      .finally(() => setMdLoading(false));
  }, [project, rawBase]);

  const handleImported = (projectId: string, platform: string) => {
    setImportOpen(false);
    const route = platform === 'uPython'
      ? `/user/${userName}/upython-project/${projectId}`
      : platform === 'pygame'
        ? `/user/${userName}/pygame-project/${projectId}`
        : `/user/${userName}/project/${projectId}`;
    navigate(route);
  };

  const module = project.moduleId ? modules.find((m) => m.id === project.moduleId) : null;

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Tooltip title="Back to gallery">
          <IconButton onClick={onBack}><ArrowBack /></IconButton>
        </Tooltip>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>{project.name}</Typography>
        <Button
          variant="contained"
          startIcon={<GetApp />}
          onClick={() => setImportOpen(true)}
        >
          Import
        </Button>
      </Box>

      {/* Meta row */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Chip
          icon={meta.icon as React.ReactElement}
          label={meta.label}
          color={meta.color}
          size="small"
        />
        {module && <Chip label={module.name} size="small" variant="outlined" />}
        {project.version && <Chip label={`v${project.version}`} size="small" variant="outlined" />}
        {(project.tags ?? []).map((t) => (
          <Chip key={t} label={t} size="small" variant="outlined" />
        ))}
      </Box>

      {project.description && (
        <Typography color="text.secondary" sx={{ mb: 2 }}>{project.description}</Typography>
      )}

      <Divider sx={{ mb: 2 }} />

      {/* Welcome markdown */}
      {mdLoading && <CircularProgress size={24} />}
      {!mdLoading && md && (
        <Box sx={{
          '& h1,& h2,& h3': { mt: 2, mb: 0.5 },
          '& p': { mt: 0.5, mb: 1 },
          '& img': { maxWidth: '100%', borderRadius: 1 },
          '& pre': { bgcolor: 'grey.900', p: 1.5, borderRadius: 1, overflowX: 'auto' },
          '& code': { fontFamily: 'monospace', fontSize: 13 },
          '& table': { borderCollapse: 'collapse', width: '100%' },
          '& th,& td': { border: '1px solid', borderColor: 'divider', p: '4px 8px' },
          '& a': { color: 'primary.main' },
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </Box>
      )}
      {!mdLoading && !md && (
        <Box sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 4 }}>
          No welcome documentation available for this project.
        </Box>
      )}

      <ImportDialog
        open={importOpen}
        project={project}
        repoUrl={repoUrl}
        modules={modules}
        userName={userName}
        onClose={() => setImportOpen(false)}
        onImported={handleImported}
      />
    </Box>
  );
}

// ---

function ProjectCard({ project, modules, onClick }: {
  project: GithubProjectEntry;
  modules: GithubModuleEntry[];
  onClick: () => void;
}) {
  const meta = platformMeta(project.softwarePlatform);
  const module = project.moduleId ? modules.find((m) => m.id === project.moduleId) : null;

  return (
    <Card sx={{ width: { xs: '100%', sm: 240 }, display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={onClick} sx={{ flexGrow: 1 }}>
        <CardContent sx={{ pb: 1 }}>
          {/* Platform + version */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
            <Chip
              icon={meta.icon as React.ReactElement}
              label={meta.label}
              color={meta.color}
              size="small"
              sx={{ height: 20, fontSize: 11 }}
            />
            {project.version && (
              <Typography variant="caption" color="text.secondary">v{project.version}</Typography>
            )}
          </Box>

          {/* Name */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 0.5, mb: 0.5 }}>
            {project.name}
          </Typography>

          {/* Description */}
          {project.description && (
            <Typography variant="caption" color="text.secondary" sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
            }}>
              {project.description}
            </Typography>
          )}

          {/* Module + tags */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
            {module && (
              <Chip label={module.name} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
            )}
            {(project.tags ?? []).slice(1).map((t) => (
              <Chip key={t} label={t} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
            ))}
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ---

function ElectronicsWelcomePage() {
  const { userName } = useParams<{ userName: string }>();
  const [projects, setProjects] = useState<GithubProjectEntry[]>([]);
  const [modules, setModules] = useState<GithubModuleEntry[]>([]);
  const [rawBase, setRawBase] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GithubProjectEntry | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await minisApi.getGithubProjectdefs(REPO_URL);
      setProjects(data.projects ?? []);
      setModules(data.modules ?? []);
      setRawBase(data.rawBase ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const filtered = search.trim()
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description?.toLowerCase().includes(search.toLowerCase()) ||
        (p.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase())),
      )
    : projects;

  const grouped = groupByCategory(filtered);

  if (selected && rawBase) {
    return (
      <DetailView
        project={selected}
        rawBase={rawBase}
        modules={modules}
        userName={userName ?? ''}
        repoUrl={REPO_URL}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>Project Gallery</Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={fetchProjects} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : <Refresh />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Search */}
      <TextField
        size="small"
        placeholder="Search projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3, width: { xs: '100%', sm: 320 } }}
        InputProps={{
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setSearch('')}>
                <ArrowBack sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading && !projects.length && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Categories */}
      {grouped.map(([category, list]) => (
        <Box key={category} sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Typography variant="h6" sx={{ textTransform: 'capitalize' }}>{category}</Typography>
            <Chip label={list.length} size="small" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {list.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                modules={modules}
                onClick={() => setSelected(p)}
              />
            ))}
          </Box>
        </Box>
      ))}

      {!loading && filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
          {search ? 'No projects match your search.' : 'No projects found.'}
        </Typography>
      )}
    </Box>
  );
}

export default ElectronicsWelcomePage;
