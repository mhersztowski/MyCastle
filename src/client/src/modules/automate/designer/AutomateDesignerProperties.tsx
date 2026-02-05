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
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Editor from '@monaco-editor/react';
import { useAutomateDesigner } from './AutomateDesignerContext';
import { NODE_TYPE_METADATA } from '../registry/nodeTypes';
import { setupAutomateMonaco } from './automateMonacoSetup';

const MIN_WIDTH = 220;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 300;

const AutomateDesignerProperties: React.FC = () => {
  const { flow, selectedNodeId, updateNode, deleteNode } = useAutomateDesigner();

  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [dialogScript, setDialogScript] = useState('');
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

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
              />
              <TextField
                label="Przypadki (oddzielone przecinkiem)"
                value={((selectedNode.config.cases as string[]) || []).join(', ')}
                onChange={e => handleConfigUpdate('cases', e.target.value.split(',').map(s => s.trim()))}
                size="small"
                fullWidth
                placeholder="active, inactive, pending"
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
              />
              {selectedNode.nodeType === 'write_variable' && (
                <TextField
                  label="Wartość"
                  value={selectedNode.config.value || ''}
                  onChange={e => handleConfigUpdate('value', e.target.value)}
                  size="small"
                  fullWidth
                />
              )}
            </>
          )}

          {/* Log */}
          {selectedNode.nodeType === 'log' && (
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
        PaperProps={{ sx: { height: '80vh' } }}
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
    </>
  );
};

export default AutomateDesignerProperties;
