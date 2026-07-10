import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import MdEditor from '../../components/mdeditor/MdEditor';

const MdViewerPage: React.FC = () => {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { readFile, isConnected } = useMqtt();

  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const path = filePath || '';

  useEffect(() => {
    const loadFile = async () => {
      if (!isConnected || !path) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const file = await readFile(path);
        setContent(file.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [isConnected, path, readFile]);

  const handleBack = () => {
    navigate(-1);
  };

  const handleEdit = () => {
    navigate(`/editor/simple/${path}`);
  };

  useMinimalTopBarSlot(
    <>
      <Button size="small" startIcon={<ArrowBackIcon />} onClick={handleBack} color="inherit" sx={{ mr: 1 }}>Back</Button>
      <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontFamily: 'monospace', color: 'inherit' }}>
        {path || 'No file selected'}
      </Typography>
      <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={handleEdit} disabled={!path} color="inherit">Edit</Button>
    </>,
    [path, handleBack, handleEdit],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          flexGrow: 1,
          overflow: 'hidden',
          minHeight: 0,
          paddingBottom: 'env(safe-area-inset-bottom)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          // Renderuj przez prawdziwy MdEditor (read-only) — dzięki temu działają
          // WSZYSTKIE customowe rozszerzenia (CadView, galerie, mapy, InfoMark,
          // Event/Plugin/Automate…), tak samo jak w edytorze markdown.
          <MdEditor key={path} initialContent={content} editable={false} filePath={path} />
        )}
      </Box>
    </Box>
  );
};

export default MdViewerPage;
