import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, List, ListItemButton, ListItemText, CircularProgress, IconButton } from '@mui/material';
import { Description as FileIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import { MdEditor } from '../../components/mdeditor';
import { useMinimalTopBarSlot } from '../../components/MinimalTopBarContext';
import { useAuth } from '../../modules/auth';
import type { DirectoryTree } from '@mhersztowski/core';

const SIDEBAR_WIDTH = 240;
const DATA_DIR = '';

interface MdFile {
  name: string;
  path: string;
  folder: string;
}

function collectMdFiles(tree: DirectoryTree): MdFile[] {
  return (tree.children ?? [])
    .filter(child => child.type === 'file' && child.name.endsWith('.md'))
    .map(child => ({ name: child.name.slice(0, -3), path: child.path, folder: '' }));
}

function Breadcrumb({ filePath }: { filePath: string }) {
  const parts = filePath.split('/').filter(Boolean);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
      {parts.map((part, i) => {
        const isLast = i === parts.length - 1;
        const label = isLast && part.endsWith('.md') ? part.slice(0, -3) : part;
        return (
          <React.Fragment key={i}>
            {i > 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>/</Typography>}
            <Typography
              variant="caption"
              noWrap
              sx={{ color: isLast ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)', fontWeight: isLast ? 600 : 400 }}
            >
              {label}
            </Typography>
          </React.Fragment>
        );
      })}
    </Box>
  );
}

const WorkspaceMdPage: React.FC = () => {
  const { '*': filePath = '' } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { listDirectory, readFile, writeFile, isConnected } = useMqtt();

  const [files, setFiles] = useState<MdFile[]>([]);
  const [content, setContent] = useState<string>('');
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate(`/user/${currentUser?.name ?? 'main'}/main`);
    }
  }, [navigate, currentUser]);

  useMinimalTopBarSlot(
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflow: 'hidden' }}>
      <IconButton size="small" onClick={handleBack} sx={{ color: 'rgba(255,255,255,0.8)', p: 0.25, mr: 0.5 }}>
        <ArrowBackIcon sx={{ fontSize: 18 }} />
      </IconButton>
      {filePath
        ? <Breadcrumb filePath={filePath} />
        : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>Workspace</Typography>
      }
    </Box>,
    [filePath, handleBack],
  );

  useEffect(() => {
    if (!isConnected) return;
    setLoadingTree(true);
    listDirectory(DATA_DIR)
      .then(tree => setFiles(collectMdFiles(tree)))
      .catch(console.error)
      .finally(() => setLoadingTree(false));
  }, [isConnected, listDirectory]);

  const loadFile = useCallback(async (path: string) => {
    if (!path) return;
    setLoadingFile(true);
    try {
      const file = await readFile(path);
      setContent(file.content);
    } catch (err) {
      console.error('Failed to read file:', err);
      setContent('');
    } finally {
      setLoadingFile(false);
    }
  }, [readFile]);

  useEffect(() => {
    if (filePath) loadFile(filePath);
    else setContent('');
  }, [filePath, loadFile]);

  const handleSave = useCallback(async (markdown: string) => {
    if (!filePath) return;
    try {
      await writeFile(filePath, markdown);
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [filePath, writeFile]);

  const handleSelect = (path: string) => {
    navigate(`/workspace/md/${path}`);
  };

  const handleLinkClick = useCallback((href: string) => {
    const path = href.startsWith('/') ? href.substring(1) : href;
    navigate(`/workspace/md/${path}`);
  }, [navigate]);

  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.default' }}>

      {/* Sidebar */}
      <Box
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
          bgcolor: '#f7f7f5',
          borderRight: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: 0.5, textTransform: 'uppercase', fontSize: 10 }}>
            Notes
          </Typography>
        </Box>

        {loadingTree ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <List dense disablePadding>
              {sortedFiles.map((file) => (
                <ListItemButton
                  key={file.path}
                  selected={filePath === file.path}
                  onClick={() => handleSelect(file.path)}
                  sx={{
                    py: 0.4,
                    px: 1.5,
                    borderRadius: 1,
                    mx: 0.5,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(0,0,0,0.07)',
                      '&:hover': { bgcolor: 'rgba(0,0,0,0.1)' },
                    },
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' },
                  }}
                >
                  <FileIcon sx={{ fontSize: 14, mr: 1, color: 'text.secondary', flexShrink: 0 }} />
                  <ListItemText
                    primary={file.name}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true, fontSize: 13 }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        )}
      </Box>

      {/* Editor area */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {loadingFile ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : !filePath ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography color="text.secondary">Wybierz plik z panelu po lewej</Typography>
          </Box>
        ) : (
          <MdEditor
            key={filePath}
            initialContent={content}
            onSave={handleSave}
            onLinkClick={handleLinkClick}
          />
        )}
      </Box>
    </Box>
  );
};

export default WorkspaceMdPage;
