/**
 * UI Viewer Page - strona do wyświetlania formularzy UI
 * Route: /viewer/ui/:id
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
  Paper,
  Button,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RefreshIcon from '@mui/icons-material/Refresh';

import { UIFormRenderer } from '../../modules/uiforms/renderer';
import { uiFormService } from '../../modules/uiforms/services/UIFormService';
import { UIFormModel } from '../../modules/uiforms/models';
import { UICallbackRegistry } from '../../modules/uiforms/binding/UICallbackRegistry';

const UIViewerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [form, setForm] = useState<UIFormModel | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Załaduj formularz
  useEffect(() => {
    const loadForm = async () => {
      if (!id) {
        setError('Brak ID formularza');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (!uiFormService.loaded) {
          await uiFormService.loadForms();
        }

        const formNode = uiFormService.getFormById(id);
        if (formNode) {
          setForm(formNode.toModel());
          // Inicjalizuj dane z dataSchema
          const initialData: Record<string, unknown> = {};
          if (formNode.dataSchema) {
            for (const [key, field] of Object.entries(formNode.dataSchema)) {
              initialData[key] = field.default ?? null;
            }
          }
          setFormData(initialData);
        } else {
          setError(`Nie znaleziono formularza: ${id}`);
        }
      } catch (err) {
        setError(`Błąd ładowania: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    loadForm();
  }, [id]);

  // Zarejestruj callbacki dla formularza
  useEffect(() => {
    if (!form) return;

    // Przykładowe callbacki
    UICallbackRegistry.register('handleSubmit', (...args: unknown[]) => {
      const data = args[0] as Record<string, unknown>;
      console.log('Form submitted:', data);
      alert('Formularz został wysłany!\n\nDane:\n' + JSON.stringify(data, null, 2));
    });

    UICallbackRegistry.register('handleReset', () => {
      setFormData({});
    });

    return () => {
      UICallbackRegistry.unregister('handleSubmit');
      UICallbackRegistry.unregister('handleReset');
    };
  }, [form]);

  const handleDataChange = useCallback((newData: Record<string, unknown>) => {
    setFormData(newData);
  }, []);

  const handleRefresh = async () => {
    if (id) {
      setLoading(true);
      await uiFormService.loadForms();
      const formNode = uiFormService.getFormById(id);
      if (formNode) {
        setForm(formNode.toModel());
      }
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="default" elevation={1}>
          <Toolbar variant="dense">
            <IconButton edge="start" onClick={() => navigate(-1)} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              UI Viewer
            </Typography>
          </Toolbar>
        </AppBar>
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <Typography color="error" variant="h6">
            {error}
          </Typography>
          <Button variant="outlined" onClick={() => navigate(-1)}>
            Wróć
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.100' }}>
      {/* App Bar */}
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={() => navigate(-1)} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <DashboardIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {form?.name || 'UI Viewer'}
          </Typography>
          <IconButton onClick={handleRefresh} sx={{ mr: 1 }}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => navigate(`/designer/ui/${id}`)}
          >
            Edytuj
          </Button>
        </Toolbar>
      </AppBar>

      {/* Content */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {form && (
          <Paper
            elevation={2}
            sx={{
              width: form.settings?.width || 400,
              minHeight: form.settings?.height || 300,
              p: form.settings?.padding ? `${form.settings.padding}px` : 2,
            }}
          >
            <UIFormRenderer
              form={form}
              mode="edit"
              data={formData}
              onChange={handleDataChange}
            />
          </Paper>
        )}

        {/* Debug: pokazuj dane formularza */}
        {Object.keys(formData).length > 0 && (
          <Paper sx={{ mt: 3, p: 2, width: form?.settings?.width || 400 }}>
            <Typography variant="subtitle2" gutterBottom>
              Dane formularza:
            </Typography>
            <Divider sx={{ mb: 1 }} />
            <Box
              component="pre"
              sx={{
                fontSize: '0.75rem',
                bgcolor: 'grey.50',
                p: 1,
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 200,
              }}
            >
              {JSON.stringify(formData, null, 2)}
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default UIViewerPage;
