import { useState } from 'react';
import {
  Box, Typography, Button, TextField, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Tooltip, Stack,
} from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { minisApi } from '../../services/MinisApiService';
import type { GithubModuleEntry } from '../../services/MinisApiService';

const DEFAULT_URL = 'https://github.com/platform-minis/MinisProjects';

function GithubProjectDefsPage() {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_URL);
  const [modules, setModules] = useState<GithubModuleEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    try {
      const data = await minisApi.getGithubProjectdefs(repoUrl);
      setModules(data.modules ?? []);
      setUpdatedAt(data.updatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setFetching(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" gutterBottom>GitHub Modules</Typography>

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="GitHub Repository URL"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          size="small"
          placeholder="https://github.com/owner/repo"
        />
        <Button
          variant="contained"
          startIcon={fetching ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
          onClick={handleFetch}
          disabled={fetching || !repoUrl}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Fetch
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {modules.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {modules.length} modules · updated {updatedAt}
          </Typography>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Platform</TableCell>
                  <TableCell>Board Profile Key</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {modules.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.id}</TableCell>
                    <TableCell>
                      <Tooltip title={m.description} placement="top-start">
                        <span>{m.name}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{m.vendor}</TableCell>
                    <TableCell>{m.platform}</TableCell>
                    <TableCell>{m.boardProfileKey ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
}

export default GithubProjectDefsPage;
