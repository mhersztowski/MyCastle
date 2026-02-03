import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  TextField,
  InputAdornment,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab,
  Divider,
  Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FolderIcon from '@mui/icons-material/Folder';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import CodeIcon from '@mui/icons-material/Code';
import DescriptionIcon from '@mui/icons-material/Description';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useFilesystem } from '../modules/filesystem';
import { DirData } from '../modules/filesystem/data/DirData';
import { FileData } from '../modules/filesystem/data/FileData';
import { generateTemplateFromSchema, JsonSchema } from '../utils/JsonSchemaUtils';

export type SchemaBrowserResult = {
  type: 'template' | 'schema';
  content: string;
  schemaPath: string;
};

interface SchemaBrowserProps {
  open: boolean;
  onClose: () => void;
  onSelect: (result: SchemaBrowserResult) => void;
}

interface TreeNodeProps {
  node: TreeItem;
  level: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  filter: string;
  expandedPaths: Set<string>;
  toggleExpanded: (path: string) => void;
}

interface TreeItem {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: TreeItem[];
}

const matchesFilter = (item: TreeItem, filter: string): boolean => {
  if (!filter) return true;
  const lowerFilter = filter.toLowerCase();

  if (item.name.toLowerCase().includes(lowerFilter)) return true;

  if (item.children) {
    return item.children.some(child => matchesFilter(child, filter));
  }

  return false;
};

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  level,
  selectedPath,
  onSelect,
  filter,
  expandedPaths,
  toggleExpanded,
}) => {
  const isExpanded = expandedPaths.has(node.path);
  const hasChildren = node.children && node.children.length > 0;
  const isDirectory = node.type === 'directory';
  const isSelected = selectedPath === node.path;

  if (!matchesFilter(node, filter)) return null;

  const filteredChildren = node.children?.filter(child => matchesFilter(child, filter));

  return (
    <>
      <ListItemButton
        onClick={() => {
          if (isDirectory && hasChildren) {
            toggleExpanded(node.path);
          } else if (!isDirectory) {
            onSelect(node.path);
          }
        }}
        selected={isSelected}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isDirectory ? (
            isExpanded ? <FolderOpenIcon color="primary" /> : <FolderIcon color="primary" />
          ) : (
            <InsertDriveFileIcon color={isSelected ? 'primary' : 'action'} />
          )}
        </ListItemIcon>
        <ListItemText
          primary={node.name}
          primaryTypographyProps={{
            fontSize: '0.875rem',
            fontWeight: isDirectory ? 500 : 400,
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
              <TreeNode
                key={child.path}
                node={child}
                level={level + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
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

const convertDirDataToTreeItem = (dirData: DirData): TreeItem => {
  const children: TreeItem[] = [];

  for (const subDir of dirData.getDirs()) {
    children.push(convertDirDataToTreeItem(subDir));
  }

  for (const file of dirData.getFiles()) {
    if (file.getName().endsWith('.json')) {
      children.push({
        name: file.getName(),
        path: file.getPath(),
        type: 'file',
      });
    }
  }

  return {
    name: dirData.getName(),
    path: dirData.getPath(),
    type: 'directory',
    children: children.length > 0 ? children : undefined,
  };
};

const SchemaBrowser: React.FC<SchemaBrowserProps> = ({ open, onClose, onSelect }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { rootDir, isDataLoaded } = useFilesystem();

  const [filter, setFilter] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedSchemaPath, setSelectedSchemaPath] = useState<string | null>(null);
  const [schemaContent, setSchemaContent] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [outputType, setOutputType] = useState<'template' | 'schema'>('template');
  const [mobileTab, setMobileTab] = useState(0);
  const [loadedSchemas, setLoadedSchemas] = useState<Map<string, object>>(new Map());

  const dataDir = rootDir?.getDirByName('data');
  const schemaDir = dataDir?.getDirByName('schema');
  const tree = schemaDir ? convertDirDataToTreeItem(schemaDir) : null;

  const loadAllSchemasFromDir = useCallback((dir: DirData, schemas: Map<string, object>) => {
    for (const file of dir.getFiles()) {
      if (file.getName().endsWith('.json') && file.getData().length > 0) {
        try {
          const content = file.toString();
          const parsed = JSON.parse(content);
          schemas.set(file.getPath(), parsed);
        } catch {
          // Ignore invalid JSON
        }
      }
    }
    for (const subDir of dir.getDirs()) {
      loadAllSchemasFromDir(subDir, schemas);
    }
  }, []);

  useEffect(() => {
    if (schemaDir && open) {
      const schemas = new Map<string, object>();
      loadAllSchemasFromDir(schemaDir, schemas);
      setLoadedSchemas(schemas);

      // Expand root schema directory by default
      setExpandedPaths(new Set([schemaDir.getPath()]));
    }
  }, [schemaDir, open, loadAllSchemasFromDir]);

  const handleSchemaSelect = useCallback((path: string) => {
    setSelectedSchemaPath(path);

    if (!rootDir) return;

    const fileData: FileData | undefined = rootDir.getFileByPath(path);
    if (!fileData || fileData.getData().length === 0) {
      setSchemaContent('');
      setTemplateContent('');
      return;
    }

    try {
      const content = fileData.toString();
      setSchemaContent(JSON.stringify(JSON.parse(content), null, 2));

      const schema = JSON.parse(content) as JsonSchema;
      const template = generateTemplateFromSchema(schema, loadedSchemas);

      // Normalize path to use forward slashes (Windows paths use backslashes)
      const normalizedPath = path.replace(/\\/g, '/');
      const schemaRef = normalizedPath.startsWith('data/')
        ? normalizedPath.slice(5)
        : normalizedPath;

      if (template && typeof template === 'object') {
        const templateWithSchema = {
          $schema: schemaRef,
          ...(template as Record<string, unknown>),
        };
        setTemplateContent(JSON.stringify(templateWithSchema, null, 2));
      } else {
        setTemplateContent(JSON.stringify(template, null, 2));
      }
    } catch (err) {
      setSchemaContent('Error parsing schema');
      setTemplateContent('');
    }

    if (isMobile) {
      setMobileTab(1);
    }
  }, [rootDir, loadedSchemas, isMobile]);

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

  const expandAll = useCallback(() => {
    if (!tree) return;
    const paths = new Set<string>();
    const collectPaths = (item: TreeItem) => {
      if (item.type === 'directory') {
        paths.add(item.path);
        item.children?.forEach(collectPaths);
      }
    };
    collectPaths(tree);
    setExpandedPaths(paths);
  }, [tree]);

  const handleConfirm = () => {
    if (!selectedSchemaPath) return;
    onSelect({
      type: outputType,
      content: outputType === 'template' ? templateContent : schemaContent,
      schemaPath: selectedSchemaPath,
    });
    onClose();
  };

  const handleCopy = async () => {
    const content = outputType === 'template' ? templateContent : schemaContent;
    await navigator.clipboard.writeText(content);
  };

  const handleOutputTypeChange = (_: React.MouseEvent<HTMLElement>, newType: 'template' | 'schema' | null) => {
    if (newType) {
      setOutputType(newType);
    }
  };

  const treePanel = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Filter schemas..."
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
      <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
        {!isDataLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : tree ? (
          <List dense>
            <TreeNode
              node={tree}
              level={0}
              selectedPath={selectedSchemaPath}
              onSelect={handleSchemaSelect}
              filter={filter}
              expandedPaths={expandedPaths}
              toggleExpanded={toggleExpanded}
            />
          </List>
        ) : (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            No schemas found in data/data/schema
          </Typography>
        )}
      </Box>
    </Box>
  );

  const previewPanel = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{
        p: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <ToggleButtonGroup
          value={outputType}
          exclusive
          onChange={handleOutputTypeChange}
          size="small"
        >
          <ToggleButton value="template">
            <Tooltip title="Template">
              <DescriptionIcon fontSize="small" sx={{ mr: isMobile ? 0 : 0.5 }} />
            </Tooltip>
            {!isMobile && 'Template'}
          </ToggleButton>
          <ToggleButton value="schema">
            <Tooltip title="Schema">
              <CodeIcon fontSize="small" sx={{ mr: isMobile ? 0 : 0.5 }} />
            </Tooltip>
            {!isMobile && 'Schema'}
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Copy to clipboard">
          <IconButton
            size="small"
            onClick={handleCopy}
            disabled={!selectedSchemaPath}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 1 }}>
        {selectedSchemaPath ? (
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              bgcolor: 'grey.50',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              minHeight: '100%',
            }}
          >
            {outputType === 'template' ? templateContent : schemaContent}
          </Paper>
        ) : (
          <Typography color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
            Select a schema to preview
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          height: isMobile ? '100%' : '80vh',
          maxHeight: isMobile ? '100%' : '80vh',
        },
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}>
        <CodeIcon color="primary" />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Schema Browser
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile ? (
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Tabs
              value={mobileTab}
              onChange={(_, newValue) => setMobileTab(newValue)}
              variant="fullWidth"
              sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
              <Tab
                icon={<FolderIcon />}
                iconPosition="start"
                label="Schemas"
                sx={{ minHeight: 48 }}
              />
              <Tab
                icon={<DescriptionIcon />}
                iconPosition="start"
                label="Preview"
                sx={{ minHeight: 48 }}
              />
            </Tabs>
            <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
              {mobileTab === 0 ? treePanel : previewPanel}
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexGrow: 1, minHeight: 0 }}>
            <Box sx={{
              width: 280,
              minWidth: 200,
              borderRight: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {treePanel}
            </Box>
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              {previewPanel}
            </Box>
          </Box>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!selectedSchemaPath}
          startIcon={outputType === 'template' ? <DescriptionIcon /> : <CodeIcon />}
        >
          Insert {outputType === 'template' ? 'Template' : 'Schema'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SchemaBrowser;
