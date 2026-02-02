import React, { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  LinearProgress,
  Alert,
  IconButton,
  List,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Collapse,
  Chip,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import MicIcon from '@mui/icons-material/Mic';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useMqtt, DirectoryTree } from '../../modules/mqttclient';
import CameraCapture from './CameraCapture';
import VoiceRecorder from './VoiceRecorder';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box role="tabpanel" hidden={value !== index} sx={{ py: 2 }}>
    {value === index && children}
  </Box>
);

interface DirectoryItemProps {
  item: DirectoryTree;
  selectedPath: string;
  onSelect: (path: string) => void;
  level: number;
}

const DirectoryItem: React.FC<DirectoryItemProps> = ({ item, selectedPath, onSelect, level }) => {
  const [open, setOpen] = useState(level < 2);
  const isSelected = selectedPath === item.path;
  const hasChildren = item.children && item.children.some(c => c.type === 'directory');

  if (item.type !== 'directory') return null;

  return (
    <>
      <ListItemButton
        onClick={() => {
          onSelect(item.path);
          if (hasChildren) setOpen(!open);
        }}
        selected={isSelected}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {open ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />}
        </ListItemIcon>
        <ListItemText primary={item.name} />
        {hasChildren && (open ? <ExpandLess /> : <ExpandMore />)}
      </ListItemButton>
      {hasChildren && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {item.children
              ?.filter(c => c.type === 'directory')
              .map(child => (
                <DirectoryItem
                  key={child.path}
                  item={child}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                  level={level + 1}
                />
              ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

interface FileUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (path: string) => void;
  initialDirectory?: string;
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  open,
  onClose,
  onSuccess,
  initialDirectory = '',
}) => {
  const { uploadFile, listDirectory, isConnected } = useMqtt();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tabValue, setTabValue] = useState(0);
  const [selectedDirectory, setSelectedDirectory] = useState(initialDirectory);
  const [fileName, setFileName] = useState('');
  const [file, setFile] = useState<File | Blob | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [directoryTree, setDirectoryTree] = useState<DirectoryTree | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);

  const loadDirectoryTree = useCallback(async () => {
    if (!isConnected) return;
    try {
      const tree = await listDirectory();
      setDirectoryTree(tree);
    } catch (err) {
      console.error('Failed to load directory tree:', err);
    }
  }, [isConnected, listDirectory]);

  React.useEffect(() => {
    if (open) {
      loadDirectoryTree();
      setSelectedDirectory(initialDirectory);
      setFile(null);
      setFileName('');
      setFilePreview(null);
      setError(null);
      setSuccess(false);
      setUploadProgress(0);
    }
  }, [open, initialDirectory, loadDirectoryTree]);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setFile(null);
    setFileName('');
    setFilePreview(null);
    setError(null);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit');
        return;
      }
      setFile(selectedFile);
      setFileName(selectedFile.name);
      setError(null);

      if (selectedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(selectedFile);
        setFilePreview(url);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleCameraCapture = (blob: Blob) => {
    setFile(blob);
    setFileName(`photo_${Date.now()}.jpg`);
    setFilePreview(URL.createObjectURL(blob));
    setShowCamera(false);
    setError(null);
  };

  const handleVoiceRecorded = (blob: Blob) => {
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
    setFile(blob);
    setFileName(`voice_${Date.now()}.${ext}`);
    setFilePreview(null);
    setShowVoiceRecorder(false);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !fileName) {
      setError('Please select a file first');
      return;
    }

    const fullPath = selectedDirectory
      ? `${selectedDirectory}/${fileName}`
      : fileName;

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      await uploadFile(fullPath, file, (progress) => {
        setUploadProgress(progress);
      });

      setSuccess(true);
      setUploadProgress(100);

      if (onSuccess) {
        onSuccess(fullPath);
      }

      // Auto close after success
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setFile(null);
    setFileName('');
    setFilePreview(null);
    setShowCamera(false);
    setShowVoiceRecorder(false);
    onClose();
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit');
        return;
      }
      setFile(droppedFile);
      setFileName(droppedFile.name);
      setError(null);

      if (droppedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(droppedFile);
        setFilePreview(url);
      } else {
        setFilePreview(null);
      }
    }
  }, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  if (showCamera) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CameraAltIcon />
          Take Photo
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={() => setShowCamera(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: 500 }}>
          <CameraCapture onCapture={handleCameraCapture} onCancel={() => setShowCamera(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  if (showVoiceRecorder) {
    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <MicIcon />
          Voice Recording
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={() => setShowVoiceRecorder(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setShowVoiceRecorder(false)} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudUploadIcon />
        Upload File
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            File uploaded successfully!
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
          {/* Directory selection */}
          <Box sx={{ width: { xs: '100%', md: 250 }, flexShrink: 0 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Destination Folder
            </Typography>
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                height: 200,
                overflow: 'auto',
              }}
            >
              <List dense>
                <ListItemButton
                  selected={selectedDirectory === ''}
                  onClick={() => setSelectedDirectory('')}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <FolderIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="/ (root)" />
                </ListItemButton>
                {directoryTree?.children
                  ?.filter(c => c.type === 'directory')
                  .map(item => (
                    <DirectoryItem
                      key={item.path}
                      item={item}
                      selectedPath={selectedDirectory}
                      onSelect={setSelectedDirectory}
                      level={0}
                    />
                  ))}
              </List>
            </Box>
            {selectedDirectory && (
              <Chip
                label={selectedDirectory}
                size="small"
                onDelete={() => setSelectedDirectory('')}
                sx={{ mt: 1 }}
              />
            )}
          </Box>

          {/* Upload area */}
          <Box sx={{ flexGrow: 1 }}>
            <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 1 }}>
              <Tab icon={<CloudUploadIcon />} iconPosition="start" label="File" />
              <Tab icon={<CameraAltIcon />} iconPosition="start" label="Camera" />
              <Tab icon={<MicIcon />} iconPosition="start" label="Voice" />
            </Tabs>

            <TabPanel value={tabValue} index={0}>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <Box
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  border: '2px dashed',
                  borderColor: file ? 'success.main' : 'grey.400',
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  bgcolor: file ? 'success.lighter' : 'grey.50',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: 'primary.lighter',
                  },
                  minHeight: 150,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {filePreview ? (
                  <Box
                    component="img"
                    src={filePreview}
                    sx={{ maxHeight: 120, maxWidth: '100%', borderRadius: 1, mb: 1 }}
                  />
                ) : file ? (
                  <InsertDriveFileIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                ) : (
                  <CloudUploadIcon sx={{ fontSize: 48, color: 'grey.500', mb: 1 }} />
                )}
                <Typography variant="body1" color={file ? 'success.main' : 'text.secondary'}>
                  {file ? fileName : 'Click or drag file to upload'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Max file size: 10MB
                </Typography>
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Box sx={{ textAlign: 'center', py: 3 }}>
                {file && filePreview ? (
                  <Box>
                    <Box
                      component="img"
                      src={filePreview}
                      sx={{ maxHeight: 150, maxWidth: '100%', borderRadius: 1, mb: 2 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {fileName}
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setFile(null);
                        setFileName('');
                        setFilePreview(null);
                      }}
                      sx={{ mt: 1 }}
                    >
                      Clear
                    </Button>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<CameraAltIcon />}
                    onClick={() => setShowCamera(true)}
                    size="large"
                  >
                    Open Camera
                  </Button>
                )}
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={2}>
              <Box sx={{ textAlign: 'center', py: 3 }}>
                {file && !filePreview ? (
                  <Box>
                    <MicIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                    <Typography variant="body1" color="success.main">
                      {fileName}
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={() => {
                        setFile(null);
                        setFileName('');
                      }}
                      sx={{ mt: 1 }}
                    >
                      Clear
                    </Button>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<MicIcon />}
                    onClick={() => setShowVoiceRecorder(true)}
                    size="large"
                    color="error"
                  >
                    Start Recording
                  </Button>
                )}
              </Box>
            </TabPanel>

            {/* File name input */}
            {file && (
              <TextField
                fullWidth
                label="File Name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                size="small"
                sx={{ mt: 2 }}
              />
            )}

            {/* Upload progress */}
            {uploading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                  Uploading... {Math.round(uploadProgress)}%
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={!file || !fileName || uploading || success}
          startIcon={uploading ? null : <CloudUploadIcon />}
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileUploadModal;
