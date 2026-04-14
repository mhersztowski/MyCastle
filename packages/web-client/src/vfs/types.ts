import type { FileSystemProvider } from '@mhersztowski/core';
import type { VfsProviderDef } from './providerRegistry';
import type { ProjectActionExecutor } from './project/types';

export type VfsProjectLanguage = 'MicroPython' | 'Python' | 'C++' | string;

export function platformToLanguage(platform: string): VfsProjectLanguage {
  switch (platform) {
    case 'uPython': return 'MicroPython';
    case 'pygame':  return 'Python';
    case 'Arduino':
    case 'PicoSdk': return 'C++';
    default:        return platform;
  }
}

export interface VfsProjectContext {
  id: string;
  name: string;
  platform: string;
  /** Programming language derived from platform */
  language: VfsProjectLanguage;
  boardProfileKey?: string;
  /** Absolute VFS path to the project.json file */
  projectJsonPath: string;
}

export interface VfsExplorerProps {
  provider: FileSystemProvider;
  rootPath?: string;
  width?: number | string;
  height?: number | string;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  onDirectoryChange?: (path: string) => void;
  /** Externally-controlled selected path — syncs tree selection and project context to this path. */
  selectedPath?: string;
  /** Called when the selected path's ancestor project context changes. Null when no project.json is found. */
  onProjectContext?: (context: VfsProjectContext | null) => void;
  /**
   * Dependencies for built-in Project.execute() (baseUrl, authToken, userName).
   * When provided, project actions are executed directly via the Project class — no external wiring needed.
   */
  projectDeps?: import('./project/types').ProjectDeps;
  /**
   * Override executor — takes precedence over built-in Project.execute() when provided.
   * Useful for custom handling or when projectDeps are not available.
   */
  onExecuteAction?: ProjectActionExecutor;
  /**
   * Called for every output line produced by a project action.
   * When provided, the in-sidebar output panel is hidden (hideOutput=true implied).
   */
  onOutputLine?: (line: import('./project/types').OutputLine) => void;
  /** Called when a project action starts (true) or finishes (false). actionLabel provided on start. */
  onActionRunningChange?: (running: boolean, actionLabel?: string) => void;
  /** Suppress the in-sidebar output terminal (use when output is shown elsewhere). */
  hideOutput?: boolean;
  readOnly?: boolean;
  showBreadcrumbs?: boolean;
  className?: string;
  providerRegistry?: VfsProviderDef[];
  onMountsChanged?: () => void;
}

export interface VfsTreeNode {
  id: string;
  label: string;
  isDirectory: boolean;
  children?: VfsTreeNode[];
}
