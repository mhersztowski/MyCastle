import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  LinearProgress,
  Checkbox,
  FormControlLabel,
  Paper,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  CircularProgress,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Description as DescriptionIcon,
  Memory as HexIcon,
} from '@mui/icons-material';
import type { ProjectDefinitionNode } from '@modules/filesystem/nodes/ProjectDefinitionNode';
import type { ProjectRealizationNode } from '@modules/filesystem/nodes/ProjectRealizationNode';
import { useProjectRealizations } from '@modules/filesystem/ProjectRealizationsContext';
import { useProjectDefinitions } from '@modules/filesystem/ProjectDefinitionsContext';

function ProjectInfoSection({ definition }: { definition: ProjectDefinitionNode }) {
  const { info } = definition;

  return (
    <Accordion defaultExpanded={false}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Project Info</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Name</Typography>
            <Typography>{info.name}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Version</Typography>
            <Typography>{info.version}</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Tags</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {info.tags.map((tag) => (
                <Chip key={tag} label={tag} size="small" />
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Hardware Architecture</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {info.hardwareArchitecture.map((hw) => (
                <Chip key={hw} label={hw} size="small" variant="outlined" />
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">Software Platform</Typography>
            <Typography>{info.softwareArchitecture.platform}</Typography>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function ProjectDocSection({ definition }: { definition: ProjectDefinitionNode }) {
  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Documentation</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            whiteSpace: 'pre-wrap',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            backgroundColor: 'grey.50',
          }}
        >
          {definition.description || 'No documentation available.'}
        </Paper>
      </AccordionDetails>
    </Accordion>
  );
}

function ProjectStatusSection({
  definition,
  realization,
}: {
  definition: ProjectDefinitionNode;
  realization: ProjectRealizationNode;
}) {
  const allTasks = definition.getAllTasks();

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', pr: 2 }}>
          <Typography variant="h6">Realization Status</Typography>
          <Chip
            label={realization.status}
            size="small"
            color={
              realization.isCompleted ? 'success' : realization.isInProgress ? 'warning' : 'default'
            }
          />
          <Typography variant="body2" color="text.secondary">
            {realization.progress}%
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ mb: 2 }}>
          <LinearProgress
            variant="determinate"
            value={realization.progress}
            sx={{ height: 8, borderRadius: 4 }}
          />
        </Box>
        {allTasks.length > 0 ? (
          <List dense>
            {allTasks.map((task) => {
              const taskRealization = realization.getTaskRealization(task.id);
              const isCompleted = taskRealization?.status === 'completed';

              return (
                <ListItem key={task.id}>
                  <FormControlLabel
                    control={<Checkbox checked={isCompleted} disabled />}
                    label={
                      <Box>
                        <Typography
                          variant="body1"
                          sx={{ textDecoration: isCompleted ? 'line-through' : 'none' }}
                        >
                          {task.title}
                        </Typography>
                        {task.description && (
                          <Typography variant="body2" color="text.secondary">
                            {task.description}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary">
            No tasks defined for this project.
          </Typography>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function ProjectResourcesSection({ definition }: { definition: ProjectDefinitionNode }) {
  const sourceFiles = definition.getAllSourceFiles();
  const binaryHex = definition.getAllBinaryHex();

  if (sourceFiles.length === 0 && binaryHex.length === 0) {
    return null;
  }

  return (
    <Accordion defaultExpanded>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Resources</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {sourceFiles.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Source Files</Typography>
            <List dense>
              {sourceFiles.map((file) => (
                <ListItem key={file.id}>
                  <ListItemIcon><DescriptionIcon /></ListItemIcon>
                  <ListItemText
                    primary={file.name}
                    secondary={`${file.path} (${file.language})`}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
        {sourceFiles.length > 0 && binaryHex.length > 0 && <Divider sx={{ my: 1 }} />}
        {binaryHex.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Binary Files</Typography>
            <List dense>
              {binaryHex.map((hex) => (
                <ListItem key={hex.id}>
                  <ListItemIcon><HexIcon /></ListItemIcon>
                  <ListItemText
                    primary={hex.name}
                    secondary={hex.path}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

function ProjectRealizationPage() {
  const { id } = useParams();
  const { getRealizationById, loading: realizationLoading } = useProjectRealizations();
  const { getDefinitionById, loading: definitionLoading } = useProjectDefinitions();

  const realization = id ? getRealizationById(id) : undefined;
  const definition = realization ? getDefinitionById(realization.definitionId) : undefined;

  if (realizationLoading || definitionLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!realization || !definition) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Project realization not found (id: {id}).
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {definition.info.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        v{definition.info.version}
      </Typography>
      <Stack spacing={2} sx={{ mt: 2 }}>
        <ProjectInfoSection definition={definition} />
        <ProjectDocSection definition={definition} />
        <ProjectStatusSection definition={definition} realization={realization} />
        <ProjectResourcesSection definition={definition} />
      </Stack>
    </Box>
  );
}

export default ProjectRealizationPage;
