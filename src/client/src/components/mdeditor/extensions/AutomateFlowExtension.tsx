/**
 * Automate Flow Extension - rozszerzenie Tiptap do osadzania flow automatyzacji w markdown
 * Format: @[automate:flow-id]
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, NodeViewProps } from '@tiptap/react';
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  TextField,
  InputAdornment,
  CircularProgress,
  Chip,
  Collapse,
  Alert,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

import { automateService } from '../../../modules/automate/services/AutomateService';
import { AutomateEngine, ExecutionResult } from '../../../modules/automate/engine/AutomateEngine';
import { AutomateFlowModel } from '../../../modules/automate/models/AutomateFlowModel';
import { useFilesystem } from '../../../modules/filesystem/FilesystemContext';

// Dialog wyboru flow
interface AutomateFlowPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (flowId: string) => void;
  selectedId?: string;
}

const AutomateFlowPickerDialog: React.FC<AutomateFlowPickerDialogProps> = ({
  open,
  onClose,
  onSelect,
  selectedId,
}) => {
  const [filter, setFilter] = useState('');
  const [flows, setFlows] = useState<{ id: string; name: string; description?: string; nodeCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      setLoading(true);
      automateService.loadFlows().then((loadedFlows) => {
        setFlows(loadedFlows.map(f => ({
          id: f.id,
          name: f.name,
          description: f.description,
          nodeCount: f.nodes?.length || 0,
        })));
        setLoading(false);
      });
    }
  }, [open]);

  const filteredFlows = useMemo(() => {
    if (!filter.trim()) return flows;
    const lowerFilter = filter.toLowerCase();
    return flows.filter(f =>
      f.name.toLowerCase().includes(lowerFilter) ||
      f.description?.toLowerCase().includes(lowerFilter)
    );
  }, [flows, filter]);

  const handleSelect = (flowId: string) => {
    onSelect(flowId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <SmartToyIcon color="warning" />
        <Typography variant="h6" sx={{ flex: 1 }}>Wybierz automatyzacje</Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Szukaj automatyzacji..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            autoFocus
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredFlows.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            {flows.length === 0
              ? 'Brak zdefiniowanych automatyzacji'
              : 'Nie znaleziono automatyzacji'}
          </Box>
        ) : (
          <List sx={{ maxHeight: 300, overflow: 'auto' }}>
            {filteredFlows.map((flow) => (
              <ListItemButton
                key={flow.id}
                selected={flow.id === selectedId}
                onClick={() => handleSelect(flow.id)}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  <SmartToyIcon color={flow.id === selectedId ? 'warning' : 'action'} />
                </ListItemIcon>
                <ListItemText
                  primary={flow.name}
                  secondary={flow.description}
                />
                <Chip label={`${flow.nodeCount} nodow`} size="small" variant="outlined" />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose}>Anuluj</Button>
      </DialogActions>
    </Dialog>
  );
};

// Node View Component
const AutomateFlowNodeView: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [flow, setFlow] = useState<AutomateFlowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [engineRef] = useState(() => ({ current: null as AutomateEngine | null }));

  const { dataSource } = useFilesystem();
  const flowId = node.attrs.flowId as string;

  // Zaladuj flow
  useEffect(() => {
    const loadFlow = async () => {
      setLoading(true);

      if (flowId) {
        if (!automateService.loaded) {
          await automateService.loadFlows();
        }
        const flowNode = automateService.getFlowById(flowId);
        setFlow(flowNode ? flowNode.toModel() : null);
      } else {
        setFlow(null);
      }

      setLoading(false);
    };

    loadFlow();
  }, [flowId]);

  const handleSelectFlow = (newFlowId: string) => {
    updateAttributes({ flowId: newFlowId });
    setDialogOpen(false);
    setExecutionResult(null);
  };

  const handleRun = useCallback(async () => {
    if (!flow || isRunning) return;

    setIsRunning(true);
    setExecutionResult(null);
    setShowLogs(true);

    const engine = new AutomateEngine();
    engineRef.current = engine;

    try {
      const result = await engine.executeFlow(flow, dataSource);
      setExecutionResult(result);
    } catch (err) {
      setExecutionResult({
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRunning(false);
      engineRef.current = null;
    }
  }, [flow, isRunning, dataSource, engineRef]);

  const handleStop = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.abort();
    }
  }, [engineRef]);

  // Placeholder gdy brak flow
  if (!flow && !loading) {
    return (
      <NodeViewWrapper>
        <Paper
          sx={{
            p: 3,
            border: selected ? '2px solid' : '1px dashed',
            borderColor: selected ? 'warning.main' : 'grey.400',
            cursor: 'pointer',
            textAlign: 'center',
            my: 1,
            '&:hover': { borderColor: 'warning.light', bgcolor: 'action.hover' },
          }}
          onClick={() => setDialogOpen(true)}
        >
          <SmartToyIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
          <Typography color="text.secondary">
            Kliknij aby wybrac automatyzacje
          </Typography>
        </Paper>

        <AutomateFlowPickerDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSelect={handleSelectFlow}
          selectedId={flowId}
        />
      </NodeViewWrapper>
    );
  }

  // Loading
  if (loading) {
    return (
      <NodeViewWrapper>
        <Paper sx={{ p: 3, textAlign: 'center', my: 1 }}>
          <CircularProgress size={24} />
        </Paper>
      </NodeViewWrapper>
    );
  }

  // Renderuj karte flow
  return (
    <NodeViewWrapper>
      <Paper
        elevation={selected ? 4 : 1}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          position: 'relative',
          border: selected ? '2px solid' : '1px solid',
          borderColor: selected ? 'warning.main' : 'grey.200',
          overflow: 'hidden',
          my: 1,
        }}
      >
        {/* Hover toolbar */}
        {isHovered && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 10,
              display: 'flex',
              gap: 0.5,
              bgcolor: 'rgba(255,255,255,0.9)',
              borderRadius: 1,
              p: 0.25,
              boxShadow: 1,
            }}
          >
            <Tooltip title="Zmien automatyzacje">
              <IconButton size="small" onClick={() => setDialogOpen(true)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {flow && (
              <Tooltip title="Edytuj w designerze">
                <IconButton
                  size="small"
                  onClick={() => window.open(`/designer/automate/${flowId}`, '_blank')}
                >
                  <OpenInFullIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}

        {/* Header */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: 'rgba(255, 152, 0, 0.08)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}>
          <SmartToyIcon color="warning" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {flow?.name || 'Automatyzacja'}
            </Typography>
            {flow?.description && (
              <Typography variant="body2" color="text.secondary">
                {flow.description}
              </Typography>
            )}
          </Box>
          <Chip
            label={`${flow?.nodes?.length || 0} nodow`}
            size="small"
            variant="outlined"
            color="warning"
          />
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'grey.50' }}>
          {isRunning ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStop}
            >
              Zatrzymaj
            </Button>
          ) : (
            <Button
              size="small"
              variant="contained"
              color="warning"
              startIcon={<PlayArrowIcon />}
              onClick={handleRun}
            >
              Uruchom
            </Button>
          )}
          {executionResult && (
            <Button
              size="small"
              variant="text"
              onClick={() => setShowLogs(!showLogs)}
              endIcon={showLogs ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {showLogs ? 'Ukryj logi' : 'Pokaz logi'}
            </Button>
          )}
          {executionResult && (
            <Chip
              label={executionResult.success ? 'OK' : 'Blad'}
              size="small"
              color={executionResult.success ? 'success' : 'error'}
              sx={{ ml: 'auto' }}
            />
          )}
        </Box>

        {/* Execution results */}
        <Collapse in={showLogs && !!executionResult}>
          <Box sx={{ maxHeight: 300, overflow: 'auto', borderTop: '1px solid', borderColor: 'divider' }}>
            {executionResult?.error && (
              <Alert severity="error" sx={{ borderRadius: 0 }}>
                {executionResult.error}
              </Alert>
            )}
            {executionResult?.logs && executionResult.logs.length > 0 && (
              <Box sx={{ p: 1 }}>
                {executionResult.logs.map((log, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontFamily: 'monospace',
                      color: log.level === 'error' ? 'error.main'
                        : log.level === 'warn' ? 'warning.main'
                        : log.level === 'debug' ? 'info.main'
                        : 'text.secondary',
                    }}
                  >
                    [{log.level}] {log.message}
                  </Typography>
                ))}
              </Box>
            )}
            {executionResult?.executionLog && executionResult.executionLog.length > 0 && (
              <Box sx={{ p: 1, bgcolor: 'grey.50' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
                  Przebieg wykonania:
                </Typography>
                {executionResult.executionLog.map((entry, i) => (
                  <Typography
                    key={i}
                    variant="caption"
                    sx={{
                      display: 'block',
                      fontFamily: 'monospace',
                      color: entry.status === 'error' ? 'error.main'
                        : entry.status === 'completed' ? 'success.main'
                        : 'text.secondary',
                    }}
                  >
                    {entry.status === 'completed' ? '✓' : entry.status === 'error' ? '✗' : '○'}{' '}
                    {entry.nodeName} ({entry.nodeType})
                    {entry.endTime && entry.startTime ? ` - ${entry.endTime - entry.startTime}ms` : ''}
                    {entry.error ? ` - ${entry.error}` : ''}
                  </Typography>
                ))}
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      <AutomateFlowPickerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSelect={handleSelectFlow}
        selectedId={flowId}
      />
    </NodeViewWrapper>
  );
};

// Tiptap Extension
export const AutomateFlowEmbed = Node.create({
  name: 'automateFlowEmbed',

  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      flowId: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="automate-flow-embed"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          const element = node as HTMLElement;
          return {
            flowId: element.getAttribute('data-flow-id') || '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', {
      'data-type': 'automate-flow-embed',
      'data-flow-id': node.attrs.flowId,
    }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AutomateFlowNodeView);
  },

  addCommands() {
    return {
      insertAutomateFlow: (flowId: string = '') => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: { flowId },
        });
      },
    };
  },
});

// Deklaracja typow dla komend
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    automateFlowEmbed: {
      insertAutomateFlow: (flowId?: string) => ReturnType;
    };
  }
}

export default AutomateFlowEmbed;
