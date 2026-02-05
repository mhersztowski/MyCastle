/**
 * AutomateMobileProperties - bottom drawer z właściwościami wybranego noda
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Drawer,
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
  Slider,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import Editor from '@monaco-editor/react';
import { useAutomateDesigner } from '../AutomateDesignerContext';
import { NODE_TYPE_METADATA } from '../../registry/nodeTypes';
import { setupAutomateMonaco } from '../automateMonacoSetup';

interface AutomateMobilePropertiesProps {
  open: boolean;
  onClose: () => void;
}

const AutomateMobileProperties: React.FC<AutomateMobilePropertiesProps> = ({ open, onClose }) => {
  const { flow, selectedNodeId, updateNode, deleteNode } = useAutomateDesigner();

  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [dialogScript, setDialogScript] = useState('');

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

  const openScriptDialog = useCallback(() => {
    setDialogScript(selectedNode?.script || '');
    setScriptDialogOpen(true);
  }, [selectedNode]);

  const handleScriptDialogSave = useCallback(() => {
    handleUpdate('script', dialogScript);
    setScriptDialogOpen(false);
  }, [dialogScript, handleUpdate]);

  const handleDelete = useCallback(() => {
    if (selectedNode) {
      deleteNode(selectedNode.id);
      onClose();
    }
  }, [selectedNode, deleteNode, onClose]);

  if (!selectedNode) return null;

  const meta = NODE_TYPE_METADATA[selectedNode.nodeType];
  const Icon = meta?.icon;

  return (
    <>
      <Drawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            borderRadius: '16px 16px 0 0',
            maxHeight: '80vh',
          },
        }}
      >
        {/* Puller handle */}
        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Box sx={{ width: 40, height: 6, bgcolor: 'grey.300', borderRadius: 3 }} />
        </Box>

        {/* Header */}
        <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          {Icon && <Icon sx={{ fontSize: 22, color: meta.color }} />}
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }} noWrap>
            {meta?.label}
          </Typography>
          <IconButton size="small" onClick={handleDelete} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ overflow: 'auto', px: 2, pb: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
            label={<Typography variant="body2">Aktywny</Typography>}
          />

          <Divider />

          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Konfiguracja
          </Typography>

          {/* JS Execute - script editor */}
          {selectedNode.nodeType === 'js_execute' && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Skrypt JavaScript
                </Typography>
                <IconButton size="small" onClick={openScriptDialog}>
                  <OpenInFullIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              <TextField
                value={selectedNode.script || ''}
                onChange={e => handleUpdate('script', e.target.value)}
                size="small"
                fullWidth
                multiline
                rows={4}
                InputProps={{
                  sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                }}
                placeholder="// Wpisz kod JavaScript..."
              />
            </Box>
          )}

          {/* If/Else */}
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

          {/* Switch */}
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
                label={<Typography variant="body2">Dynamiczny prompt (ze skryptu)</Typography>}
              />

              {selectedNode.config.useScript ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Skrypt (return prompt string)
                    </Typography>
                    <IconButton size="small" onClick={openScriptDialog}>
                      <OpenInFullIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                  <TextField
                    value={selectedNode.script || ''}
                    onChange={e => handleUpdate('script', e.target.value)}
                    size="small"
                    fullWidth
                    multiline
                    rows={4}
                    InputProps={{
                      sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                    }}
                  />
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
                label={<Typography variant="body2">Dynamiczny tekst (ze skryptu)</Typography>}
              />

              {selectedNode.config.useScript ? (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Skrypt (return text string)
                    </Typography>
                    <IconButton size="small" onClick={openScriptDialog}>
                      <OpenInFullIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                  <TextField
                    value={selectedNode.script || ''}
                    onChange={e => handleUpdate('script', e.target.value)}
                    size="small"
                    fullWidth
                    multiline
                    rows={4}
                    InputProps={{
                      sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                    }}
                  />
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

          <Typography variant="caption" color="text.secondary">
            Pozycja: ({Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)})
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {selectedNode.id}
          </Typography>
        </Box>
      </Drawer>

      {/* Fullscreen script editor dialog */}
      <Dialog
        open={scriptDialogOpen}
        onClose={() => setScriptDialogOpen(false)}
        fullScreen
      >
        <DialogTitle sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
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
              minimap: { enabled: false },
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

export default AutomateMobileProperties;
