import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress, Alert, Paper } from '@mui/material';
import { ArrowBack as ArrowBackIcon, Edit as EditIcon } from '@mui/icons-material';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
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
                tableLayout: 'fixed',
              },
              '& th, & td': {
                border: '1px solid #ddd',
                padding: '8px',
                textAlign: 'left',
                verticalAlign: 'top',
                boxSizing: 'border-box',
              },
              '& th': {
                backgroundColor: '#f6f8fa',
                fontWeight: 600,
              },
              // Allow inline styles to override text-align
              '& th[style*="text-align"], & td[style*="text-align"]': {
                textAlign: 'inherit',
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto',
                borderRadius: '8px',
              },
              '& img[style*="float: left"]': {
                marginRight: '16px',
                marginBottom: '8px',
              },
              '& img[style*="float: right"]': {
                marginLeft: '16px',
                marginBottom: '8px',
              },
              '& img[style*="display: inline-block"]': {
                verticalAlign: 'top',
                marginRight: '8px',
              },
              // Clear floats after content
              '& p::after, & h1::after, & h2::after, & h3::after': {
                content: '""',
                display: 'table',
                clear: 'both',
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
