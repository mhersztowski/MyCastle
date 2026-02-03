import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, Button, CircularProgress, Alert } from '@mui/material';
import { Save as SaveIcon, ArrowBack as ArrowBackIcon, Visibility as VisibilityIcon } from '@mui/icons-material';
import Editor, { Monaco } from '@monaco-editor/react';
import { useMqtt } from '../../modules/mqttclient/MqttContext';
import { useFilesystem } from '../../modules/filesystem/FilesystemContext';
import type { editor } from 'monaco-editor';
import { EditorActionsToolbar, markdownActionsConfig, JsonActionsToolbar } from '../../components/editor';
import { DirectoryTree } from '../../modules/mqttclient';
import { JsonSchemaUtils, ValidationError } from '../../utils/JsonSchemaUtils';
import ValidationErrorModal from '../../components/ValidationErrorModal';

const getLanguageFromPath = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    default:
      return 'plaintext';
  }
};

const extractSchemaPath = (content: string): string | null => {
  try {
    const json = JSON.parse(content);
    if (json.$schema && typeof json.$schema === 'string') {
      return json.$schema;
    }
  } catch {
    // Not valid JSON yet
  }
  return null;
};

const extractRefs = (schema: Record<string, unknown>, refs: Set<string>, basePath: string): void => {
  if (typeof schema !== 'object' || schema === null) return;

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref' && typeof value === 'string' && !value.startsWith('#')) {
      const refPath = resolveRefPath(value, basePath);
      refs.add(refPath);
    } else if (typeof value === 'object' && value !== null) {
      extractRefs(value as Record<string, unknown>, refs, basePath);
    }
  }
};

const resolveRefPath = (ref: string, basePath: string): string => {
  if (ref.startsWith('/') || ref.startsWith('data/')) {
    return ref;
  }
  const baseDir = basePath.substring(0, basePath.lastIndexOf('/'));
  return `${baseDir}/${ref}`;
};

// Interface for dirinfo.json structure
interface DirinfoFile {
  type: string;
  name: string;
  kind: string;
  components?: Array<{
    type: string;
    schemaPath?: string;
    ref?: string;
  }>;
}

interface Dirinfo {
  type: 'dir';
  files?: DirinfoFile[];
}

// Extract schema path from dirinfo.json for a given file
const getSchemaFromDirinfo = (dirinfo: Dirinfo, fileName: string): string | null => {
  if (!dirinfo.files) return null;

  const fileEntry = dirinfo.files.find(f => f.name === fileName);
  if (!fileEntry || !fileEntry.components) return null;

  const jsonComponent = fileEntry.components.find(c => c.type === 'file_json');
  if (!jsonComponent) return null;

  return jsonComponent.schemaPath || jsonComponent.ref || null;
};

const SimpleEditorPage: React.FC = () => {
  const { '*': filePath } = useParams();
  const navigate = useNavigate();
  const { readFile, writeFile, listDirectory, syncDirinfo: syncDirinfoMqtt, isConnected } = useMqtt();
  const { syncDirinfo: syncDirinfoFilesystem } = useFilesystem();
  const monacoRef = useRef<Monaco | null>(null);
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);

  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [loadedSchemas, setLoadedSchemas] = useState<Map<string, object>>(new Map());
  const [directoryTree, setDirectoryTree] = useState<DirectoryTree | null>(null);
  const [_dirinfo, setDirinfo] = useState<Dirinfo | null>(null);
  const [dirinfoSchemaPath, setDirinfoSchemaPath] = useState<string | null>(null);

  const path = filePath || '';
  const language = getLanguageFromPath(path);
  const hasChanges = content !== originalContent;

  // Load dirinfo.json from the same directory
  const loadDirinfo = useCallback(async (filePath: string): Promise<{ dirinfo: Dirinfo | null; schemaPath: string | null }> => {
    const fileName = filePath.split('/').pop() || '';
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    const dirinfoPath = dirPath ? `${dirPath}/dirinfo.json` : 'dirinfo.json';

    try {
      const dirinfoFile = await readFile(dirinfoPath);
      const parsed = JSON.parse(dirinfoFile.content) as Dirinfo;
      const schemaPath = getSchemaFromDirinfo(parsed, fileName);
      return { dirinfo: parsed, schemaPath };
    } catch {
      // dirinfo.json doesn't exist or is invalid
      return { dirinfo: null, schemaPath: null };
    }
  }, [readFile]);

  const loadSchemaWithRefs = useCallback(async (
    schemaPath: string,
    loadedSchemas: Map<string, Record<string, unknown>>,
    readFileFn: typeof readFile
  ): Promise<void> => {
    if (loadedSchemas.has(schemaPath)) return;

    try {
      const schemaFile = await readFileFn(schemaPath);
      const schema = JSON.parse(schemaFile.content);
      loadedSchemas.set(schemaPath, schema);

      const refs = new Set<string>();
      extractRefs(schema, refs, schemaPath);

      for (const refPath of refs) {
        await loadSchemaWithRefs(refPath, loadedSchemas, readFileFn);
      }
    } catch (err) {
      console.warn(`Failed to load schema: ${schemaPath}`, err);
    }
  }, []);

  const configureJsonSchema = useCallback(async (fileContent: string, filePath: string, monaco: Monaco, dirinfoSchema?: string | null) => {
    if (!monaco || language !== 'json') return;

    let schemaPath = extractSchemaPath(fileContent);

    // Default schema for dirinfo.json files
    if (!schemaPath && filePath.endsWith('dirinfo.json')) {
      schemaPath = 'data/schema/dir.json';
    }

    // Use schema from dirinfo.json if no schema in file
    if (!schemaPath && dirinfoSchema) {
      schemaPath = dirinfoSchema;
      setDirinfoSchemaPath(dirinfoSchema);
    }

    if (!schemaPath) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [],
        enableSchemaRequest: false,
      });
      setLoadedSchemas(new Map());
      setDirinfoSchemaPath(null);
      return;
    }

    const schemasMap = new Map<string, Record<string, unknown>>();

    const fullSchemaPath = schemaPath.startsWith('data/')
      ? schemaPath
      : `data/${schemaPath}`;

    await loadSchemaWithRefs(fullSchemaPath, schemasMap, readFile);

    if (schemasMap.size === 0) return;

    // Store schemas for validation
    setLoadedSchemas(schemasMap as Map<string, object>);

    const schemas = Array.from(schemasMap.entries()).map(([schemaUri, schema]) => {
      const fullUri = `inmemory://${schemaUri}`;
      console.log('Adding schema:', fullUri);
      return {
        uri: fullUri,
        schema: schema,
      };
    });

    console.log('Schema list:', schemas.map(s => s.uri));

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: schemas,
      enableSchemaRequest: false,
      allowComments: false,
    });

    setSchemaLoaded(true);
  }, [language, loadSchemaWithRefs, readFile]);

  useEffect(() => {
    const loadFile = async () => {
      if (!isConnected || !path) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setSchemaLoaded(false);
        setDirinfo(null);
        setDirinfoSchemaPath(null);

        const file = await readFile(path);
        setContent(file.content);
        setOriginalContent(file.content);

        // Load dirinfo.json for schema lookup (for non-dirinfo JSON files)
        let dirinfoSchema: string | null = null;
        if (language === 'json' && !path.endsWith('dirinfo.json')) {
          const { dirinfo: loadedDirinfo, schemaPath } = await loadDirinfo(path);
          setDirinfo(loadedDirinfo);
          dirinfoSchema = schemaPath;
        }

        if (monacoRef.current && language === 'json') {
          await configureJsonSchema(file.content, path, monacoRef.current, dirinfoSchema);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    loadFile();
  }, [isConnected, path, readFile, loadDirinfo]);

  const getMainSchemaPath = useCallback((): string | null => {
    let schemaPath = extractSchemaPath(content);

    // Default schema for dirinfo.json files
    if (!schemaPath && path.endsWith('dirinfo.json')) {
      schemaPath = 'data/schema/dir.json';
    }

    // Use schema from dirinfo.json if available
    if (!schemaPath && dirinfoSchemaPath) {
      schemaPath = dirinfoSchemaPath;
    }

    if (!schemaPath) return null;

    return schemaPath.startsWith('data/')
      ? schemaPath
      : `data/${schemaPath}`;
  }, [content, path, dirinfoSchemaPath]);

  const getMainSchema = useCallback((): object | undefined => {
    const fullSchemaPath = getMainSchemaPath();
    if (!fullSchemaPath) return undefined;
    return loadedSchemas.get(fullSchemaPath);
  }, [getMainSchemaPath, loadedSchemas]);

  const validateJsonContent = useCallback((): ValidationError[] => {
    if (language !== 'json' || loadedSchemas.size === 0) {
      return [];
    }

    const fullSchemaPath = getMainSchemaPath();
    if (!fullSchemaPath) return [];

    const mainSchema = loadedSchemas.get(fullSchemaPath);
    if (!mainSchema) return [];

    // Use validateStringWithRefs to get line/column positions
    const result = JsonSchemaUtils.validateStringWithRefs(content, mainSchema, loadedSchemas);
    return result.errors;
  }, [content, language, loadedSchemas, getMainSchemaPath]);

  const performSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await writeFile(path, content);
      setOriginalContent(content);
      setShowValidationModal(false);

      // Sync dirinfo.json to backend and frontend filesystem
      if (path.endsWith('dirinfo.json')) {
        // Sync to backend metadata cache
        try {
          await syncDirinfoMqtt(path);
          console.log('Dirinfo synced to backend:', path);
        } catch (syncErr) {
          console.warn('Failed to sync dirinfo to backend:', syncErr);
        }

        // Sync to frontend filesystem (updates FileData components)
        try {
          const success = syncDirinfoFilesystem(path, content);
          if (success) {
            console.log('Dirinfo synced to frontend filesystem:', path);
          } else {
            console.warn('Failed to sync dirinfo to frontend filesystem:', path);
          }
        } catch (syncErr) {
          console.warn('Failed to sync dirinfo to frontend:', syncErr);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!path) return;

    // Validate JSON files before saving
    if (language === 'json' && loadedSchemas.size > 0) {
      const errors = validateJsonContent();
      if (errors.length > 0) {
        setValidationErrors(errors);
        setShowValidationModal(true);
        return;
      }
    }

    await performSave();
  };

  const handleSaveAnyway = async () => {
    await performSave();
  };

  const handleCloseValidationModal = () => {
    setShowValidationModal(false);
  };

  const handleGoToError = (line: number, column: number) => {
    if (editorInstance) {
      editorInstance.setPosition({ lineNumber: line, column: column });
      editorInstance.revealLineInCenter(line);
      // Delay focus to ensure modal is fully closed
      setTimeout(() => {
        editorInstance.focus();
      }, 100);
    }
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleView = () => {
    navigate(`/viewer/md/${path}`);
  };

  const handleEditorChange = (value: string | undefined) => {
    setContent(value || '');
  };

  const handleBeforeMount = (monaco: Monaco) => {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      schemas: [],
      enableSchemaRequest: false,
      schemaRequest: 'ignore',
    });
  };

  const handleEditorMount = async (editorRef: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    monacoRef.current = monaco;
    setEditorInstance(editorRef);

    if (content && language === 'json') {
      await configureJsonSchema(content, path, monaco, dirinfoSchemaPath);
    }
  };

  const handleLoadDirectory = useCallback(async () => {
    if (!isConnected) return;
    try {
      const tree = await listDirectory();
      setDirectoryTree(tree);
    } catch (err) {
      console.error('Failed to load directory tree:', err);
    }
  }, [isConnected, listDirectory]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'var(--app-height, 100vh)',
        overflow: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <AppBar
        position="sticky"
        color="default"
        elevation={1}
        sx={{
          top: 0,
          zIndex: 1100,
          flexShrink: 0,
        }}
      >
        <Toolbar variant="dense">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleBack}
            sx={{ mr: 2 }}
          >
            Back
          </Button>
          <Typography variant="subtitle1" sx={{ flexGrow: 1, fontFamily: 'monospace' }}>
            {path || 'No file selected'}
            {schemaLoaded && language === 'json' && (
              <Typography component="span" variant="caption" sx={{ ml: 2, color: 'success.main' }}>
                (Schema loaded)
              </Typography>
            )}
          </Typography>
          {language === 'markdown' && (
            <Button
              variant="outlined"
              startIcon={<VisibilityIcon />}
              onClick={handleView}
              sx={{ mr: 1 }}
            >
              View
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges || saving || loading}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Toolbar>
      </AppBar>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {language === 'markdown' && (
        <EditorActionsToolbar
          config={markdownActionsConfig}
          editor={editorInstance}
        />
      )}

      {language === 'json' && (
        <JsonActionsToolbar
          editor={editorInstance}
          directoryTree={directoryTree}
          onLoadDirectory={handleLoadDirectory}
        />
      )}

      <Box
        sx={{
          flexGrow: 1,
          position: 'relative',
          minHeight: 0,
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : (
          <Editor
            height="100%"
            language={language}
            value={content}
            onChange={handleEditorChange}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            theme="vs-light"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              fixedOverflowWidgets: true,
            }}
          />
        )}
      </Box>

      <ValidationErrorModal
        open={showValidationModal}
        onClose={handleCloseValidationModal}
        onSaveAnyway={handleSaveAnyway}
        onGoToError={handleGoToError}
        errors={validationErrors}
        fileName={path}
        schema={getMainSchema()}
      />
    </Box>
  );
};

export default SimpleEditorPage;
