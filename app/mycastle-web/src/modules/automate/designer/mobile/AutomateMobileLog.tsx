/**
 * AutomateMobileLog - bottom drawer z logiem wykonania
 */

import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAutomateDesigner } from '../AutomateDesignerContext';

interface AutomateMobileLogProps {
  open: boolean;
  onClose: () => void;
}

const AutomateMobileLog: React.FC<AutomateMobileLogProps> = ({ open, onClose }) => {
  const { executionLog, executionResult } = useAutomateDesigner();

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderRadius: '16px 16px 0 0',
          maxHeight: '50vh',
        },
      }}
    >
      {/* Puller handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
        <Box sx={{ width: 40, height: 6, bgcolor: 'grey.300', borderRadius: 3 }} />
      </Box>

      {/* Header */}
      <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Log wykonania
          </Typography>
          {executionResult && (
            <Chip
              label={executionResult.success ? 'OK' : 'Error'}
              size="small"
              color={executionResult.success ? 'success' : 'error'}
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Log entries */}
      <Box sx={{ overflow: 'auto', px: 1, pb: 2 }}>
        {executionLog.length === 0 && !executionResult && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            Brak logów
          </Typography>
        )}

        <List dense disablePadding>
          {executionLog.map((entry, i) => (
            <ListItem key={`${entry.nodeId}-${i}`} sx={{ py: 0.25 }}>
              <ListItemText
                primary={
                  <Typography variant="body2" component="span">
                    <Chip
                      label={entry.status}
                      size="small"
                      color={
                        entry.status === 'completed' ? 'success' :
                        entry.status === 'error' ? 'error' :
                        entry.status === 'running' ? 'info' : 'default'
                      }
                      sx={{ mr: 0.5, height: 18, fontSize: '0.65rem' }}
                    />
                    {entry.nodeName} ({entry.nodeType})
                    {entry.endTime && (
                      <span style={{ color: '#999', marginLeft: 4 }}>
                        {entry.endTime - entry.startTime}ms
                      </span>
                    )}
                    {entry.error && (
                      <span style={{ color: '#f44336', marginLeft: 4 }}>
                        {entry.error}
                      </span>
                    )}
                  </Typography>
                }
              />
            </ListItem>
          ))}
          {executionResult?.logs.map((log, i) => (
            <ListItem key={`log-${i}`} sx={{ py: 0.25 }}>
              <ListItemText
                primary={
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    [{log.level}] {log.message}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
};

export default AutomateMobileLog;
