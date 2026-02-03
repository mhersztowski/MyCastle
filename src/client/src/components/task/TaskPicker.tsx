import React, { useState, useMemo, useCallback } from 'react';
import {
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  TextField,
  InputAdornment,
  Box,
  Skeleton,
  Collapse,
  Typography,
} from '@mui/material';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useFilesystem } from '../../modules/filesystem';
import { ProjectNode } from '../../modules/filesystem/nodes';
import { DataSource } from '../../modules/filesystem/data/DataSource';

interface TaskPickerProps {
  id: string | null;
  editable?: boolean;
  size?: 'small' | 'medium';
  onChange?: (id: string | null) => void;
}

interface ProjectTreeItemProps {
  project: ProjectNode;
  level: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  filter: string;
  dataSource: DataSource;
}

const ProjectTreeItem: React.FC<ProjectTreeItemProps> = ({
  project,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  filter,
  dataSource,
}) => {
  // Get tasks from dataSource by projectId
  const projectTasks = useMemo(() => {
    return dataSource.getTasksByProjectId(project.id);
  }, [dataSource, project.id]);

  const filteredTasks = useMemo(() => {
    return filter
      ? projectTasks.filter(t => t.matches(filter))
      : projectTasks;
  }, [projectTasks, filter]);

  const hasContent = projectTasks.length > 0 || project.hasChildren();
  const isExpanded = expandedIds.has(project.id);

  // Check if project or its children/tasks match filter
  const matchesFilter = useMemo(() => {
    if (!filter) return true;
    if (project.matches(filter)) return true;
    if (filteredTasks.length > 0) return true;
    // Check children recursively
    for (const child of project.children) {
      const childTasks = dataSource.getTasksByProjectId(child.id);
      if (child.matches(filter) || childTasks.some(t => t.matches(filter))) {
        return true;
      }
    }
    return false;
  }, [project, filter, filteredTasks, dataSource]);

  if (!matchesFilter) return null;

  return (
    <>
      {/* Project header */}
      <ListItemButton
        onClick={() => hasContent && onToggleExpand(project.id)}
        sx={{ pl: 1 + level * 1.5, py: 0.25, bgcolor: 'grey.50', minHeight: 32 }}
      >
        {hasContent && (
          <Box sx={{ mr: 0.25, display: 'flex', alignItems: 'center' }}>
            {isExpanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
          </Box>
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {isExpanded ? <FolderOpenIcon sx={{ fontSize: 18 }} color="success" /> : <FolderIcon sx={{ fontSize: 18 }} color="success" />}
        </ListItemIcon>
        <ListItemText
          primary={project.getDisplayName()}
          primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {projectTasks.length}
        </Typography>
      </ListItemButton>

      {/* Tasks and child projects */}
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <List component="div" disablePadding dense>
          {/* Tasks in this project */}
          {filteredTasks.map((task) => (
            <ListItemButton
              key={task.id}
              selected={selectedId === task.id}
              onClick={() => onSelect(task.id)}
              sx={{ pl: 2.5 + level * 1.5, py: 0.25, minHeight: 28 }}
            >
              <ListItemIcon sx={{ minWidth: 24 }}>
                <TaskIcon sx={{ fontSize: 16 }} color={selectedId === task.id ? 'secondary' : 'action'} />
              </ListItemIcon>
              <ListItemText
                primary={task.getDisplayName()}
                primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
              />
            </ListItemButton>
          ))}

          {/* Child projects */}
          {project.children.map((child) => (
            <ProjectTreeItem
              key={child.id}
              project={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              filter={filter}
              dataSource={dataSource}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
};

// Collect all project IDs from ProjectNode hierarchy
const collectAllProjectIds = (projects: ProjectNode[]): string[] => {
  const ids: string[] = [];
  for (const project of projects) {
    ids.push(project.id);
    ids.push(...collectAllProjectIds(project.children));
  }
  return ids;
};

const TaskPicker: React.FC<TaskPickerProps> = ({
  id,
  editable = false,
  size = 'medium',
  onChange,
}) => {
  const { dataSource, isDataLoaded } = useFilesystem();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const projects = useMemo(() => {
    if (!isDataLoaded) return [];
    return dataSource.projects;
  }, [dataSource, isDataLoaded]);

  const unassignedTasks = useMemo(() => {
    if (!isDataLoaded) return [];
    return dataSource.getUnassignedTasks();
  }, [dataSource, isDataLoaded]);

  const selectedTask = useMemo(() => {
    if (!id || !isDataLoaded) return null;
    return dataSource.getTaskById(id) || null;
  }, [dataSource, isDataLoaded, id]);

  const handleOpen = () => {
    if (editable) {
      setOpen(true);
      setFilter('');
      // Expand all when opening
      setExpandedIds(new Set(['__unassigned__', ...collectAllProjectIds(projects)]));
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelect = (taskId: string) => {
    onChange?.(taskId);
    setOpen(false);
  };

  const handleToggleExpand = useCallback((projectId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleFilterChange = (value: string) => {
    setFilter(value);
    if (value) {
      setExpandedIds(new Set(['__unassigned__', ...collectAllProjectIds(projects)]));
    }
  };

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={100} height={size === 'small' ? 24 : 32} />;
  }

  const filteredUnassignedTasks = filter
    ? unassignedTasks.filter(t => t.matches(filter))
    : unassignedTasks;

  return (
    <>
      <Chip
        icon={<TaskIcon />}
        label={selectedTask ? selectedTask.getDisplayName() : 'Select task'}
        size={size}
        variant={selectedTask ? 'outlined' : 'filled'}
        color={selectedTask ? 'secondary' : 'default'}
        onClick={editable ? handleOpen : undefined}
        onDelete={editable ? handleOpen : undefined}
        deleteIcon={editable ? <EditIcon /> : undefined}
        sx={{ cursor: editable ? 'pointer' : 'default' }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <TaskIcon color="secondary" />
          Select Task
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search tasks..."
              value={filter}
              onChange={(e) => handleFilterChange(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              autoFocus
            />
          </Box>
          <List dense sx={{ maxHeight: 400, overflow: 'auto' }}>
            {/* Unassigned tasks */}
            {filteredUnassignedTasks.length > 0 && (
              <>
                <ListItemButton
                  onClick={() => handleToggleExpand('__unassigned__')}
                  sx={{ bgcolor: 'grey.100', py: 0.25, minHeight: 32 }}
                >
                  <Box sx={{ mr: 0.25, display: 'flex', alignItems: 'center' }}>
                    {expandedIds.has('__unassigned__') ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                  </Box>
                  <ListItemIcon sx={{ minWidth: 24 }}>
                    <TaskIcon sx={{ fontSize: 18 }} color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Unassigned"
                    primaryTypographyProps={{ fontSize: '0.85rem', fontWeight: 500, fontStyle: 'italic' }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {unassignedTasks.length}
                  </Typography>
                </ListItemButton>
                <Collapse in={expandedIds.has('__unassigned__')} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding dense>
                    {filteredUnassignedTasks.map((task) => (
                      <ListItemButton
                        key={task.id}
                        selected={id === task.id}
                        onClick={() => handleSelect(task.id)}
                        sx={{ pl: 2.5, py: 0.25, minHeight: 28 }}
                      >
                        <ListItemIcon sx={{ minWidth: 24 }}>
                          <TaskIcon sx={{ fontSize: 16 }} color={id === task.id ? 'secondary' : 'action'} />
                        </ListItemIcon>
                        <ListItemText
                          primary={task.getDisplayName()}
                          primaryTypographyProps={{ fontSize: '0.8rem', noWrap: true }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </>
            )}

            {/* Projects with tasks */}
            {projects.map((project) => (
              <ProjectTreeItem
                key={project.id}
                project={project}
                level={0}
                selectedId={id}
                expandedIds={expandedIds}
                onSelect={handleSelect}
                onToggleExpand={handleToggleExpand}
                filter={filter}
                dataSource={dataSource}
              />
            ))}

            {dataSource.tasks.length === 0 && (
              <Typography color="text.secondary" sx={{ px: 2, py: 2 }}>
                No tasks found
              </Typography>
            )}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TaskPicker;
