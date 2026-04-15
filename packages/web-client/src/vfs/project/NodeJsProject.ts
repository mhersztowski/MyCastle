import { Project } from './Project';
import type { ProjectAction, ProjectDeps } from './types';
import type { VfsProjectContext } from '../types';

interface DoneEvent {
  success: boolean;
  exitCode?: number;
  error?: string;
}

export class NodeJsProject extends Project {
  constructor(context: VfsProjectContext, deps: ProjectDeps) { super(context, deps); }

  getTypeLabel() { return 'Node.js'; }

  getActions(): ProjectAction[] {
    return [
      { id: 'install', label: 'Install',    description: 'npm install',     hasOutput: true },
      { id: 'build',   label: 'Build',      description: 'npm run build',   hasOutput: true },
      { id: 'dev',     label: 'Dev',        description: 'npm run dev',     hasOutput: true },
      { id: 'start',   label: 'Start',      description: 'npm start',       hasOutput: true },
      { id: 'test',    label: 'Test',       description: 'npm test',        hasOutput: true },
    ];
  }

  async execute(actionId: string, _selectedPath: string | null, onOutput: (l: string) => void, signal: AbortSignal) {
    // Derive the path relative to user home (/home/... → strip /home)
    const projectDir = this.context.projectJsonPath.replace(/\/package\.json$/, '');
    const subpath = projectDir.startsWith('/home/')
      ? projectDir.slice('/home/'.length)
      : projectDir.replace(/^\//, '');

    const scriptMap: Record<string, string> = {
      install: 'install',
      build:   'build',
      dev:     'dev',
      start:   'start',
      test:    'test',
    };
    const script = scriptMap[actionId];
    if (!script) return { success: false, error: `Unknown action: ${actionId}` };

    onOutput(`> npm ${script === 'install' ? 'install' : `run ${script}`} …`);

    const done = await this.apiGetSSE<DoneEvent>(
      `/users/${encodeURIComponent(this.deps.userName)}/nodejs/run`,
      { subpath, script },
      onOutput,
      signal,
    );

    if (done.error) return { success: false, error: done.error };
    return { success: done.success };
  }
}
