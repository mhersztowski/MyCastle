import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Chip,
  Typography,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tooltip,
  SelectChangeEvent,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import EventIcon from '@mui/icons-material/Event';
import SearchIcon from '@mui/icons-material/Search';
import { DataSource } from '../modules/filesystem/data/DataSource';
import { PersonNode } from '../modules/filesystem/nodes/PersonNode';
import { TaskNode } from '../modules/filesystem/nodes/TaskNode';
import { ProjectNode } from '../modules/filesystem/nodes/ProjectNode';
import { EventNode } from '../modules/filesystem/nodes/EventNode';
import { v4 as uuidv4 } from 'uuid';

export type ObjectType = 'person' | 'task' | 'project' | 'event';
export type ConditionOperator = 'and' | 'or' | 'not';

export interface SearchCondition {
  id: string;
  field: string;
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith';
  value: string;
}

export interface SearchGroup {
  id: string;
  operator: ConditionOperator;
  conditions: SearchCondition[];
}

export type SearchResult = PersonNode | TaskNode | ProjectNode | EventNode;

interface ObjectSearchProps {
  dataSource: DataSource;
  onResultsChange?: (results: SearchResult[]) => void;
  showResults?: boolean;
}

const OBJECT_TYPE_CONFIG: Record<ObjectType, { label: string; icon: React.ReactNode; fields: string[] }> = {
  person: {
    label: 'Person',
    icon: <PersonIcon />,
    fields: ['id', 'nick', 'firstName', 'secondName', 'description'],
  },
  task: {
    label: 'Task',
    icon: <TaskIcon />,
    fields: ['id', 'name', 'description', 'projectId'],
  },
  project: {
    label: 'Project',
    icon: <FolderIcon />,
    fields: ['id', 'name', 'description'],
  },
  event: {
    label: 'Event',
    icon: <EventIcon />,
    fields: ['name', 'description', 'taskId', 'startTime', 'endTime'],
  },
};


const ObjectSearch: React.FC<ObjectSearchProps> = ({ dataSource, onResultsChange, showResults = true }) => {
  const [objectType, setObjectType] = useState<ObjectType>('person');
  const [groups, setGroups] = useState<SearchGroup[]>([
    { id: uuidv4(), operator: 'and', conditions: [] },
  ]);

  const addCondition = useCallback((groupId: string) => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? {
              ...group,
              conditions: [
                ...group.conditions,
                {
                  id: uuidv4(),
                  field: OBJECT_TYPE_CONFIG[objectType].fields[0],
                  operator: 'contains' as const,
                  value: '',
                },
              ],
            }
          : group
      )
    );
  }, [objectType]);

  const removeCondition = useCallback((groupId: string, conditionId: string) => {
    setGroups(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, conditions: group.conditions.filter(c => c.id !== conditionId) }
          : group
      )
    );
  }, []);

  const updateCondition = useCallback(
    (groupId: string, conditionId: string, updates: Partial<SearchCondition>) => {
      setGroups(prev =>
        prev.map(group =>
          group.id === groupId
            ? {
                ...group,
                conditions: group.conditions.map(c =>
                  c.id === conditionId ? { ...c, ...updates } : c
                ),
              }
            : group
        )
      );
    },
    []
  );

  const addGroup = useCallback(() => {
    setGroups(prev => [...prev, { id: uuidv4(), operator: 'and', conditions: [] }]);
  }, []);

  const removeGroup = useCallback((groupId: string) => {
    setGroups(prev => (prev.length > 1 ? prev.filter(g => g.id !== groupId) : prev));
  }, []);

  const updateGroupOperator = useCallback((groupId: string, operator: ConditionOperator) => {
    setGroups(prev =>
      prev.map(group => (group.id === groupId ? { ...group, operator } : group))
    );
  }, []);

  const getObjectValue = useCallback((obj: SearchResult, field: string): string => {
    const value = (obj as unknown as Record<string, unknown>)[field];
    return value !== undefined && value !== null ? String(value) : '';
  }, []);

  const matchesCondition = useCallback(
    (obj: SearchResult, condition: SearchCondition): boolean => {
      const value = getObjectValue(obj, condition.field).toLowerCase();
      const searchValue = condition.value.toLowerCase();

      switch (condition.operator) {
        case 'contains':
          return value.includes(searchValue);
        case 'equals':
          return value === searchValue;
        case 'startsWith':
          return value.startsWith(searchValue);
        case 'endsWith':
          return value.endsWith(searchValue);
        default:
          return false;
      }
    },
    [getObjectValue]
  );

  const matchesGroup = useCallback(
    (obj: SearchResult, group: SearchGroup): boolean => {
      if (group.conditions.length === 0) return true;

      const results = group.conditions.map(condition => matchesCondition(obj, condition));

      switch (group.operator) {
        case 'and':
          return results.every(r => r);
        case 'or':
          return results.some(r => r);
        case 'not':
          return !results.every(r => r);
        default:
          return true;
      }
    },
    [matchesCondition]
  );

  const results = useMemo(() => {
    let items: SearchResult[] = [];

    switch (objectType) {
      case 'person':
        items = dataSource.persons;
        break;
      case 'task':
        items = dataSource.tasks;
        break;
      case 'project':
        items = dataSource.getAllProjectsFlat();
        break;
      case 'event':
        items = dataSource.events;
        break;
    }

    const hasConditions = groups.some(g => g.conditions.length > 0);
    if (!hasConditions) {
      onResultsChange?.(items);
      return items;
    }

    const filtered = items.filter(item => groups.every(group => matchesGroup(item, group)));
    onResultsChange?.(filtered);
    return filtered;
  }, [objectType, dataSource, groups, matchesGroup, onResultsChange]);

  const handleObjectTypeChange = (event: SelectChangeEvent<ObjectType>) => {
    setObjectType(event.target.value as ObjectType);
    setGroups([{ id: uuidv4(), operator: 'and', conditions: [] }]);
  };

  const getResultIcon = (item: SearchResult) => {
    if (item instanceof PersonNode) return <PersonIcon />;
    if (item instanceof TaskNode) return <TaskIcon />;
    if (item instanceof ProjectNode) return <FolderIcon />;
    if (item instanceof EventNode) return <EventIcon />;
    return null;
  };

  const getResultPrimary = (item: SearchResult): string => {
    if (item instanceof PersonNode) return item.nick;
    if (item instanceof TaskNode) return item.name;
    if (item instanceof ProjectNode) return item.name;
    if (item instanceof EventNode) return item.name;
    return '';
  };

  const getResultSecondary = (item: SearchResult): string => {
    if (item instanceof PersonNode) {
      const parts = [item.firstName, item.secondName].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : '';
    }
    if (item instanceof TaskNode) return item.description || '';
    if (item instanceof ProjectNode) return item.description || '';
    if (item instanceof EventNode) return item.description || '';
    return '';
  };

  const getResultKey = (item: SearchResult, index: number): string => {
    if (item instanceof PersonNode) return item.id;
    if (item instanceof TaskNode) return item.id;
    if (item instanceof ProjectNode) return item.id;
    return `event-${index}`;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Object Type Selector */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <SearchIcon color="primary" />
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Object Type</InputLabel>
            <Select
              value={objectType}
              label="Object Type"
              onChange={handleObjectTypeChange}
            >
              {Object.entries(OBJECT_TYPE_CONFIG).map(([key, config]) => (
                <MenuItem key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {config.icon}
                    {config.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="body2" color="text.secondary">
            {results.length} results
          </Typography>
        </Box>
      </Paper>

      {/* Search Groups */}
      {groups.map((group, groupIndex) => (
        <Paper key={group.id} sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {groupIndex > 0 && (
              <Chip label="AND" size="small" color="primary" sx={{ mr: 1 }} />
            )}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <Select
                value={group.operator}
                onChange={e => updateGroupOperator(group.id, e.target.value as ConditionOperator)}
              >
                <MenuItem value="and">AND</MenuItem>
                <MenuItem value="or">OR</MenuItem>
                <MenuItem value="not">NOT</MenuItem>
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              Group {groupIndex + 1}
            </Typography>
            <Tooltip title="Add condition">
              <IconButton size="small" onClick={() => addCondition(group.id)}>
                <AddIcon />
              </IconButton>
            </Tooltip>
            {groups.length > 1 && (
              <Tooltip title="Remove group">
                <IconButton size="small" color="error" onClick={() => removeGroup(group.id)}>
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {group.conditions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              No conditions (matches all)
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.conditions.map((condition, condIndex) => (
                <Box key={condition.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {condIndex > 0 && (
                    <Chip
                      label={group.operator.toUpperCase()}
                      size="small"
                      variant="outlined"
                      sx={{ minWidth: 50 }}
                    />
                  )}
                  {condIndex === 0 && <Box sx={{ minWidth: 50 }} />}
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      value={condition.field}
                      onChange={e =>
                        updateCondition(group.id, condition.id, { field: e.target.value })
                      }
                    >
                      {OBJECT_TYPE_CONFIG[objectType].fields.map(field => (
                        <MenuItem key={field} value={field}>
                          {field}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      value={condition.operator}
                      onChange={e =>
                        updateCondition(group.id, condition.id, {
                          operator: e.target.value as SearchCondition['operator'],
                        })
                      }
                    >
                      <MenuItem value="contains">contains</MenuItem>
                      <MenuItem value="equals">equals</MenuItem>
                      <MenuItem value="startsWith">starts with</MenuItem>
                      <MenuItem value="endsWith">ends with</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    placeholder="Value"
                    value={condition.value}
                    onChange={e =>
                      updateCondition(group.id, condition.id, { value: e.target.value })
                    }
                    sx={{ flexGrow: 1 }}
                  />
                  <Tooltip title="Remove condition">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeCondition(group.id, condition.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
        </Paper>
      ))}

      {/* Add Group Button */}
      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={addGroup}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add Group
      </Button>

      {/* Results */}
      {showResults && (
        <Paper sx={{ flexGrow: 1, overflow: 'auto', maxHeight: 400 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle1">
              Results ({results.length})
            </Typography>
          </Box>
          {results.length > 0 ? (
            <List dense>
              {results.map((item, index) => (
                <React.Fragment key={getResultKey(item, index)}>
                  {index > 0 && <Divider />}
                  <ListItem>
                    <ListItemIcon>{getResultIcon(item)}</ListItemIcon>
                    <ListItemText
                      primary={getResultPrimary(item)}
                      secondary={getResultSecondary(item)}
                    />
                  </ListItem>
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No results found</Typography>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default ObjectSearch;
