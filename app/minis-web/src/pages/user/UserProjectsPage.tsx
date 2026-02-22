import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardActionArea,
  Grid,
  Chip,
  Stack,
  Alert,
  CircularProgress,
  LinearProgress,
  Divider,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useProjectRealizations } from '@modules/filesystem/ProjectRealizationsContext';
import { useProjectDefinitions } from '@modules/filesystem/ProjectDefinitionsContext';
import type { ProjectDefinitionNode } from '@modules/filesystem/nodes/ProjectDefinitionNode';

function UserProjectsPage() {
  const navigate = useNavigate();
  const {
    realizations,
    loading: realizationsLoading,
    error: realizationsError,
    createRealizationFromDefinition,
  } = useProjectRealizations();
  const {
    definitions,
    loading: definitionsLoading,
    error: definitionsError,
  } = useProjectDefinitions();

  const [starting, setStarting] = useState(false);

  const handleStartProject = async (definition: ProjectDefinitionNode) => {
    setStarting(true);
    try {
      const realization = await createRealizationFromDefinition(definition);
      navigate(`/user/project/${realization.id}`);
    } catch {
      // error is set in context
    } finally {
      setStarting(false);
    }
  };

  const error = realizationsError || definitionsError;

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* My Realizations */}
      <Typography variant="h5" gutterBottom>Moje Projekty</Typography>

      {realizationsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : realizations.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Nie masz jeszcze żadnych realizowanych projektów.
        </Typography>
      ) : (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {realizations.map((r) => (
            <Grid item xs={12} sm={6} md={4} key={r.id}>
              <Card>
                <CardActionArea onClick={() => navigate(`/user/project/${r.id}`)}>
                  <CardContent>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="h6" sx={{ flex: 1 }} noWrap>
                        {r.name}
                      </Typography>
                      <Chip
                        label={r.status}
                        size="small"
                        color={r.isCompleted ? 'success' : r.isInProgress ? 'warning' : 'default'}
                      />
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={r.progress}
                      sx={{ height: 6, borderRadius: 3, mb: 1 }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {r.progress}% complete
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {r.taskRealizations.filter(t => t.status === 'completed').length}/{r.taskRealizations.length} tasks
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Available Definitions */}
      <Typography variant="h5" gutterBottom>Dostępne Projekty</Typography>

      {definitionsLoading || starting ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : definitions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Brak dostępnych definicji projektów.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {definitions.map((def) => (
            <Grid item xs={12} sm={6} md={4} key={def.id}>
              <Card>
                <CardActionArea onClick={() => handleStartProject(def)}>
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
                      {def.description || 'Brak opisu'}
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

export default UserProjectsPage;
