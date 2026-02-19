import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Typography,
  TextField,
  InputAdornment,
  CircularProgress,
} from '@mui/material';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PostAddIcon from '@mui/icons-material/PostAdd';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import type { editor } from 'monaco-editor';
import { DirectoryTree } from '../../modules/mqttclient';
import { generateUUID } from '../../utils/JsonSchemaUtils';
import SchemaBrowser, { SchemaBrowserResult } from '../SchemaBrowser';

interface JsonActionsToolbarProps {
  editor: editor.IStandaloneCodeEditor | null;
  directoryTree: DirectoryTree | null;
  onLoadDirectory?: () => Promise<void>;
  sx?: object;
}

interface TreeItemProps {
  item: DirectoryTree;
  onSelect: (path: string) => void;
  level: number;
  filter: string;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}

const matchesFilter = (item: DirectoryTree, filter: string): boolean => {
  if (!filter) return true;
  const lowerFilter = filter.toLowerCase();

  if (item.name.toLowerCase().includes(lowerFilter)) return true;
  if (item.path.toLowerCase().includes(lowerFilter)) return true;

  if (item.children) {
    return item.children.some(child => matchesFilter(child, filter));
  }

  return false;
};

const TreeItem: React.FC<TreeItemProps> = ({
  item,
  onSelect,
  level,
  filter,
  expandedPaths,
  toggleExpanded,
}) => {
  const isExpanded = expandedPaths.has(item.path);
  const hasChildren = item.children && item.children.length > 0;
  const isDirectory = item.type === 'directory';

  if (!matchesFilter(item, filter)) return null;

  const filteredChildren = item.children?.filter(child => matchesFilter(child, filter));

  return (
    <>
      <ListItemButton
        onClick={() => {
          if (isDirectory && hasChildren) {
            toggleExpanded(item.path);
          } else if (!isDirectory) {
            onSelect(item.path);
          }
        }}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            isExpanded ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <InsertDriveFileIcon color="action" />
          )}
        </ListItemIcon>
        <ListItemText
          primary={item.name}
          secondary={!isDirectory ? item.path : undefined}
          primaryTypographyProps={{
            fontSize: '0.875rem',
            fontWeight: isDirectory ? 500 : 400,
          }}
          secondaryTypographyProps={{
            fontSize: '0.75rem',
            noWrap: true,
          }}
        />
        {isDirectory && hasChildren && (
          isExpanded ? <ExpandLess /> : <ExpandMore />
        )}
      </ListItemButton>
      {isDirectory && hasChildren && (
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {filteredChildren?.map(child => (
              <TreeItem
                key={child.path}
                item={child}
                onSelect={onSelect}
                level={level + 1}
                filter={filter}
                expandedPaths={expandedPaths}
                toggleExpanded={toggleExpanded}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const JsonActionsToolbar: React.FC<JsonActionsToolbarProps> = ({
  editor,
  directoryTree,
  onLoadDirectory,
  sx,
}) => {
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [schemaBrowserOpen, setSchemaBrowserOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // Expand root directory when file picker opens and directoryTree is available
  useEffect(() => {
    if (filePickerOpen && directoryTree) {
      setExpandedPaths(new Set([directoryTree.path.replace(/\\/g, '/')]));
    }
  }, [filePickerOpen, directoryTree]);

  const insertTextAtCursor = (text: string) => {
    if (!editor) return;

    const selection = editor.getSelection();
    const position = selection?.getStartPosition() || editor.getPosition();
    if (!position) return;

    editor.executeEdits('insert', [{
      range: {
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      },
      text,
      forceMoveMarkers: true,
    }]);

    editor.focus();
  };

  const handleInsertUUID = () => {
    const uuid = generateUUID();
    insertTextAtCursor(uuid);
  };

  const handleOpenFilePicker = async () => {
    setFilePickerOpen(true);
    if (!directoryTree && onLoadDirectory) {
      setLoading(true);
      try {
        await onLoadDirectory();
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSelectFile = (path: string) => {
    // Normalize path to use forward slashes
    const normalizedPath = path.replace(/\\/g, '/');
    insertTextAtCursor(`"${normalizedPath}"`);
    setFilePickerOpen(false);
    setFilter('');
  };

  const handleOpenSchemaBrowser = () => {
    setSchemaBrowserOpen(true);
  };

  const handleSchemaSelect = (result: SchemaBrowserResult) => {
    if (!editor) return;

    // Insert template at cursor position
    insertTextAtCursor(result.content);
  };

  const handleFormatJson = () => {
    if (!editor) return;

    // Use Monaco's built-in format action which works even with partially invalid JSON
    editor.getAction('editor.action.formatDocument')?.run();
    editor.focus();
  };

  const toggleExpanded = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!directoryTree) return;
    const paths = new Set<string>();
    const collectPaths = (item: DirectoryTree) => {
      if (item.type === 'directory') {
        paths.add(item.path);
        item.children?.forEach(collectPaths);
      }
    };
    collectPaths(directoryTree);
    setExpandedPaths(paths);
  };

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.5,
          px: 1,
          py: 0.5,
          bgcolor: 'grey.100',
          borderBottom: '1px solid',
          borderColor: 'divider',
          ...sx,
        }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
          JSON:
        </Typography>

        <Tooltip title="Insert UUID" arrow>
          <IconButton
            size="small"
            onClick={handleInsertUUID}
            sx={{
              borderRadius: 1,
              '&:hover': { bgcolor: 'grey.200' },
            }}
          >
            <FingerprintIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Insert file path" arrow>
          <IconButton
            size="small"
            onClick={handleOpenFilePicker}
            sx={{
              borderRadius: 1,
              '&:hover': { bgcolor: 'grey.200' },
            }}
          >
            <InsertDriveFileIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Browse schemas and insert template" arrow>
          <IconButton
            size="small"
            onClick={handleOpenSchemaBrowser}
            sx={{
              borderRadius: 1,
              '&:hover': { bgcolor: 'grey.200' },
            }}
          >
            <PostAddIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        <Tooltip title="Format JSON" arrow>
          <IconButton
            size="small"
            onClick={handleFormatJson}
            sx={{
              borderRadius: 1,
              '&:hover': { bgcolor: 'grey.200' },
            }}
          >
            <FormatIndentIncreaseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Dialog
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <InsertDriveFileIcon />
          Select File Path
          <Box sx={{ flexGrow: 1 }} />
          <IconButton size="small" onClick={() => setFilePickerOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Filter files..."
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                if (e.target.value) expandAll();
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Box>
          <Box sx={{ height: 400, overflow: 'auto' }}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
              </Box>
            ) : directoryTree ? (
              <List dense>
                <TreeItem
                  item={directoryTree}
                  onSelect={handleSelectFile}
                  level={0}
                  filter={filter}
                  expandedPaths={expandedPaths}
                  toggleExpanded={toggleExpanded}
                />
              </List>
            ) : (
              <Typography color="text.secondary" sx={{ p: 2 }}>
                No files available
              </Typography>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      <SchemaBrowser
        open={schemaBrowserOpen}
        onClose={() => setSchemaBrowserOpen(false)}
        onSelect={handleSchemaSelect}
      />
    </>
  );
};

export default JsonActionsToolbar;
