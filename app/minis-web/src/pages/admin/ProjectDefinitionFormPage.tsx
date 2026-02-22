import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Stack,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material';
import type {
  ProjectInfoModel,
  ProjectDefinitionComponentModel,
  PDCTaskModel,
  PDCSourceFileModel,
  PDCBinaryHexModel,
} from '@modules/filesystem/models/ProjectDefinitionModel';
import { useProjectDefinitions } from '@modules/filesystem/ProjectDefinitionsContext';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function createEmptyInfo(): ProjectInfoModel {
  return {
    name: '',
    version: '1.0.0',
    tags: [],
    hardwareArchitecture: [],
    softwareArchitecture: { platform: '' },
  };
}

function ProjectDefinitionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { saveDefinition, getDefinitionById, loading: contextLoading, error: contextError } = useProjectDefinitions();

  const [info, setInfo] = useState<ProjectInfoModel>(createEmptyInfo);
  const [description, setDescription] = useState('');
  const [components, setComponents] = useState<ProjectDefinitionComponentModel[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [hwInput, setHwInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [existingCreated, setExistingCreated] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      const existing = getDefinitionById(id);
      if (existing) {
        setInfo(existing.info);
        setDescription(existing.description);
        setExistingCreated(existing.created);
        setComponents([...existing.components]);
      }
    }
  }, [isEdit, id, getDefinitionById]);

  const handleAddTag = useCallback(() => {
    const tag = tagInput.trim();
    if (tag && !info.tags.includes(tag)) {
      setInfo(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  }, [tagInput, info.tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    setInfo(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  }, []);

  const handleAddHw = useCallback(() => {
    const hw = hwInput.trim();
    if (hw && !info.hardwareArchitecture.includes(hw)) {
      setInfo(prev => ({ ...prev, hardwareArchitecture: [...prev.hardwareArchitecture, hw] }));
      setHwInput('');
    }
  }, [hwInput, info.hardwareArchitecture]);

  const handleRemoveHw = useCallback((hw: string) => {
    setInfo(prev => ({ ...prev, hardwareArchitecture: prev.hardwareArchitecture.filter(h => h !== hw) }));
  }, []);

  const handleAddComponent = useCallback((type: ProjectDefinitionComponentModel['type']) => {
    const base = { id: generateId(), name: '' };
    let component: ProjectDefinitionComponentModel;
    switch (type) {
      case 'tasks':
        component = { ...base, type: 'tasks', tasks: [] };
        break;
      case 'source_files':
        component = { ...base, type: 'source_files', sourceFiles: [] };
        break;
      case 'binary_hex':
        component = { ...base, type: 'binary_hex', binaryHex: { id: generateId(), name: '', path: '' } };
        break;
    }
    setComponents(prev => [...prev, component]);
  }, []);

  const handleRemoveComponent = useCallback((componentId: string) => {
    setComponents(prev => prev.filter(c => c.id !== componentId));
  }, []);

  const handleComponentNameChange = useCallback((componentId: string, name: string) => {
    setComponents(prev => prev.map(c => c.id === componentId ? { ...c, name } : c));
  }, []);

  // Task management within components
  const handleAddTask = useCallback((componentId: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'tasks') {
        const newTask: PDCTaskModel = {
          id: generateId(),
          title: '',
          description: '',
          order: c.tasks.length,
        };
        return { ...c, tasks: [...c.tasks, newTask] };
      }
      return c;
    }));
  }, []);

  const handleTaskChange = useCallback((componentId: string, taskId: string, field: keyof PDCTaskModel, value: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'tasks') {
        return {
          ...c,
          tasks: c.tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t),
        };
      }
      return c;
    }));
  }, []);

  const handleRemoveTask = useCallback((componentId: string, taskId: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'tasks') {
        return { ...c, tasks: c.tasks.filter(t => t.id !== taskId) };
      }
      return c;
    }));
  }, []);

  // Source file management
  const handleAddSourceFile = useCallback((componentId: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'source_files') {
        const newFile: PDCSourceFileModel = {
          id: generateId(),
          name: '',
          path: '',
          language: '',
        };
        return { ...c, sourceFiles: [...c.sourceFiles, newFile] };
      }
      return c;
    }));
  }, []);

  const handleSourceFileChange = useCallback((componentId: string, fileId: string, field: keyof PDCSourceFileModel, value: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'source_files') {
        return {
          ...c,
          sourceFiles: c.sourceFiles.map(f => f.id === fileId ? { ...f, [field]: value } : f),
        };
      }
      return c;
    }));
  }, []);

  const handleRemoveSourceFile = useCallback((componentId: string, fileId: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'source_files') {
        return { ...c, sourceFiles: c.sourceFiles.filter(f => f.id !== fileId) };
      }
      return c;
    }));
  }, []);

  // Binary hex
  const handleBinaryHexChange = useCallback((componentId: string, field: keyof PDCBinaryHexModel, value: string) => {
    setComponents(prev => prev.map(c => {
      if (c.id === componentId && c.type === 'binary_hex') {
        return { ...c, binaryHex: { ...c.binaryHex, [field]: value } };
      }
      return c;
    }));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    try {
      const now = new Date().toISOString();
      const definition = {
        id: id || generateId(),
        info,
        description,
        components,
        created: existingCreated || now,
        modified: now,
      };
      await saveDefinition(definition);
      navigate('/admin/projects');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save definition');
    } finally {
      setSaving(false);
    }
  }, [id, info, description, components, existingCreated, navigate, saveDefinition]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/admin/projects')} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          {isEdit ? 'Edit Project Definition' : 'New Project Definition'}
        </Typography>
      </Box>

      {(saveError || contextError) && (
        <Alert severity="error" sx={{ mb: 2 }}>{saveError || contextError}</Alert>
      )}

      {/* Project Info */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Project Info</Typography>
        <Stack spacing={2}>
          <TextField
            label="Name"
            value={info.name}
            onChange={(e) => setInfo(prev => ({ ...prev, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="Version"
            value={info.version}
            onChange={(e) => setInfo(prev => ({ ...prev, version: e.target.value }))}
            fullWidth
            placeholder="1.0.0"
          />

          {/* Tags */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Tags</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {info.tags.map((tag) => (
                <Chip key={tag} label={tag} onDelete={() => handleRemoveTag(tag)} size="small" />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              />
              <Button size="small" onClick={handleAddTag}>Add</Button>
            </Stack>
          </Box>

          {/* Hardware Architecture */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Hardware Architecture</Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {info.hardwareArchitecture.map((hw) => (
                <Chip key={hw} label={hw} onDelete={() => handleRemoveHw(hw)} size="small" />
              ))}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                value={hwInput}
                onChange={(e) => setHwInput(e.target.value)}
                placeholder="Add hardware..."
                onKeyDown={(e) => e.key === 'Enter' && handleAddHw()}
              />
              <Button size="small" onClick={handleAddHw}>Add</Button>
            </Stack>
          </Box>

          {/* Software Architecture */}
          <TextField
            label="Platform"
            value={info.softwareArchitecture.platform}
            onChange={(e) => setInfo(prev => ({
              ...prev,
              softwareArchitecture: { ...prev.softwareArchitecture, platform: e.target.value },
            }))}
            fullWidth
            placeholder="Arduino"
          />
        </Stack>
      </Paper>

      {/* Description */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Description (Markdown)</Typography>
        <TextField
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          multiline
          rows={8}
          placeholder="Project description in markdown..."
        />
      </Paper>

      {/* Components */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Components</Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Add Component</InputLabel>
            <Select
              label="Add Component"
              value=""
              onChange={(e) => handleAddComponent(e.target.value as ProjectDefinitionComponentModel['type'])}
            >
              <MenuItem value="tasks">Tasks</MenuItem>
              <MenuItem value="source_files">Source Files</MenuItem>
              <MenuItem value="binary_hex">Binary Hex</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {components.map((component) => (
          <Paper key={component.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label={component.type} size="small" color="primary" />
                <TextField
                  size="small"
                  value={component.name}
                  onChange={(e) => handleComponentNameChange(component.id, e.target.value)}
                  placeholder="Component name"
                />
              </Stack>
              <IconButton size="small" onClick={() => handleRemoveComponent(component.id)}>
                <DeleteIcon />
              </IconButton>
            </Box>
            <Divider sx={{ my: 1 }} />

            {/* Tasks component */}
            {component.type === 'tasks' && (
              <Stack spacing={1}>
                {component.tasks.map((task) => (
                  <Stack key={task.id} direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      value={task.title}
                      onChange={(e) => handleTaskChange(component.id, task.id, 'title', e.target.value)}
                      placeholder="Task title"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      value={task.description}
                      onChange={(e) => handleTaskChange(component.id, task.id, 'description', e.target.value)}
                      placeholder="Description"
                      sx={{ flex: 2 }}
                    />
                    <IconButton size="small" onClick={() => handleRemoveTask(component.id, task.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => handleAddTask(component.id)}>
                  Add Task
                </Button>
              </Stack>
            )}

            {/* Source files component */}
            {component.type === 'source_files' && (
              <Stack spacing={1}>
                {component.sourceFiles.map((file) => (
                  <Stack key={file.id} direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      value={file.name}
                      onChange={(e) => handleSourceFileChange(component.id, file.id, 'name', e.target.value)}
                      placeholder="File name"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      value={file.path}
                      onChange={(e) => handleSourceFileChange(component.id, file.id, 'path', e.target.value)}
                      placeholder="Path"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      value={file.language}
                      onChange={(e) => handleSourceFileChange(component.id, file.id, 'language', e.target.value)}
                      placeholder="Language"
                      sx={{ width: 120 }}
                    />
                    <IconButton size="small" onClick={() => handleRemoveSourceFile(component.id, file.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                <Button size="small" startIcon={<AddIcon />} onClick={() => handleAddSourceFile(component.id)}>
                  Add Source File
                </Button>
              </Stack>
            )}

            {/* Binary hex component */}
            {component.type === 'binary_hex' && (
              <Stack spacing={1}>
                <TextField
                  size="small"
                  value={component.binaryHex.name}
                  onChange={(e) => handleBinaryHexChange(component.id, 'name', e.target.value)}
                  placeholder="Binary name"
                  fullWidth
                />
                <TextField
                  size="small"
                  value={component.binaryHex.path}
                  onChange={(e) => handleBinaryHexChange(component.id, 'path', e.target.value)}
                  placeholder="File path"
                  fullWidth
                />
              </Stack>
            )}
          </Paper>
        ))}

        {components.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No components added. Use the dropdown above to add one.
          </Typography>
        )}
      </Paper>

      {/* Save */}
      <Button
        variant="contained"
        size="large"
        startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
        onClick={handleSave}
        disabled={!info.name.trim() || saving || contextLoading}
      >
        {saving ? 'Saving...' : isEdit ? 'Update Definition' : 'Create Definition'}
      </Button>
    </Box>
  );
}

export default ProjectDefinitionFormPage;
