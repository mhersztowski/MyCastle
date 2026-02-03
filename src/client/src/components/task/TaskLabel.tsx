import React from 'react';
import { Chip, Skeleton } from '@mui/material';
import TaskIcon from '@mui/icons-material/Task';
import { useFilesystem } from '../../modules/filesystem';

interface TaskLabelProps {
  id: string;
  size?: 'small' | 'medium';
}

const TaskLabel: React.FC<TaskLabelProps> = ({ id, size = 'medium' }) => {
  const { dataSource, isDataLoaded } = useFilesystem();

  const task = React.useMemo(() => {
    if (!isDataLoaded) return null;
    return dataSource.getTaskById(id) || null;
  }, [dataSource, isDataLoaded, id]);

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={80} height={size === 'small' ? 24 : 32} />;
  }

  if (!task) {
    return (
      <Chip
        icon={<TaskIcon />}
        label="Unknown"
        size={size}
        variant="outlined"
        color="error"
      />
    );
  }

  return (
    <Chip
      icon={<TaskIcon />}
      label={task.getDisplayName()}
      size={size}
      variant="outlined"
      color="secondary"
    />
  );
};

export default TaskLabel;
