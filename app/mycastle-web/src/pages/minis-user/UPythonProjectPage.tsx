import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  ArrowBack,
  Close,
  CloseFullscreen,
  Code,
  Delete as DeleteIcon,
  Description,
  Edit as EditIcon,
  Extension,
  FolderOpen,
  OpenInFull,
  Save,
  SaveOutlined,
  Settings,
  SmartToy,
  Terminal as TerminalIcon,
  Upload as UploadIcon,
  VerticalSplit,
  CloudUpload,
  ExpandMore,
  ExpandLess,
  InsertDriveFile,
  WarningAmber,
} from '@mui/icons-material';
import Collapse from '@mui/material/Collapse';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../modules/auth';
import '@modules/editor/monacoWorkers';
import { EditorInstance } from '@mhersztowski/web-client';
import {
  UPythonBlocklyComponent,
  type UPythonBlocklyService,
  boardProfiles,
  HARDWARE_CATEGORY_NAMES,
} from '@modules/upythonblockly';
import { MpyReplTerminal } from '@modules/upythonblockly/repl';
import { UploadDialog } from '@modules/upythonblockly/upload';
import { minisApi } from '../../services/MinisApiService';
import { AccountMenu } from '../../components/AccountMenu';
import type { MinisDeviceModel } from '@mhersztowski/core';
import { MemoryFS, FileType } from '@mhersztowski/core';
import { AgentPanel, DEFAULT_AGENT_CONFIG } from '@mhersztowski/web-client';

type ViewMode = 'blockly' | 'split' | 'code';

const MIN_PANEL_PX = 200;

function UPythonProjectPage() {
  const { userName, projectId } = useParams<{ userName: string; projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin, token } = useAuth();
  const serviceRef = useRef<UPythonBlocklyService | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const generatedCodeRef = useRef('');
  const codeEditedRef = useRef(false);
  const suppressEditorChangeRef = useRef(false);
  const suppressBlocklyChangeRef = useRef(false);
  const isLoadingSketchRef = useRef(false);
  // When Blockly init is delayed (WebView), sketch API call may complete first.
  // Store the XML here and apply it once the service is ready.
  const queuedSketchXmlRef = useRef<string | null>(null);
  const currentSketchRef = useRef<string | null>(null);
  const hiddenCategoriesRef = useRef<Set<string>>(
    (() => {
      const stored = localStorage.getItem('upython_hidden_cats');
      if (stored !== null) return new Set<string>(JSON.parse(stored) as string[]);
      return new Set<string>(HARDWARE_CATEGORY_NAMES);
    })(),
  );

  // In React Native WebView the native layout may not be finalised when JS starts,
  // so Blockly.inject() would read height=0. Delay init until layout settles.
  const isWebView = typeof navigator !== 'undefined' && navigator.userAgent.includes('MyCastleMobile');
  const [blocklyReady, setBlocklyReady] = useState(!isWebView);
  useEffect(() => {
    if (!isWebView) return;
    const t = setTimeout(() => setBlocklyReady(true), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [board, setBoard] = useState<string>('rp2040_pico');
  const [newSketchName, setNewSketchName] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('blockly');
  const [codeEdited, setCodeEdited] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [replOpen, setReplOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | undefined>();
  const [pushTokenOpen, setPushTokenOpen] = useState(false);
  const [pushToken, setPushToken] = useState('');
  const [pushError, setPushError] = useState('');
  const [sketches, setSketches] = useState<string[]>([]);
  const [currentSketch, setCurrentSketch] = useState<string | null>(null);
  const [sketchesOpen, setSketchesOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  );
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [readmeExpanded, setReadmeExpanded] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string | null>(null);
  const [readmeEditMode, setReadmeEditMode] = useState(false);
  const [readmeEditValue, setReadmeEditValue] = useState('');
  const [devices, setDevices] = useState<MinisDeviceModel[]>([]);
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>(() =>
    searchParams.get('device') ?? (projectId ? localStorage.getItem(`upython_device_${projectId}`) : null) ?? ''
  );
  const initialSketch = searchParams.get('sketch');
  const [uploadCode, setUploadCode] = useState('');
  const [uploadExtraFiles, setUploadExtraFiles] = useState<Array<{ name: string; content: string }>>([]);
  const [projectLibraries, setProjectLibraries] = useState<Array<{ url: string; remoteName: string }>>([]);
  const [scriptCategories, setScriptCategories] = useState<Array<{ name: string; colour: string; blocks: string[] }>>([]);
  const [libSaving, setLibSaving] = useState(false);
  // undefined = still fetching, null = no script found, string = script content
  const [projectScript, setProjectScript] = useState<string | null | undefined>(undefined);
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('upython_hidden_cats');
    if (stored !== null) return new Set<string>(JSON.parse(stored) as string[]);
    // Default: all hardware categories hidden
    return new Set<string>(HARDWARE_CATEGORY_NAMES);
  });
  const [loadKey, setLoadKey] = useState(0);
  const [agentOpen, setAgentOpen] = useState(false);
  const [sketchFiles, setSketchFiles] = useState<Map<string, string[]>>(new Map());
  const [expandedSketches, setExpandedSketches] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null); // sketchName being dragged over
  const lastSourceStorageKey = projectId ? `upython_last_source_${projectId}` : null;
  const [sketchLastSource, setSketchLastSource] = useState<Map<string, 'blockly' | 'code'>>(() => {
    if (!projectId) return new Map();
    try {
      const raw = localStorage.getItem(`upython_last_source_${projectId}`);
      if (raw) return new Map(JSON.parse(raw) as [string, 'blockly' | 'code'][]);
    } catch { /* ignore */ }
    return new Map();
  });
  const [agentFs, setAgentFs] = useState<MemoryFS | null>(null);
  const [agentFsVersion, setAgentFsVersion] = useState(0);
  const [agentApiKey, setAgentApiKey] = useState('');

  // Sync agent FS writes back to the server project + refresh sketches list
  useEffect(() => {
    if (!agentFs || !userName || !projectId) return;

    // Full sync: scan all MemoryFS sketch dirs and write code files to server, then refresh list
    const syncAll = async () => {
      console.log('[agent sync] syncAll start, project:', projectId);
      try {
        const rootEntries = await agentFs.readDirectory('/');
        console.log('[agent sync] root entries:', rootEntries.map(e => `${e.name}(${e.type === FileType.Directory ? 'dir' : 'file'})`));
        for (const entry of rootEntries) {
          if (entry.type !== FileType.Directory) continue;
          const sketchName = entry.name;
          let fileEntries: { name: string; type: FileType }[] = [];
          try { fileEntries = await agentFs.readDirectory(`/${sketchName}`); } catch { continue; }
          for (const fileEntry of fileEntries) {
            if (fileEntry.type !== FileType.File) continue;
            const fileName = fileEntry.name;
            if (!fileName.endsWith('.py') && !fileName.endsWith('.blockly')) continue;
            try {
              const data = await agentFs.readFile(`/${sketchName}/${fileName}`);
              const content = new TextDecoder().decode(data);
              console.log('[agent sync] writing', sketchName, '/', fileName, '(', content.length, 'chars)');
              await minisApi.writeUpythonSketchFile(userName, projectId, sketchName, fileName, content);
              console.log('[agent sync] wrote OK', sketchName, '/', fileName);
            } catch (e) { console.error('[agent sync] failed to write', sketchName, '/', fileName, e); }
          }
        }
        const list = await minisApi.listUpythonSketches(userName, projectId);
        console.log('[agent sync] refresh done, sketches:', list);
        setSketches(list);
      } catch (e) { console.error('[agent sync] full sync error:', e); }
    };

    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSyncAll = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(syncAll, 1000);
    };

    const sub = agentFs.onDidChangeFile((events) => {
      console.log('[agent sync] onDidChangeFile:', events.map(e => e.path));
      scheduleSyncAll();
    });

    return () => {
      sub.dispose();
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [agentFs, userName, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs in sync for use inside Blockly listener
  useEffect(() => {
    codeEditedRef.current = codeEdited;
  }, [codeEdited]);

  useEffect(() => {
    currentSketchRef.current = currentSketch;
  }, [currentSketch]);

  // Persist sketchLastSource to localStorage
  useEffect(() => {
    if (!lastSourceStorageKey) return;
    try {
      localStorage.setItem(lastSourceStorageKey, JSON.stringify([...sketchLastSource]));
    } catch { /* ignore */ }
  }, [sketchLastSource, lastSourceStorageKey]);

  // After each sketch load, keep isLoadingSketchRef true for a bit longer to absorb any
  // deferred Blockly workspace events, then do a final isDirty reset.
  useEffect(() => {
    if (loadKey === 0) return;
    setIsDirty(false);
    const t = setTimeout(() => {
      isLoadingSketchRef.current = false;
      setIsDirty(false);
    }, 100);
    return () => clearTimeout(t);
  }, [loadKey]);

  // Sync generated code to Monaco editor
  const syncCodeToEditor = useCallback((code: string) => {
    generatedCodeRef.current = code;
    setGeneratedCode(code);
    if (editorRef.current) {
      suppressEditorChangeRef.current = true;
      editorRef.current.setContent(code);
      suppressEditorChangeRef.current = false;
    }
  }, []);

  const handleServiceReady = useCallback((service: UPythonBlocklyService) => {
    serviceRef.current = service;

    // Libraries declared in project.js take priority over those stored in Project.json
    const scriptLibs = service.getLibraries();
    if (scriptLibs.length > 0) setProjectLibraries(scriptLibs);
    setScriptCategories(service.getCategories());

    // Apply persisted toolbox visibility on init
    if (hiddenCategoriesRef.current.size > 0) {
      service.updateToolboxVisibility(hiddenCategoriesRef.current);
    }

    // If a sketch was fetched before Blockly was ready (WebView delay), load it now.
    if (queuedSketchXmlRef.current) {
      const xml = queuedSketchXmlRef.current;
      queuedSketchXmlRef.current = null;
      suppressBlocklyChangeRef.current = true;
      service.loadFromXml(xml);
      suppressBlocklyChangeRef.current = false;
      setTimeout(() => service.rerenderBlocks(), 300);
    }

    service.onWorkspaceChange(() => {
      if (suppressBlocklyChangeRef.current) return;
      if (codeEditedRef.current) {
        setConfirmOpen(true);
        return;
      }
      const code = service.generateCode();
      syncCodeToEditor(code);
      if (!isLoadingSketchRef.current) {
        setIsDirty(true);
        setSketchLastSource((prev) => {
          const s = currentSketchRef.current;
          if (!s) return prev;
          const next = new Map(prev);
          next.set(s, 'blockly');
          return next;
        });
      }
    });

    const code = service.generateCode();
    syncCodeToEditor(code);
    setIsDirty(false);
  }, [syncCodeToEditor]);

  // Resize Blockly when panels change
  useEffect(() => {
    const timer = setTimeout(() => {
      serviceRef.current?.resize();
    }, 50);
    return () => clearTimeout(timer);
  }, [viewMode, splitRatio, configOpen, sketchesOpen]);

  // Resolve board, libraries and project.js script from project record
  useEffect(() => {
    if (!userName || !projectId) return;
    (async () => {
      try {
        const [projects, script] = await Promise.all([
          minisApi.getUserProjects(userName),
          minisApi.getProjectScript(userName, projectId),
        ]);
        setProjectScript(script);

        const project = projects.find((p) => p.id === projectId);
        if (!project) return;
        setGithubRepoUrl(project.githubRepoUrl);
        const boardKey = project.boardProfileKey ?? (project as unknown as Record<string, unknown>).moduleId as string | undefined;
        if (boardKey && boardProfiles[boardKey]) {
          setBoard(boardKey);
          serviceRef.current?.changeBoard(boardKey);
        }
        const libs = (project as unknown as Record<string, unknown>).libraries as Array<{ url?: string; remoteName?: string; name?: string }> | undefined;
        if (libs?.length) {
          setProjectLibraries(
            libs.filter(l => l.url).map(l => ({
              url: l.url!,
              remoteName: l.remoteName ?? (l.url!.split('/').pop() ?? l.name ?? 'lib.py'),
            }))
          );
        }
      } catch {
        setProjectScript(null);
      }
    })();
  }, [userName, projectId]);

  // Load sketches list, auto-open sketch from URL param or first
  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.listUpythonSketches(userName, projectId)
      .then((list) => {
        setSketches(list);
        if (list.length > 0) {
          const target = initialSketch && list.includes(initialSketch) ? initialSketch : list[0];
          handleLoadSketch(target);
        }
      })
      .catch(() => setSketches([]));
  }, [userName, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load README
  useEffect(() => {
    if (!userName || !projectId) return;
    minisApi.readProjectReadme(userName, projectId).then(setReadmeContent);
  }, [userName, projectId]);

  // Load devices
  useEffect(() => {
    if (!userName) return;
    minisApi.getUserDevices(userName).then(setDevices).catch(() => setDevices([]));
  }, [userName]);

  // Auto-generate MinisConfig.py in sketch directory when device or sketch changes
  useEffect(() => {
    if (!userName || !projectId || !selectedDeviceName || !currentSketch) return;
    minisApi.getDeviceMinisConfig(userName, selectedDeviceName)
      .then((cfg) => {
        if (!cfg.deviceName && !cfg.serialNumber) return;
        const configContent = [
          `MINIS_DEVICE_NAME = ${JSON.stringify(cfg.deviceName || cfg.serialNumber)}`,
          `MINIS_WIFI_SSID = ${JSON.stringify(cfg.wifiSsid)}`,
          `MINIS_WIFI_PASSWORD = ${JSON.stringify(cfg.wifiPassword)}`,
        ].join('\n') + '\n';
        return minisApi.writeUpythonSketchFile(userName, projectId, currentSketch, 'MinisConfig.py', configContent);
      })
      .catch(() => { /* non-critical */ });
  }, [selectedDeviceName, currentSketch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveLibraries = async () => {
    if (!userName || !projectId) return;
    setLibSaving(true);
    try {
      // Patch projectScript: strip old addLibrary / var RAW lines, prepend new ones
      const base = (projectScript ?? '').split('\n')
        .filter(l => !l.trimStart().startsWith('addLibrary(') && !l.trimStart().startsWith('var RAW ='))
        .join('\n')
        .trimStart();
      const libLines = projectLibraries
        .map(l => `addLibrary({ url: '${l.url}', remoteName: '${l.remoteName}' });`)
        .join('\n');
      const newContent = libLines ? libLines + '\n\n' + base : base;
      await minisApi.saveProjectScript(userName, projectId, newContent);
      setProjectScript(newContent);
    } finally {
      setLibSaving(false);
    }
  };

  const handleSaveReadme = async () => {
    if (!userName || !projectId) return;
    await minisApi.writeProjectReadme(userName, projectId, readmeEditValue);
    setReadmeContent(readmeEditValue);
    setReadmeEditMode(false);
  };

  const handleLoadSketch = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);
    setIsDirty(false);
    isLoadingSketchRef.current = true;

    suppressBlocklyChangeRef.current = true;
    serviceRef.current?.clearWorkspace();
    let xmlLoaded = false;
    try {
      const xmlContent = await minisApi.readUpythonSketchFile(
        userName, projectId, sketchName, `${sketchName}.blockly`,
      );
      if (xmlContent) {
        if (serviceRef.current) {
          serviceRef.current.loadFromXml(xmlContent);
          xmlLoaded = true;
        } else {
          // Blockly not ready yet (WebView delay) — queue for handleServiceReady
          queuedSketchXmlRef.current = xmlContent;
          xmlLoaded = true;
        }
      }
    } catch {
      // File not found — workspace already cleared
    }
    suppressBlocklyChangeRef.current = false;

    if (xmlLoaded && serviceRef.current) {
      // Regenerate from blockly so code always matches current blocks (handles legacy shadows etc.)
      syncCodeToEditor(serviceRef.current.generateCode());
    } else {
      try {
        const pyContent = await minisApi.readUpythonSketchFile(
          userName, projectId, sketchName, `${sketchName}.py`,
        );
        syncCodeToEditor(pyContent);
      } catch {
        if (serviceRef.current) syncCodeToEditor(serviceRef.current.generateCode());
      }
    }
    // Increment loadKey — the useEffect on loadKey will do the final isDirty reset and
    // clear isLoadingSketchRef after 100ms (enough to absorb deferred Blockly events).
    setIsDirty(false);
    setLoadKey((k) => k + 1);
    // Re-render blocks after loading to fix layout issues in WebView where getBBox()
    // may return stale/zero values causing blocks to overlap.
    setTimeout(() => serviceRef.current?.rerenderBlocks(), 300);
  };

  const handleToggleSketchExpand = async (sketchName: string) => {
    if (!userName || !projectId) return;
    setExpandedSketches((prev) => {
      const next = new Set(prev);
      if (next.has(sketchName)) { next.delete(sketchName); return next; }
      next.add(sketchName);
      return next;
    });
    if (!sketchFiles.has(sketchName)) {
      const files = await minisApi.listUpythonSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
      setSketchFiles((prev) => new Map(prev).set(sketchName, files));
    }
  };

  const handleLoadSketchFile = async (sketchName: string, fileName: string) => {
    if (!userName || !projectId) return;
    setCurrentSketch(sketchName);
    setCodeEdited(false);
    setIsDirty(false);
    isLoadingSketchRef.current = true;

    if (fileName.endsWith('.blockly')) {
      suppressBlocklyChangeRef.current = true;
      serviceRef.current?.clearWorkspace();
      try {
        const xml = await minisApi.readUpythonSketchFile(userName, projectId, sketchName, fileName);
        if (xml && serviceRef.current) {
          serviceRef.current.loadFromXml(xml);
          syncCodeToEditor(serviceRef.current.generateCode());
        }
      } catch { /* ignore */ }
      suppressBlocklyChangeRef.current = false;
      setViewMode('blockly');
    } else if (fileName.endsWith('.py')) {
      try {
        const content = await minisApi.readUpythonSketchFile(userName, projectId, sketchName, fileName);
        syncCodeToEditor(content);
      } catch { /* ignore */ }
      setViewMode('code');
    }
    setIsDirty(false);
    setLoadKey((k) => k + 1);
  };


  const handleDeleteSketchFile = async (sketchName: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!userName || !projectId) return;
    if (!window.confirm(`Delete ${fileName} from sketch "${sketchName}"?`)) return;
    try {
      await minisApi.deleteUpythonSketchFile(userName, projectId, sketchName, fileName);
      setSketchFiles((prev) => {
        const next = new Map(prev);
        next.set(sketchName, (next.get(sketchName) ?? []).filter((f) => f !== fileName));
        return next;
      });
    } catch { /* ignore */ }
  };

  const handleDropOnSketch = async (sketchName: string, dt: DataTransfer) => {
    if (!userName || !projectId) return;
    const files = Array.from(dt.files);
    for (const file of files) {
      const text = await file.text().catch(() => null);
      if (text === null) continue;
      await minisApi.writeUpythonSketchFile(userName, projectId, sketchName, file.name, text).catch(() => {});
    }
    // Refresh file list for this sketch
    const updated = await minisApi.listUpythonSketchFiles(userName, projectId, sketchName).catch(() => [] as string[]);
    setSketchFiles((prev) => new Map(prev).set(sketchName, updated));
    setExpandedSketches((prev) => new Set(prev).add(sketchName));
  };

  const handleNewSketch = () => {
    const name = newSketchName.trim();
    if (!name) return;
    setCurrentSketch(name);
    if (!sketches.includes(name)) setSketches((prev) => [...prev, name]);
    setNewSketchName('');
  };

  const handleSaveSketch = async () => {
    if (!userName || !projectId || !currentSketch) return;

    const blocklyXml = serviceRef.current?.serializeToXml() ?? '';
    const pyCode = editorRef.current?.getContent() ?? generatedCode;

    await Promise.all([
      minisApi.writeUpythonSketchFile(userName, projectId, currentSketch, `${currentSketch}.blockly`, blocklyXml),
      minisApi.writeUpythonSketchFile(userName, projectId, currentSketch, `${currentSketch}.py`, pyCode),
    ]);
    if (!sketches.includes(currentSketch)) setSketches((prev) => [...prev, currentSketch]);
    setCodeEdited(false);
    setIsDirty(false);
  };

  const openUploadDialog = async () => {
    setUploadCode(editorRef.current?.getContent() ?? generatedCode);
    // Load extra .py files from the sketch (exclude the main sketch file)
    const extras: Array<{ name: string; content: string }> = [];
    if (userName && projectId && currentSketch) {
      try {
        const files = await minisApi.listUpythonSketchFiles(userName, projectId, currentSketch);
        const mainFile = `${currentSketch}.py`;
        for (const file of files) {
          if (file.endsWith('.blockly') || file === mainFile) continue;
          const content = await minisApi.readUpythonSketchFile(userName, projectId, currentSketch, file).catch(() => null);
          if (content !== null) extras.push({ name: file, content });
        }
      } catch { /* non-critical */ }
    }
    setUploadExtraFiles(extras);
    setReplOpen(false);
    setUploadOpen(true);
  };

  const handleConfirmOverwrite = () => {
    setConfirmOpen(false);
    setCodeEdited(false);
    setIsDirty(false);
    if (serviceRef.current) {
      syncCodeToEditor(serviceRef.current.generateCode());
    }
  };

  const handleOpenAgent = useCallback(async () => {
    const code = editorRef.current?.getContent() ?? generatedCode;
    const xml = serviceRef.current?.serializeToXml() ?? '';
    const sketchName = currentSketch ?? 'sketch';

    const apiKey = await minisApi.getAnthropicKey().catch(() => '');

    const fs = new MemoryFS();
    const enc = new TextEncoder();

    // Project instructions for the agent — describe sketch structure so it creates files correctly
    const claudeMd = [
      '# MicroPython Project',
      '',
      'This is a MicroPython (uPython) project. The file system contains sketch directories.',
      '',
      '## File system structure',
      '```',
      '/{sketchName}/          ← sketch directory (one per sketch)',
      '  {sketchName}.py       ← main MicroPython code file',
      '  {sketchName}.blockly  ← optional Blockly XML (do not edit manually)',
      '```',
      '',
      `## Current sketch: \`${sketchName}\``,
      `The active sketch is at \`/${sketchName}/${sketchName}.py\`.`,
      '',
      '## Rules',
      '- To create a new sketch called `foo`: create directory `/foo/` and file `/foo/foo.py`.',
      '- The main code file MUST have the same name as its parent directory (e.g. `/foo/foo.py`).',
      '- Never place `.py` files directly at the root `/` — they must be inside a sketch directory.',
      '- Do not create files outside of sketch directories.',
    ].join('\n');
    await fs.writeFile('/CLAUDE.md', enc.encode(claudeMd), { create: true, overwrite: true });

    // Load ALL sketches from server so agent can see the full project
    const allSketches = await minisApi.listUpythonSketches(userName!, projectId!).catch(() => [] as string[]);
    for (const sName of allSketches) {
      await fs.mkdir(`/${sName}`);
      const files = await minisApi.listUpythonSketchFiles(userName!, projectId!, sName).catch(() => [] as string[]);
      for (const fileName of files) {
        if (sName === sketchName && (fileName === `${sketchName}.py` || fileName === `${sketchName}.blockly`)) continue; // use in-editor version
        const content = await minisApi.readUpythonSketchFile(userName!, projectId!, sName, fileName).catch(() => null);
        if (content !== null) await fs.writeFile(`/${sName}/${fileName}`, enc.encode(content), { create: true, overwrite: true });
      }
    }

    // Current sketch uses the in-editor (possibly unsaved) version
    if (!allSketches.includes(sketchName)) await fs.mkdir(`/${sketchName}`);
    await fs.writeFile(`/${sketchName}/${sketchName}.py`, enc.encode(code), { create: true, overwrite: true });
    if (xml) {
      await fs.writeFile(`/${sketchName}/${sketchName}.blockly`, enc.encode(xml), { create: true, overwrite: true });
    }

    setAgentApiKey(apiKey);
    setAgentFs(fs);
    setAgentFsVersion((v) => v + 1);
    setAgentOpen(true);
  }, [generatedCode, currentSketch]);

  // --- Splitter drag ---
  const splitterContainerRef = useRef<HTMLDivElement>(null);

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = splitterContainerRef.current;
    if (!container) return;
    const startX = e.clientX;
    const containerRect = container.getBoundingClientRect();
    const startRatio = splitRatio;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newRatio = startRatio + dx / containerRect.width;
      const minRatio = MIN_PANEL_PX / containerRect.width;
      const maxRatio = 1 - minRatio;
      setSplitRatio(Math.min(maxRatio, Math.max(minRatio, newRatio)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      serviceRef.current?.resize();
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const btnSx = (active: boolean) => ({
    bgcolor: active ? 'rgba(255,255,255,0.2)' : 'transparent',
    borderColor: 'rgba(255,255,255,0.4)',
    color: 'inherit',
    minWidth: { xs: 'auto' },
    px: { xs: 0.5, sm: 1.5 },
    '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } },
  });

  const showBlockly = viewMode === 'blockly' || viewMode === 'split';
  const showCode = viewMode === 'code' || viewMode === 'split';

  // Initialize Monaco when code panel mounts, dispose when it unmounts
  useEffect(() => {
    if (!showCode || !editorContainerRef.current) return;

    const editor = EditorInstance.create(editorContainerRef.current, {
      value: generatedCodeRef.current,
      language: 'python',
      theme: 'vs-dark',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      wordWrap: 'off',
      readOnly: false,
    });

    editor.on('contentChanged', () => {
      if (suppressEditorChangeRef.current) return;
      if (isLoadingSketchRef.current) return;
      setCodeEdited(true);
      setSketchLastSource((prev) => {
        const s = currentSketchRef.current;
        if (!s) return prev;
        const next = new Map(prev);
        next.set(s, 'code');
        return next;
      });
      setIsDirty(true);
    });

    editorRef.current = editor;

    return () => {
      editor.dispose();
      editorRef.current = null;
    };
  }, [showCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Current Python code for upload
  const codeForUpload = editorRef.current?.getContent() ?? generatedCode;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      {/* Top AppBar */}
      <AppBar position="static" elevation={1} sx={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Toolbar variant="dense">
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => isDirty ? setBackConfirmOpen(true) : navigate(`/user/${userName}/electronics/upython`)}
            sx={{ mr: 1 }}
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" sx={{ mr: 2, display: { xs: 'none', md: 'block' } }} noWrap>
            uPython Project
          </Typography>

          <Button
            size="small" variant={configOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<Settings />}
            onClick={() => setConfigOpen((v) => !v)}
            sx={btnSx(configOpen)}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Config</Box>
          </Button>

          <Button
            size="small" variant={readmeOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<Description />}
            onClick={() => setReadmeOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(readmeOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>README</Box>
          </Button>

          {isAdmin && (
            <Button
              size="small" variant={agentOpen ? 'contained' : 'outlined'} color="inherit"
              startIcon={<SmartToy />}
              onClick={() => {
                if (agentOpen) { setAgentOpen(false); } else { void handleOpenAgent(); }
              }}
              sx={{ ml: 1, ...btnSx(agentOpen) }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>AI</Box>
            </Button>
          )}

          <Button
            size="small" variant={sketchesOpen ? 'contained' : 'outlined'} color="inherit"
            startIcon={<FolderOpen />}
            onClick={() => setSketchesOpen((v) => !v)}
            sx={{ ml: 1, ...btnSx(sketchesOpen) }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sketches{currentSketch ? `: ${currentSketch}` : ''}</Box>
          </Button>

          {isAdmin && githubRepoUrl && (<>
            <Tooltip title="Push sketches to GitHub">
              <span>
                <Button
                  size="small" variant="outlined" color="inherit"
                  startIcon={pushing ? <CircularProgress size={14} color="inherit" /> : <CloudUpload />}
                  onClick={() => { setPushError(''); setPushTokenOpen(true); }}
                  disabled={pushing}
                  sx={{ ml: 1, ...btnSx(false) }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Push</Box>
                </Button>
              </span>
            </Tooltip>
          </>)}

          <Tooltip title={isDirty && currentSketch ? 'Unsaved changes' : ''}>
            <span>
              <Button
                size="small"
                variant={isDirty && currentSketch ? 'contained' : 'outlined'}
                color={isDirty && currentSketch ? 'warning' : 'inherit'}
                startIcon={<Save />}
                onClick={handleSaveSketch}
                disabled={!currentSketch}
                sx={{ ml: 1, ...(isDirty && currentSketch ? {} : btnSx(false)) }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Save</Box>
              </Button>
            </span>
          </Tooltip>

          <Box sx={{ flexGrow: 1 }} />

          <ButtonGroup size="small">
            <Button
              variant={viewMode === 'blockly' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<Extension />}
              onClick={() => setViewMode('blockly')}
              sx={btnSx(viewMode === 'blockly')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Blockly</Box>
            </Button>
            <Button
              variant={viewMode === 'split' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<VerticalSplit />}
              onClick={() => setViewMode('split')}
              sx={{ ...btnSx(viewMode === 'split'), display: { xs: 'none', md: 'inline-flex' } }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Split</Box>
            </Button>
            <Button
              variant={viewMode === 'code' ? 'contained' : 'outlined'} color="inherit"
              startIcon={<Code />}
              onClick={() => setViewMode('code')}
              sx={btnSx(viewMode === 'code')}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Code{codeEdited ? ' *' : ''}</Box>
            </Button>
          </ButtonGroup>

          <Box sx={{ flexGrow: 1 }} />

          {board && (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mr: 1, display: { xs: 'none', md: 'block' } }}>
              {boardProfiles[board]?.name ?? board}
            </Typography>
          )}
          {/* Upload + Terminal — widoczne tylko na mobilnym */}
          <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <Tooltip title={!selectedDeviceName ? 'No device — open Config to select one' : 'Upload to device'}>
              <span>
                <IconButton
                  color={!selectedDeviceName ? 'warning' : 'inherit'}
                  size="small"
                  onClick={openUploadDialog}
                  disabled={!generatedCode && !codeEdited}
                >
                  <UploadIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="MicroPython REPL Terminal">
              <IconButton color="inherit" size="small" onClick={() => setReplOpen((v) => { if (!v) setUploadOpen(false); return !v; })}>
                <TerminalIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
          <AccountMenu userName={userName} />
        </Toolbar>
      </AppBar>

      {/* Content area */}
      <Box sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* Configuration panel */}
        {configOpen && (
          <Box
            sx={{
              width: { xs: '100%', sm: 280 }, maxWidth: { xs: 320, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
              borderRight: 1, borderColor: 'divider',
              overflow: 'auto', bgcolor: 'background.paper', p: 2,
            }}
          >
            <Typography variant="subtitle2" gutterBottom>Configuration</Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              ID: {projectId}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Board: {board ? (boardProfiles[board]?.name ?? board) : 'Loading...'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Chip: {board ? (boardProfiles[board]?.chipName ?? '—') : '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Platform: MicroPython
            </Typography>
            <FormControl fullWidth size="small" sx={{ mt: 2 }}>
              <InputLabel>Device</InputLabel>
              <Select
                value={selectedDeviceName}
                label="Device"
                onChange={(e) => {
                  const name = e.target.value;
                  setSelectedDeviceName(name);
                  if (projectId) {
                    if (name) localStorage.setItem(`upython_device_${projectId}`, name);
                    else localStorage.removeItem(`upython_device_${projectId}`);
                  }
                }}
                renderValue={(v) => {
                  const d = devices.find((x) => x.name === v);
                  return d ? `${d.name}${d.sn ? ` (${d.sn})` : ''}` : v;
                }}
              >
                <MenuItem value=""><em>— none —</em></MenuItem>
                {devices.map((d) => (
                  <MenuItem key={d.name} value={d.name}>{d.name}{d.sn ? ` (${d.sn})` : ''}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Divider sx={{ mt: 2, mb: 1 }} />
            <Typography variant="subtitle2" gutterBottom>Hardware Categories</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {HARDWARE_CATEGORY_NAMES.map((name) => {
                const visible = !hiddenCategories.has(name);
                return (
                  <Button
                    key={name}
                    size="small"
                    variant={visible ? 'contained' : 'outlined'}
                    onClick={() => {
                      const next = new Set(hiddenCategories);
                      if (visible) { next.add(name); } else { next.delete(name); }
                      hiddenCategoriesRef.current = next;
                      setHiddenCategories(next);
                      localStorage.setItem('upython_hidden_cats', JSON.stringify([...next]));
                      serviceRef.current?.updateToolboxVisibility(next);
                    }}
                    sx={{ textTransform: 'none', fontSize: '0.7rem', px: 0.75, py: 0.25, minWidth: 0 }}
                  >
                    {name}
                  </Button>
                );
              })}
            </Box>

            {scriptCategories.length > 0 && (
              <>
                <Divider sx={{ mt: 2, mb: 1 }} />
                <Typography variant="subtitle2" gutterBottom>Script Categories</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {scriptCategories.map((cat) => (
                    <Chip
                      key={cat.name}
                      label={cat.name}
                      size="small"
                      sx={{ bgcolor: cat.colour, color: '#fff', fontSize: '0.7rem' }}
                    />
                  ))}
                </Box>
              </>
            )}

            <Divider sx={{ mt: 2, mb: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>Libraries</Typography>
              <Tooltip title="Add library">
                <IconButton
                  size="small"
                  onClick={() => setProjectLibraries((prev) => [...prev, { url: '', remoteName: '' }])}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Save to project.js">
                <span>
                  <IconButton
                    size="small"
                    onClick={handleSaveLibraries}
                    disabled={libSaving || projectScript === undefined || projectScript === null}
                  >
                    {libSaving ? <CircularProgress size={16} /> : <SaveOutlined fontSize="small" />}
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            {projectLibraries.length === 0 && (
              <Typography variant="caption" color="text.secondary">No libraries</Typography>
            )}
            {projectLibraries.map((lib, idx) => (
              <Box key={idx} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TextField
                    size="small"
                    label="Remote name"
                    value={lib.remoteName}
                    onChange={(e) => {
                      const next = [...projectLibraries];
                      next[idx] = { ...next[idx], remoteName: e.target.value };
                      setProjectLibraries(next);
                    }}
                    sx={{ flex: 1, fontSize: '0.75rem' }}
                    inputProps={{ style: { fontSize: '0.75rem' } }}
                  />
                  <Tooltip title="Remove">
                    <IconButton
                      size="small"
                      onClick={() => setProjectLibraries((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <TextField
                  size="small"
                  label="URL"
                  value={lib.url}
                  onChange={(e) => {
                    const next = [...projectLibraries];
                    next[idx] = { ...next[idx], url: e.target.value };
                    setProjectLibraries(next);
                  }}
                  fullWidth
                  inputProps={{ style: { fontSize: '0.75rem' } }}
                />
              </Box>
            ))}
          </Box>
        )}

        {/* README panel */}
        {readmeOpen && (
          <Box
            sx={{
              width: readmeExpanded ? '100%' : { xs: '100%', sm: 360 },
              maxWidth: readmeExpanded ? '100%' : { xs: 400, sm: 'none' },
              flexShrink: readmeExpanded ? 1 : 0,
              position: { xs: 'absolute', sm: readmeExpanded ? 'absolute' : 'relative' },
              zIndex: readmeExpanded ? 1200 : { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0, right: readmeExpanded ? 0 : 'auto',
              borderRight: readmeExpanded ? 0 : 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>README</Typography>
              {readmeEditMode ? (
                <>
                  <Tooltip title="Save">
                    <IconButton size="small" onClick={handleSaveReadme}><Save fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Cancel">
                    <IconButton size="small" onClick={() => setReadmeEditMode(false)}><Close sx={{ fontSize: 16 }} /></IconButton>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Tooltip title={readmeExpanded ? 'Collapse' : 'Expand'}>
                    <IconButton size="small" onClick={() => setReadmeExpanded((v) => !v)}>
                      {readmeExpanded ? <CloseFullscreen fontSize="small" /> : <OpenInFull fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => { setReadmeEditValue(readmeContent ?? ''); setReadmeEditMode(true); }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
              {readmeEditMode ? (
                <TextField
                  multiline
                  fullWidth
                  minRows={10}
                  value={readmeEditValue}
                  onChange={(e) => setReadmeEditValue(e.target.value)}
                  variant="outlined"
                  size="small"
                  inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
                />
              ) : readmeContent ? (
                <Box sx={{ '& h1,h2,h3': { mt: 1, mb: 0.5 }, '& p': { mt: 0, mb: 1 }, '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto', fontSize: 12 }, '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5, fontSize: 12 }, '& table': { borderCollapse: 'collapse', width: '100%', fontSize: 12, mb: 1 }, '& th,td': { border: 1, borderColor: 'divider', px: 1, py: 0.5 }, '& th': { bgcolor: 'action.hover', fontWeight: 'bold' } }}>
                  <ReactMarkdown remarkPlugins={[remarkBreaks, remarkGfm]}>{readmeContent}</ReactMarkdown>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No README yet. Click <EditIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} /> to create one.
                </Typography>
              )}
            </Box>
          </Box>
        )}

        {/* AI Agent panel */}
        {isAdmin && agentOpen && agentFs && (
          <Box
            sx={{
              width: { xs: '100%', sm: 380 }, maxWidth: { xs: 420, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
              borderRight: 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <AgentPanel
              key={agentFsVersion}
              provider={agentFs}
              providerVersion={agentFsVersion}
              webFetchUrl="/api/web-fetch"
              authToken={token ?? undefined}
              defaultConfig={{
                providerType: 'anthropic',
                providers: {
                  ...DEFAULT_AGENT_CONFIG.providers,
                  anthropic: {
                    ...DEFAULT_AGENT_CONFIG.providers.anthropic,
                    apiKey: agentApiKey,
                  },
                },
              }}
            />
          </Box>
        )}

        {/* Sketches panel */}
        {sketchesOpen && (
          <Box
            sx={{
              width: { xs: '100%', sm: 220 }, maxWidth: { xs: 280, sm: 'none' },
              flexShrink: 0,
              position: { xs: 'absolute', sm: 'relative' },
              zIndex: { xs: 10, sm: 'auto' },
              top: 0, bottom: 0, left: 0,
              borderRight: 1, borderColor: 'divider',
              display: 'flex', flexDirection: 'column',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="subtitle2" sx={{ p: 2, pb: 1 }}>Sketches</Typography>
            <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 0.5 }}>
              <TextField
                size="small"
                placeholder="new sketch name"
                value={newSketchName}
                onChange={(e) => setNewSketchName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleNewSketch(); }}
                inputProps={{ style: { fontSize: 12, padding: '4px 8px' } }}
                sx={{ flexGrow: 1 }}
              />
              <Tooltip title="Create sketch">
                <span>
                  <IconButton size="small" onClick={handleNewSketch} disabled={!newSketchName.trim()}>
                    <Add fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <List dense sx={{ flexGrow: 1, overflow: 'auto' }}>
              {sketches.map((name) => {
                const expanded = expandedSketches.has(name);
                const files = sketchFiles.get(name) ?? [];
                const lastSrc = sketchLastSource.get(name) ?? 'blockly';
                return (
                  <Box key={name}>
                    <ListItemButton
                      selected={currentSketch === name}
                      onClick={() => handleLoadSketch(name)}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(name); }}
                      onDragLeave={() => setDropTarget(null)}
                      onDrop={(e) => { e.preventDefault(); setDropTarget(null); void handleDropOnSketch(name, e.dataTransfer); }}
                      sx={{
                        pr: 0.5,
                        outline: dropTarget === name ? '2px dashed' : 'none',
                        outlineColor: 'primary.main',
                      }}
                    >
                      <ListItemText
                        primary={name}
                        primaryTypographyProps={{ fontSize: 13, noWrap: true }}
                        sx={{ flexGrow: 1, minWidth: 0 }}
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); void handleToggleSketchExpand(name); }}
                        sx={{ ml: 0.5, p: 0.25 }}
                      >
                        {expanded ? <ExpandLess fontSize="inherit" /> : <ExpandMore fontSize="inherit" />}
                      </IconButton>
                    </ListItemButton>
                    <Collapse in={expanded} unmountOnExit>
                      <List dense disablePadding>
                        {files.map((file) => {
                          const isLastEdited =
                            (lastSrc === 'code' && file === `${name}.py`) ||
                            (lastSrc === 'blockly' && file === `${name}.blockly`);
                          const isOpen = isLastEdited && name === currentSketch;
                          const fileColor = isOpen ? 'error.main' : isLastEdited ? 'primary.main' : 'text.primary';
                          return (
                          <ListItemButton
                            key={file}
                            onClick={() => void handleLoadSketchFile(name, file)}
                            sx={{ pl: 3.5, py: 0.25, pr: 0.5 }}
                          >
                            <InsertDriveFile sx={{ fontSize: 14, mr: 0.75, color: fileColor, flexShrink: 0 }} />
                            <ListItemText
                              primary={file}
                              primaryTypographyProps={{ fontSize: 11, noWrap: true, color: fileColor, fontWeight: isLastEdited ? 600 : 400 }}
                              sx={{ flexGrow: 1, minWidth: 0 }}
                            />
                            <IconButton
                              size="small"
                              onClick={(e) => void handleDeleteSketchFile(name, file, e)}
                              sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1, color: 'error.main' } }}
                            >
                              <DeleteIcon sx={{ fontSize: 13 }} />
                            </IconButton>
                          </ListItemButton>
                          );
                        })}
                        {files.length === 0 && (
                          <Typography sx={{ pl: 4, py: 0.5, fontSize: 11, color: 'text.disabled' }}>
                            empty
                          </Typography>
                        )}
                      </List>
                    </Collapse>
                  </Box>
                );
              })}
              {sketches.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1 }}>
                  No sketches yet
                </Typography>
              )}
            </List>
          </Box>
        )}

        {/* Editor area */}
        <Box
          ref={splitterContainerRef}
          sx={{ flexGrow: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}
        >
          {/* Blockly panel */}
          <Box
            sx={{
              position: 'relative', overflow: 'hidden',
              display: showBlockly ? 'block' : 'none',
              width: viewMode === 'split' ? `${splitRatio * 100}%` : '100%',
              height: '100%',
              flexShrink: 0,
            }}
          >
            <UPythonBlocklyComponent
              onServiceReady={handleServiceReady}
              initialBoard={board}
              ready={blocklyReady && projectScript !== undefined}
              projectScript={projectScript ?? undefined}
            />
          </Box>

          {/* Splitter handle */}
          {viewMode === 'split' && (
            <Box
              onMouseDown={handleSplitterMouseDown}
              sx={{
                width: 6, cursor: 'col-resize', bgcolor: 'divider', flexShrink: 0,
                '&:hover': { bgcolor: 'primary.main' },
                transition: 'background-color 0.15s',
              }}
            />
          )}

          {/* Code panel */}
          {showCode && (
            <Box
              ref={editorContainerRef}
              sx={{ flexGrow: 1, overflow: 'hidden', minWidth: MIN_PANEL_PX, height: '100%' }}
            />
          )}
        </Box>
      </Box>

      {/* REPL Terminal — floating panel (consistent with WebSerialTerminal / BuildOutputPanel) */}
      <MpyReplTerminal
        open={replOpen}
        onClose={() => setReplOpen(false)}
        code={codeForUpload}
      />

      {/* Bottom status bar */}
      <AppBar position="static" elevation={0} color="default" sx={{ borderTop: 1, borderColor: 'divider', display: { xs: 'none', sm: 'block' } }}>
        <Toolbar variant="dense" sx={{ minHeight: 36 }}>
          <Tooltip title={!selectedDeviceName ? 'No device — open Config to select one' : 'Upload to device'}>
            <span>
              <IconButton
                size="small"
                onClick={openUploadDialog}
                disabled={!generatedCode && !codeEdited}
                color={!selectedDeviceName ? 'warning' : 'default'}
              >
                <UploadIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="MicroPython REPL Terminal">
            <IconButton size="small" onClick={() => setReplOpen((v) => { if (!v) setUploadOpen(false); return !v; })}>
              <TerminalIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {!selectedDeviceName && (
            <Chip
              icon={<WarningAmber sx={{ fontSize: '14px !important' }} />}
              label="No device — open Config"
              size="small"
              color="warning"
              variant="outlined"
              onClick={() => setConfigOpen(true)}
              sx={{ ml: 1, fontSize: '0.7rem', height: 22, cursor: 'pointer' }}
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {boardProfiles[board]?.name ?? board}
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        code={uploadCode}
        userName={userName}
        board={board}
        projectId={projectId}
        deviceName={selectedDeviceName || undefined}
        libraries={projectLibraries}
        extraFiles={uploadExtraFiles}
      />

      {/* Confirm overwrite dialog */}
      {/* Push to GitHub dialog */}
      <Dialog open={pushTokenOpen} onClose={() => setPushTokenOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Push to GitHub</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Enter a GitHub Personal Access Token with write access to <strong>{githubRepoUrl}</strong>.<br />
            Leave empty to use the server&apos;s <code>GITHUB_TOKEN</code> env var.
          </DialogContentText>
          <TextField
            label="GitHub Token (optional)"
            type="password"
            fullWidth size="small"
            value={pushToken}
            onChange={(e) => setPushToken(e.target.value)}
            placeholder="ghp_..."
          />
          {pushError && <DialogContentText color="error" sx={{ mt: 1 }}>{pushError}</DialogContentText>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPushTokenOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={pushing}
            startIcon={pushing ? <CircularProgress size={14} /> : <CloudUpload />}
            onClick={async () => {
              if (!userName || !projectId) return;
              setPushError('');
              setPushing(true);
              try {
                const result = await minisApi.pushProjectToGithub(userName, projectId, pushToken || undefined);
                setPushTokenOpen(false);
                setPushToken('');
                console.log(`Pushed ${result.fileCount} files, commit: ${result.commitSha}`);
              } catch (err) {
                setPushError(err instanceof Error ? err.message : String(err));
              } finally {
                setPushing(false);
              }
            }}
          >
            Push
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={backConfirmOpen} onClose={() => setBackConfirmOpen(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Save before leaving?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setBackConfirmOpen(false); navigate(`/user/${userName}/electronics/upython`); }}>
            Discard
          </Button>
          <Button
            onClick={async () => {
              setBackConfirmOpen(false);
              await handleSaveSketch().catch(() => {});
              navigate(`/user/${userName}/electronics/upython`);
            }}
            color="primary" variant="contained"
          >
            Save &amp; go back
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Overwrite manual changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have manually edited the code. Blockly changes will regenerate the code and overwrite
            your edits. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmOverwrite} color="warning" variant="contained">
            Overwrite
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UPythonProjectPage;
