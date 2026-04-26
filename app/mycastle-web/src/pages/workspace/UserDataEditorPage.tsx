import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { CompositeFS, RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider, FileSystemCapabilities, FileStat, DirectoryEntry, WriteFileOptions, DeleteOptions, RenameOptions } from '@mhersztowski/core';
import type { VfsEvent, FileChangeEvent } from '@mhersztowski/core';
import { MonacoMultiEditor, remoteFsProvider, defaultProviderRegistry, DEFAULT_AGENT_CONFIG, WordCountPluginV2, GenerateUuidPlugin } from '@mhersztowski/web-client';
import type { VfsProviderDef, VfsMountPreset, VfsProjectContext } from '@mhersztowski/web-client';
import { ArduinoBoardConfigDialog } from '../../components/ArduinoBoardConfigDialog';
import { MarkdownPreviewPlugin } from '../../plugins/MarkdownPreviewPlugin';
import { MarkdownEditorPlugin } from '../../plugins/MarkdownEditorPlugin';
import { FoldingPlugin } from '../../plugins/FoldingPlugin';
import { createTypeScriptPlugin } from '../../plugins/TypeScriptIntelliSensePlugin';
import { createPythonPlugin } from '../../plugins/PythonIntelliSensePlugin';
import { createCppPlugin } from '../../plugins/CppIntelliSensePlugin';
import { VisualMinisLibPlugin } from '../../plugins/VisualMinisLibPlugin';
import { createMjdEditorPlugin } from '../../plugins/MjdEditorPlugin';
import { createSnippetsPlugin } from '../../plugins/SnippetsPlugin';
import { createMarkdownLspPlugin } from '../../plugins/MarkdownLspPlugin';
import { createMarkdownLspServerPlugin } from '../../plugins/MarkdownLspServerPlugin';
import type { AgentConfig } from '@mhersztowski/web-client';
import { useAuth } from '../../modules/auth';
import { minisApi } from '../../services/MinisApiService';
import '@modules/editor/monacoWorkers';
import '@xterm/xterm/css/xterm.css';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

const REMOTE_TERMINAL_TOKEN_KEY = 'mycastle_remote_terminal_token';

function buildWorkspaceClaudeMd(userName: string, isAdmin: boolean): string {
  const lines = [
    '# User Data Editor',
    '',
    'You are working inside the MyCastle personal data editor.',
    '',
    '## File system mounts',
    `- \`/home/\` — personal data directory for user **${userName}** (maps to \`/data/Minis/Users/${userName}/\` on the server)`,
  ];
  if (isAdmin) {
    lines.push('- `/server/` — full server filesystem (admin access only)');
  }
  lines.push(
    '',
    `## Current user: \`${userName}\``,
    '',
    '## Rules',
    '- Personal files must be placed under `/home/`. Never create files at the root `/`.',
    '- Markdown notes go in `/home/notes/` (`.md` files).',
    '- Do not modify files under `/server/` unless explicitly asked.',
    '',
    '## Projects — Electronics projects',
    '',
    'Projects live under `/home/Projects/{projectId}/`. Each project directory MUST contain a `project.json` file.',
    'Without it the editor cannot show project actions (Compile / Deploy / Build etc.).',
    '',
    '### project.json format',
    '```json',
    '{',
    '  "id": "<projectId — must match the project registered in /home/Project.json>",',
    '  "name": "<human-readable name>",',
    '  "platform": "<Arduino|uPython|pygame|PicoSdk>",',
    '  "boardProfileKey": "<esp32s3_pico|esp32s3_zero|esp32_devkitc — optional, for Arduino/uPython>"',
    '}',
    '```',
    '',
    '### Platform detection — how to infer platform from file extensions',
    '| Files present in sketches/ | Platform |',
    '|----------------------------|----------|',
    '| `*.ino`                    | `Arduino` |',
    '| `main.c` or `CMakeLists.txt` | `PicoSdk` |',
    '| `*.py` + no `.ino`/`main.c` | `uPython` |',
    '| `*.py` with pygame imports  | `pygame` |',
    '',
    '### When project.json is missing — procedure',
    '1. List the project directory to see what files are present.',
    `2. Read \`/home/Project.json\` — this is the registry; find the entry whose \`id\` matches the directory name (or whose \`name\` matches). It contains \`softwarePlatform\`, \`boardProfileKey\`, \`id\`, \`name\`.`,
    '3. If the entry is found: use its `id`, `name`, `softwarePlatform` (as `platform`) and `boardProfileKey`.',
    '4. If not found in registry: detect platform from file extensions (table above), use the directory name as both `id` and `name`.',
    '5. Write `project.json` to the project root (e.g. `/home/Projects/{projectId}/project.json`).',
    '6. Inform the user that the file was created and that they should refresh the file explorer to see project actions.',
    '',
    '### Creating a new project — procedure',
    '**IMPORTANT: project directories MUST use the project `id` (UUID) as their name, never the human-readable name.**',
    '',
    '1. Generate a UUID for the new project (e.g. `crypto.randomUUID()` style: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`).',
    '   - In practice: produce a UUID v4 yourself — 8-4-4-4-12 hex characters separated by dashes.',
    '2. Register the project in `/home/Project.json` by appending to the `projects` array:',
    '   `{ "id": "<uuid>", "name": "<human name>", "softwarePlatform": "Arduino|uPython|pygame|PicoSdk", "boardProfileKey": "..." }`',
    '3. Create the directory `/home/Projects/<uuid>/` (e.g. by writing an initial file inside it).',
    '4. Write `project.json` inside `/home/Projects/<uuid>/project.json` with the values from step 2.',
    '5. Create a `sketches/` subdirectory with at least one starter sketch directory.',
    '6. Inform the user of the UUID-named directory and that they should refresh the file explorer.',
    '',
    '### /home/Project.json format (registry)',
    '```json',
    '{ "projects": [ { "id": "...", "name": "...", "softwarePlatform": "Arduino|uPython|pygame|PicoSdk", "boardProfileKey": "..." } ] }',
    '```',
  );
  return lines.join('\n');
}

/** Prefixes every path operation with a fixed base path — identical to VfsView's SubpathFS. */
class SubpathFS implements FileSystemProvider {
  readonly scheme: string;
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]>;
  constructor(private readonly inner: FileSystemProvider, private readonly prefix: string) {
    this.scheme = inner.scheme;
    this.onDidChangeFile = inner.onDidChangeFile;
  }
  get capabilities(): FileSystemCapabilities { return this.inner.capabilities; }
  private p(path: string) { return path === '/' ? this.prefix : this.prefix + path; }
  stat(path: string): Promise<FileStat> { return this.inner.stat(this.p(path)); }
  readDirectory(path: string): Promise<DirectoryEntry[]> { return this.inner.readDirectory(this.p(path)); }
  readFile(path: string): Promise<Uint8Array> { return this.inner.readFile(this.p(path)); }
  writeFile(path: string, content: Uint8Array, opts?: WriteFileOptions) { return this.inner.writeFile!(this.p(path), content, opts); }
  mkdir(path: string) { return this.inner.mkdir!(this.p(path)); }
  delete(path: string, opts?: DeleteOptions) { return this.inner.delete!(this.p(path), opts); }
  rename(o: string, n: string, opts?: RenameOptions) { return this.inner.rename!(this.p(o), this.p(n), opts); }
}

function RemoteTerminalConfigDialog({
  open,
  currentToken,
  onSave,
  onClose,
}: {
  open: boolean;
  currentToken: string;
  onSave: (token: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentToken);

  useEffect(() => {
    if (open) setDraft(currentToken);
  }, [open, currentToken]);

  const handleSave = useCallback(() => {
    onSave(draft.trim());
  }, [draft, onSave]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Remote Terminal — API Key</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The terminal connects to <strong>mycastle.hersztowski.org</strong>. This server requires
          its own API key — your local session token is not accepted there.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Generate an API key at{' '}
          <Link href="https://mycastle.hersztowski.org/user/marcin/tools/api-keys" target="_blank" rel="noopener">
            mycastle.hersztowski.org → Tools → API Keys
          </Link>
          , then paste it below.
        </Typography>
        <TextField
          label="API Key"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          fullWidth
          size="small"
          placeholder="minis_..."
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </DialogContent>
      <DialogActions>
        {currentToken && (
          <Button color="error" onClick={() => onSave('')} sx={{ mr: 'auto' }}>
            Clear
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!draft.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function UserDataEditorPage() {
  const { token, currentUser, isAdmin } = useAuth();
  const homeMountedRef = useRef(false);
  const [agentDefaultConfig, setAgentDefaultConfig] = useState<Partial<AgentConfig> | undefined>(undefined);

  useEffect(() => {
    minisApi.getAnthropicKey().then(apiKey => {
      setAgentDefaultConfig({
        providerType: 'anthropic',
        providers: {
          ...DEFAULT_AGENT_CONFIG.providers,
          anthropic: { ...DEFAULT_AGENT_CONFIG.providers.anthropic, apiKey },
        },
      });
    }).catch(() => {});
  }, []);

  const claudeMd = useMemo(
    () => currentUser ? buildWorkspaceClaudeMd(currentUser.name, isAdmin) : '',
    [currentUser, isAdmin],
  );

  const [cfs] = useState(() => new CompositeFS());
  // remoteRef holds the RemoteFS once created; remoteForProvider triggers re-renders for dependent useMemo
  const remoteRef = useRef<RemoteFS | null>(null);
  const [remoteForProvider, setRemoteForProvider] = useState<RemoteFS | null>(null);

  // Keep token in sync whenever remote is ready
  useEffect(() => {
    remoteRef.current?.setToken(token ?? undefined);
  }, [token]);

  // Mount /home once user + token are available — create RemoteFS with user-scoped URL
  useEffect(() => {
    if (!currentUser || !token || homeMountedRef.current) return;
    homeMountedRef.current = true;

    // Non-admin users use a scoped endpoint that only allows access to their own home dir
    const homeBaseUrl = isAdmin ? '/api/vfs' : `/api/users/${currentUser.name}/vfs`;
    const homeRemote = new RemoteFS({ baseUrl: homeBaseUrl });
    homeRemote.setToken(token);
    remoteRef.current = homeRemote;
    setRemoteForProvider(homeRemote);

    cfs.mount('/home', new SubpathFS(homeRemote, `/data/Minis/Users/${currentUser.name}`));

    if (isAdmin) {
      const adminRemote = new RemoteFS({ baseUrl: '/api/vfs' });
      adminRemote.setToken(token);
      cfs.mount('/server', adminRemote);
    }
  }, [currentUser, token, cfs, isAdmin]);

  // Custom provider that recreates the same SubpathFS mount as the CompositeFS setup above.
  const userHomeProviderDef = useMemo((): VfsProviderDef | null => {
    if (!currentUser || !remoteForProvider) return null;
    const userName = currentUser.name;
    return {
      type: 'user-home',
      label: 'User Home',
      description: `Personal directory for ${userName}`,
      configFields: [],
      factory: () => new SubpathFS(remoteForProvider, `/data/Minis/Users/${userName}`),
    };
  }, [currentUser, remoteForProvider]);

  const registry = useMemo(
    () => [remoteFsProvider, ...(userHomeProviderDef ? [userHomeProviderDef] : []), ...defaultProviderRegistry],
    [userHomeProviderDef],
  );

  const defaultMountPresets = useMemo((): VfsMountPreset[] => {
    if (!currentUser) return [];
    return [{
      id: 'builtin-user-home',
      name: `${currentUser.name}'s home`,
      mountPoint: '/home',
      providerType: 'user-home',
      config: {},
    }];
  }, [currentUser]);

  const tsPlugin = useMemo(() => createTypeScriptPlugin(cfs), [cfs]);
  const pyPlugin = useMemo(() => createPythonPlugin(cfs), [cfs]);
  const cppPlugin = useMemo(() => createCppPlugin(cfs), [cfs]);
  const mjdPlugin = useMemo(() => createMjdEditorPlugin(cfs), [cfs]);
  const snippetsPlugin = useMemo(() => createSnippetsPlugin(cfs), [cfs]);
  const mdLspPlugin = useMemo(() => createMarkdownLspPlugin(cfs), [cfs]);
  const mdLspServerPlugin = useMemo(
    () => token ? createMarkdownLspServerPlugin(token) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!token], // recreate only when token transitions null↔value, not on every refresh
  );

  const projectDeps = useMemo(
    () => currentUser ? { baseUrl: '', authToken: token ?? undefined, userName: currentUser.name } : undefined,
    [currentUser, token],
  );

  // Board config dialog state
  const [boardConfigContext, setBoardConfigContext] = useState<VfsProjectContext | null>(null);
  const boardConfigSaveRef = useRef<((updates: Record<string, unknown>) => Promise<void>) | null>(null);

  const handleDialogAction = useCallback((
    actionId: string,
    context: VfsProjectContext,
    saveProjectJson: (updates: Record<string, unknown>) => Promise<void>,
  ) => {
    if (actionId === 'board-config') {
      boardConfigSaveRef.current = saveProjectJson;
      setBoardConfigContext(context);
    }
  }, []);

  const handleBoardConfigSave = useCallback(async (updates: Record<string, unknown>) => {
    await boardConfigSaveRef.current?.(updates);
  }, []);

  // Remote terminal API key — stored in localStorage, separate from local JWT
  const [remoteTerminalToken, setRemoteTerminalToken] = useState<string>(
    () => localStorage.getItem(REMOTE_TERMINAL_TOKEN_KEY) ?? '',
  );
  const [terminalConfigOpen, setTerminalConfigOpen] = useState(false);

  const handleSaveRemoteToken = useCallback((value: string) => {
    if (value) {
      localStorage.setItem(REMOTE_TERMINAL_TOKEN_KEY, value);
    } else {
      localStorage.removeItem(REMOTE_TERMINAL_TOKEN_KEY);
    }
    setRemoteTerminalToken(value);
    setTerminalConfigOpen(false);
  }, []);

  return (
    <>
      <MonacoMultiEditor
        provider={cfs as FileSystemProvider}
        height="100%"
        providerRegistry={registry}
        defaultMountPresets={defaultMountPresets}
        plugins={[WordCountPluginV2, GenerateUuidPlugin, FoldingPlugin, MarkdownPreviewPlugin, MarkdownEditorPlugin, mjdPlugin, tsPlugin, pyPlugin, cppPlugin, VisualMinisLibPlugin, snippetsPlugin, mdLspPlugin, ...(mdLspServerPlugin ? [mdLspServerPlugin] : [])]}
        enableAgent={isAdmin}
        defaultAgentConfig={agentDefaultConfig}
        agentClaudeMd={claudeMd}
        agentAuthToken={token ?? undefined}
        enableTerminal={isAdmin}
        terminalToken={remoteTerminalToken || undefined}
        onTerminalConfigRequest={() => setTerminalConfigOpen(true)}
        projectDeps={projectDeps}
        onDialogAction={handleDialogAction}
      />
      {boardConfigContext && (
        <ArduinoBoardConfigDialog
          open={boardConfigContext !== null}
          context={boardConfigContext}
          onClose={() => setBoardConfigContext(null)}
          onSave={handleBoardConfigSave}
        />
      )}
      <RemoteTerminalConfigDialog
        open={terminalConfigOpen}
        currentToken={remoteTerminalToken}
        onSave={handleSaveRemoteToken}
        onClose={() => setTerminalConfigOpen(false)}
      />
    </>
  );
}
