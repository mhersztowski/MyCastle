import React, { useState, useCallback, Fragment } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Tooltip,
  Box,
  Button,
  Paper,
  Typography,
  Collapse,
  Tabs,
  Tab,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FolderIcon from '@mui/icons-material/Folder';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { ProjectModel, ProjectComponentModel } from '../../modules/filesystem/models/ProjectModel';
import { TaskModel } from '../../modules/filesystem/models/TaskModel';
import ProjectTaskEditor from './ProjectTaskEditor';
import ProjectComponentEditor from './ProjectComponentEditor';
import { v4 as uuidv4 } from 'uuid';

const MAX_DEPTH = 5;

interface ProjectListEditorProps {
  projects: ProjectModel[];
  onChange: (projects: ProjectModel[]) => void;
  readOnly?: boolean;
  level?: number;
}

// Detail panel for a single expanded project row
const ProjectDetailPanel: React.FC<{
  project: ProjectModel;
  onChange: (updated: ProjectModel) => void;
  readOnly?: boolean;
  level: number;
}> = ({ project, onChange, readOnly, level }) => {
  const [activeTab, setActiveTab] = useState(0);

  const subProjectCount = project.projects?.length || 0;
  const taskCount = project.tasks?.length || 0;
  const componentCount = project.components?.length || 0;

  return (
    <Box sx={{ pl: 4, pr: 1, pb: 2, pt: 1, bgcolor: 'action.hover' }}>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ minHeight: 36, mb: 1 }}
      >
        <Tab
          label={`Sub-projects (${subProjectCount})`}
          sx={{ minHeight: 36, py: 0, textTransform: 'none', fontSize: '0.8rem' }}
          disabled={level >= MAX_DEPTH}
        />
        <Tab
          label={`Tasks (${taskCount})`}
          sx={{ minHeight: 36, py: 0, textTransform: 'none', fontSize: '0.8rem' }}
        />
        <Tab
          label={`Components (${componentCount})`}
          sx={{ minHeight: 36, py: 0, textTransform: 'none', fontSize: '0.8rem' }}
        />
      </Tabs>

      {activeTab === 0 && level < MAX_DEPTH && (
        <ProjectListEditor
          projects={project.projects || []}
          onChange={(subProjects: ProjectModel[]) =>
            onChange({ ...project, projects: subProjects.length > 0 ? subProjects : undefined })
          }
          readOnly={readOnly}
          level={level + 1}
        />
      )}

      {activeTab === 1 && (
        <ProjectTaskEditor
          tasks={project.tasks || []}
          onChange={(tasks: TaskModel[]) =>
            onChange({ ...project, tasks: tasks.length > 0 ? tasks : undefined })
          }
          readOnly={readOnly}
        />
      )}

      {activeTab === 2 && (
        <ProjectComponentEditor
          components={project.components || []}
          onChange={(components: ProjectComponentModel[]) =>
            onChange({ ...project, components: components.length > 0 ? components : undefined })
          }
          readOnly={readOnly}
        />
      )}
    </Box>
  );
};

const ProjectListEditor: React.FC<ProjectListEditorProps> = ({
  projects,
  onChange,
  readOnly = false,
  level = 0,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ProjectModel>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(() => {
    const newProject: ProjectModel = {
      type: 'project',
      id: uuidv4(),
      name: '',
      description: '',
    };
    onChange([...projects, newProject]);
    setEditingId(newProject.id);
    setEditDraft(newProject);
  }, [projects, onChange]);

  const handleDelete = useCallback((id: string) => {
    onChange(projects.filter((p) => p.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditDraft({});
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [projects, onChange, editingId]);

  const handleEditStart = useCallback((project: ProjectModel) => {
    setEditingId(project.id);
    setEditDraft({ ...project });
  }, []);

  const handleEditCancel = useCallback(() => {
    const project = projects.find((p) => p.id === editingId);
    if (project && !project.name) {
      onChange(projects.filter((p) => p.id !== editingId));
    }
    setEditingId(null);
    setEditDraft({});
  }, [editingId, projects, onChange]);

  const handleEditSave = useCallback(() => {
    if (!editingId || !editDraft.name?.trim()) return;

    onChange(
      projects.map((p) =>
        p.id === editingId
          ? { ...p, ...editDraft, name: editDraft.name!.trim() }
          : p
      )
    );
    setEditingId(null);
    setEditDraft({});
  }, [editingId, editDraft, projects, onChange]);

  const handleProjectUpdate = useCallback((id: string, updated: ProjectModel) => {
    onChange(projects.map((p) => (p.id === id ? updated : p)));
  }, [projects, onChange]);

  const handleDraftChange = useCallback(
    (field: string, value: string | number | undefined) => {
      setEditDraft((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleEditSave();
      else if (e.key === 'Escape') handleEditCancel();
    },
    [handleEditSave, handleEditCancel]
  );

  const colCount = readOnly ? 3 : 4;

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: 220 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600, width: 100 }}>Cost</TableCell>
              {!readOnly && (
                <TableCell sx={{ width: 100 }} align="right">
                  Actions
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((project) => {
              const isEditing = editingId === project.id;
              const isExpanded = expandedIds.has(project.id);

              if (isEditing) {
                return (
                  <TableRow key={project.id} sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.name || ''}
                        onChange={(e) => handleDraftChange('name', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="name *"
                        autoFocus
                        error={!editDraft.name?.trim()}
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        value={editDraft.description || ''}
                        onChange={(e) => handleDraftChange('description', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="description"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={editDraft.cost ?? ''}
                        onChange={(e) =>
                          handleDraftChange(
                            'cost',
                            e.target.value ? parseFloat(e.target.value) : undefined
                          )
                        }
                        onKeyDown={handleKeyDown}
                        placeholder="0"
                        fullWidth
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Save (Enter)">
                        <span>
                          <IconButton
                            size="small"
                            onClick={handleEditSave}
                            color="success"
                            disabled={!editDraft.name?.trim()}
                          >
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Cancel (Esc)">
                        <IconButton size="small" onClick={handleEditCancel}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              }

              const nestedCount =
                (project.projects?.length || 0) +
                (project.tasks?.length || 0) +
                (project.components?.length || 0);

              return (
                <Fragment key={project.id}>
                  <TableRow
                    hover
                    onDoubleClick={!readOnly ? () => handleEditStart(project) : undefined}
                    sx={{ cursor: readOnly ? 'default' : 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {project.name && (
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(project.id);
                            }}
                            sx={{ p: 0.25 }}
                          >
                            {isExpanded ? (
                              <ExpandLessIcon sx={{ fontSize: 18 }} />
                            ) : (
                              <ExpandMoreIcon sx={{ fontSize: 18 }} />
                            )}
                          </IconButton>
                        )}
                        <FolderIcon sx={{ fontSize: 16, color: 'action.active' }} />
                        {project.name}
                        {nestedCount > 0 && (
                          <Typography variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                            (
                            {[
                              project.projects?.length ? `${project.projects.length}p` : '',
                              project.tasks?.length ? `${project.tasks.length}t` : '',
                              project.components?.length ? `${project.components.length}c` : '',
                            ]
                              .filter(Boolean)
                              .join(', ')}
                            )
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        noWrap
                        sx={{ maxWidth: 300 }}
                      >
                        {project.description || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>{project.cost ?? ''}</TableCell>
                    {!readOnly && (
                      <TableCell align="right">
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEditStart(project)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton
                            size="small"
                            onClick={() => handleDelete(project.id)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>

                  {project.name && (
                    <TableRow>
                      <TableCell
                        colSpan={colCount}
                        sx={{ p: 0, '&.MuiTableCell-root': { borderBottom: 0 } }}
                      >
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <ProjectDetailPanel
                            project={project}
                            onChange={(updated) => handleProjectUpdate(project.id, updated)}
                            readOnly={readOnly}
                            level={level}
                          />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}

            {projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} align="center" sx={{ py: 3 }}>
                  <Typography variant="body2" color="text.secondary">
                    No projects
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {!readOnly && (
        <Box sx={{ mt: 1 }}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={editingId !== null}
          >
            Add Project
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default ProjectListEditor;
