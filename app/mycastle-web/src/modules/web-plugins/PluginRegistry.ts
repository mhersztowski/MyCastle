type ScriptFn = (...args: unknown[]) => unknown;

class PluginRegistryClass {
  private readonly fns = new Map<string, ScriptFn>();

  register(name: string, fn: ScriptFn): void {
    this.fns.set(name, fn);
  }

  unregisterAll(names: string[]): void {
    for (const name of names) {
      this.fns.delete(name);
    }
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
