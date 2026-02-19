/**
 * Page Hooks Settings Page - konfiguracja hooków stron (flow uruchamiane przy ładowaniu strony)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import WebhookIcon from '@mui/icons-material/Webhook';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

import { pageHooksService } from '../../modules/automate/hooks/PageHooksService';
import { PageHookModel, PageHooksConfigModel, DEFAULT_PAGE_HOOKS_CONFIG } from '../../modules/automate/hooks/PageHooksModels';
import { automateService } from '../../modules/automate/services/AutomateService';
import { AutomateFlowNode } from '../../modules/automate/nodes/AutomateFlowNode';
import { useMqtt } from '../../modules/mqttclient';

// Available routes for hooks
const AVAILABLE_ROUTES = [
  { value: '/agent', label: 'Agent' },
  { value: '/calendar', label: 'Calendar' },
  { value: '/todolist', label: 'To-Do List' },
  { value: '/shopping', label: 'Shopping' },
  { value: '/automate', label: 'Automate' },
  { value: '/filesystem/list', label: 'File List' },
  { value: '/person', label: 'Person' },
  { value: '/project', label: 'Project' },
  { value: '/objectviewer', label: 'Object Viewer' },
  { value: '/components', label: 'Components' },
  { value: '/settings/ai', label: 'AI Settings' },
  { value: '/settings/speech', label: 'Speech Settings' },
  { value: '/settings/receipt', label: 'Receipt Settings' },
  { value: '/settings/page-hooks', label: 'Page Hooks Settings' },
];

interface HookDialogData {
  route: string;
  flowId: string;
  description: string;
  enabled: boolean;
}

const PageHooksSettingsPage: React.FC = () => {
  const { isConnected } = useMqtt();
  const [config, setConfig] = useState<PageHooksConfigModel>({ ...DEFAULT_PAGE_HOOKS_CONFIG });
  const [flows, setFlows] = useState<AutomateFlowNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHookId, setEditingHookId] = useState<string | null>(null);
  const [dialogData, setDialogData] = useState<HookDialogData>({
    route: '/agent',
    flowId: '',
    description: '',
    enabled: true,
  });

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    Promise.all([
      pageHooksService.loadConfig(),
      automateService.loadFlows(),
    ]).then(([loadedConfig, loadedFlows]) => {
      setConfig(loadedConfig);
      setFlows(loadedFlows);
      setLoading(false);
    });
  }, [isConnected]);

  const handleToggleHook = useCallback(async (id: string) => {
    await pageHooksService.toggleHook(id);
    setConfig({ ...pageHooksService.getConfig() });
  }, []);

  const handleDeleteHook = useCallback(async (id: string) => {
    await pageHooksService.removeHook(id);
    setConfig({ ...pageHooksService.getConfig() });
    setSaveMessage({ type: 'success', text: 'Hook usunięty' });
  }, []);

  const openAddDialog = useCallback(() => {
    setEditingHookId(null);
    setDialogData({
      route: '/agent',
      flowId: flows[0]?.id || '',
      description: '',
      enabled: true,
    });
    setDialogOpen(true);
  }, [flows]);

  const openEditDialog = useCallback((hook: PageHookModel) => {
    setEditingHookId(hook.id);
    setDialogData({
      route: hook.route,
      flowId: hook.flowId,
      description: hook.description || '',
      enabled: hook.enabled,
    });
    setDialogOpen(true);
  }, []);

  const handleDialogSave = useCallback(async () => {
    if (!dialogData.flowId) {
      setSaveMessage({ type: 'error', text: 'Wybierz flow' });
      return;
    }

    if (editingHookId) {
      await pageHooksService.updateHook(editingHookId, {
        route: dialogData.route,
        flowId: dialogData.flowId,
        description: dialogData.description || undefined,
        enabled: dialogData.enabled,
      });
      setSaveMessage({ type: 'success', text: 'Hook zaktualizowany' });
    } else {
      await pageHooksService.addHook({
        route: dialogData.route,
        flowId: dialogData.flowId,
        description: dialogData.description || undefined,
        enabled: dialogData.enabled,
      });
      setSaveMessage({ type: 'success', text: 'Hook dodany' });
    }

    setConfig({ ...pageHooksService.getConfig() });
    setDialogOpen(false);
  }, [dialogData, editingHookId]);

  const getFlowName = useCallback((flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    return flow?.name || flowId;
  }, [flows]);

  const getRouteName = useCallback((route: string) => {
    const routeInfo = AVAILABLE_ROUTES.find(r => r.value === route);
    return routeInfo?.label || route;
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <WebhookIcon sx={{ fontSize: 32, color: '#9c27b0' }} />
        <Typography variant="h5" fontWeight={600}>Page Hooks</Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Hooki stron
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openAddDialog}
            size="small"
            disabled={flows.length === 0}
          >
            Dodaj
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Hooki pozwalają uruchamiać flow automatyzacji przy ładowaniu wybranych stron.
        </Typography>

        {flows.length === 0 && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Brak flow automatyzacji. Utwórz flow w module Automate, aby móc je przypisać do stron.
          </Alert>
        )}

        {config.hooks.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Brak skonfigurowanych hooków
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Strona</TableCell>
                  <TableCell>Flow</TableCell>
                  <TableCell>Opis</TableCell>
                  <TableCell align="center">Aktywny</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.hooks.map((hook) => (
                  <TableRow key={hook.id}>
                    <TableCell>{getRouteName(hook.route)}</TableCell>
                    <TableCell>{getFlowName(hook.flowId)}</TableCell>
                    <TableCell>{hook.description || '-'}</TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={hook.enabled}
                        onChange={() => handleToggleHook(hook.id)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => openEditDialog(hook)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDeleteHook(hook.id)} color="error">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {saveMessage && (
        <Alert severity={saveMessage.type} sx={{ mb: 2 }} onClose={() => setSaveMessage(null)}>
          {saveMessage.text}
        </Alert>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingHookId ? 'Edytuj hook' : 'Dodaj hook'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Strona</InputLabel>
              <Select
                value={dialogData.route}
                label="Strona"
                onChange={e => setDialogData(prev => ({ ...prev, route: e.target.value }))}
              >
                {AVAILABLE_ROUTES.map(route => (
                  <MenuItem key={route.value} value={route.value}>{route.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Flow</InputLabel>
              <Select
                value={dialogData.flowId}
                label="Flow"
                onChange={e => setDialogData(prev => ({ ...prev, flowId: e.target.value }))}
              >
                {flows.map(flow => (
                  <MenuItem key={flow.id} value={flow.id}>
                    {flow.name}
                    {flow.runtime && ` (${flow.runtime})`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Opis (opcjonalny)"
              size="small"
              fullWidth
              value={dialogData.description}
              onChange={e => setDialogData(prev => ({ ...prev, description: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleDialogSave}>
            {editingHookId ? 'Zapisz' : 'Dodaj'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PageHooksSettingsPage;
