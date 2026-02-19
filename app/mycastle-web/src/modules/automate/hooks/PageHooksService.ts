/**
 * Serwis do zarządzania hookami stron
 */

import { mqttClient } from '../../mqttclient';
import { PageHooksConfigModel, PageHookModel, DEFAULT_PAGE_HOOKS_CONFIG } from './PageHooksModels';

const CONFIG_PATH = 'data/page_hooks.json';

class PageHooksService {
  private config: PageHooksConfigModel = DEFAULT_PAGE_HOOKS_CONFIG;
  private loaded = false;

  async loadConfig(): Promise<PageHooksConfigModel> {
    try {
      const file = await mqttClient.readFile(CONFIG_PATH);
      this.config = JSON.parse(file.content) as PageHooksConfigModel;
      this.loaded = true;
    } catch {
      // File doesn't exist or parse error - use defaults
      this.config = { ...DEFAULT_PAGE_HOOKS_CONFIG };
      this.loaded = true;
    }
    return this.config;
  }

  async saveConfig(): Promise<void> {
    await mqttClient.writeFile(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  getConfig(): PageHooksConfigModel {
    return this.config;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getHooksForRoute(route: string): PageHookModel[] {
    return this.config.hooks.filter(h => h.enabled && h.route === route);
  }

  async addHook(hook: Omit<PageHookModel, 'id'>): Promise<PageHookModel> {
    const newHook: PageHookModel = {
      ...hook,
      id: crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
    };
    this.config.hooks.push(newHook);
    await this.saveConfig();
    return newHook;
  }

  async updateHook(id: string, updates: Partial<PageHookModel>): Promise<void> {
    const index = this.config.hooks.findIndex(h => h.id === id);
    if (index !== -1) {
      this.config.hooks[index] = { ...this.config.hooks[index], ...updates };
      await this.saveConfig();
    }
  }

  async removeHook(id: string): Promise<void> {
    this.config.hooks = this.config.hooks.filter(h => h.id !== id);
    await this.saveConfig();
  }

  async toggleHook(id: string): Promise<void> {
    const hook = this.config.hooks.find(h => h.id === id);
    if (hook) {
      hook.enabled = !hook.enabled;
      await this.saveConfig();
    }
  }
}

export const pageHooksService = new PageHooksService();
