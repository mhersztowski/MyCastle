/**
 * Automate List Page - lista flow automatyzacji
 * Route: /automate
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Snackbar,
  Tooltip,
  Chip,
  Collapse,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';

import { automateService } from '../../modules/automate/services/AutomateService';
import { createFlow } from '@mhersztowski/core';
import { AutomateFlowNode } from '../../modules/automate/nodes';
import { useMqtt, DirectoryTree, mqttClient } from '../../modules/mqttclient';
import { v4 as uuidv4 } from 'uuid';

const FLOW_EXTENSION = '.automate.json';

// Filter tree to only show directories with .automate.json files
function filterFlowTree(tree: DirectoryTree): DirectoryTree | null {
  if (tree.type === 'file') {
    return tree.name.endsWith(FLOW_EXTENSION) ? tree : null;
  }

  const filteredChildren: DirectoryTree[] = [];
  if (tree.children) {
    for (const child of tree.children) {
      const filtered = filterFlowTree(child);
      if (filtered) {
        filteredChildren.push(filtered);
      }
    }
  }

  if (filteredChildren.length > 0) {
    return { ...tree, children: filteredChildren };
  }
  return null;
}

interface FlowTreeNodeProps {
  node: DirectoryTree;
  level: number;
  flowsMap: Map<string, AutomateFlowNode>;
  onNavigate: (flowId: string) => void;
  onDuplicate: (flowId: string) => void;
  onDelete: (flowId: string) => void;
}

// Directory picker tree node for selecting where to save new flow
interface DirTreeNodeProps {
  node: DirectoryTree;
  level: number;
  selectedPath: string;
  onSelect: (path: string) => void;
}

const DirTreeNode: React.FC<DirTreeNodeProps> = ({ node, level, selectedPath, onSelect }) => {
  const [open, setOpen] = useState(level < 2);

  if (node.type !== 'directory') return null;

  const isSelected = node.path === selectedPath;

  return (
    <>
      <ListItemButton
        onClick={() => onSelect(node.path)}
        selected={isSelected}
        sx={{ pl: 2 + level * 2, py: 0.5 }}
      >
        <ListItemIcon sx={{ minWidth: 32 }}>
          {open ? <FolderOpenIcon fontSize="small" color="primary" /> : <FolderIcon fontSize="small" color="primary" />}
        </ListItemIcon>
        <ListItemText
          primary={node.name || '/'}
          primaryTypographyProps={{ variant: 'body2' }}
        />
        {node.children && node.children.some(c => c.type === 'directory') && (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          >
            {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        )}
      </ListItemButton>

      {node.children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children
              .filter(c => c.type === 'directory')
              .map((child, index) => (
                <DirTreeNode
                  key={`${child.path}-${index}`}
                  node={child}
                  level={level + 1}
                  selectedPath={selectedPath}
                  onSelect={onSelect}
                />
              ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const FlowTreeNode: React.FC<FlowTreeNodeProps> = ({
  node,
  level,
  flowsMap,
  onNavigate,
  onDuplicate,
  onDelete,
}) => {
  const [open, setOpen] = useState(level < 2);

  const isDirectory = node.type === 'directory';
  const flow = !isDirectory ? flowsMap.get(node.path) : undefined;

  const handleClick = () => {
    if (isDirectory) {
      setOpen(!open);
    } else if (flow) {
      onNavigate(flow.id);
    }
  };

  return (
    <>
      <ListItemButton
        onClick={handleClick}
        sx={{ pl: 2 + level * 2, borderRadius: 1 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            open ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <AccountTreeIcon color="warning" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {isDirectory ? node.name : (flow?.name || node.name.replace(FLOW_EXTENSION, ''))}
              {!isDirectory && flow && (
                <Chip
                  label={`${flow.nodes?.length || 0} nodów`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 20, fontSize: '0.7rem' }}
                />
              )}
            </Box>
          }
          secondary={!isDirectory && flow?.description}
          primaryTypographyProps={{ variant: 'body2' }}
          secondaryTypographyProps={{ variant: 'caption' }}
        />
        {!isDirectory && flow && (
          <ListItemSecondaryAction>
            <Tooltip title="Otwórz w designerze">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onNavigate(flow.id); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Duplikuj">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate(flow.id); }}>
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Usuń">
              <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete(flow.id); }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </ListItemSecondaryAction>
        )}
        {isDirectory && node.children && node.children.length > 0 && (
          open ? <ExpandLess /> : <ExpandMore />
        )}
      </ListItemButton>

      {isDirectory && node.children && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {node.children.map((child, index) => (
              <FlowTreeNode
                key={`${child.path}-${index}`}
                node={child}
                level={level + 1}
                flowsMap={flowsMap}
                onNavigate={onNavigate}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const AutomateListPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected, isConnecting } = useMqtt();

  const [flows, setFlows] = useState<AutomateFlowNode[]>([]);
  const [flowTree, setFlowTree] = useState<DirectoryTree | null>(null);
  const [flowsMap, setFlowsMap] = useState<Map<string, AutomateFlowNode>>(new Map());
  const [loading, setLoading] = useState(true);
  const [newFlowDialogOpen, setNewFlowDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowPath, setNewFlowPath] = useState('data/automations');
  const [dirTree, setDirTree] = useState<DirectoryTree | null>(null);
  const [showDirPicker, setShowDirPicker] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  useEffect(() => {
    if (!isConnected) return;

    const loadFlows = async () => {
      setLoading(true);
      try {
        const loaded = await automateService.loadFlows();
        setFlows(loaded);

        // Build flows map (path -> flow)
        const map = new Map<string, AutomateFlowNode>();
        for (const f of loaded) {
          const path = automateService.getFlowPath(f.id);
          if (path) {
            map.set(path, f);
          }
        }
        setFlowsMap(map);

        // Load directory tree
        const tree = await mqttClient.listDirectory('');
        const filtered = filterFlowTree(tree);
        setFlowTree(filtered);
      } catch (err) {
        console.error('Failed to load flows:', err);
      } finally {
        setLoading(false);
      }
    };

    loadFlows();
  }, [isConnected]);

  // Load directory tree when dialog opens
  useEffect(() => {
    if (newFlowDialogOpen && !dirTree) {
      mqttClient.listDirectory('').then(tree => {
        setDirTree(tree);
      }).catch(err => {
        console.error('Failed to load directory tree:', err);
      });
    }
  }, [newFlowDialogOpen, dirTree]);

  const handleCreateFlow = useCallback(async () => {
    if (!newFlowName.trim()) return;

    const flowId = uuidv4();
    const newFlow = createFlow(flowId, newFlowName.trim());
    const customPath = `${newFlowPath}/${flowId}.automate.json`;
    await automateService.createFlow(newFlow, customPath);

    setNewFlowDialogOpen(false);
    setNewFlowName('');
    setNewFlowPath('data/automations');
    setShowDirPicker(false);
    navigate(`/designer/automate/${newFlow.id}`);
  }, [newFlowName, newFlowPath, navigate]);

  const reloadFlowsAndTree = useCallback(async () => {
    const loaded = automateService.getAllFlows();
    setFlows(loaded);

    // Rebuild flows map
    const map = new Map<string, AutomateFlowNode>();
    for (const f of loaded) {
      const path = automateService.getFlowPath(f.id);
      if (path) {
        map.set(path, f);
      }
    }
    setFlowsMap(map);

    // Reload directory tree
    try {
      const tree = await mqttClient.listDirectory('');
      const filtered = filterFlowTree(tree);
      setFlowTree(filtered);
    } catch (err) {
      console.error('Failed to reload tree:', err);
    }
  }, []);

  const handleDeleteFlow = useCallback(async (id: string) => {
    const deleted = await automateService.deleteFlow(id);
    if (deleted) {
      await reloadFlowsAndTree();
      setSnackbar({ open: true, message: 'Flow usunięty', severity: 'success' });
    }
  }, [reloadFlowsAndTree]);

  const handleDuplicateFlow = useCallback(async (id: string) => {
    const original = automateService.getFlowById(id);
    if (!original) return;

    const duplicate = await automateService.duplicateFlow(id, uuidv4(), `${original.name} (kopia)`);
    if (duplicate) {
      await reloadFlowsAndTree();
      setSnackbar({ open: true, message: 'Flow zduplikowany', severity: 'success' });
    }
  }, [reloadFlowsAndTree]);

  if (isConnecting) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isConnected) {
    return <Alert severity="warning">Nie połączono z serwerem.</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountTreeIcon color="primary" />
          <Typography variant="h5">Automate</Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setNewFlowDialogOpen(true)}
        >
          Nowy flow
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : !flowTree || flows.length === 0 ? (
        <Box sx={{ textAlign: 'center', mt: 8, color: 'text.secondary' }}>
          <AccountTreeIcon sx={{ fontSize: 64, mb: 2, color: 'action.disabled' }} />
          <Typography variant="h6" gutterBottom>Brak flow</Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            Utwórz nowy flow automatyzacji
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNewFlowDialogOpen(true)}>
            Nowy flow
          </Button>
        </Box>
      ) : (
        <List>
          <FlowTreeNode
            node={flowTree}
            level={0}
            flowsMap={flowsMap}
            onNavigate={(flowId) => navigate(`/designer/automate/${flowId}`)}
            onDuplicate={handleDuplicateFlow}
            onDelete={handleDeleteFlow}
          />
        </List>
      )}

      <Dialog open={newFlowDialogOpen} onClose={() => setNewFlowDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nowy flow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa flow"
            value={newFlowName}
            onChange={e => setNewFlowName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !showDirPicker) handleCreateFlow(); }}
            sx={{ mt: 1, mb: 2 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <FolderIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Lokalizacja:
            </Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {newFlowPath || '/'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CreateNewFolderIcon />}
              onClick={() => setShowDirPicker(!showDirPicker)}
            >
              {showDirPicker ? 'Ukryj' : 'Zmień'}
            </Button>
          </Box>

          <Collapse in={showDirPicker}>
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                maxHeight: 250,
                overflow: 'auto',
                mb: 1,
              }}
            >
              {dirTree ? (
                <List dense disablePadding>
                  <DirTreeNode
                    node={dirTree}
                    level={0}
                    selectedPath={newFlowPath}
                    onSelect={setNewFlowPath}
                  />
                </List>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
            </Box>
          </Collapse>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setNewFlowDialogOpen(false); setShowDirPicker(false); }}>Anuluj</Button>
          <Button onClick={handleCreateFlow} variant="contained" disabled={!newFlowName.trim()}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AutomateListPage;
