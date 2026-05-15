export type {
  PluginManifest,
  IWebPluginAPI,
  StatusBarItemOptions,
  StatusBarHandle,
  PluginScriptTemplate,
  SecretMetadata,
} from './types';
export { pluginRegistry } from './PluginRegistry';
export type { RegisteredTemplate } from './PluginRegistry';
export { loadPlugins, unloadPlugins } from './PluginLoader';
export { PluginProvider, usePlugins } from './PluginProvider';
export { getSecretsOwner, setSecretsOwner } from './secretsOwner';
export { SecretsOwnerScope } from './SecretsOwnerScope';
