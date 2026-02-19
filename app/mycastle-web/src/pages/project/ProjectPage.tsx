import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import FolderIcon from '@mui/icons-material/Folder';
import { useFilesystem } from '../../modules/filesystem';
import { ProjectModel, ProjectsModel, TaskModel, TasksModel } from '@mhersztowski/core';
import { ProjectListEditor } from '../../components/project';

const PROJECTS_PATH = 'data/projects.json';
const TASKS_PATH = 'data/tasks.json';

// Recursively merge tasks from DataSource into project models
function mergeTasksIntoProjects(
  projects: ProjectModel[],
  getTasksForProject: (projectId: string) => TaskModel[]
): ProjectModel[] {
  return projects.map((project) => {
    const externalTasks = getTasksForProject(project.id);
    const allTasks = [...(project.tasks || []), ...externalTasks];
    return {
      ...project,
      tasks: allTasks.length > 0 ? allTasks : undefined,
      projects: project.projects
        ? mergeTasksIntoProjects(project.projects, getTasksForProject)
        : undefined,
    };
  });
}

// Extract tasks from project hierarchy, setting projectId
function extractTasksFromProjects(projects: ProjectModel[]): TaskModel[] {
  const tasks: TaskModel[] = [];
  for (const project of projects) {
    if (project.tasks) {
      for (const task of project.tasks) {
        tasks.push({ ...task, projectId: project.id });
      }
    }
    if (project.projects) {
      tasks.push(...extractTasksFromProjects(project.projects));
    }
  }
  return tasks;
}

// Strip inline tasks from projects for clean file save
function stripTasksFromProjects(projects: ProjectModel[]): ProjectModel[] {
  return projects.map(({ tasks: _tasks, ...rest }) => ({
    ...rest,
    projects: rest.projects ? stripTasksFromProjects(rest.projects) : undefined,
  }));
}

// Collect all project IDs from hierarchy
function getAllProjectIds(projects: ProjectModel[]): Set<string> {
  const ids = new Set<string>();
  for (const p of projects) {
    ids.add(p.id);
    if (p.projects) {
      for (const id of getAllProjectIds(p.projects)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

const ProjectPage: React.FC = () => {
  const { dataSource, isDataLoaded, writeFile, loadAllData } = useFilesystem();

  const getTasksForProject = useCallback(
    (projectId: string): TaskModel[] => {
      if (!isDataLoaded) return [];
      return dataSource.getTasksByProjectId(projectId).map((t) => t.toModel());
    },
    [dataSource, isDataLoaded]
  );

  const initialProjects = useMemo(() => {
    if (!isDataLoaded) return [];
    const models = dataSource.projects.map((p) => p.toModel());
    return mergeTasksIntoProjects(models, getTasksForProject);
  }, [dataSource, isDataLoaded, getTasksForProject]);

  const [projects, setProjects] = useState<ProjectModel[]>(initialProjects);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  React.useEffect(() => {
    if (isDataLoaded) {
      const models = dataSource.projects.map((p) => p.toModel());
      setProjects(mergeTasksIntoProjects(models, getTasksForProject));
      setIsDirty(false);
    }
  }, [isDataLoaded, dataSource, getTasksForProject]);

  const handleChange = useCallback((updated: ProjectModel[]) => {
    setProjects(updated);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Save projects WITHOUT inline tasks (keep original architecture)
      const projectsData: ProjectsModel = {
        type: 'projects',
        projects: stripTasksFromProjects(projects),
      };
      await writeFile(PROJECTS_PATH, JSON.stringify(projectsData, null, 2));

      // Extract tasks from project hierarchy and save to tasks.json
      const projectTasks = extractTasksFromProjects(projects);
      const projectIds = getAllProjectIds(projects);
      // Keep unassigned tasks and tasks for projects not in our hierarchy
      const otherTasks = dataSource.tasks
        .filter((t) => !t.projectId || !projectIds.has(t.projectId))
        .map((t) => t.toModel());

      const tasksData: TasksModel = {
        type: 'tasks',
        tasks: [...projectTasks, ...otherTasks],
      };
      await writeFile(TASKS_PATH, JSON.stringify(tasksData, null, 2));

      // Reload DataSource so all data stays in sync
      await loadAllData();
      setIsDirty(false);
      setSnackbar({ open: true, message: 'Saved successfully', severity: 'success' });
    } catch (err) {
      console.error('Failed to save:', err);
      setSnackbar({ open: true, message: 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [projects, dataSource, writeFile, loadAllData]);

  if (!isDataLoaded) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
        <FolderIcon color="primary" />
        <Typography variant="h5" sx={{ flex: 1 }}>
          Projects
        </Typography>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          Save
        </Button>
      </Box>

      <ProjectListEditor projects={projects} onChange={handleChange} />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProjectPage;
