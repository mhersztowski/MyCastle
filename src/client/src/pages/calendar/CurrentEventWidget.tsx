import React, { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
} from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TaskIcon from '@mui/icons-material/Task';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { CurrentEvent } from './types';
import { useFilesystem } from '../../modules/filesystem';
import { TaskSequenceComponentModel } from '../../modules/filesystem/models/TaskModel';

dayjs.extend(duration);

interface CurrentEventWidgetProps {
  event: CurrentEvent;
  onStop: () => void;
}

const CurrentEventWidget: React.FC<CurrentEventWidgetProps> = ({
  event,
  onStop,
}) => {
  const { dataSource } = useFilesystem();
  const [elapsed, setElapsed] = useState('00:00:00');

  useEffect(() => {
    const updateElapsed = () => {
      const diff = dayjs().diff(event.startTime);
      const dur = dayjs.duration(diff);
      const hours = Math.floor(dur.asHours()).toString().padStart(2, '0');
      const minutes = dur.minutes().toString().padStart(2, '0');
      const seconds = dur.seconds().toString().padStart(2, '0');
      setElapsed(`${hours}:${minutes}:${seconds}`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [event.startTime]);

  const taskNode = event.taskId
    ? dataSource.getTaskById(event.taskId)
    : null;

  const taskName = taskNode?.getDisplayName() ?? null;

  const sequenceTasks = useMemo(() => {
    if (!taskNode?.components) return null;
    const seqComp = taskNode.components.find(
      (c): c is TaskSequenceComponentModel => c.type === 'task_sequence'
    );
    return seqComp?.tasks ?? null;
  }, [taskNode]);

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        bgcolor: 'success.light',
        color: 'success.contrastText',
        borderRadius: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            bgcolor: 'success.dark',
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.6 },
              '100%': { opacity: 1 },
            },
          }}
        >
          <PlayArrowIcon sx={{ color: 'white', fontSize: 28 }} />
        </Box>

        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.contrastText' }}>
            {event.name}
          </Typography>
          {event.description && (
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {event.description}
            </Typography>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <AccessTimeIcon fontSize="small" sx={{ opacity: 0.8 }} />
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Started: {event.startTime.format('HH:mm')}
            </Typography>
            {taskName && (
              <Chip
                icon={<TaskIcon />}
                label={taskName}
                size="small"
                sx={{
                  bgcolor: 'success.dark',
                  color: 'success.contrastText',
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
            )}
          </Box>
          {sequenceTasks && sequenceTasks.length > 0 && (
            <Box
              sx={{
                mt: 1,
                pl: 1,
                borderLeft: '2px solid',
                borderColor: 'success.dark',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 600, opacity: 0.9 }}>
                Sequence ({sequenceTasks.length})
              </Typography>
              {sequenceTasks.map((t, i) => (
                <Box key={t.id || i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TaskIcon sx={{ fontSize: 14, opacity: 0.8 }} />
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    {t.name || '(unnamed)'}
                  </Typography>
                  {t.description && (
                    <Typography variant="body2" sx={{ opacity: 0.7 }} noWrap>
                      — {t.description}
                    </Typography>
                  )}
                  {t.duration != null && (
                    <Chip
                      label={`${t.duration}h`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.7rem',
                        bgcolor: 'success.dark',
                        color: 'success.contrastText',
                      }}
                    />
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h4"
            sx={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: 'success.contrastText',
            }}
          >
            {elapsed}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            Duration
          </Typography>
        </Box>

        <Tooltip title="Stop Event">
          <IconButton
            onClick={onStop}
            sx={{
              bgcolor: 'error.main',
              color: 'white',
              width: 56,
              height: 56,
              '&:hover': {
                bgcolor: 'error.dark',
              },
            }}
          >
            <StopIcon sx={{ fontSize: 32 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
};

export default CurrentEventWidget;
