/**
 * Automate Designer Page - strona do projektowania flow automatyzacji
 * Route: /designer/automate/:id?
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Chip,
  Collapse,
} from '@mui/material';
import { useTheme, useMediaQuery } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveAsIcon from '@mui/icons-material/SaveAs';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';

import { AutomateDesigner } from '../../modules/automate/designer/AutomateDesigner';
import { AutomateDesignerProvider } from '../../modules/automate/designer/AutomateDesignerContext';
import { automateService } from '../../modules/automate/services/AutomateService';
import { AutomateFlowModel, createFlow } from '@mhersztowski/core';
import { useMqtt, DirectoryTree } from '../../modules/mqttclient';
import { useFilesystem } from '../../modules/filesystem/FilesystemContext';
import { v4 as uuidv4 } from 'uuid';

const FLOW_EXTENSION = '.automate.json';

// Filter tree to only show directories with .automate.json files and the files themselves
function filterFlowTree(tree: DirectoryTree): DirectoryTree | null {
  if (tree.type === 'file') {
    return tree.name.endsWith(FLOW_EXTENSION) ? tree : null;
  }

  // Directory: filter children
  const filteredChildren: DirectoryTree[] = [];
  if (tree.children) {
    for (const child of tree.children) {
      const filtered = filterFlowTree(child);
      if (filtered) {
        filteredChildren.push(filtered);
      }
    }
  }

  // Only return directory if it has flow files
  if (filteredChildren.length > 0) {
    return { ...tree, children: filteredChildren };
  }
  return null;
}

interface FlowTreeNodeProps {
  node: DirectoryTree;
  level: number;
  flowsMap: Map<string, AutomateFlowModel>;
  onSelect: (flow: AutomateFlowModel) => void;
}

const FlowTreeNode: React.FC<FlowTreeNodeProps> = ({ node, level, flowsMap, onSelect }) => {
  const [open, setOpen] = useState(level < 2);

  const isDirectory = node.type === 'directory';
  const flow = !isDirectory ? flowsMap.get(node.path) : undefined;

  const handleClick = () => {
    if (isDirectory) {
      setOpen(!open);
    } else if (flow) {
      onSelect(flow);
    }
  };

  return (
    <>
      <ListItemButton onClick={handleClick} sx={{ pl: 2 + level * 2 }}>
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            open ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <AccountTreeIcon color="warning" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={isDirectory ? node.name : (flow?.name || node.name.replace(FLOW_EXTENSION, ''))}
          secondary={!isDirectory && flow?.description}
          primaryTypographyProps={{ variant: 'body2', noWrap: true }}
          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
        />
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
                onSelect={onSelect}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

// Directory picker tree node for selecting where to save flow
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

const AutomateDesignerPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isConnected, isConnecting } = useMqtt();
  const { dataSource } = useFilesystem();

  const [flow, setFlow] = useState<AutomateFlowModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [newFlowDialogOpen, setNewFlowDialogOpen] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowPath, setNewFlowPath] = useState('data/automations');
  const [selectFlowDialogOpen, setSelectFlowDialogOpen] = useState(false);
  const [availableFlows, setAvailableFlows] = useState<AutomateFlowModel[]>([]);
  const [flowTree, setFlowTree] = useState<DirectoryTree | null>(null);
  const [flowsMap, setFlowsMap] = useState<Map<string, AutomateFlowModel>>(new Map());
  const [flowPath, setFlowPath] = useState<string | undefined>();
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false);
  const [saveAsPath, setSaveAsPath] = useState('');
  const [loadingTree, setLoadingTree] = useState(false);
  const [dirTree, setDirTree] = useState<DirectoryTree | null>(null);
  const [showNewFlowDirPicker, setShowNewFlowDirPicker] = useState(false);
  const [showSaveAsDirPicker, setShowSaveAsDirPicker] = useState(false);

  const freshFlowIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected) return;

    const loadFlow = async () => {
      if (id && freshFlowIdRef.current === id) {
        setLoading(false);
        return;
      }

      setLoading(true);

      if (!automateService.loaded) {
        await automateService.loadFlows();
      }

      if (id) {
        const flowNode = automateService.getFlowById(id);
        if (flowNode) {
          setFlow(flowNode.toModel());
          setFlowPath(automateService.getFlowPath(id));
        } else {
          setSnackbar({ open: true, message: `Nie znaleziono flow: ${id}`, severity: 'error' });
          setFlow(null);
          setFlowPath(undefined);
        }
      } else {
        setFlow(null);
        openSelectFlowDialog();
      }

      setLoading(false);
    };

    loadFlow();
  }, [id, isConnected]);

  const { listDirectory } = useMqtt();

  // Load directory tree for pickers
  const loadDirTree = useCallback(async () => {
    if (dirTree) return;
    try {
      const tree = await listDirectory('');
      setDirTree(tree);
    } catch (err) {
      console.error('Failed to load directory tree:', err);
    }
  }, [dirTree, listDirectory]);

  // Load dir tree when new flow dialog opens
  useEffect(() => {
    if (newFlowDialogOpen && !dirTree) {
      loadDirTree();
    }
  }, [newFlowDialogOpen, dirTree, loadDirTree]);

  // Load dir tree when save as dialog opens
  useEffect(() => {
    if (saveAsDialogOpen && !dirTree) {
      loadDirTree();
    }
  }, [saveAsDialogOpen, dirTree, loadDirTree]);

  const openSelectFlowDialog = useCallback(async () => {
    setSelectFlowDialogOpen(true);
    setLoadingTree(true);

    try {
      // Load flows if not loaded
      if (!automateService.loaded) {
        await automateService.loadFlows();
      }

      // Build flows map (path -> flow)
      const flows = automateService.getAllFlows();
      const map = new Map<string, AutomateFlowModel>();
      for (const f of flows) {
        const path = automateService.getFlowPath(f.id);
        if (path) {
          map.set(path, f.toModel());
        }
      }
      setFlowsMap(map);
      setAvailableFlows(flows.map(f => f.toModel()));

      // Load directory tree
      const tree = await listDirectory('');
      const filtered = filterFlowTree(tree);
      setFlowTree(filtered);
    } catch (err) {
      console.error('Failed to load flow tree:', err);
    } finally {
      setLoadingTree(false);
    }
  }, [listDirectory]);

  const handleSave = useCallback(async (flowToSave: AutomateFlowModel, customPath?: string) => {
    setSaving(true);
    try {
      await automateService.createFlow(flowToSave, customPath);

      if (freshFlowIdRef.current === flowToSave.id) {
        freshFlowIdRef.current = null;
      }

      // Update displayed path
      setFlowPath(automateService.getFlowPath(flowToSave.id));

      setSnackbar({ open: true, message: 'Flow zapisany', severity: 'success' });

      if (!id && flowToSave.id) {
        navigate(`/designer/automate/${flowToSave.id}`, { replace: true });
      }
    } catch (error) {
      setSnackbar({ open: true, message: `Błąd zapisu: ${error}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [id, navigate]);

  const handleSaveAs = useCallback(async () => {
    if (!flow || !saveAsPath.trim()) return;
    const selectedDir = saveAsPath.trim();
    const customPath = `${selectedDir}/${flow.id}.automate.json`;
    setSaveAsDialogOpen(false);
    setShowSaveAsDirPicker(false);
    await handleSave({ ...flow, updatedAt: new Date().toISOString() }, customPath);
    setSaveAsPath('');
  }, [flow, saveAsPath, handleSave]);

  const handleCreateNewFlow = async () => {
    if (!newFlowName.trim()) return;

    const flowId = uuidv4();
    const newFlow = createFlow(flowId, newFlowName.trim());
    freshFlowIdRef.current = newFlow.id;

    // Build custom path from selected directory
    const selectedDir = newFlowPath.trim() || 'data/automations';
    const customPath = `${selectedDir}/${flowId}.automate.json`;

    setFlow(newFlow);
    setLoading(false);
    setNewFlowDialogOpen(false);
    setSelectFlowDialogOpen(false);
    setNewFlowName('');
    setNewFlowPath('data/automations');
    setShowNewFlowDirPicker(false);
    navigate(`/designer/automate/${newFlow.id}`, { replace: true });

    // Save immediately to custom path
    await handleSave(newFlow, customPath);
  };

  const openSaveAsDialog = () => {
    // Extract directory from current path
    const currentDir = flowPath ? flowPath.substring(0, flowPath.lastIndexOf('/')) : 'data/automations';
    setSaveAsPath(currentDir);
    setShowSaveAsDirPicker(false);
    setSaveAsDialogOpen(true);
  };

  const handleSelectFlow = (selectedFlow: AutomateFlowModel) => {
    setFlow(selectedFlow);
    setFlowPath(automateService.getFlowPath(selectedFlow.id));
    setSelectFlowDialogOpen(false);
    navigate(`/designer/automate/${selectedFlow.id}`, { replace: true });
  };

  if (isConnecting) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Łączenie z serwerem...</Typography>
      </Box>
    );
  }

  if (!isConnected) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert severity="warning">Nie połączono z serwerem. Sprawdź czy backend jest uruchomiony.</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense">
          <IconButton edge="start" onClick={() => navigate('/automate')} sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          {!isMobile && <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />}
          <Typography
            variant="h6"
            component="div"
            sx={{ fontSize: isMobile ? '1rem' : undefined }}
            noWrap
          >
            {isMobile
              ? (flow?.name || 'Automate')
              : `Automate Designer${flow ? ` - ${flow.name}` : ''}`
            }
          </Typography>
          {flowPath && !isMobile && (
            <Tooltip title={flowPath}>
              <Chip
                icon={<FolderIcon />}
                label={flowPath.split('/').pop()}
                size="small"
                variant="outlined"
                sx={{ ml: 1, maxWidth: 200 }}
              />
            </Tooltip>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {flow && !isMobile && (
            <Tooltip title="Zapisz jako...">
              <IconButton size="small" onClick={openSaveAsDialog} sx={{ mr: 1 }}>
                <SaveAsIcon />
              </IconButton>
            </Tooltip>
          )}
          {saving && <CircularProgress size={20} sx={{ mr: 2 }} />}
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        {flow ? (
          <AutomateDesignerProvider initialFlow={flow} onChange={setFlow}>
            <AutomateDesigner
              initialFlow={flow}
              onChange={setFlow}
              onSave={handleSave}
              saving={saving}
              dataSource={dataSource}
            />
          </AutomateDesignerProvider>
        ) : (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <AccountTreeIcon sx={{ fontSize: 64, color: 'action.disabled' }} />
            <Typography color="text.secondary">Wybierz lub utwórz flow</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewFlowDialogOpen(true)}>
                Nowy flow
              </Button>
              <Button
                variant="outlined"
                onClick={openSelectFlowDialog}
              >
                Otwórz istniejący
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog open={newFlowDialogOpen} onClose={() => setNewFlowDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nowy flow</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Nazwa flow"
            value={newFlowName}
            onChange={e => setNewFlowName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newFlowName.trim() && !showNewFlowDirPicker) handleCreateNewFlow(); }}
            sx={{ mt: 1, mb: 2 }}
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <FolderIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Lokalizacja:
            </Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {newFlowPath || 'data/automations'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CreateNewFolderIcon />}
              onClick={() => setShowNewFlowDirPicker(!showNewFlowDirPicker)}
            >
              {showNewFlowDirPicker ? 'Ukryj' : 'Zmień'}
            </Button>
          </Box>

          <Collapse in={showNewFlowDirPicker}>
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
                    selectedPath={newFlowPath || 'data/automations'}
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
          <Button onClick={() => { setNewFlowDialogOpen(false); setShowNewFlowDirPicker(false); }}>Anuluj</Button>
          <Button onClick={handleCreateNewFlow} variant="contained" disabled={!newFlowName.trim()}>
            Utwórz
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={saveAsDialogOpen} onClose={() => setSaveAsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Zapisz jako</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, mb: 1 }}>
            <FolderIcon color="primary" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Lokalizacja:
            </Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {saveAsPath || 'data/automations'}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<CreateNewFolderIcon />}
              onClick={() => setShowSaveAsDirPicker(!showSaveAsDirPicker)}
            >
              {showSaveAsDirPicker ? 'Ukryj' : 'Zmień'}
            </Button>
          </Box>

          <Collapse in={showSaveAsDirPicker}>
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
                    selectedPath={saveAsPath || 'data/automations'}
                    onSelect={setSaveAsPath}
                  />
                </List>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
            </Box>
          </Collapse>

          <Typography variant="caption" color="text.secondary">
            Plik zostanie zapisany jako: {saveAsPath || 'data/automations'}/{flow?.id}.automate.json
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setSaveAsDialogOpen(false); setShowSaveAsDirPicker(false); }}>Anuluj</Button>
          <Button onClick={handleSaveAs} variant="contained" disabled={!saveAsPath.trim()}>
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={selectFlowDialogOpen}
        onClose={() => { if (flow) setSelectFlowDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Wybierz flow</DialogTitle>
        <DialogContent dividers sx={{ p: 0, minHeight: 300, maxHeight: 400, overflow: 'auto' }}>
          {loadingTree ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : !flowTree || availableFlows.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
              <Typography>Brak flow</Typography>
              <Typography variant="caption" color="text.secondary">
                Utwórz nowy flow lub dodaj pliki .automate.json do filesystem
              </Typography>
            </Box>
          ) : (
            <List component="nav" dense>
              <FlowTreeNode
                node={flowTree}
                level={0}
                flowsMap={flowsMap}
                onSelect={handleSelectFlow}
              />
            </List>
          )}
        </DialogContent>
        <DialogActions>
          {flow && <Button onClick={() => setSelectFlowDialogOpen(false)}>Anuluj</Button>}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setSelectFlowDialogOpen(false); setNewFlowDialogOpen(true); }}
          >
            Nowy flow
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AutomateDesignerPage;
