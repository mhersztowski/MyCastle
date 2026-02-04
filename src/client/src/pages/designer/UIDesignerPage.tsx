/**
 * UI Designer Page - strona do projektowania formularzy UI
 * Route: /designer/ui/:id?
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
import DashboardIcon from '@mui/icons-material/Dashboard';
import AddIcon from '@mui/icons-material/Add';

import { UIFormDesigner } from '../../modules/uiforms/designer';
import { uiFormService } from '../../modules/uiforms/services/UIFormService';
import { UIFormModel, createForm, createControl } from '../../modules/uiforms/models';
import { useMqtt } from '../../modules/mqttclient';

// Helper: generuj unikalne ID
const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const UIDesignerPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { isConnected, isConnecting } = useMqtt();

  const [form, setForm] = useState<UIFormModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Dialogi
  const [newFormDialogOpen, setNewFormDialogOpen] = useState(false);
  const [newFormName, setNewFormName] = useState('');
  const [selectFormDialogOpen, setSelectFormDialogOpen] = useState(false);
  const [availableForms, setAvailableForms] = useState<UIFormModel[]>([]);

  // Ref do przechowywania ID świeżo utworzonego formularza (jeszcze niezapisanego)
  const freshFormIdRef = useRef<string | null>(null);

  // Załaduj formularz - czekaj na połączenie MQTT
  useEffect(() => {
    if (!isConnected) return;

    const loadForm = async () => {
      // Jeśli to jest świeżo utworzony formularz, nie ładuj z serwisu
      if (id && freshFormIdRef.current === id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      if (!uiFormService.loaded) {
        await uiFormService.loadForms();
      }

      if (id) {
        const formNode = uiFormService.getFormById(id);
        if (formNode) {
          setForm(formNode.toModel());
        } else {
          setSnackbar({
            open: true,
            message: `Nie znaleziono formularza: ${id}`,
            severity: 'error',
          });
          setForm(null);
        }
      } else {
        // Nowy formularz lub wybór
        setForm(null);
        setSelectFormDialogOpen(true);
        setAvailableForms(uiFormService.getAllForms().map(f => f.toModel()));
      }

      setLoading(false);
    };

    loadForm();
  }, [id, isConnected]);

  // Zapisz formularz
  const handleSave = useCallback(async (formToSave: UIFormModel) => {
    setSaving(true);
    try {
      // Utwórz node z modelu i zapisz
      await uiFormService.createForm(formToSave);

      // Formularz zapisany - wyczyść ref (teraz można go załadować z serwisu)
      if (freshFormIdRef.current === formToSave.id) {
        freshFormIdRef.current = null;
      }

      setSnackbar({
        open: true,
        message: 'Formularz zapisany',
        severity: 'success',
      });

      // Aktualizuj URL jeśli to nowy formularz
      if (!id && formToSave.id) {
        navigate(`/designer/ui/${formToSave.id}`, { replace: true });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: `Błąd zapisu: ${error}`,
        severity: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [id, navigate]);

  // Utwórz nowy formularz
  const handleCreateNewForm = () => {
    if (!newFormName.trim()) return;

    const rootControl = createControl('vbox', generateId(), 'root', 'fullRect');
    const newForm = createForm(generateId(), newFormName.trim(), rootControl);

    // Zapisz ID nowego formularza żeby useEffect nie próbował go ładować z serwisu
    freshFormIdRef.current = newForm.id;

    setForm(newForm);
    setLoading(false);
    setNewFormDialogOpen(false);
    setSelectFormDialogOpen(false);
    setNewFormName('');
    navigate(`/designer/ui/${newForm.id}`, { replace: true });
  };

  // Wybierz istniejący formularz
  const handleSelectForm = (selectedForm: UIFormModel) => {
    setForm(selectedForm);
    setSelectFormDialogOpen(false);
    navigate(`/designer/ui/${selectedForm.id}`, { replace: true });
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
        <Alert severity="warning">
          Nie połączono z serwerem. Sprawdź czy backend jest uruchomiony.
        </Alert>
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
      {/* App Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={() => navigate(-1)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <DashboardIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            UI Designer
          </Typography>
          {saving && <CircularProgress size={20} sx={{ mr: 2 }} />}
        </Toolbar>
      </AppBar>

      {/* Designer */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {form ? (
          <UIFormDesigner
            initialForm={form}
            onChange={setForm}
            onSave={handleSave}
          />
        ) : (
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <DashboardIcon sx={{ fontSize: 64, color: 'action.disabled' }} />
            <Typography color="text.secondary">
              Wybierz lub utwórz formularz
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setNewFormDialogOpen(true)}
              >
                Nowy formularz
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setAvailableForms(uiFormService.getAllForms().map(f => f.toModel()));
                  setSelectFormDialogOpen(true);
                }}
              >
                Otwórz istniejący
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Dialog nowy formularz */}
      <Dialog open={newFormDialogOpen} onClose={() => setNewFormDialogOpen(false)}>
        <DialogTitle>Nowy formularz</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa formularza"
            value={newFormName}
            onChange={(e) => setNewFormName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateNewForm();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFormDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleCreateNewForm} variant="contained" disabled={!newFormName.trim()}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog wyboru formularza */}
      <Dialog
        open={selectFormDialogOpen}
        onClose={() => {
          if (form) setSelectFormDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Wybierz formularz</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {availableForms.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>Brak formularzy</Typography>
            </Box>
          ) : (
            <List>
              {availableForms.map((f) => (
                <ListItemButton key={f.id} onClick={() => handleSelectForm(f)}>
                  <ListItemIcon>
                    <DashboardIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText primary={f.name} secondary={f.id} />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          {form && <Button onClick={() => setSelectFormDialogOpen(false)}>Anuluj</Button>}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setSelectFormDialogOpen(false);
              setNewFormDialogOpen(true);
            }}
          >
            Nowy formularz
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UIDesignerPage;
