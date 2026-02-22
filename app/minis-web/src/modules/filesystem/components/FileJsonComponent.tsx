import { Box, Paper, Typography } from '@mui/material';
import { FileNode } from '../nodes/FileNode';

interface FileJsonComponentProps {
  file: FileNode;
}

export function FileJsonComponent({ file }: FileJsonComponentProps) {
  let parsedContent: unknown = null;
  let parseError: string | null = null;

  if (file.content) {
    try {
      parsedContent = JSON.parse(file.content);
    } catch (err) {
      parseError = err instanceof Error ? err.message : 'Invalid JSON';
    }
  }

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {file.name}
      </Typography>
      {parseError ? (
        <Typography color="error" variant="body2">
          Error parsing JSON: {parseError}
        </Typography>
      ) : (
        <Box
          component="pre"
          sx={{
            backgroundColor: 'grey.100',
            p: 2,
            borderRadius: 1,
            overflow: 'auto',
            fontSize: '0.875rem',
          }}
        >
          {JSON.stringify(parsedContent, null, 2)}
        </Box>
      )}
    </Paper>
  );
}

export default FileJsonComponent;
