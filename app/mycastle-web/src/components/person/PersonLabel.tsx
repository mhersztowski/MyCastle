import React from 'react';
import { Chip, Skeleton } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { useFilesystem } from '../../modules/filesystem';

interface PersonLabelProps {
  id: string;
  size?: 'small' | 'medium';
}

const PersonLabel: React.FC<PersonLabelProps> = ({ id, size = 'medium' }) => {
  const { dataSource, isDataLoaded } = useFilesystem();

  const person = React.useMemo(() => {
    if (!isDataLoaded) return null;
    return dataSource.getPersonById(id) || null;
  }, [dataSource, isDataLoaded, id]);

  if (!isDataLoaded) {
    return <Skeleton variant="rounded" width={80} height={size === 'small' ? 24 : 32} />;
  }

  if (!person) {
    return (
      <Chip
        icon={<PersonIcon />}
        label="Unknown"
        size={size}
        variant="outlined"
        color="error"
      />
    );
  }

  return (
    <Chip
      icon={<PersonIcon />}
      label={person.getDisplayName()}
      size={size}
      variant="outlined"
      color="primary"
    />
  );
};

export default PersonLabel;
