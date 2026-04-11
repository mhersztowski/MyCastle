import { Box, Typography } from '@mui/material';
import type { Project } from '@mhersztowski/core-cad';
import type { ToolName } from '../tools/types';

interface Props {
  project: Project;
  activeTool: ToolName;
}

const TOOL_HINTS: Record<ToolName, string> = {
  select: 'Click to select · Shift+click multi-select · Drag box-select · Delete removes selection',
  line: 'Click start point · Click end point · Esc to cancel · chains automatically',
  circle: 'Click center · Click radius point · Esc to cancel',
  rect: 'Click first corner · Click second corner · Esc to cancel',
  polyline: 'Click points · Enter to finish · C to close · Esc to cancel',
};

export function StatusBar({ project, activeTool }: Props) {
  const entityCount = project.entityRegistry.getAll().length;
  const selectedCount = project.selectionManager.count();
  const activeLayer = project.layerSystem.getActive();

  return (
    <Box sx={{
      height: 24, display: 'flex', alignItems: 'center', px: 1.5, gap: 2,
      bgcolor: '#2d2d30', borderTop: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
        {activeTool.toUpperCase()}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', flex: 1 }}>
        {TOOL_HINTS[activeTool]}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        Layer: <span style={{ color: activeLayer.color }}>{activeLayer.name}</span>
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
        {entityCount} entities{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
      </Typography>
    </Box>
  );
}
