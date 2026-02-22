import { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { useMqtt } from '@modules/mqttclient';

function FilesystemSavePage() {
  const { isConnected, writeFile } = useMqtt();
  const [fileName, setFileName] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    if (!isConnected || !fileName || !content) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await writeFile(fileName, content);
      setSuccess(true);
      setFileName('');
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Save File
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>File saved successfully!</Alert>}
      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          <TextField
            label="File Name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            fullWidth
            placeholder="path/to/file.json"
          />
          <TextField
            label="Content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            fullWidth
            multiline
            rows={10}
            placeholder="File content..."
          />
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={!fileName || !content || saving || !isConnected}
          >
            {saving ? 'Saving...' : 'Save File'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

export default FilesystemSavePage;
