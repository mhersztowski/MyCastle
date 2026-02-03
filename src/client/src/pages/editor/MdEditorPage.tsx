import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Snackbar,
  Breadcrumbs,
  Link,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderIcon from '@mui/icons-material/Folder';
import { useMqtt, mqttClient } from '../../modules/mqttclient';
import { MdEditor } from '../../components/mdeditor';

const MdEditorPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, isConnecting } = useMqtt();

  const [initialContent, setInitialContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const savedContentRef = useRef<string>('');

  const filePath = location.pathname.replace('/editor/md/', '');
  const fileName = filePath.split('/').pop() || 'Untitled';
  const pathParts = filePath.split('/').filter(Boolean);

  useEffect(() => {
    const loadFile = async () => {
      if (!isConnected || !filePath) return;

      setLoading(true);
      setError(null);

      try {
        const file = await mqttClient.readFile(filePath);
        if (file) {
          const fileContent = file.content || '';
          setInitialContent(fileContent);
          savedContentRef.current = fileContent;
        } else {
          setInitialContent('');
          savedContentRef.current = '';
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [isConnected, filePath]);

  const handleSave = useCallback(async (markdown: string) => {
    if (!filePath) return;

    setSaving(true);
    setError(null);

    try {
      await mqttClient.writeFile(filePath, markdown);
      savedContentRef.current = markdown;
      setSaveSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [filePath]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Connecting to server...</Typography>
      </Box>
    );
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Not connected to server. Please check if the backend is running.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'grey.50' }}>
      {/* Header */}
      <Paper
        elevation={1}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          borderRadius: 0,
        }}
      >
        <Tooltip title="Back">
          <IconButton onClick={handleBack} size="small">
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>

        <DescriptionIcon color="primary" />

        <Breadcrumbs sx={{ flexGrow: 1 }}>
          {pathParts.slice(0, -1).map((part, index) => (
            <Link
              key={index}
              color="inherit"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                const targetPath = pathParts.slice(0, index + 1).join('/');
                navigate(`/filesystem/list?path=${targetPath}`);
              }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <FolderIcon sx={{ fontSize: 16 }} />
              {part}
            </Link>
          ))}
          <Typography color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <DescriptionIcon sx={{ fontSize: 16 }} />
            {fileName}
          </Typography>
        </Breadcrumbs>

        {saving && <CircularProgress size={20} />}
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ m: 2 }}>
          {error}
        </Alert>
      )}

      {/* Editor */}
      <Box sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Paper
            elevation={0}
            sx={{
              flexGrow: 1,
              m: 2,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <MdEditor
              initialContent={initialContent}
              onSave={handleSave}
              placeholder="Start writing... Type '/' for commands"
              autoFocus
            />
          </Paper>
        )}
      </Box>

      {/* Save success snackbar */}
      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        message="File saved successfully"
      />
    </Box>
  );
};

export default MdEditorPage;
