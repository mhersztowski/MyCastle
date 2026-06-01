import { useState, useCallback } from 'react';
import type { PrefabEntry } from '@mhersztowski/core-scene3d';
import { PrefabStore } from '@mhersztowski/core-scene3d';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import CategoryIcon from '@mui/icons-material/Category';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderSpecialIcon from '@mui/icons-material/FolderSpecial';

export interface ProjectPrefabGroup {
  project: string;
  prefabs: PrefabEntry[];
}

export interface PrefabsPanelProps {
  prefabs: PrefabEntry[];
  currentProject?: string;
  otherProjectsPrefabs?: ProjectPrefabGroup[];
  onInstantiate?: (entry: PrefabEntry) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  className?: string;
}

function nodeTypeIcon(type: string) {
  switch (type) {
    case 'mesh': return <ViewInArIcon sx={{ fontSize: 14 }} />;
    case 'light': return <LightbulbOutlinedIcon sx={{ fontSize: 14 }} />;
    case 'camera': return <VideocamOutlinedIcon sx={{ fontSize: 14 }} />;
    case 'audio': return <VolumeUpOutlinedIcon sx={{ fontSize: 14 }} />;
    case 'group': return <FolderOutlinedIcon sx={{ fontSize: 14 }} />;
    default: return <CategoryIcon sx={{ fontSize: 14 }} />;
  }
}

function nodeTypeColor(type: string): string {
  switch (type) {
    case 'mesh': return '#4fc3f7';
    case 'light': return '#fff176';
    case 'camera': return '#ce93d8';
    case 'audio': return '#80cbc4';
    default: return '#90caf9';
  }
}

function PrefabRow({
  entry,
  editable,
  onInstantiate,
  onRenameOpen,
  onDeleteOpen,
}: {
  entry: PrefabEntry;
  editable: boolean;
  onInstantiate?: (e: PrefabEntry) => void;
  onRenameOpen?: (e: PrefabEntry) => void;
  onDeleteOpen?: (e: PrefabEntry) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        py: 0.4,
        px: 0.75,
        mb: 0.375,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.default',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ color: nodeTypeColor(entry.rootType), flexShrink: 0, display: 'flex' }}>
        {nodeTypeIcon(entry.rootType)}
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Typography noWrap sx={{ fontSize: '0.72rem', fontWeight: 500, color: 'text.primary' }}>
          {entry.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.4, mt: 0.2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip
            label={entry.rootType}
            size="small"
            sx={{
              height: 14, fontSize: '0.52rem',
              bgcolor: `${nodeTypeColor(entry.rootType)}22`,
              color: nodeTypeColor(entry.rootType),
              border: 'none',
              '.MuiChip-label': { px: 0.5 },
            }}
          />
          {entry.nodeCount > 1 && (
            <Chip
              label={`${entry.nodeCount} nodes`}
              size="small"
              sx={{ height: 14, fontSize: '0.52rem', '.MuiChip-label': { px: 0.5 } }}
            />
          )}
          {(entry as PrefabEntry & { version?: string }).version && (
            <Typography sx={{ fontSize: '0.52rem', color: 'text.disabled' }}>
              v{(entry as PrefabEntry & { version?: string }).version}
            </Typography>
          )}
        </Box>
      </Box>

      {editable && (
        <>
          <Tooltip title="Rename">
            <IconButton size="small" sx={{ p: 0.375 }} onClick={() => onRenameOpen?.(entry)}>
              <DriveFileRenameOutlineIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete prefab">
            <IconButton size="small" sx={{ p: 0.375, color: 'error.main' }} onClick={() => onDeleteOpen?.(entry)}>
              <DeleteOutlineIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </>
      )}
      <Tooltip title="Instantiate — add to scene">
        <IconButton
          size="small"
          sx={{ p: 0.375, color: '#fff', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' }, ml: 0.25 }}
          onClick={() => onInstantiate?.(entry)}
        >
          <AddCircleOutlineIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function SectionHeader({
  label,
  count,
  expanded,
  onToggle,
  isCurrent,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  isCurrent: boolean;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.4,
        cursor: 'pointer',
        borderRadius: 0.75,
        userSelect: 'none',
        '&:hover': { bgcolor: 'action.hover' },
        mb: 0.25,
      }}
    >
      {expanded
        ? <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
        : <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled', flexShrink: 0 }} />
      }
      <FolderSpecialIcon sx={{ fontSize: 14, color: isCurrent ? 'primary.main' : 'text.secondary', flexShrink: 0 }} />
      <Typography
        noWrap
        sx={{
          fontSize: '0.7rem',
          fontWeight: isCurrent ? 600 : 400,
          color: isCurrent ? 'primary.main' : 'text.secondary',
          flex: 1,
          minWidth: 0,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', flexShrink: 0 }}>
        {count}
      </Typography>
    </Box>
  );
}

export function PrefabsPanel({
  prefabs,
  currentProject,
  otherProjectsPrefabs = [],
  onInstantiate,
  onDelete,
  onRename,
  className,
}: PrefabsPanelProps) {
  const [renameTarget, setRenameTarget] = useState<PrefabEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PrefabEntry | null>(null);
  const [currentExpanded, setCurrentExpanded] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const handleRenameOpen = useCallback((entry: PrefabEntry) => {
    setRenameTarget(entry);
    setRenameValue(entry.name);
  }, []);

  const handleRenameConfirm = useCallback(() => {
    if (!renameTarget || !renameValue.trim()) return;
    onRename?.(renameTarget.id, renameValue.trim());
    setRenameTarget(null);
  }, [renameTarget, renameValue, onRename]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    onDelete?.(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, onDelete]);

  const toggleProject = useCallback((project: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(project)) next.delete(project);
      else next.add(project);
      return next;
    });
  }, []);

  const totalCount = prefabs.length + otherProjectsPrefabs.reduce((s, g) => s + g.prefabs.length, 0);

  return (
    <Box
      className={className}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        borderRight: 1,
        borderColor: 'divider',
        overflow: 'hidden',
      }}
    >
      <Typography
        variant="overline"
        sx={{ px: 1.5, pt: 1, pb: 0.5, fontSize: '0.65rem', color: 'text.secondary', letterSpacing: '0.08em', flexShrink: 0 }}
      >
        Prefabs
      </Typography>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.75, pb: 1 }}>
        {totalCount === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, px: 1 }}>
            <CategoryIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 1 }} />
            <Typography sx={{ fontSize: '0.72rem', color: 'text.disabled', lineHeight: 1.6 }}>
              No prefabs yet.<br />
              Right-click a node in the Hierarchy<br />
              and choose <b>Save as Prefab</b>.
            </Typography>
          </Box>
        ) : (
          <>
            {/* ── Current project section ── */}
            <SectionHeader
              label={currentProject ?? 'Current project'}
              count={prefabs.length}
              expanded={currentExpanded}
              onToggle={() => setCurrentExpanded(v => !v)}
              isCurrent
            />
            <Collapse in={currentExpanded} unmountOnExit>
              <Box sx={{ pl: 1.5, mb: 0.75 }}>
                {prefabs.length === 0 ? (
                  <Typography sx={{ fontSize: '0.67rem', color: 'text.disabled', py: 0.5, pl: 0.5 }}>
                    No prefabs in this project yet.
                  </Typography>
                ) : (
                  prefabs.map(entry => (
                    <PrefabRow
                      key={entry.id}
                      entry={entry}
                      editable
                      onInstantiate={onInstantiate}
                      onRenameOpen={handleRenameOpen}
                      onDeleteOpen={setDeleteTarget}
                    />
                  ))
                )}
              </Box>
            </Collapse>

            {/* ── Other projects sections ── */}
            {otherProjectsPrefabs.map(group => (
              <Box key={group.project}>
                <SectionHeader
                  label={group.project}
                  count={group.prefabs.length}
                  expanded={expandedProjects.has(group.project)}
                  onToggle={() => toggleProject(group.project)}
                  isCurrent={false}
                />
                <Collapse in={expandedProjects.has(group.project)} unmountOnExit>
                  <Box sx={{ pl: 1.5, mb: 0.75 }}>
                    {group.prefabs.map(entry => (
                      <PrefabRow
                        key={entry.id}
                        entry={entry}
                        editable={false}
                        onInstantiate={onInstantiate}
                      />
                    ))}
                  </Box>
                </Collapse>
              </Box>
            ))}
          </>
        )}
      </Box>

      {/* Rename dialog */}
      <Dialog open={Boolean(renameTarget)} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', pb: 1 }}>Rename Prefab</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            autoFocus fullWidth size="small" label="Name"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameConfirm(); }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button size="small" variant="contained" onClick={handleRenameConfirm}>Rename</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '0.9rem', pb: 1 }}>Delete Prefab</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.8rem' }}>
            Delete <b>{deleteTarget?.name}</b>? Existing instances in the scene will not be affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button size="small" variant="contained" color="error" onClick={handleDeleteConfirm}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Re-export pure helpers so consumers don't need to import PrefabStore separately
export { PrefabStore };
