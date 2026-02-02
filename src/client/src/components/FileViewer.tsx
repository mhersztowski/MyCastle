import React from 'react';
import { Box, Typography, Chip, Divider } from '@mui/material';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { FileData, BinaryFileData } from '../modules/mqttclient';

interface FileViewerProps {
  file?: FileData;
  binaryFile?: BinaryFileData;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const FileViewer: React.FC<FileViewerProps> = ({ file, binaryFile }) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Binary file preview
  if (binaryFile) {
    const { path, data, mimeType, size, lastModified } = binaryFile;
    const dataUrl = `data:${mimeType};base64,${data}`;

    const renderBinaryPreview = () => {
      if (mimeType.startsWith('image/')) {
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              bgcolor: 'grey.200',
              borderRadius: 1,
              p: 2,
              minHeight: 200,
            }}
          >
            <Box
              component="img"
              src={dataUrl}
              alt={path}
              sx={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 350px)',
                objectFit: 'contain',
                borderRadius: 1,
                boxShadow: 1,
              }}
            />
          </Box>
        );
      }

      if (mimeType.startsWith('audio/')) {
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              p: 3,
              bgcolor: 'grey.100',
              borderRadius: 1,
            }}
          >
            <AudiotrackIcon sx={{ fontSize: 64, color: 'primary.main' }} />
            <audio controls src={dataUrl} style={{ width: '100%', maxWidth: 400 }}>
              Your browser does not support the audio element.
            </audio>
          </Box>
        );
      }

      if (mimeType.startsWith('video/')) {
        return (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              bgcolor: 'black',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <video
              controls
              src={dataUrl}
              style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 350px)' }}
            >
              Your browser does not support the video element.
            </video>
          </Box>
        );
      }

      if (mimeType === 'application/pdf') {
        return (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              p: 3,
              bgcolor: 'grey.100',
              borderRadius: 1,
            }}
          >
            <PictureAsPdfIcon sx={{ fontSize: 64, color: 'error.main' }} />
            <Typography>PDF preview not available</Typography>
            <a href={dataUrl} download={path.split('/').pop()} style={{ textDecoration: 'none' }}>
              <Chip label="Download PDF" clickable color="primary" />
            </a>
          </Box>
        );
      }

      // Generic binary file
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            p: 3,
            bgcolor: 'grey.100',
            borderRadius: 1,
          }}
        >
          <InsertDriveFileIcon sx={{ fontSize: 64, color: 'grey.500' }} />
          <Typography>Binary file preview not available</Typography>
          <Typography variant="body2" color="text.secondary">
            Type: {mimeType}
          </Typography>
          <a href={dataUrl} download={path.split('/').pop()} style={{ textDecoration: 'none' }}>
            <Chip label="Download File" clickable color="primary" />
          </a>
        </Box>
      );
    };

    const getFileIcon = () => {
      if (mimeType.startsWith('image/')) return <ImageIcon color="success" />;
      if (mimeType.startsWith('audio/')) return <AudiotrackIcon color="primary" />;
      if (mimeType.startsWith('video/')) return <VideoFileIcon color="secondary" />;
      if (mimeType === 'application/pdf') return <PictureAsPdfIcon color="error" />;
      return <InsertDriveFileIcon />;
    };

    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {getFileIcon()}
          <Typography variant="subtitle1" fontWeight="medium">
            {path}
          </Typography>
          <Chip
            label={formatFileSize(size)}
            size="small"
            color="info"
            variant="outlined"
          />
          <Chip
            label={mimeType}
            size="small"
            variant="outlined"
          />
          <Chip
            label={`Modified: ${formatDate(lastModified)}`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        {renderBinaryPreview()}
      </Box>
    );
  }

  // Text file preview (original behavior)
  if (file) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Typography variant="subtitle1" fontWeight="medium">
            {file.path}
          </Typography>
          <Chip
            label={`Modified: ${formatDate(file.lastModified)}`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Divider sx={{ mb: 2 }} />

        <Box
          component="pre"
          sx={{
            backgroundColor: 'grey.100',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.875rem',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 'calc(100vh - 300px)',
            m: 0,
          }}
        >
          {file.content || '(empty file)'}
        </Box>
      </Box>
    );
  }

  return (
    <Typography color="text.secondary">
      No file selected
    </Typography>
  );
};

export default FileViewer;
