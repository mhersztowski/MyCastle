import { useState, useCallback, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StorageIcon from '@mui/icons-material/Storage';
import AddIcon from '@mui/icons-material/Add';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import CancelIcon from '@mui/icons-material/Cancel';
import type { ActiveTemplate, TemplateMode } from './RepositoryPanel';

function resolveUrl(rawBase: string, path: string): string {
  if (path.startsWith('http')) return path;
  return `${rawBase.replace(/\/$/, '')}/${path}`;
}

function TemplateItem({
  template,
  mode,
  onInsert,
  isArmed,
  onArm,
}: {
  template: ActiveTemplate;
  mode: TemplateMode;
  onInsert: (t: ActiveTemplate) => Promise<void>;
  isArmed?: boolean;
  onArm?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try { await onInsert(template); }
    finally { setLoading(false); }
  }, [template, onInsert, loading]);

  const hasFile = mode === 'scene3d' ? !!template.sceneFile : !!template.cadFile;

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: 130,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: isArmed ? 'rgba(79,195,247,0.08)' : 'background.paper',
        border: isArmed ? '1px solid rgba(79,195,247,0.4)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 1,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        '&:hover': { borderColor: isArmed ? 'primary.main' : 'primary.main' },
      }}
    >
      {template.thumbnail ? (
        <Box
          component="img"
          src={resolveUrl(template.rawBase, template.thumbnail)}
          alt={template.name}
          sx={{ width: '100%', height: 55, objectFit: 'cover' }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <Box sx={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(255,255,255,0.03)' }}>
          <StorageIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
        </Box>
      )}
      <Box sx={{ px: 0.75, pt: 0.5, pb: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: 10, lineHeight: 1.3 }}>
          {template.name || 'Unnamed'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            variant="contained"
            disabled={!hasFile || loading}
            onClick={handleClick}
            startIcon={loading ? <CircularProgress size={9} color="inherit" /> : <AddIcon sx={{ fontSize: 11 }} />}
            sx={{ flex: 1, fontSize: 9, py: 0.1, px: 0.75, minWidth: 0 }}
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
                sx={{ border: '1px solid', borderColor: isArmed ? 'primary.main' : 'rgba(255,255,255,0.12)', borderRadius: 0.5, p: 0.25 }}
              >
                <TouchAppIcon sx={{ fontSize: 11 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
}

export function TemplatesPanel({
  mode,
  templates,
  onInsert,
  armedTemplateId,
  onArm,
}: {
  mode: TemplateMode;
  templates: ActiveTemplate[];
  onInsert: (template: ActiveTemplate) => Promise<void>;
  armedTemplateId?: string | null;
  onArm?: (t: ActiveTemplate | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (templates.length === 0) return null;

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        bgcolor: 'rgba(255,255,255,0.02)',
      }}
    >
      {/* Armed banner */}
      {armedTemplateId && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, flexShrink: 0,
          bgcolor: 'rgba(79,195,247,0.1)', borderBottom: '1px solid rgba(79,195,247,0.25)',
        }}>
          <TouchAppIcon sx={{ fontSize: 12, color: 'primary.main', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: 'primary.main', fontSize: 10, flex: 1 }}>
            Placing — click in scene to stamp, Esc to cancel
          </Typography>
          <Tooltip title="Cancel placement">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={() => onArm?.(null)}>
              <CancelIcon sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          height: 24,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'text.secondary', userSelect: 'none' }}>
          Templates
        </Typography>
        <Typography variant="caption" sx={{ ml: 0.75, fontSize: 10, color: 'text.disabled' }}>
          ({templates.length})
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={collapsed ? 'Expand' : 'Collapse'}>
          <IconButton size="small" sx={{ p: 0 }}>
            {collapsed
              ? <ExpandMoreIcon sx={{ fontSize: 14 }} />
              : <ExpandLessIcon sx={{ fontSize: 14 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Cards */}
      {!collapsed && (
        <Box
          ref={scrollRef}
          sx={{
            display: 'flex',
            gap: 0.75,
            px: 1,
            pb: 1,
            overflowX: 'auto',
            '&::-webkit-scrollbar': { height: 4 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
          }}
        >
          {templates.map(t => (
            <TemplateItem
              key={`${t.projectId}:${t.id}`}
              template={t}
              mode={mode}
              onInsert={onInsert}
              isArmed={armedTemplateId === t.id}
              onArm={() => {
                if (armedTemplateId === t.id) { onArm?.(null); return; }
                onArm?.(t);
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
