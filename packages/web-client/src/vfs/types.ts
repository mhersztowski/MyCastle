import type { FileSystemProvider } from '@mhersztowski/core';
import type { VfsProviderDef } from './providerRegistry';

export interface VfsExplorerProps {
  provider: FileSystemProvider;
  rootPath?: string;
  width?: number | string;
  height?: number | string;
  onFileSelect?: (path: string) => void;
  onFileOpen?: (path: string) => void;
  readOnly?: boolean;
  showBreadcrumbs?: boolean;
  className?: string;
  providerRegistry?: VfsProviderDef[];
}

export interface VfsTreeNode {
  id: string;
  label: string;
  isDirectory: boolean;
  children?: VfsTreeNode[];
}
