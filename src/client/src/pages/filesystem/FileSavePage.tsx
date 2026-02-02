import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import { useMqtt } from '../../modules/mqttclient';

const FileSavePage: React.FC = () => {
  const { writeFile, isConnected } = useMqtt();
  const [filePath, setFilePath] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!filePath.trim()) {
      setError('File path is required');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await writeFile(filePath, content);
      setSuccess(`File saved successfully: ${result.path}`);
      setFilePath('');
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Not connected to server. Please wait for connection...
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Save File
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create or update a file in the filesystem
      </Typography>

      <Card>
        <CardContent>
          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            fullWidth
            label="File Path"
            placeholder="e.g., documents/notes.txt"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            sx={{ mb: 2 }}
            disabled={loading}
          />

          <TextField
            fullWidth
            multiline
            rows={15}
            label="Content"
            placeholder="Enter file content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            sx={{ mb: 2 }}
            disabled={loading}
          />

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={loading || !filePath.trim()}
          >
            {loading ? 'Saving...' : 'Save File'}
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
};

export default FileSavePage;
