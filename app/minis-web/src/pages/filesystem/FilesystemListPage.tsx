import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  List,
} from '@mui/material';
import { useFilesystem } from '@modules/filesystem';
import { DirComponent } from '@modules/filesystem/components/DirComponent';
import { FileJsonComponent } from '@modules/filesystem/components/FileJsonComponent';
import type { FileNode } from '@modules/filesystem/nodes/FileNode';

function FilesystemListPage() {
  const { rootDir, selectedFile, loading, error, connected, loadDirectory, selectFile } = useFilesystem();
  const [, setRefresh] = useState(0);

  useEffect(() => {
    if (connected) {
      loadDirectory('/');
    }
  }, [connected, loadDirectory]);

  const handleFileSelect = useCallback(
    (file: FileNode) => {
      selectFile(file);
    },
    [selectFile]
  );

  const handleDirToggle = useCallback(() => {
    setRefresh((prev) => prev + 1);
  }, []);

  if (loading && !rootDir) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        File Browser
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ display: 'flex', minHeight: 400 }}>
        <Box
          sx={{
            width: 300,
            borderRight: 1,
            borderColor: 'divider',
            overflow: 'auto',
          }}
        >
          {rootDir ? (
            <List dense>
              <DirComponent
                dir={rootDir}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
                onDirToggle={handleDirToggle}
              />
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No files found
            </Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, p: 2, overflow: 'auto' }}>
          {selectedFile ? (
            selectedFile.isJson ? (
              <FileJsonComponent file={selectedFile} />
            ) : (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {selectedFile.name}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    backgroundColor: 'grey.100',
                    p: 2,
                    borderRadius: 1,
                    overflow: 'auto',
                    fontSize: '0.875rem',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {selectedFile.content || 'No content loaded'}
                </Box>
              </Paper>
            )
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select a file to view its content
            </Typography>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default FilesystemListPage;
