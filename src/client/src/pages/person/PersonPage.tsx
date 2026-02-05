import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import PersonIcon from '@mui/icons-material/Person';
import { useFilesystem } from '../../modules/filesystem';
import { PersonModel, PersonsModel } from '../../modules/filesystem/models/PersonModel';
import { PersonListEditor } from '../../components/person';

const PERSONS_PATH = 'data/persons.json';

const PersonPage: React.FC = () => {
  const { dataSource, isDataLoaded, writeFile, loadAllData } = useFilesystem();

  const initialPersons = useMemo(() => {
    if (!isDataLoaded) return [];
    return dataSource.persons.map((p) => p.toModel());
  }, [dataSource, isDataLoaded]);

  const [persons, setPersons] = useState<PersonModel[]>(initialPersons);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Sync when data loads
  React.useEffect(() => {
    if (isDataLoaded) {
      setPersons(dataSource.persons.map((p) => p.toModel()));
      setIsDirty(false);
    }
  }, [isDataLoaded, dataSource]);

  const handleChange = useCallback((updated: PersonModel[]) => {
    setPersons(updated);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const data: PersonsModel = {
        type: 'persons',
        items: persons,
      };
      await writeFile(PERSONS_PATH, JSON.stringify(data, null, 2));

      // Reload DataSource so all data stays in sync
      await loadAllData();
      setIsDirty(false);
      setSnackbar({ open: true, message: 'Saved successfully', severity: 'success' });
    } catch (err) {
      console.error('Failed to save persons:', err);
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [persons, writeFile, loadAllData]);

  if (!isDataLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
        <PersonIcon color="primary" />
        <Typography variant="h5" sx={{ flex: 1 }}>
          Persons
        </Typography>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          Save
        </Button>
      </Box>

      <PersonListEditor persons={persons} onChange={handleChange} />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PersonPage;
