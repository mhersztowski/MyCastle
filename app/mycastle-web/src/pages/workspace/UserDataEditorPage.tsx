import { useEffect, useMemo, useRef, useState } from 'react';
import { CompositeFS, RemoteFS } from '@mhersztowski/core';
import type { FileSystemProvider } from '@mhersztowski/core';
import {
  TextEditorWorkspace, SubpathFS, DEFAULT_AGENT_CONFIG, createVfsUmlProjectSource,
  remoteFsProvider, defaultProviderRegistry,
} from '@mhersztowski/texteditor';
import type { VfsProviderDef, VfsMountPreset, AgentConfig } from '@mhersztowski/texteditor';
import { MarkdownEditorPlugin } from '../../plugins/MarkdownEditorPlugin';
import { useAuth } from '../../modules/auth';
import { minisApi } from '../../services/MinisApiService';
import { ReadOnlyFS } from '../../vfs/ReadOnlyFS';
import '@modules/editor/monacoWorkers';

// localStorage key for the remote-terminal API key — kept stable so existing
// users do not lose their saved token after the editor was extracted to a package.
const REMOTE_TERMINAL_TOKEN_KEY = 'mycastle_remote_terminal_token';

/** MyCastle-specific agent workspace guide — injected into the agent system prompt. */
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
    lines.push('- `/mycastle-code/` — MyCastle monorepo source tree (**read-only** — do not attempt to write)');
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

/**
 * MyCastle personal-data editor page. Thin host around the reusable
 * {@link TextEditorWorkspace} component: builds the user-scoped composite
 * filesystem, fetches the agent API key, and supplies the workspace guide.
 */
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
      // MyCastle source tree — read-only wrapper hides write actions from the editor and the agent.
      cfs.mount('/mycastle-code', new ReadOnlyFS(new SubpathFS(homeRemote, '/mycastle-code')));
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

  // MyCastle source tree — admin only (uses /api/vfs admin scope). Wrapped in ReadOnlyFS
  // so the editor hides write actions and the agent treats files as immutable.
  const mycastleCodeProviderDef = useMemo((): VfsProviderDef | null => {
    if (!isAdmin || !remoteForProvider) return null;
    return {
      type: 'mycastle-code',
      label: 'MyCastle Source',
      description: 'MyCastle monorepo source tree (read-only)',
      configFields: [],
      factory: () => new ReadOnlyFS(new SubpathFS(remoteForProvider, '/mycastle-code')),
    };
  }, [isAdmin, remoteForProvider]);

  const registry = useMemo(
    () => [
      remoteFsProvider,
      ...(userHomeProviderDef ? [userHomeProviderDef] : []),
      ...(mycastleCodeProviderDef ? [mycastleCodeProviderDef] : []),
      ...defaultProviderRegistry,
    ],
    [userHomeProviderDef, mycastleCodeProviderDef],
  );

  const defaultMountPresets = useMemo((): VfsMountPreset[] => {
    if (!currentUser) return [];
    const presets: VfsMountPreset[] = [{
      id: 'builtin-user-home',
      name: `${currentUser.name}'s home`,
      mountPoint: '/home',
      providerType: 'user-home',
      config: {},
    }];
    if (isAdmin) {
      presets.push({
        id: 'builtin-mycastle-code',
        name: 'MyCastle Source',
        mountPoint: '/mycastle-code',
        providerType: 'mycastle-code',
        config: {},
      });
    }
    return presets;
  }, [currentUser, isAdmin]);

  const projectDeps = useMemo(
    () => currentUser ? { baseUrl: '', authToken: token ?? undefined, userName: currentUser.name } : undefined,
    [currentUser, token],
  );

  /**
   * Diagramy UML dla edytora bloczkowego.
   *
   * Ta sama konfiguracja źródła, której używa MinisLib Graph (tryb „ten serwer"
   * albo wskazany zdalny) — dzięki temu obie wtyczki widzą te same projekty
   * i adres serwera podaje się raz.
   *
   * `useMemo` bez zależności nie jest ozdobnikiem: nowy obiekt przy każdym
   * renderze oznaczałby nową wtyczkę Blockly, a więc przeładowanie zestawu
   * wtyczek edytora przy każdym odświeżeniu strony.
   */
  const umlProjectSource = useMemo(() => createVfsUmlProjectSource(), []);

  return (
    <TextEditorWorkspace
      provider={cfs as FileSystemProvider}
      providerRegistry={registry}
      defaultMountPresets={defaultMountPresets}
      extraPlugins={[MarkdownEditorPlugin]}
      enableAgent={isAdmin}
      defaultAgentConfig={agentDefaultConfig}
      agentClaudeMd={claudeMd}
      agentAuthToken={token ?? undefined}
      enableTerminal={isAdmin}
      terminalServerName="mycastle.hersztowski.org"
      terminalApiKeysUrl="https://mycastle.hersztowski.org/user/marcin/tools/api-keys"
      terminalTokenStorageKey={REMOTE_TERMINAL_TOKEN_KEY}
      projectDeps={projectDeps}
      blocklyUmlSource={umlProjectSource}
    />
  );
}
