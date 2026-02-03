import React from 'react';
import { Chip, Skeleton } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import { useFilesystem } from '../../modules/filesystem';

interface ProjectLabelProps {
  id: string;
  size?: 'small' | 'medium';
}

const ProjectLabel: React.FC<ProjectLabelProps> = ({ id, size = 'medium' }) => {
  const { dataSource, isDataLoaded } = useFilesystem();

  const project = React.useMemo(() => {
    if (!isDataLoaded) return null;
    return dataSource.findProjectByIdDeep(id) || null;
  }, [dataSource, isDataLoaded, id]);

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={80} height={size === 'small' ? 24 : 32} />;
  }

  if (!project) {
    return (
      <Chip
        icon={<FolderIcon />}
        label="Unknown"
        size={size}
        variant="outlined"
        color="error"
      />
    );
  }

  return (
    <Chip
      icon={<FolderIcon />}
      label={project.getDisplayName()}
      size={size}
      variant="outlined"
      color="success"
    />
  );
};

export default ProjectLabel;
