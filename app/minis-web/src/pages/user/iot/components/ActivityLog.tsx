import { useState } from 'react';
import { Box, Typography, Chip, IconButton, Collapse } from '@mui/material';
import { Delete, ExpandMore, ExpandLess } from '@mui/icons-material';
import type { ActivityLogEntry } from '@modules/iot-emulator';

const TYPE_COLORS: Record<string, 'primary' | 'default' | 'success' | 'warning'> = {
  telemetry: 'primary',
  heartbeat: 'default',
  command: 'success',
  'command-ack': 'warning',
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  onClear: () => void;
}

function ActivityLog({ entries, onClear }: ActivityLogProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6">Activity Log</Typography>
        <IconButton size="small" onClick={onClear} title="Clear log">
          <Delete fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ maxHeight: '65vh', overflow: 'auto' }}>
        {entries.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No activity yet. Start a device to see messages.
          </Typography>
        )}
        {entries.map((entry, index) => (
          <Box
            key={index}
            sx={{
              py: 0.5,
              px: 1,
              borderBottom: '1px solid',
              borderColor: 'divider',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
            onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 60 }}>
                {formatTime(entry.timestamp)}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 'bold',
                  color: entry.direction === 'sent' ? 'info.main' : 'success.main',
                  minWidth: 12,
                }}
              >
                {entry.direction === 'sent' ? '\u2191' : '\u2193'}
              </Typography>
              <Chip
                label={entry.type}
                size="small"
                color={TYPE_COLORS[entry.type] || 'default'}
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}
              >
                {entry.deviceName}
              </Typography>
              {expandedIndex === index ? <ExpandLess sx={{ fontSize: 14 }} /> : <ExpandMore sx={{ fontSize: 14 }} />}
            </Box>
            <Collapse in={expandedIndex === index}>
              <Box sx={{ mt: 0.5, pl: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {entry.topic}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    bgcolor: 'grey.900',
                    color: 'grey.100',
                    p: 1,
                    borderRadius: 1,
                    overflow: 'auto',
                    maxHeight: 150,
                    mt: 0.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {(() => {
                    try { return JSON.stringify(JSON.parse(entry.payload), null, 2); } catch { return entry.payload; }
                  })()}
                </Box>
              </Box>
            </Collapse>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default ActivityLog;
