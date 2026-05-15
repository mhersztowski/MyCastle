import type { PluginScriptTemplate } from './types';

type ScriptFn = (...args: unknown[]) => unknown;

/** A Plugin Script template plus the plugin that contributed it. */
export interface RegisteredTemplate {
  pluginId: string;
  pluginName: string;
  template: PluginScriptTemplate;
}

class PluginRegistryClass {
  private readonly fns = new Map<string, ScriptFn>();
  // key: `${pluginId}:${template.id}`
  private readonly templates = new Map<string, RegisteredTemplate>();

  register(name: string, fn: ScriptFn): void {
    this.fns.set(name, fn);
  }

  unregisterAll(names: string[]): void {
    for (const name of names) {
      this.fns.delete(name);
    }
  }

  /** Register a Plugin Script template. Returns its registry key (for cleanup). */
  registerTemplate(pluginId: string, pluginName: string, template: PluginScriptTemplate): string {
    const key = `${pluginId}:${template.id}`;
    this.templates.set(key, { pluginId, pluginName, template });
    return key;
  }

  unregisterTemplates(keys: string[]): void {
    for (const key of keys) {
      this.templates.delete(key);
    }
  }

  /** All currently-registered Plugin Script templates (across loaded plugins). */
  getTemplates(): RegisteredTemplate[] {
    return [...this.templates.values()];
  }

  // Converts 'iot.devices', 'map.heatmap' → { iot: { devices: fn }, map: { heatmap: fn } }
  buildContext(): Record<string, Record<string, ScriptFn>> {
    const ctx: Record<string, Record<string, ScriptFn>> = {};
    for (const [key, fn] of this.fns) {
      const dot = key.indexOf('.');
      if (dot === -1) {
        if (!ctx[key]) ctx[key] = {};
        ctx[key]['_self'] = fn;
      } else {
        const ns = key.slice(0, dot);
        const method = key.slice(dot + 1);
        if (!ctx[ns]) ctx[ns] = {};
        ctx[ns][method] = fn;
      }
    }
    return ctx;
  }
}

export const pluginRegistry = new PluginRegistryClass();
