/**
 * Automate Flow Extension - rozszerzenie Tiptap do osadzania flow automatyzacji w markdown
 * Format: @[automate:flow-id]
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  CircularProgress,
  Chip,
  Collapse,
  Alert,
  FormControlLabel,
  Switch,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';

import { automateService } from '../../../modules/automate/services/AutomateService';
import { AutomateEngine, ExecutionResult } from '../../../modules/automate/engine/AutomateEngine';
import { AutomateFlowModel } from '../../../modules/automate/models/AutomateFlowModel';
import { useFilesystem } from '../../../modules/filesystem/FilesystemContext';
import { mqttClient, DirectoryTree } from '../../../modules/mqttclient';
import { useNotification } from '../../../modules/notification';
import { AutomateFlowNode } from '../../../modules/automate/nodes';

const FLOW_EXTENSION = '.automate.json';

// Filter tree to only show directories with .automate.json files
function filterFlowTree(tree: DirectoryTree): DirectoryTree | null {
  if (tree.type === 'file') {
    return tree.name.endsWith(FLOW_EXTENSION) ? tree : null;
  }

  const filteredChildren: DirectoryTree[] = [];
  if (tree.children) {
    for (const child of tree.children) {
      const filtered = filterFlowTree(child);
      if (filtered) {
        filteredChildren.push(filtered);
      }
    }
  }

  if (filteredChildren.length > 0) {
    return { ...tree, children: filteredChildren };
  }
  return null;
}

interface FlowTreeNodeProps {
  node: DirectoryTree;
  level: number;
  flowsMap: Map<string, AutomateFlowNode>;
  selectedId?: string;
  onSelect: (flowId: string) => void;
}

const FlowTreeNode: React.FC<FlowTreeNodeProps> = ({ node, level, flowsMap, selectedId, onSelect }) => {
  const [open, setOpen] = useState(level < 2);

  const isDirectory = node.type === 'directory';
  const flow = !isDirectory ? flowsMap.get(node.path) : undefined;

  const handleClick = () => {
    if (isDirectory) {
      setOpen(!open);
    } else if (flow) {
      onSelect(flow.id);
    }
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        selected={!isDirectory && flow?.id === selectedId}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            open ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <AccountTreeIcon color="warning" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={isDirectory ? node.name : (flow?.name || node.name.replace(FLOW_EXTENSION, ''))}
          secondary={!isDirectory && flow?.description}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
        />
        {!isDirectory && flow && (
          <Chip label={`${flow.nodes?.length || 0}`} size="small" variant="outlined" sx={{ ml: 1 }} />
        )}
        {isDirectory && node.children && node.children.length > 0 && (
          open ? <ExpandLess /> : <ExpandMore />
        )}
      </ListItemButton>

      {isDirectory && node.children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children.map((child, index) => (
              <FlowTreeNode
                key={`${child.path}-${index}`}
                node={child}
                level={level + 1}
                flowsMap={flowsMap}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

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
  const [flowTree, setFlowTree] = useState<DirectoryTree | null>(null);
  const [flowsMap, setFlowsMap] = useState<Map<string, AutomateFlowNode>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      const loadTree = async () => {
        setLoading(true);
        try {
          // Load flows if not loaded
          if (!automateService.loaded) {
            await automateService.loadFlows();
          }

          // Build flows map (path -> flow)
          const flows = automateService.getAllFlows();
          const map = new Map<string, AutomateFlowNode>();
          for (const f of flows) {
            const path = automateService.getFlowPath(f.id);
            if (path) {
              map.set(path, f);
            }
          }
          setFlowsMap(map);

          // Load directory tree
          const tree = await mqttClient.listDirectory('');
          const filtered = filterFlowTree(tree);
          setFlowTree(filtered);
        } catch (err) {
          console.error('Failed to load flow tree:', err);
        } finally {
          setLoading(false);
        }
      };
      loadTree();
    }
  }, [open]);

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

      <DialogContent dividers sx={{ p: 0, minHeight: 300, maxHeight: 400, overflow: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !flowTree || flowsMap.size === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
            <Typography>Brak zdefiniowanych automatyzacji</Typography>
            <Typography variant="caption" color="text.secondary">
              Utwórz flow w designerze lub dodaj pliki .automate.json
            </Typography>
          </Box>
        ) : (
          <List component="nav" dense>
            <FlowTreeNode
              node={flowTree}
              level={0}
              flowsMap={flowsMap}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
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
  const autorunTriggeredRef = useRef(false);
  const handleRunRef = useRef<(() => Promise<void>) | null>(null);

  const { dataSource } = useFilesystem();
  const { notify } = useNotification();
  const flowId = node.attrs.flowId as string;
  const autorun = node.attrs.autorun as boolean;

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

  // Autorun effect - run flow automatically when loaded if autorun is enabled
  useEffect(() => {
    if (autorun && flow && !loading && !autorunTriggeredRef.current && !isRunning) {
      autorunTriggeredRef.current = true;
      // Execute directly - handleRunRef should be set by now
      handleRunRef.current?.();
    }
  }, [autorun, flow, loading, isRunning]);

  // Reset autorun trigger when flow changes
  useEffect(() => {
    autorunTriggeredRef.current = false;
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

    let result: ExecutionResult | null = null;

    try {
      if (flow.runtime === 'backend' || flow.runtime === 'universal') {
        // Remote execution on backend via MQTT
        result = await mqttClient.runAutomateFlow(flow.id) as ExecutionResult;
      } else {
        // Local execution for client flows
        const engine = new AutomateEngine();
        engineRef.current = engine;
        result = await engine.executeFlow(flow, dataSource);
      }
      setExecutionResult(result);
    } catch (err) {
      result = {
        success: false,
        executionLog: [],
        logs: [],
        notifications: [],
        variables: {},
        error: err instanceof Error ? err.message : String(err),
      };
      setExecutionResult(result);
    } finally {
      setIsRunning(false);
      engineRef.current = null;

      // Process notifications
      if (result?.notifications) {
        for (const n of result.notifications) {
          notify(n.message, n.severity || 'info');
        }
      }
    }
  }, [flow, isRunning, dataSource, engineRef, notify]);

  // Keep ref updated for autorun
  handleRunRef.current = handleRun;

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
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autorun}
                onChange={(e) => updateAttributes({ autorun: e.target.checked })}
              />
            }
            label={<Typography variant="caption">Autorun</Typography>}
            sx={{ ml: 0.5, mr: 0 }}
          />
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
      autorun: { default: false },
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
            autorun: element.getAttribute('data-autorun') === 'true',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', {
      'data-type': 'automate-flow-embed',
      'data-flow-id': node.attrs.flowId,
      'data-autorun': node.attrs.autorun ? 'true' : 'false',
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
