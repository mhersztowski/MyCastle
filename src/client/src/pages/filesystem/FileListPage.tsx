import React, { useState } from 'react';
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
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { useMqtt, DirectoryTree, FileData as MqttFileData, BinaryFileData } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem';
import { DirData } from '../../modules/filesystem/data/DirData';
import { FileData as FilesystemFileData } from '../../modules/filesystem/data/FileData';
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

// Convert DirData to DirectoryTree format for FileTreeView
const convertDirDataToTree = (dirData: DirData): DirectoryTree => {
  const children: DirectoryTree[] = [];

  // Add subdirectories
  for (const subDir of dirData.getDirs()) {
    children.push(convertDirDataToTree(subDir));
  }

  // Add files
  for (const file of dirData.getFiles()) {
    children.push({
      name: file.getName(),
      path: file.getPath(),
      type: 'file',
    });
  }

  return {
    name: dirData.getName(),
    path: dirData.getPath(),
    type: 'directory',
    children: children.length > 0 ? children : undefined,
  };
};

// Convert filesystem FileData to MqttFileData format for FileViewer
const convertToMqttFileData = (fileData: FilesystemFileData): MqttFileData => {
  return {
    path: fileData.getPath(),
    content: fileData.toString(),
    lastModified: new Date().toISOString(), // FileData doesn't store lastModified
  };
};

const FileListPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { readBinaryFile, isConnected, isConnecting } = useMqtt();
  const { rootDir, isLoading, isDataLoaded, error: fsError, loadAllData } = useFilesystem();

  const [selectedFile, setSelectedFile] = useState<MqttFileData | null>(null);
  const [selectedBinaryFile, setSelectedBinaryFile] = useState<BinaryFileData | null>(null);
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

  const openInNotionEditor = () => {
    const filePath = selectedFile?.path || selectedBinaryFile?.path;
    if (filePath && isMarkdownFile(filePath)) {
      window.open(`/editor/md/${filePath}`, '_blank');
    }
  };

  const openInViewer = () => {
    const filePath = selectedFile?.path || selectedBinaryFile?.path;
    if (filePath) {
      window.open(`/viewer/md/${filePath}`, '_blank');
    }
  };

  const handleRefresh = async () => {
    setSelectedFile(null);
    setSelectedBinaryFile(null);
    await loadAllData();
  };

  const handleFileSelect = async (path: string) => {
    setFileLoading(true);
    setError(null);
    setSelectedFile(null);
    setSelectedBinaryFile(null);

    try {
      if (isBinaryFile(path)) {
        // Binary files still need to be loaded via MQTT
        const binaryData = await readBinaryFile(path);
        setSelectedBinaryFile(binaryData);
      } else {
        // Text files are already loaded in filesystem
        if (rootDir) {
          const fileData = rootDir.getFileByPath(path);
          if (fileData) {
            setSelectedFile(convertToMqttFileData(fileData));
          } else {
            setError(`File not found: ${path}`);
          }
        }
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

  // Convert DirData to DirectoryTree for FileTreeView
  const tree = rootDir ? convertDirDataToTree(rootDir) : null;
  const loading = isLoading && !isDataLoaded;
  const displayError = error || fsError;

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
              <>
                <Tooltip title="Edit in Notion-like editor (new window)">
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    startIcon={<AutoStoriesIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    onClick={openInNotionEditor}
                  >
                    Notion
                  </Button>
                </Tooltip>
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
              </>
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
          <IconButton onClick={handleRefresh} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {displayError && (
        <Alert severity="error" sx={{ mb: isMobile ? 1 : 2 }} onClose={() => setError(null)}>
          {displayError}
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
        onSuccess={() => handleRefresh()}
      />
    </Box>
  );
};

export default FileListPage;
