export type { PluginManifest, IWebPluginAPI, StatusBarItemOptions, StatusBarHandle } from './types';
export { pluginRegistry } from './PluginRegistry';
export { loadPlugins, unloadPlugins } from './PluginLoader';
export { PluginProvider, usePlugins } from './PluginProvider';
