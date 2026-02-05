/**
 * Automate Designer Page - strona do projektowania flow automatyzacji
 * Route: /designer/automate/:id?
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';

import { AutomateDesigner } from '../../modules/automate/designer/AutomateDesigner';
import { AutomateDesignerProvider } from '../../modules/automate/designer/AutomateDesignerContext';
import { automateService } from '../../modules/automate/services/AutomateService';
import { AutomateFlowModel, createFlow } from '../../modules/automate/models';
import { useMqtt } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem/FilesystemContext';
import { v4 as uuidv4 } from 'uuid';

const AutomateDesignerPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource } = useFilesystem();

  const [flow, setFlow] = useState<AutomateFlowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [newFlowDialogOpen, setNewFlowDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [selectFlowDialogOpen, setSelectFlowDialogOpen] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<AutomateFlowModel[]>([]);

  const freshFlowIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected) return;

    const loadFlow = async () => {
      if (id && freshFlowIdRef.current === id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      if (!automateService.loaded) {
        await automateService.loadFlows();
      }

      if (id) {
        const flowNode = automateService.getFlowById(id);
        if (flowNode) {
          setFlow(flowNode.toModel());
        } else {
          setSnackbar({ open: true, message: `Nie znaleziono flow: ${id}`, severity: 'error' });
          setFlow(null);
        }
      } else {
        setFlow(null);
        setSelectFlowDialogOpen(true);
        setAvailableFlows(automateService.getAllFlows().map(f => f.toModel()));
      }

      setLoading(false);
    };

    loadFlow();
  }, [id, isConnected]);

  const handleSave = useCallback(async (flowToSave: AutomateFlowModel) => {
    setSaving(true);
    try {
      await automateService.createFlow(flowToSave);

      if (freshFlowIdRef.current === flowToSave.id) {
        freshFlowIdRef.current = null;
      }

      setSnackbar({ open: true, message: 'Flow zapisany', severity: 'success' });

      if (!id && flowToSave.id) {
        navigate(`/designer/automate/${flowToSave.id}`, { replace: true });
      }
    } catch (error) {
      setSnackbar({ open: true, message: `Błąd zapisu: ${error}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [id, navigate]);

  const handleCreateNewFlow = () => {
    if (!newFlowName.trim()) return;

    const newFlow = createFlow(uuidv4(), newFlowName.trim());
    freshFlowIdRef.current = newFlow.id;

    setFlow(newFlow);
    setLoading(false);
    setNewFlowDialogOpen(false);
    setSelectFlowDialogOpen(false);
    setNewFlowName('');
    navigate(`/designer/automate/${newFlow.id}`, { replace: true });
  };

  const handleSelectFlow = (selectedFlow: AutomateFlowModel) => {
    setFlow(selectedFlow);
    setSelectFlowDialogOpen(false);
    navigate(`/designer/automate/${selectedFlow.id}`, { replace: true });
  };

  if (isConnecting) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Łączenie z serwerem...</Typography>
      </Box>
    );
  }

  if (!isConnected) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="warning">Nie połączono z serwerem. Sprawdź czy backend jest uruchomiony.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={() => navigate('/automate')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Automate Designer{flow ? ` - ${flow.name}` : ''}
          </Typography>
          {saving && <CircularProgress size={20} sx={{ mr: 2 }} />}
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {flow ? (
          <AutomateDesignerProvider initialFlow={flow} onChange={setFlow}>
            <AutomateDesigner
              initialFlow={flow}
              onChange={setFlow}
              onSave={handleSave}
              saving={saving}
              dataSource={dataSource}
            />
          </AutomateDesignerProvider>
        ) : (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <AccountTreeIcon sx={{ fontSize: 64, color: 'action.disabled' }} />
            <Typography color="text.secondary">Wybierz lub utwórz flow</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewFlowDialogOpen(true)}>
                Nowy flow
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setAvailableFlows(automateService.getAllFlows().map(f => f.toModel()));
                  setSelectFlowDialogOpen(true);
                }}
              >
                Otwórz istniejący
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog open={newFlowDialogOpen} onClose={() => setNewFlowDialogOpen(false)}>
        <DialogTitle>Nowy flow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa flow"
            value={newFlowName}
            onChange={e => setNewFlowName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateNewFlow(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFlowDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleCreateNewFlow} variant="contained" disabled={!newFlowName.trim()}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={selectFlowDialogOpen}
        onClose={() => { if (flow) setSelectFlowDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Wybierz flow</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {availableFlows.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>Brak flow</Typography>
            </Box>
          ) : (
            <List>
              {availableFlows.map(f => (
                <ListItemButton key={f.id} onClick={() => handleSelectFlow(f)}>
                  <ListItemIcon><AccountTreeIcon color="primary" /></ListItemIcon>
                  <ListItemText primary={f.name} secondary={f.description || f.id} />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          {flow && <Button onClick={() => setSelectFlowDialogOpen(false)}>Anuluj</Button>}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setSelectFlowDialogOpen(false); setNewFlowDialogOpen(true); }}
          >
            Nowy flow
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AutomateDesignerPage;
