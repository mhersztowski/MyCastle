export { PluginSystem, definePlugin } from './PluginSystem';
export type {
  Plugin,
  PluginContext,
  PluginManifest,
  PluginState,
  PluginInfo,
} from './PluginSystem';

// Example plugins
export { WordCountPlugin, HighlightLinePlugin } from './examples';
