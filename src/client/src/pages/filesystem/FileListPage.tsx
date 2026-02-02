import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  Button,
  Divider,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  Badge,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useMqtt, DirectoryTree, FileData, BinaryFileData } from '../../modules/mqttclient';
import FileTreeView from '../../components/FileTreeView';
import FileViewer from '../../components/FileViewer';
import { FileUploadModal } from '../../components/upload';

const isMarkdownFile = (path: string): boolean => {
  return path.toLowerCase().endsWith('.md');
};

const BINARY_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
  '.mp3', '.wav', '.ogg', '.webm', '.m4a', '.flac',
  '.mp4', '.avi', '.mov', '.mkv',
  '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
];

const isBinaryFile = (path: string): boolean => {
  const ext = path.toLowerCase().substring(path.lastIndexOf('.'));
  return BINARY_EXTENSIONS.includes(ext);
};

const isEditableFile = (path: string): boolean => {
  return !isBinaryFile(path);
};

const FileListPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { listDirectory, readFile, readBinaryFile, isConnected, isConnecting } = useMqtt();
  const [tree, setTree] = useState<DirectoryTree | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [selectedBinaryFile, setSelectedBinaryFile] = useState<BinaryFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState(0);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const openInEditor = () => {
    const filePath = selectedFile?.path || selectedBinaryFile?.path;
    if (filePath && isEditableFile(filePath)) {
      window.open(`/editor/simple/${filePath}`, '_blank');
    }
  };

  const openInViewer = () => {
    const filePath = selectedFile?.path || selectedBinaryFile?.path;
    if (filePath) {
      window.open(`/viewer/md/${filePath}`, '_blank');
    }
  };

  const loadTree = async () => {
    if (!isConnected) return;

    setLoading(true);
    setError(null);

    try {
      const result = await listDirectory();
      setTree(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (path: string) => {
    setFileLoading(true);
    setError(null);
    setSelectedFile(null);
    setSelectedBinaryFile(null);

    try {
      if (isBinaryFile(path)) {
        const binaryData = await readBinaryFile(path);
        setSelectedBinaryFile(binaryData);
      } else {
        const fileData = await readFile(path);
        setSelectedFile(fileData);
      }
      if (isMobile) {
        setMobileTab(1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setFileLoading(false);
    }
  };

  const handleMobileTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setMobileTab(newValue);
  };

  useEffect(() => {
    if (isConnected) {
      loadTree();
    }
  }, [isConnected]);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
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

  const treePanel = (
    <Box sx={{ height: '100%', overflow: 'auto', p: isMobile ? 1 : 2 }}>
      {!isMobile && (
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Directory Tree
        </Typography>
      )}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : tree ? (
        <FileTreeView tree={tree} onFileSelect={handleFileSelect} />
      ) : (
        <Typography color="text.secondary">No files found</Typography>
      )}
    </Box>
  );

  const currentFilePath = selectedFile?.path || selectedBinaryFile?.path;
  const hasSelectedFile = selectedFile || selectedBinaryFile;

  const contentPanel = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: isMobile ? 1 : 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        {!isMobile && (
          <Typography variant="subtitle2" color="text.secondary" sx={{ flexGrow: 1 }}>
            File Content
          </Typography>
        )}
        {hasSelectedFile && (
          <Box sx={{ display: 'flex', gap: 1, flexGrow: isMobile ? 1 : 0, justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
            {currentFilePath && isEditableFile(currentFilePath) && (
              <Tooltip title="Open in Editor (new window)">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditIcon />}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  onClick={openInEditor}
                >
                  Edit
                </Button>
              </Tooltip>
            )}
            {currentFilePath && isMarkdownFile(currentFilePath) && (
              <Tooltip title="Open in Viewer (new window)">
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<VisibilityIcon />}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  onClick={openInViewer}
                >
                  View
                </Button>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
      {hasSelectedFile && <Divider sx={{ mb: 1 }} />}
      {fileLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : hasSelectedFile ? (
        <Box sx={{ flexGrow: 1, overflow: 'auto', minHeight: 0 }}>
          <FileViewer file={selectedFile || undefined} binaryFile={selectedBinaryFile || undefined} />
        </Box>
      ) : (
        <Typography color="text.secondary">
          Select a file from the tree to view its content
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: isMobile ? 1 : 2, gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontSize: isMobile ? '1.25rem' : undefined }}>
          File Browser
        </Typography>
        {isMobile ? (
          <Tooltip title="Upload File">
            <IconButton
              color="primary"
              onClick={() => setUploadModalOpen(true)}
              sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}
            >
              <CloudUploadIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            variant="contained"
            size="small"
            startIcon={<CloudUploadIcon />}
            onClick={() => setUploadModalOpen(true)}
          >
            Upload
          </Button>
        )}
        <Tooltip title="Refresh">
          <IconButton onClick={loadTree} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: isMobile ? 1 : 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {isMobile ? (
        <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Paper sx={{ borderRadius: 0 }}>
            <Tabs
              value={mobileTab}
              onChange={handleMobileTabChange}
              variant="fullWidth"
              sx={{ minHeight: 48 }}
            >
              <Tab
                icon={<FolderIcon />}
                iconPosition="start"
                label="Files"
                sx={{ minHeight: 48 }}
              />
              <Tab
                icon={
                  <Badge
                    color="primary"
                    variant="dot"
                    invisible={!hasSelectedFile}
                  >
                    <DescriptionIcon />
                  </Badge>
                }
                iconPosition="start"
                label="Preview"
                sx={{ minHeight: 48 }}
              />
            </Tabs>
          </Paper>
          <Paper sx={{ flexGrow: 1, overflow: 'hidden', borderRadius: 0, minHeight: 0 }}>
            {mobileTab === 0 ? treePanel : contentPanel}
          </Paper>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, minHeight: 0 }}>
          <Paper sx={{ width: 300, minWidth: 250, overflow: 'hidden' }}>
            {treePanel}
          </Paper>
          <Paper sx={{ flexGrow: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {contentPanel}
          </Paper>
        </Box>
      )}

      <FileUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => loadTree()}
      />
    </Box>
  );
};

export default FileListPage;
