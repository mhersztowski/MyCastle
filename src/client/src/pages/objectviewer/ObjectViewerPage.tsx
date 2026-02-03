import React, { useState, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import PersonIcon from '@mui/icons-material/Person';
import TaskIcon from '@mui/icons-material/Task';
import FolderIcon from '@mui/icons-material/Folder';
import EventIcon from '@mui/icons-material/Event';
import CloseIcon from '@mui/icons-material/Close';
import { useMqtt } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem';
import ObjectSearch, { SearchResult } from '../../components/ObjectSearch';
import { PersonNode } from '../../modules/filesystem/nodes/PersonNode';
import { TaskNode } from '../../modules/filesystem/nodes/TaskNode';
import { ProjectNode } from '../../modules/filesystem/nodes/ProjectNode';
import { EventNode } from '../../modules/filesystem/nodes/EventNode';

const ObjectViewerPage: React.FC = () => {
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource, isLoading, isDataLoaded, error } = useFilesystem();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);

  const handleResultsChange = useCallback((newResults: SearchResult[]) => {
    setResults(newResults);
  }, []);

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

  const renderItemDetails = (item: SearchResult) => {
    if (item instanceof PersonNode) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography><strong>ID:</strong> {item.id}</Typography>
          <Typography><strong>Nick:</strong> {item.nick}</Typography>
          {item.firstName && <Typography><strong>First Name:</strong> {item.firstName}</Typography>}
          {item.secondName && <Typography><strong>Second Name:</strong> {item.secondName}</Typography>}
          {item.description && <Typography><strong>Description:</strong> {item.description}</Typography>}
        </Box>
      );
    }
    if (item instanceof TaskNode) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography><strong>ID:</strong> {item.id}</Typography>
          <Typography><strong>Name:</strong> {item.name}</Typography>
          {item.description && <Typography><strong>Description:</strong> {item.description}</Typography>}
          {item.projectId && <Typography><strong>Project ID:</strong> {item.projectId}</Typography>}
          {item.duration && <Typography><strong>Duration:</strong> {item.duration}h</Typography>}
          {item.cost && <Typography><strong>Cost:</strong> {item.cost}</Typography>}
        </Box>
      );
    }
    if (item instanceof ProjectNode) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography><strong>ID:</strong> {item.id}</Typography>
          <Typography><strong>Name:</strong> {item.name}</Typography>
          {item.description && <Typography><strong>Description:</strong> {item.description}</Typography>}
          {item.cost && <Typography><strong>Cost:</strong> {item.cost}</Typography>}
          <Typography><strong>Path:</strong> {item.getPath().join(' > ')}</Typography>
        </Box>
      );
    }
    if (item instanceof EventNode) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography><strong>Name:</strong> {item.name}</Typography>
          {item.description && <Typography><strong>Description:</strong> {item.description}</Typography>}
          {item.taskId && <Typography><strong>Task ID:</strong> {item.taskId}</Typography>}
          <Typography><strong>Start:</strong> {item.startTime}</Typography>
          <Typography><strong>End:</strong> {item.endTime}</Typography>
        </Box>
      );
    }
    return null;
  };

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
          <ManageSearchIcon color="primary" sx={{ fontSize: 28 }} />
          <Typography variant="h6">Object Viewer</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
            Search and browse objects in DataSource
          </Typography>
        </Box>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading state */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, overflow: 'hidden' }}>
          {/* Search Panel */}
          <Box sx={{ width: '50%', overflow: 'auto' }}>
            <ObjectSearch
              dataSource={dataSource}
              onResultsChange={handleResultsChange}
              showResults={false}
            />
          </Box>

          {/* Results Panel */}
          <Paper sx={{ width: '50%', overflow: 'auto' }}>
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
                    <ListItem
                      component="div"
                      onClick={() => setSelectedItem(item)}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
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
        </Box>
      )}

      {/* Item Details Dialog */}
      <Dialog
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedItem && getResultIcon(selectedItem)}
          {selectedItem && getResultPrimary(selectedItem)}
          <IconButton
            onClick={() => setSelectedItem(null)}
            sx={{ ml: 'auto' }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItem && renderItemDetails(selectedItem)}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default ObjectViewerPage;
