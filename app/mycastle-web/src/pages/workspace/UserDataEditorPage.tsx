import { useEffect, useMemo, useRef, useState } from 'react';
import { CompositeFS, RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider, FileSystemCapabilities, FileStat, DirectoryEntry, WriteFileOptions, DeleteOptions, RenameOptions } from '@mhersztowski/core';
import type { VfsEvent, FileChangeEvent } from '@mhersztowski/core';
import { MonacoMultiEditor, remoteFsProvider, defaultProviderRegistry, DEFAULT_AGENT_CONFIG, WordCountPluginV2 } from '@mhersztowski/web-client';
import { MarkdownPreviewPlugin } from '../../plugins/MarkdownPreviewPlugin';
import { MarkdownEditorPlugin } from '../../plugins/MarkdownEditorPlugin';
import type { AgentConfig } from '@mhersztowski/web-client';
import { useAuth } from '../../modules/auth';
import { minisApi } from '../../services/MinisApiService';
import '@modules/editor/monacoWorkers';
import '@xterm/xterm/css/xterm.css';

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

  const [{ cfs, remote }] = useState(() => {
    const remote = new RemoteFS({ baseUrl: '/api/vfs' });
    const cfs = new CompositeFS();
    return { cfs, remote };
  });

  // Keep token in sync
  useEffect(() => {
    remote.setToken(token ?? undefined);
  }, [token, remote]);

  // Mount /home once user + token are available
  useEffect(() => {
    if (!currentUser || !token || homeMountedRef.current) return;
    homeMountedRef.current = true;
    cfs.mount('/home', new SubpathFS(remote, `/data/Minis/Users/${currentUser.name}`));
    if (isAdmin) cfs.mount('/server', remote);
  }, [currentUser, token, cfs, remote]);

  const registry = useMemo(() => [remoteFsProvider, ...defaultProviderRegistry], []);

  const projectDeps = useMemo(
    () => currentUser ? { baseUrl: '', authToken: token ?? undefined, userName: currentUser.name } : undefined,
    [currentUser, token],
  );

  return (
    <MonacoMultiEditor
      provider={cfs as FileSystemProvider}
      height="100%"
      providerRegistry={registry}
      plugins={[WordCountPluginV2, MarkdownPreviewPlugin, MarkdownEditorPlugin]}
      enableAgent={isAdmin}
      defaultAgentConfig={agentDefaultConfig}
      agentClaudeMd={claudeMd}
      agentAuthToken={token ?? undefined}
      enableTerminal
      terminalToken={token ?? undefined}
      projectDeps={projectDeps}
    />
  );
}
