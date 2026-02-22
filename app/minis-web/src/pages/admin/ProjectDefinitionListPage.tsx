import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  TextField,
  Button,
  Chip,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useProjectDefinitions } from '@modules/filesystem/ProjectDefinitionsContext';

function ProjectDefinitionListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { definitions, loading, error, findDefinitions } = useProjectDefinitions();

  const filtered = search.trim()
    ? findDefinitions(search)
    : definitions;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Project Definitions</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/admin/projects/new')}
        >
          New Definition
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TextField
        label="Search definitions..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        size="small"
        sx={{ mb: 3 }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No project definitions found. Create one to get started.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {filtered.map((def) => (
            <Grid item xs={12} sm={6} md={4} key={def.id}>
              <Card>
                <CardActionArea onClick={() => navigate(`/admin/projects/${def.id}`)}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      {def.info.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      v{def.info.version}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                      {def.tagList.map((tag) => (
                        <Chip key={tag} label={tag} size="small" />
                      ))}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {def.description}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      {def.components.length} component(s)
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default ProjectDefinitionListPage;
