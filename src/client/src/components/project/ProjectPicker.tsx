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
  TextField,
  InputAdornment,
  Box,
  Skeleton,
  Collapse,
  IconButton,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { useFilesystem } from '../../modules/filesystem';
import { ProjectNode } from '../../modules/filesystem/nodes';

interface ProjectPickerProps {
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
}

const ProjectTreeItem: React.FC<ProjectTreeItemProps> = ({
  project,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  filter,
}) => {
  const hasChildren = project.hasChildren();
  const isExpanded = expandedIds.has(project.id);
  const isSelected = selectedId === project.id;

  if (filter && !project.matchesDeep(filter)) return null;

  return (
    <>
      <ListItemButton
        selected={isSelected}
        onClick={() => onSelect(project.id)}
        sx={{ pl: 1 + level * 1.5, py: 0.25, minHeight: 32 }}
      >
        {hasChildren && (
          <Box
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(project.id);
            }}
            sx={{ mr: 0.25, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            {isExpanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
          </Box>
        )}
        <ListItemIcon sx={{ minWidth: 24 }}>
          {hasChildren ? (
            isExpanded ? <FolderOpenIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} /> : <FolderIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} />
          ) : (
            <FolderIcon sx={{ fontSize: 18 }} color={isSelected ? 'success' : 'action'} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={project.getDisplayName()}
          primaryTypographyProps={{ fontSize: '0.85rem', noWrap: true }}
        />
      </ListItemButton>
      {hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding dense>
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
              />
            ))}
          </List>
        </Collapse>
      )}
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

const ProjectPicker: React.FC<ProjectPickerProps> = ({
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

  const selectedProject = useMemo(() => {
    if (!id || !isDataLoaded) return null;
    return dataSource.findProjectByIdDeep(id) || null;
  }, [dataSource, isDataLoaded, id]);

  const handleOpen = () => {
    if (editable) {
      setOpen(true);
      setFilter('');
      // Expand all when opening
      setExpandedIds(new Set(collectAllProjectIds(projects)));
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handleSelect = (projectId: string) => {
    onChange?.(projectId);
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
      // Expand all when filtering
      setExpandedIds(new Set(collectAllProjectIds(projects)));
    }
  };

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={100} height={size === 'small' ? 24 : 32} />;
  }

  return (
    <>
      <Chip
        icon={<FolderIcon />}
        label={selectedProject ? selectedProject.getDisplayName() : 'Select project'}
        size={size}
        variant={selectedProject ? 'outlined' : 'filled'}
        color={selectedProject ? 'success' : 'default'}
        onClick={editable ? handleOpen : undefined}
        onDelete={editable ? handleOpen : undefined}
        deleteIcon={editable ? <EditIcon /> : undefined}
        sx={{ cursor: editable ? 'pointer' : 'default' }}
      />

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <FolderIcon color="success" />
          Select Project
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
              placeholder="Search projects..."
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
              />
            ))}
            {projects.length === 0 && (
              <ListItemText
                primary="No projects found"
                sx={{ px: 2, py: 1, color: 'text.secondary' }}
              />
            )}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProjectPicker;
