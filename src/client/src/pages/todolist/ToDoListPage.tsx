import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Divider,
  IconButton,
  Tooltip,
} from '@mui/material';
import ChecklistIcon from '@mui/icons-material/Checklist';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import DoneIcon from '@mui/icons-material/Done';
import dayjs from 'dayjs';
import { useMqtt } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem';
import { TaskNode } from '../../modules/filesystem/nodes';
import { EventModel, EventsModel } from '../../modules/filesystem/models/EventModel';

interface TaskWithOverdue {
  task: TaskNode;
  daysInterval: number;
  daysSinceLastEvent: number | null;
  lastEventDate: string | null;
}

const ToDoListPage: React.FC = () => {
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource, isLoading, isDataLoaded, error, writeFile, loadAllData } = useFilesystem();
  const [selectedTab, setSelectedTab] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Tab types: 'delayed', 'in1day', 'in3days'
  const tabTypes = ['delayed', 'in1day', 'in3days'] as const;

  // Get tasks with interval component and calculate overdue status
  const tasksWithOverdue = useMemo((): TaskWithOverdue[] => {
    const result: TaskWithOverdue[] = [];

    for (const task of dataSource.tasks) {
      if (!task.hasInterval()) continue;

      const daysInterval = task.getDaysInterval();
      if (daysInterval === null) continue;

      const lastEvent = dataSource.getLastEventByTaskId(task.id);
      let daysSinceLastEvent: number | null = null;
      let lastEventDate: string | null = null;

      if (lastEvent) {
        const eventDate = lastEvent.getStartDate();
        if (eventDate) {
          daysSinceLastEvent = dayjs().diff(eventDate, 'day');
          lastEventDate = eventDate.format('YYYY-MM-DD HH:mm');
        }
      }

      result.push({
        task,
        daysInterval,
        daysSinceLastEvent,
        lastEventDate,
      });
    }

    // Sort by overdue priority (most overdue first)
    return result.sort((a, b) => {
      const aOverdue = a.daysSinceLastEvent !== null ? a.daysSinceLastEvent - a.daysInterval : Infinity;
      const bOverdue = b.daysSinceLastEvent !== null ? b.daysSinceLastEvent - b.daysInterval : Infinity;
      return bOverdue - aOverdue;
    });
  }, [dataSource.tasks, dataSource.events]);

  // Filter tasks for selected tab
  const filteredTasks = useMemo(() => {
    const tabType = tabTypes[selectedTab];

    return tasksWithOverdue.filter(item => {
      // Never executed - show in all tabs
      if (item.daysSinceLastEvent === null) return true;

      const daysUntilDue = item.daysInterval - item.daysSinceLastEvent;

      switch (tabType) {
        case 'delayed':
          // Only show overdue tasks (daysUntilDue <= 0)
          return daysUntilDue <= 0;
        case 'in1day':
          // Show tasks due within 1 day (daysUntilDue <= 1)
          return daysUntilDue <= 1;
        case 'in3days':
          // Show tasks due within 3 days (daysUntilDue <= 3)
          return daysUntilDue <= 3;
        default:
          return true;
      }
    });
  }, [tasksWithOverdue, selectedTab]);

  const getOverdueStatus = (item: TaskWithOverdue): 'overdue' | 'due' | 'ok' | 'never' => {
    if (item.daysSinceLastEvent === null) return 'never';
    if (item.daysSinceLastEvent >= item.daysInterval) return 'overdue';
    if (item.daysSinceLastEvent >= item.daysInterval - 1) return 'due';
    return 'ok';
  };

  const getStatusColor = (status: string): 'error' | 'warning' | 'success' | 'default' => {
    switch (status) {
      case 'overdue': return 'error';
      case 'due': return 'warning';
      case 'never': return 'default';
      default: return 'success';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'overdue': return <ErrorIcon color="error" />;
      case 'due': return <WarningIcon color="warning" />;
      case 'never': return <TaskAltIcon color="disabled" />;
      default: return <TaskAltIcon color="success" />;
    }
  };

  const getProjectPath = useCallback((task: TaskNode): string => {
    if (!task.projectId) return '';
    const project = dataSource.findProjectByIdDeep(task.projectId);
    if (!project) return '';
    return project.getPath().join('.');
  }, [dataSource]);

  const handleDone = useCallback(async (task: TaskNode) => {
    setSaving(task.id);
    setSaveError(null);

    try {
      const now = dayjs();
      const dateStr = now.format('YYYY-MM-DD');
      const [year, month, day] = dateStr.split('-');

      // Build event name from project path + task name
      const projectPath = getProjectPath(task);
      const eventName = projectPath ? `${projectPath}.${task.name}` : task.name;

      // Calculate end time based on task duration (in hours)
      const endTime = task.duration ? now.add(task.duration, 'hour') : now;

      // Create the event model
      const newEvent: EventModel = {
        type: 'event',
        name: eventName,
        description: task.description,
        taskId: task.id,
        startTime: now.toISOString(),
        endTime: endTime.toISOString(),
      };

      // Build file path
      const filePath = `data/calendar/${year}/${month}/${day}.json`;

      // Get existing events for this day
      const existingEvents = dataSource.events
        .filter(e => {
          const eventDate = e.getStartDate();
          return eventDate && eventDate.format('YYYY-MM-DD') === dateStr;
        })
        .map(e => e.toModel());

      // Add new event
      const eventsModel: EventsModel = {
        type: 'events',
        tasks: [...existingEvents, newEvent],
      };

      // Save to filesystem
      await writeFile(filePath, JSON.stringify(eventsModel, null, 2));

      // Reload data to get the new event
      await loadAllData();

    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save event');
    } finally {
      setSaving(null);
    }
  }, [dataSource.events, writeFile, loadAllData, getProjectPath]);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Connecting to server...</Typography>
      </Box>
    );
  }

  if (!isConnected) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          Not connected to server. Please check if the backend is running.
        </Alert>
      </Box>
    );
  }

  const loading = isLoading && !isDataLoaded;

  return (
    <Box sx={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', p: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ChecklistIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h6">
            To-Do List
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
            ({tasksWithOverdue.length} recurring tasks)
          </Typography>
        </Box>
      </Paper>

      {/* Error */}
      {(error || saveError) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>
          {error || saveError}
        </Alert>
      )}

      {/* Tabs */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedTab}
          onChange={(_, newValue) => setSelectedTab(newValue)}
          variant="fullWidth"
        >
          <Tab label={`Delayed (${tasksWithOverdue.filter(t => t.daysSinceLastEvent === null || t.daysSinceLastEvent >= t.daysInterval).length})`} />
          <Tab label={`In 1 day (${tasksWithOverdue.filter(t => t.daysSinceLastEvent === null || t.daysSinceLastEvent >= t.daysInterval - 1).length})`} />
          <Tab label={`In 3 days (${tasksWithOverdue.filter(t => t.daysSinceLastEvent === null || t.daysSinceLastEvent >= t.daysInterval - 3).length})`} />
        </Tabs>
      </Paper>

      {/* Loading state */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        /* Task List */
        <Paper sx={{ flexGrow: 1, overflow: 'auto' }}>
          {filteredTasks.length > 0 ? (
            <List>
              {filteredTasks.map((item, index) => {
                const status = getOverdueStatus(item);
                const projectPath = getProjectPath(item.task);

                return (
                  <React.Fragment key={item.task.id}>
                    {index > 0 && <Divider />}
                    <ListItem
                      sx={{
                        bgcolor: status === 'overdue' ? 'error.light' + '20' :
                                 status === 'due' ? 'warning.light' + '20' :
                                 status === 'never' ? 'grey.100' : 'transparent',
                      }}
                    >
                      <ListItemIcon>
                        {getStatusIcon(status)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle1" fontWeight={500}>
                              {item.task.name}
                            </Typography>
                            <Chip
                              label={`every ${item.daysInterval}d`}
                              size="small"
                              variant="outlined"
                            />
                            {item.task.hasDuration() && (
                              <Chip
                                label={item.task.getDurationFormatted()}
                                size="small"
                                variant="outlined"
                                color="info"
                              />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                            {projectPath && (
                              <Typography variant="body2" color="text.secondary">
                                {projectPath}
                              </Typography>
                            )}
                            <Typography variant="body2" color="text.secondary">
                              {item.lastEventDate
                                ? `Last: ${item.lastEventDate} (${item.daysSinceLastEvent} days ago)`
                                : 'Never executed'}
                            </Typography>
                          </Box>
                        }
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={
                            status === 'overdue'
                              ? `${(item.daysSinceLastEvent ?? 0) - item.daysInterval} days overdue`
                              : status === 'due'
                              ? 'Due soon'
                              : status === 'never'
                              ? 'Never done'
                              : 'OK'
                          }
                          color={getStatusColor(status)}
                          size="small"
                        />
                        <Tooltip title="Mark as done">
                          <IconButton
                            color="success"
                            onClick={() => handleDone(item.task)}
                            disabled={saving === item.task.id}
                            size="small"
                          >
                            {saving === item.task.id ? (
                              <CircularProgress size={20} />
                            ) : (
                              <DoneIcon />
                            )}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </ListItem>
                  </React.Fragment>
                );
              })}
            </List>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <TaskAltIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
              <Typography color="text.secondary">
                No tasks due in this time frame.
              </Typography>
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default ToDoListPage;
