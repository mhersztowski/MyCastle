/**
 * AutomateDesignerProperties - panel właściwości wybranego noda (prawy panel)
 * Resizable + fullscreen editor dialog for js_execute
 */

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tooltip,
  Slider,
  Chip,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useTheme, useMediaQuery } from '@mui/material';
import Editor from '@monaco-editor/react';
import { useAutomateDesigner } from './AutomateDesignerContext';
import { NODE_TYPE_METADATA, ERROR_OUTPUT_PORT, SCHEDULE_PRESETS } from '../registry/nodeTypes';
import { setupAutomateMonaco } from './automateMonacoSetup';
import { automateService } from '../services/AutomateService';
import { AutomateFlowNode } from '../nodes/AutomateFlowNode';
import { DirectoryTree, mqttClient } from '../../mqttclient';

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

// Tree node for flow picker (simplified, for selection only)
interface FlowPickerTreeNodeProps {
  node: DirectoryTree;
  level: number;
  flowsMap: Map<string, AutomateFlowNode>;
  currentFlowId?: string; // Exclude current flow
  onSelect: (flowId: string, flowName: string) => void;
}

const FlowPickerTreeNode: React.FC<FlowPickerTreeNodeProps> = ({
  node,
  level,
  flowsMap,
  currentFlowId,
  onSelect,
}) => {
  const [open, setOpen] = useState(level < 2);

  const isDirectory = node.type === 'directory';
  const flow = !isDirectory ? flowsMap.get(node.path) : undefined;

  // Skip current flow
  if (flow && flow.id === currentFlowId) return null;

  const handleClick = () => {
    if (isDirectory) {
      setOpen(!open);
    } else if (flow) {
      onSelect(flow.id, flow.name);
    }
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        sx={{ pl: 2 + level * 2, py: 0.5, borderRadius: 1 }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {isDirectory ? (
            open ? <FolderOpenIcon fontSize="small" color="primary" /> : <FolderIcon fontSize="small" color="primary" />
          ) : (
            <AccountTreeIcon fontSize="small" color="warning" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {isDirectory ? node.name : (flow?.name || node.name.replace(FLOW_EXTENSION, ''))}
              </Typography>
              {!isDirectory && flow?.runtime && (
                <Chip
                  label={flow.runtime}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              )}
            </Box>
          }
          primaryTypographyProps={{ component: 'div' }}
        />
        {isDirectory && node.children && node.children.length > 0 && (
          open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />
        )}
      </ListItemButton>

      {isDirectory && node.children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding dense>
            {node.children.map((child: DirectoryTree, index: number) => (
              <FlowPickerTreeNode
                key={`${child.path}-${index}`}
                node={child}
                level={level + 1}
                flowsMap={flowsMap}
                currentFlowId={currentFlowId}
                onSelect={onSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const MIN_WIDTH = 220;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;

const AutomateDesignerProperties: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { flow, selectedNodeId, updateNode, deleteNode, deleteEdge } = useAutomateDesigner();

  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [dialogScript, setDialogScript] = useState('');
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<AutomateFlowNode[]>([]);
  const [flowPickerOpen, setFlowPickerOpen] = useState(false);
  const [flowTree, setFlowTree] = useState<DirectoryTree | null>(null);
  const [flowsMap, setFlowsMap] = useState<Map<string, AutomateFlowNode>>(new Map());
  const [flowTreeLoading, setFlowTreeLoading] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  // Load available flows for call_flow selector
  useEffect(() => {
    const loadFlows = async () => {
      try {
        const flows = await automateService.getAllFlows();
        setAvailableFlows(flows);

        // Build flows map (path -> flow)
        const map = new Map<string, AutomateFlowNode>();
        for (const f of flows) {
          const path = automateService.getFlowPath(f.id);
          if (path) {
            map.set(path, f);
          }
        }
        setFlowsMap(map);
      } catch (err) {
        console.warn('Failed to load flows for call_flow selector:', err);
      }
    };
    loadFlows();
  }, []);

  // Load directory tree when flow picker opens
  useEffect(() => {
    if (flowPickerOpen && !flowTree) {
      setFlowTreeLoading(true);
      mqttClient.listDirectory('').then((tree: DirectoryTree) => {
        const filtered = filterFlowTree(tree);
        setFlowTree(filtered);
      }).catch((err: unknown) => {
        console.error('Failed to load flow tree:', err);
      }).finally(() => {
        setFlowTreeLoading(false);
      });
    }
  }, [flowPickerOpen, flowTree]);

  const selectedNode = useMemo(() => {
    if (!flow || !selectedNodeId) return null;
    return flow.nodes.find(n => n.id === selectedNodeId) || null;
  }, [flow, selectedNodeId]);

  const handleUpdate = useCallback((field: string, value: unknown) => {
    if (!selectedNodeId) return;
    updateNode(selectedNodeId, { [field]: value });
  }, [selectedNodeId, updateNode]);

  const handleConfigUpdate = useCallback((key: string, value: unknown) => {
    if (!selectedNodeId || !selectedNode) return;
    updateNode(selectedNodeId, {
      config: { ...selectedNode.config, [key]: value },
    });
  }, [selectedNodeId, selectedNode, updateNode]);

  // Special handler for switch node cases - syncs output ports with cases
  const handleSwitchCasesUpdate = useCallback((casesStr: string) => {
    if (!selectedNodeId || !selectedNode) return;
    // Parse for outputs - filter empty, but keep raw string for TextField
    const casesList = casesStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const hasErrorPort = selectedNode.config.enableErrorPort;
    const outputs = [
      ...casesList.map((c, i) => ({
        id: `case_${i}`,
        name: c,
        direction: 'output' as const,
        dataType: 'flow' as const,
      })),
      { id: 'default', name: 'Default', direction: 'output' as const, dataType: 'flow' as const },
      ...(hasErrorPort ? [ERROR_OUTPUT_PORT] : []),
    ];
    updateNode(selectedNodeId, {
      config: { ...selectedNode.config, cases: casesList, casesRaw: casesStr },
      outputs,
    });
  }, [selectedNodeId, selectedNode, updateNode]);

  // Handler for generating webhook secret
  const generateWebhookSecret = useCallback(() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleConfigUpdate('secret', secret);
  }, [handleConfigUpdate]);

  // Handler for copying webhook URL
  const copyWebhookUrl = useCallback(() => {
    if (!flow || !selectedNode) return;
    const baseUrl = import.meta.env.VITE_HTTP_URL || 'http://localhost:3001';
    const secret = selectedNode.config.secret as string | undefined;
    const url = `${baseUrl}/webhook/${flow.id}/${selectedNode.id}${secret ? `?token=${secret}` : ''}`;
    navigator.clipboard.writeText(url);
    setCopiedWebhookUrl(true);
    setTimeout(() => setCopiedWebhookUrl(false), 2000);
  }, [flow, selectedNode]);

  // Handler for toggling HTTP methods
  const toggleHttpMethod = useCallback((method: string) => {
    if (!selectedNode) return;
    const current = (selectedNode.config.allowedMethods as string[]) || ['POST'];
    const newMethods = current.includes(method)
      ? current.filter(m => m !== method)
      : [...current, method];
    // Ensure at least one method is selected
    if (newMethods.length > 0) {
      handleConfigUpdate('allowedMethods', newMethods);
    }
  }, [selectedNode, handleConfigUpdate]);

  // Handler for error port toggle
  const handleErrorPortToggle = useCallback((enabled: boolean) => {
    if (!selectedNodeId || !selectedNode) return;
    const meta = NODE_TYPE_METADATA[selectedNode.nodeType];
    const baseOutputs = selectedNode.outputs?.filter(p => p.id !== 'error') || meta.defaultOutputs;
    const newOutputs = enabled
      ? [...baseOutputs, ERROR_OUTPUT_PORT]
      : baseOutputs;
    updateNode(selectedNodeId, {
      config: { ...selectedNode.config, enableErrorPort: enabled },
      outputs: newOutputs,
    });
  }, [selectedNodeId, selectedNode, updateNode]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Script dialog
  const openScriptDialog = useCallback(() => {
    setDialogScript(selectedNode?.script || '');
    setScriptDialogOpen(true);
  }, [selectedNode]);

  const handleScriptDialogSave = useCallback(() => {
    handleUpdate('script', dialogScript);
    setScriptDialogOpen(false);
  }, [dialogScript, handleUpdate]);

  if (!selectedNode) {
    return (
      <Box sx={{ width: panelWidth, position: 'relative', borderLeft: '1px solid', borderColor: 'divider', p: 2, bgcolor: 'background.paper' }}>
        {/* Resize handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
            cursor: 'col-resize', zIndex: 10,
            '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
          }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
          Wybierz node aby zobaczyć właściwości
        </Typography>
      </Box>
    );
  }

  const meta = NODE_TYPE_METADATA[selectedNode.nodeType];
  const Icon = meta?.icon;

  return (
    <>
      <Box
        sx={{
          width: panelWidth,
          position: 'relative',
          borderLeft: '1px solid',
          borderColor: 'divider',
          overflow: 'auto',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        {/* Resize handle */}
        <Box
          onMouseDown={handleResizeStart}
          sx={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
            cursor: 'col-resize', zIndex: 10,
            bgcolor: isResizing ? 'primary.main' : 'transparent',
            opacity: isResizing ? 0.4 : 1,
            '&:hover': { bgcolor: 'primary.main', opacity: 0.3 },
          }}
        />

        {/* Header */}
        <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
          {Icon && <Icon sx={{ fontSize: 18, color: meta.color }} />}
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            {meta?.label}
          </Typography>
          <IconButton size="small" onClick={() => deleteNode(selectedNode.id)} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Basic properties */}
          <TextField
            label="Nazwa"
            value={selectedNode.name}
            onChange={e => handleUpdate('name', e.target.value)}
            size="small"
            fullWidth
          />

          <TextField
            label="Opis"
            value={selectedNode.description || ''}
            onChange={e => handleUpdate('description', e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />

          <FormControlLabel
            control={
              <Switch
                checked={!selectedNode.disabled}
                onChange={e => handleUpdate('disabled', !e.target.checked)}
                size="small"
              />
            }
            label={<Typography variant="caption">Aktywny</Typography>}
          />

          {/* Error Port Toggle - only for nodes that can error */}
          {meta.canError && (
            <FormControlLabel
              control={
                <Switch
                  checked={!!selectedNode.config.enableErrorPort}
                  onChange={e => handleErrorPortToggle(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="caption" sx={{ color: 'error.main' }}>
                  Włącz port błędu
                </Typography>
              }
            />
          )}

          <Divider />

          {/* Node-type specific config */}
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Konfiguracja
          </Typography>

          {/* JS Execute - script editor with fullscreen option */}
          {selectedNode.nodeType === 'js_execute' && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Skrypt JavaScript
                </Typography>
                <Tooltip title="Otwórz w pełnym oknie">
                  <IconButton size="small" onClick={openScriptDialog}>
                    <OpenInFullIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ height: 300 }}>
                <Editor
                  height="100%"
                  defaultLanguage="javascript"
                  value={selectedNode.script || ''}
                  onChange={value => handleUpdate('script', value || '')}
                  beforeMount={setupAutomateMonaco}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    tabSize: 2,
                  }}
                  theme="vs-dark"
                />
              </Box>
            </Box>
          )}

          {/* If/Else - condition */}
          {selectedNode.nodeType === 'if_else' && (
            <TextField
              label="Warunek (JS expression)"
              value={selectedNode.config.condition || ''}
              onChange={e => handleConfigUpdate('condition', e.target.value)}
              size="small"
              fullWidth
              placeholder="variables.x > 10"
              inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
            />
          )}

          {/* Switch - expression + cases */}
          {selectedNode.nodeType === 'switch' && (
            <>
              <TextField
                label="Wyrażenie"
                value={selectedNode.config.expression || ''}
                onChange={e => handleConfigUpdate('expression', e.target.value)}
                size="small"
                fullWidth
                placeholder="variables.status"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />
              <TextField
                label="Przypadki (oddzielone przecinkiem)"
                value={(selectedNode.config.casesRaw as string) ?? ((selectedNode.config.cases as string[]) || []).join(', ')}
                onChange={e => handleSwitchCasesUpdate(e.target.value)}
                size="small"
                fullWidth
                placeholder="active, inactive, pending"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />
            </>
          )}

          {/* For Loop */}
          {selectedNode.nodeType === 'for_loop' && (
            <>
              <TextField
                label="Liczba iteracji"
                type="number"
                value={selectedNode.config.count || 0}
                onChange={e => handleConfigUpdate('count', parseInt(e.target.value) || 0)}
                size="small"
                fullWidth
              />
              <TextField
                label="Zmienna indeksu"
                value={selectedNode.config.indexVariable || 'i'}
                onChange={e => handleConfigUpdate('indexVariable', e.target.value)}
                size="small"
                fullWidth
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />
            </>
          )}

          {/* While Loop */}
          {selectedNode.nodeType === 'while_loop' && (
            <>
              <TextField
                label="Warunek (JS expression)"
                value={selectedNode.config.condition || ''}
                onChange={e => handleConfigUpdate('condition', e.target.value)}
                size="small"
                fullWidth
                placeholder="variables.counter < 100"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />
              <TextField
                label="Max iteracji"
                type="number"
                value={selectedNode.config.maxIterations || 1000}
                onChange={e => handleConfigUpdate('maxIterations', parseInt(e.target.value) || 1000)}
                size="small"
                fullWidth
              />
            </>
          )}

          {/* Read/Write Variable */}
          {(selectedNode.nodeType === 'read_variable' || selectedNode.nodeType === 'write_variable') && (
            <>
              <TextField
                label="Nazwa zmiennej"
                value={selectedNode.config.variableName || ''}
                onChange={e => handleConfigUpdate('variableName', e.target.value)}
                size="small"
                fullWidth
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />
              {selectedNode.nodeType === 'write_variable' && (
                <TextField
                  label="Wartość"
                  value={selectedNode.config.value || ''}
                  onChange={e => handleConfigUpdate('value', e.target.value)}
                  size="small"
                  fullWidth
                  inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
                />
              )}
            </>
          )}

          {/* Log */}
          {selectedNode.nodeType === 'log' && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedNode.config.logInput}
                    onChange={e => handleConfigUpdate('logInput', e.target.checked)}
                    size="small"
                  />
                }
                label="Loguj input jako obiekt"
              />
              <TextField
                label="Wiadomość (opcjonalna)"
                value={selectedNode.config.message || ''}
                onChange={e => handleConfigUpdate('message', e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                helperText={selectedNode.config.logInput ? "Zostanie dodana przed obiektem input" : undefined}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Poziom</InputLabel>
                <Select
                  value={selectedNode.config.level || 'info'}
                  label="Poziom"
                  onChange={e => handleConfigUpdate('level', e.target.value)}
                >
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="warn">Warning</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                  <MenuItem value="debug">Debug</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {/* Notification */}
          {selectedNode.nodeType === 'notification' && (
            <>
              <TextField
                label="Wiadomość"
                value={selectedNode.config.message || ''}
                onChange={e => handleConfigUpdate('message', e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
              />
              <FormControl size="small" fullWidth>
                <InputLabel>Typ</InputLabel>
                <Select
                  value={selectedNode.config.severity || 'info'}
                  label="Typ"
                  onChange={e => handleConfigUpdate('severity', e.target.value)}
                >
                  <MenuItem value="success">Success</MenuItem>
                  <MenuItem value="info">Info</MenuItem>
                  <MenuItem value="warning">Warning</MenuItem>
                  <MenuItem value="error">Error</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {/* System API */}
          {selectedNode.nodeType === 'system_api' && (
            <TextField
              label="Metoda API"
              value={selectedNode.config.apiMethod || ''}
              onChange={e => handleConfigUpdate('apiMethod', e.target.value)}
              size="small"
              fullWidth
              placeholder="file.read, data.getPersons..."
              inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
            />
          )}

          {/* LLM Call */}
          {selectedNode.nodeType === 'llm_call' && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedNode.config.useScript}
                    onChange={e => handleConfigUpdate('useScript', e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Dynamiczny prompt (ze skryptu)</Typography>}
              />

              {selectedNode.config.useScript ? (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Skrypt (return prompt string)
                    </Typography>
                    <Tooltip title="Otwórz w pełnym oknie">
                      <IconButton size="small" onClick={openScriptDialog}>
                        <OpenInFullIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ height: 200 }}>
                    <Editor
                      height="100%"
                      defaultLanguage="javascript"
                      value={selectedNode.script || ''}
                      onChange={value => handleUpdate('script', value || '')}
                      beforeMount={setupAutomateMonaco}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                      }}
                      theme="vs-dark"
                    />
                  </Box>
                </Box>
              ) : (
                <TextField
                  label="Prompt"
                  value={selectedNode.config.prompt || ''}
                  onChange={e => handleConfigUpdate('prompt', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Wpisz prompt dla AI..."
                />
              )}

              <TextField
                label="System Prompt"
                value={selectedNode.config.systemPrompt || ''}
                onChange={e => handleConfigUpdate('systemPrompt', e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={2}
                placeholder="Instrukcja systemowa (opcjonalna)"
              />

              <TextField
                label="Model"
                value={selectedNode.config.model || ''}
                onChange={e => handleConfigUpdate('model', e.target.value)}
                size="small"
                fullWidth
                placeholder="Domyślny z ustawień AI"
              />

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Temperature: {String(selectedNode.config.temperature ?? 0.7)}
                </Typography>
                <Slider
                  value={(selectedNode.config.temperature as number) ?? 0.7}
                  onChange={(_, v) => handleConfigUpdate('temperature', v as number)}
                  min={0}
                  max={2}
                  step={0.1}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>

              <TextField
                label="Max Tokens"
                type="number"
                value={selectedNode.config.maxTokens || 2048}
                onChange={e => handleConfigUpdate('maxTokens', parseInt(e.target.value) || 2048)}
                size="small"
                fullWidth
              />
            </>
          )}

          {/* TTS */}
          {selectedNode.nodeType === 'tts' && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedNode.config.useScript}
                    onChange={e => handleConfigUpdate('useScript', e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Dynamiczny tekst (ze skryptu)</Typography>}
              />

              {selectedNode.config.useScript ? (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Skrypt (return text string)
                    </Typography>
                    <Tooltip title="Otwórz w pełnym oknie">
                      <IconButton size="small" onClick={openScriptDialog}>
                        <OpenInFullIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ height: 200 }}>
                    <Editor
                      height="100%"
                      defaultLanguage="javascript"
                      value={selectedNode.script || ''}
                      onChange={value => handleUpdate('script', value || '')}
                      beforeMount={setupAutomateMonaco}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                      }}
                      theme="vs-dark"
                    />
                  </Box>
                </Box>
              ) : (
                <TextField
                  label="Tekst do odczytania"
                  value={selectedNode.config.text || ''}
                  onChange={e => handleConfigUpdate('text', e.target.value)}
                  size="small"
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Wpisz tekst do odczytania..."
                />
              )}

              <TextField
                label="Voice"
                value={selectedNode.config.voice || ''}
                onChange={e => handleConfigUpdate('voice', e.target.value)}
                size="small"
                fullWidth
                placeholder="Domyślny z ustawień Speech"
              />

              <Box>
                <Typography variant="caption" color="text.secondary">
                  Speed: {String(selectedNode.config.speed ?? 1.0)}
                </Typography>
                <Slider
                  value={(selectedNode.config.speed as number) ?? 1.0}
                  onChange={(_, v) => handleConfigUpdate('speed', v as number)}
                  min={0.25}
                  max={4.0}
                  step={0.25}
                  valueLabelDisplay="auto"
                  size="small"
                />
              </Box>
            </>
          )}

          {/* STT */}
          {selectedNode.nodeType === 'stt' && (
            <TextField
              label="Language"
              value={selectedNode.config.language || ''}
              onChange={e => handleConfigUpdate('language', e.target.value)}
              size="small"
              fullWidth
              placeholder="Domyślny z ustawień Speech (pl, en...)"
            />
          )}

          {/* Manual Trigger - payload */}
          {selectedNode.nodeType === 'manual_trigger' && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={!!selectedNode.config.useScript}
                    onChange={e => handleConfigUpdate('useScript', e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Dynamiczny payload (ze skryptu)</Typography>}
              />

              {selectedNode.config.useScript ? (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Skrypt (return payload)
                    </Typography>
                    <Tooltip title="Otwórz w pełnym oknie">
                      <IconButton size="small" onClick={openScriptDialog}>
                        <OpenInFullIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Box sx={{ height: 200 }}>
                    <Editor
                      height="100%"
                      defaultLanguage="javascript"
                      value={selectedNode.script || ''}
                      onChange={value => handleUpdate('script', value || '')}
                      beforeMount={setupAutomateMonaco}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                      }}
                      theme="vs-dark"
                    />
                  </Box>
                </Box>
              ) : (
                <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Box sx={{ px: 1, pt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Payload (JSON)
                    </Typography>
                  </Box>
                  <Box sx={{ height: 150 }}>
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      value={(selectedNode.config.payload as string) || '{}'}
                      onChange={value => handleConfigUpdate('payload', value || '{}')}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                      }}
                      theme="vs-dark"
                    />
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Webhook Trigger */}
          {selectedNode.nodeType === 'webhook_trigger' && (
            <>
              {/* Webhook URL */}
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  URL Webhooka
                </Typography>
                <TextField
                  value={`${import.meta.env.VITE_HTTP_URL || 'http://localhost:3001'}/webhook/${flow?.id}/${selectedNode.id}${selectedNode.config.secret ? `?token=${selectedNode.config.secret}` : ''}`}
                  size="small"
                  fullWidth
                  InputProps={{
                    readOnly: true,
                    sx: { fontSize: '0.75rem', fontFamily: 'monospace' },
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={copiedWebhookUrl ? 'Skopiowano!' : 'Kopiuj URL'}>
                          <IconButton size="small" onClick={copyWebhookUrl}>
                            {copiedWebhookUrl ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>

              {/* Secret token */}
              <TextField
                label="Secret Token"
                type="password"
                value={selectedNode.config.secret || ''}
                onChange={e => handleConfigUpdate('secret', e.target.value)}
                size="small"
                fullWidth
                placeholder="Opcjonalny token uwierzytelniający"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Generuj nowy secret">
                        <IconButton size="small" onClick={generateWebhookSecret}>
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />

              {/* Allowed HTTP methods */}
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Dozwolone metody HTTP
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {['POST', 'GET', 'PUT', 'DELETE'].map(method => {
                    const isSelected = ((selectedNode.config.allowedMethods as string[]) || ['POST']).includes(method);
                    return (
                      <Chip
                        key={method}
                        label={method}
                        size="small"
                        onClick={() => toggleHttpMethod(method)}
                        color={isSelected ? 'primary' : 'default'}
                        variant={isSelected ? 'filled' : 'outlined'}
                      />
                    );
                  })}
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Dane webhooka dostępne w skrypcie:<br />
                <code>inp._webhookPayload</code> - body<br />
                <code>inp._webhookMethod</code> - metoda<br />
                <code>inp._webhookHeaders</code> - nagłówki<br />
                <code>inp._webhookQuery</code> - query params
              </Typography>
            </>
          )}

          {/* Schedule Trigger */}
          {selectedNode.nodeType === 'schedule_trigger' && (
            <>
              {/* Enable/Disable */}
              <FormControlLabel
                control={
                  <Switch
                    checked={selectedNode.config.enabled !== false}
                    onChange={e => handleConfigUpdate('enabled', e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Harmonogram aktywny</Typography>}
              />

              {/* Preset selector */}
              <FormControl size="small" fullWidth>
                <InputLabel>Częstotliwość</InputLabel>
                <Select
                  value={selectedNode.config.preset || 'custom'}
                  label="Częstotliwość"
                  onChange={e => {
                    const preset = e.target.value as string;
                    if (preset !== 'custom') {
                      handleConfigUpdate('cronExpression', preset);
                    }
                    handleConfigUpdate('preset', preset);
                  }}
                >
                  {SCHEDULE_PRESETS.map(p => (
                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Custom cron expression */}
              {selectedNode.config.preset === 'custom' && (
                <TextField
                  label="Wyrażenie cron"
                  value={selectedNode.config.cronExpression || ''}
                  onChange={e => handleConfigUpdate('cronExpression', e.target.value)}
                  size="small"
                  fullWidth
                  placeholder="* * * * *"
                  helperText="Format: minuta(0-59) godzina(0-23) dzień(1-31) miesiąc(1-12) dzień-tyg(0-6)"
                  inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
                />
              )}

              {/* Timezone */}
              <TextField
                label="Strefa czasowa"
                value={selectedNode.config.timezone || 'UTC'}
                onChange={e => handleConfigUpdate('timezone', e.target.value)}
                size="small"
                fullWidth
                placeholder="UTC, Europe/Warsaw, America/New_York"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />

              {/* Info */}
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Cron: {String(selectedNode.config.cronExpression || '(brak)')}<br />
                Dane dostępne w skrypcie:<br />
                <code>inp._scheduledTime</code> - timestamp<br />
                <code>inp._cronExpression</code> - wyrażenie cron<br />
                <code>inp._timezone</code> - strefa czasowa
              </Typography>
            </>
          )}

          {/* Comment */}
          {selectedNode.nodeType === 'comment' && (
            <TextField
              label="Komentarz"
              value={selectedNode.config.text || ''}
              onChange={e => handleConfigUpdate('text', e.target.value)}
              size="small"
              fullWidth
              multiline
              rows={4}
            />
          )}

          {/* Call Flow */}
          {selectedNode.nodeType === 'call_flow' && (
            <>
              {/* Subflow picker button */}
              <Button
                variant="outlined"
                size="small"
                fullWidth
                onClick={() => setFlowPickerOpen(true)}
                startIcon={<AccountTreeIcon />}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                {selectedNode.config.flowId
                  ? (selectedNode.config.subflowName as string) || 'Wybrany flow'
                  : 'Wybierz subflow...'}
              </Button>

              {/* Show selected flow info */}
              {selectedNode.config.flowId && (() => {
                const selectedFlow = availableFlows.find(f => f.id === selectedNode.config.flowId);
                if (!selectedFlow) {
                  return (
                    <Typography variant="caption" color="error">
                      Flow nie znaleziono
                    </Typography>
                  );
                }
                return (
                  <Box sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      <strong>{selectedFlow.name}</strong><br />
                      {selectedFlow.description && <>{selectedFlow.description}<br /></>}
                      Nodów: {selectedFlow.nodes.length}<br />
                      Runtime: {selectedFlow.runtime || 'universal'}
                    </Typography>
                  </Box>
                );
              })()}

              <FormControlLabel
                control={
                  <Switch
                    checked={selectedNode.config.passInputAsPayload !== false}
                    onChange={e => handleConfigUpdate('passInputAsPayload', e.target.checked)}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Przekaż input do subflow</Typography>}
              />

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                W subflow dostępne:<br />
                <code>vars._parentInput</code> - dane z parent flow<br />
                <br />
                Po zakończeniu subflow:<br />
                <code>inp._result</code> - zmienne subflow
              </Typography>
            </>
          )}

          {/* Rate Limit */}
          {selectedNode.nodeType === 'rate_limit' && (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel>Tryb</InputLabel>
                <Select
                  value={selectedNode.config.mode || 'delay'}
                  label="Tryb"
                  onChange={e => handleConfigUpdate('mode', e.target.value)}
                >
                  <MenuItem value="delay">Delay (opóźnij)</MenuItem>
                  <MenuItem value="throttle">Throttle (max raz na X ms)</MenuItem>
                  <MenuItem value="debounce">Debounce (poczekaj na ciszę)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Czas (ms)"
                type="number"
                value={selectedNode.config.delayMs || 1000}
                onChange={e => handleConfigUpdate('delayMs', parseInt(e.target.value) || 1000)}
                size="small"
                fullWidth
                inputProps={{ min: 0, step: 100 }}
              />

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                {selectedNode.config.mode === 'delay' && (
                  <>Czeka określony czas przed kontynuacją.</>
                )}
                {selectedNode.config.mode === 'throttle' && (
                  <>Przepuszcza max raz na X ms. Kolejne wywołania idą do portu "Skipped".</>
                )}
                {selectedNode.config.mode === 'debounce' && (
                  <>Czeka na "ciszę" - opóźnia wykonanie o X ms.</>
                )}
              </Typography>
            </>
          )}

          {/* For Each */}
          {selectedNode.nodeType === 'foreach' && (
            <>
              <TextField
                label="Źródło (wyrażenie JS)"
                value={selectedNode.config.sourceExpression || 'inp._result'}
                onChange={e => handleConfigUpdate('sourceExpression', e.target.value)}
                size="small"
                fullWidth
                placeholder="inp._result"
                helperText="Wyrażenie zwracające tablicę"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />

              <TextField
                label="Zmienna elementu"
                value={selectedNode.config.itemVariable || 'item'}
                onChange={e => handleConfigUpdate('itemVariable', e.target.value)}
                size="small"
                fullWidth
                placeholder="item"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />

              <TextField
                label="Zmienna indeksu"
                value={selectedNode.config.indexVariable || 'index'}
                onChange={e => handleConfigUpdate('indexVariable', e.target.value)}
                size="small"
                fullWidth
                placeholder="index"
                inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
              />

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                W każdej iteracji dostępne:<br />
                <code>inp._result</code> - aktualny element<br />
                <code>vars.item</code> - aktualny element<br />
                <code>vars.index</code> - indeks (0, 1, 2...)<br />
                <br />
                Port "Loop" uruchamiany dla każdego elementu.<br />
                Port "Done" po zakończeniu iteracji.
              </Typography>
            </>
          )}

          {/* Merge */}
          {selectedNode.nodeType === 'merge' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Tryb agregacji</InputLabel>
                <Select
                  value={selectedNode.config.mode || 'object'}
                  label="Tryb agregacji"
                  onChange={e => handleConfigUpdate('mode', e.target.value)}
                >
                  <MenuItem value="object">Obiekt (klucz: portId)</MenuItem>
                  <MenuItem value="array">Tablica</MenuItem>
                </Select>
              </FormControl>

              <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Porty wejściowe</Typography>
              {selectedNode.inputs.map((port, idx) => (
                <Box key={port.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <TextField
                    size="small"
                    value={port.name}
                    onChange={e => {
                      if (!selectedNodeId) return;
                      const newInputs = [...selectedNode.inputs];
                      newInputs[idx] = { ...port, name: e.target.value };
                      updateNode(selectedNodeId, { inputs: newInputs });
                    }}
                    sx={{ flex: 1 }}
                    inputProps={{ autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false }}
                  />
                  {selectedNode.inputs.length > 2 && (
                    <IconButton
                      size="small"
                      onClick={() => {
                        if (!selectedNodeId) return;
                        // Remove edges connected to this port
                        if (flow) {
                          const edgesToRemove = flow.edges.filter(
                            e => e.targetNodeId === selectedNode.id && e.targetPortId === port.id
                          );
                          for (const edge of edgesToRemove) {
                            deleteEdge(edge.id);
                          }
                        }
                        // Remove the port
                        const newInputs = selectedNode.inputs.filter((_, i) => i !== idx);
                        updateNode(selectedNodeId, { inputs: newInputs });
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
              <Button
                size="small"
                onClick={() => {
                  if (!selectedNodeId) return;
                  const nextNum = selectedNode.inputs.length + 1;
                  const newInputs = [
                    ...selectedNode.inputs,
                    { id: `in_${nextNum}`, name: `In ${nextNum}`, direction: 'input' as const, dataType: 'any' as const },
                  ];
                  updateNode(selectedNodeId, { inputs: newInputs });
                }}
              >
                + Dodaj port
              </Button>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Merge czeka na dane ze wszystkich podłączonych portów.<br />
                <br />
                Wynik (tryb object):<br />
                <code>{`{ "in_1": value1, "in_2": value2, ... }`}</code><br />
                <br />
                Wynik (tryb array):<br />
                <code>[value1, value2, ...]</code>
              </Typography>
            </>
          )}

          <Divider />

          {/* Position info */}
          <Typography variant="caption" color="text.secondary">
            Pozycja: ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {selectedNode.id}
          </Typography>
        </Box>
      </Box>

      {/* Fullscreen script editor dialog */}
      <Dialog
        open={scriptDialogOpen}
        onClose={() => setScriptDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
        PaperProps={isMobile ? undefined : { sx: { height: '80vh' } }}
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Edytor skryptu - {selectedNode?.name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Editor
            height="100%"
            defaultLanguage="javascript"
            value={dialogScript}
            onChange={value => setDialogScript(value || '')}
            beforeMount={setupAutomateMonaco}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
            }}
            theme="vs-dark"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScriptDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleScriptDialogSave} variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Flow picker dialog for call_flow */}
      <Dialog
        open={flowPickerOpen}
        onClose={() => setFlowPickerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Wybierz subflow</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {flowTreeLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : flowTree ? (
            <List dense disablePadding>
              <FlowPickerTreeNode
                node={flowTree}
                level={0}
                flowsMap={flowsMap}
                currentFlowId={flow?.id}
                onSelect={(flowId, flowName) => {
                  if (selectedNodeId) {
                    updateNode(selectedNodeId, {
                      config: {
                        ...selectedNode?.config,
                        flowId,
                        subflowName: flowName,
                      },
                    });
                  }
                  setFlowPickerOpen(false);
                }}
              />
            </List>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">Brak dostępnych flow</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFlowPickerOpen(false)}>Anuluj</Button>
          {selectedNode?.config.flowId as string ? (
            <Button
              color="error"
              onClick={() => {
                if (selectedNodeId) {
                  updateNode(selectedNodeId, {
                    config: {
                      ...selectedNode?.config,
                      flowId: '',
                      subflowName: '',
                    },
                  });
                }
                setFlowPickerOpen(false);
              }}
            >
              Wyczyść wybór
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AutomateDesignerProperties;
