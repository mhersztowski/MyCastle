export * from './types';
export { VfsExplorer } from './VfsExplorer';
export { useVfsTree } from './useVfsTree';
export { VfsBreadcrumbs } from './VfsBreadcrumbs';
export { VfsMountManager } from './VfsMountManager';
export { getFileIcon } from './icons';
export { useVfsClipboard } from './clipboard';
export type { VfsClipboard } from './clipboard';
export {
  memoryFsProvider,
  githubFsProvider,
  browserFsProvider,
  remoteFsProvider,
  isBrowserFSSupported,
  defaultProviderRegistry,
} from './providerRegistry';
export type { VfsProviderDef, VfsProviderConfigField } from './providerRegistry';
