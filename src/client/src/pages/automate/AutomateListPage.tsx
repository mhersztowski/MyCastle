/**
 * Automate List Page - lista flow automatyzacji
 * Route: /automate
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Tooltip,
  Chip,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { automateService } from '../../modules/automate/services/AutomateService';
import { createFlow } from '../../modules/automate/models';
import { AutomateFlowNode } from '../../modules/automate/nodes';
import { useMqtt } from '../../modules/mqttclient';
import { v4 as uuidv4 } from 'uuid';

const AutomateListPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected, isConnecting } = useMqtt();

  const [flows, setFlows] = useState<AutomateFlowNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFlowDialogOpen, setNewFlowDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    if (!isConnected) return;

    const loadFlows = async () => {
      setLoading(true);
      const loaded = await automateService.loadFlows();
      setFlows(loaded);
      setLoading(false);
    };

    loadFlows();
  }, [isConnected]);

  const handleCreateFlow = useCallback(async () => {
    if (!newFlowName.trim()) return;

    const newFlow = createFlow(uuidv4(), newFlowName.trim());
    await automateService.createFlow(newFlow);

    setNewFlowDialogOpen(false);
    setNewFlowName('');
    navigate(`/designer/automate/${newFlow.id}`);
  }, [newFlowName, navigate]);

  const handleDeleteFlow = useCallback(async (id: string) => {
    const deleted = await automateService.deleteFlow(id);
    if (deleted) {
      setFlows(automateService.getAllFlows());
      setSnackbar({ open: true, message: 'Flow usunięty', severity: 'success' });
    }
  }, []);

  const handleDuplicateFlow = useCallback(async (id: string) => {
    const original = automateService.getFlowById(id);
    if (!original) return;

    const duplicate = await automateService.duplicateFlow(id, uuidv4(), `${original.name} (kopia)`);
    if (duplicate) {
      setFlows(automateService.getAllFlows());
      setSnackbar({ open: true, message: 'Flow zduplikowany', severity: 'success' });
    }
  }, []);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isConnected) {
    return <Alert severity="warning">Nie połączono z serwerem.</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountTreeIcon color="primary" />
          <Typography variant="h5">Automate</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewFlowDialogOpen(true)}
        >
          Nowy flow
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : flows.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
          <AccountTreeIcon sx={{ fontSize: 64, mb: 2, color: 'action.disabled' }} />
          <Typography variant="h6" gutterBottom>Brak flow</Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Utwórz nowy flow automatyzacji
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewFlowDialogOpen(true)}>
            Nowy flow
          </Button>
        </Box>
      ) : (
        <List>
          {flows.map(flow => (
            <ListItemButton
              key={flow.id}
              onClick={() => navigate(`/designer/automate/${flow.id}`)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon>
                <AccountTreeIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {flow.name}
                    <Chip label={`${flow.nodes.length} nodów`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                  </Box>
                }
                secondary={flow.description || flow.id}
              />
              <ListItemSecondaryAction>
                <Tooltip title="Otwórz w designerze">
                  <IconButton size="small" onClick={() => navigate(`/designer/automate/${flow.id}`)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplikuj">
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDuplicateFlow(flow.id); }}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Usuń">
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); handleDeleteFlow(flow.id); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItemButton>
          ))}
        </List>
      )}

      <Dialog open={newFlowDialogOpen} onClose={() => setNewFlowDialogOpen(false)}>
        <DialogTitle>Nowy flow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa flow"
            value={newFlowName}
            onChange={e => setNewFlowName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFlow(); }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFlowDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleCreateFlow} variant="contained" disabled={!newFlowName.trim()}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AutomateListPage;
