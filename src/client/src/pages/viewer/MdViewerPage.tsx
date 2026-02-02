import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, CircularProgress, Alert, Paper } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import { MarkdownRenderer } from '../../utils/MdParser';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

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

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'var(--app-height, 100vh)',
        overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <AppBar
        position="sticky"
        color="default"
        elevation={1}
        sx={{
          top: 0,
          zIndex: 1100,
          flexShrink: 0,
        }}
      >
        <Toolbar variant="dense">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="subtitle1" sx={{ flexGrow: 1, fontFamily: 'monospace' }}>
            {path || 'No file selected'}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={handleEdit}
            disabled={!path}
          >
            Edit
          </Button>
        </Toolbar>
      </AppBar>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box
        sx={{
          flexGrow: 1,
          overflow: 'auto',
          bgcolor: 'grey.50',
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
          <Paper
            sx={{
              maxWidth: 900,
              mx: 'auto',
              my: 2,
              p: 4,
              '& pre': {
                backgroundColor: '#f6f8fa',
                padding: 2,
                borderRadius: 1,
                overflow: 'auto',
              },
              '& code': {
                fontFamily: 'monospace',
              },
              '& table': {
                borderCollapse: 'collapse',
                width: '100%',
                my: 2,
              },
              '& th, & td': {
                border: '1px solid #ddd',
                padding: '8px',
                textAlign: 'left',
              },
              '& th': {
                backgroundColor: '#f6f8fa',
              },
              '& img': {
                maxWidth: '100%',
              },
              '& blockquote': {
                borderLeft: '4px solid #ddd',
                margin: 0,
                paddingLeft: 2,
                color: 'text.secondary',
              },
            }}
          >
            <MarkdownRenderer markdown={content} />
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default MdViewerPage;
