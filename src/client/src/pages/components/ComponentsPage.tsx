import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Divider,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Skeleton,
} from '@mui/material';
import { PersonLabel, PersonPicker } from '../../components/person';
import { TaskLabel, TaskPicker } from '../../components/task';
import { ProjectLabel, ProjectPicker } from '../../components/project';
import { useFilesystem } from '../../modules/filesystem';

const ComponentsPage: React.FC = () => {
  const { dataSource, isDataLoaded } = useFilesystem();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Get sample IDs from DataSource
  const samplePersonIds = useMemo(() => {
    return dataSource.persons.slice(0, 3).map(p => p.id);
  }, [dataSource.persons]);

  const sampleTaskIds = useMemo(() => {
    return dataSource.tasks.slice(0, 2).map(t => t.id);
  }, [dataSource.tasks]);

  const sampleProjectIds = useMemo(() => {
    return dataSource.projects.slice(0, 2).map(p => p.id);
  }, [dataSource.projects]);

  if (!isDataLoaded) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={500} height={24} sx={{ mb: 3 }} />
        <Grid container spacing={3}>
          {[1, 2, 3].map(i => (
            <Grid item xs={12} md={4} key={i}>
              <Skeleton variant="rounded" height={300} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        UI Components Demo
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Demonstration of reusable UI components for Person, Task, and Project models.
        Data loaded from DataSource ({dataSource.persons.length} persons, {dataSource.tasks.length} tasks, {dataSource.projects.length} projects).
      </Typography>

      <Grid container spacing={3}>
        {/* Person Components */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader
              title="Person Components"
              subheader={`${dataSource.persons.length} persons loaded`}
            />
            <Divider />
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                PersonLabel (read-only)
              </Typography>
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {samplePersonIds.map((id, idx) => (
                  <PersonLabel key={id} id={id} size={idx > 0 ? 'small' : 'medium'} />
                ))}
                <PersonLabel id="invalid-id" size="small" />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                PersonPicker (editable=false)
              </Typography>
              <Box sx={{ mb: 2 }}>
                <PersonPicker
                  id={samplePersonIds[0] || null}
                  editable={false}
                />
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                PersonPicker (editable=true)
              </Typography>
              <Box sx={{ mb: 1 }}>
                <PersonPicker
                  id={selectedPersonId}
                  editable={true}
                  onChange={setSelectedPersonId}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                Selected: {selectedPersonId || 'none'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Task Components */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader
              title="Task Components"
              subheader={`${dataSource.tasks.length} tasks loaded`}
            />
            <Divider />
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                TaskLabel (read-only)
              </Typography>
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {sampleTaskIds.map((id, idx) => (
                  <TaskLabel key={id} id={id} size={idx > 0 ? 'small' : 'medium'} />
                ))}
                <TaskLabel id="invalid-id" size="small" />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                TaskPicker (editable=false)
              </Typography>
              <Box sx={{ mb: 2 }}>
                <TaskPicker
                  id={sampleTaskIds[0] || null}
                  editable={false}
                />
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                TaskPicker (editable=true)
              </Typography>
              <Box sx={{ mb: 1 }}>
                <TaskPicker
                  id={selectedTaskId}
                  editable={true}
                  onChange={setSelectedTaskId}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                Selected: {selectedTaskId || 'none'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Project Components */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardHeader
              title="Project Components"
              subheader={`${dataSource.projects.length} projects loaded`}
            />
            <Divider />
            <CardContent>
              <Typography variant="subtitle2" gutterBottom>
                ProjectLabel (read-only)
              </Typography>
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {sampleProjectIds.map((id, idx) => (
                  <ProjectLabel key={id} id={id} size={idx > 0 ? 'small' : 'medium'} />
                ))}
                <ProjectLabel id="invalid-id" size="small" />
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" gutterBottom>
                ProjectPicker (editable=false)
              </Typography>
              <Box sx={{ mb: 2 }}>
                <ProjectPicker
                  id={sampleProjectIds[0] || null}
                  editable={false}
                />
              </Box>

              <Typography variant="subtitle2" gutterBottom>
                ProjectPicker (editable=true)
              </Typography>
              <Box sx={{ mb: 1 }}>
                <ProjectPicker
                  id={selectedProjectId}
                  editable={true}
                  onChange={setSelectedProjectId}
                />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                Selected: {selectedProjectId || 'none'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Usage Examples */}
      <Paper sx={{ mt: 3, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Usage Examples
        </Typography>
        <Typography variant="body2" component="pre" sx={{
          bgcolor: 'grey.100',
          p: 2,
          borderRadius: 1,
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
        }}>
{`// Label - read-only display
<PersonLabel id="person-uuid" />
<TaskLabel id="task-uuid" size="small" />
<ProjectLabel id="project-uuid" />

// Picker - with selection modal
<PersonPicker
  id={selectedId}
  editable={true}
  onChange={(id) => setSelectedId(id)}
/>

// Access data via DataSource
const { dataSource } = useFilesystem();
const person = dataSource.getPersonById('id');
const tasks = dataSource.findTasks('query');
const project = dataSource.findProjectByIdDeep('id');`}
        </Typography>
      </Paper>
    </Box>
  );
};

export default ComponentsPage;
