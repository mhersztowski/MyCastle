import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { IPluginStorage } from './backendPluginTypes.js';

/**
 * JSON-file backed key/value store for a single backend plugin.
 * Writes are serialized so concurrent set/delete calls cannot clobber the file.
 */
export class PluginStorage implements IPluginStorage {
  private cache: Record<string, unknown> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly file: string) {}

  private async load(): Promise<Record<string, unknown>> {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.file, 'utf-8')) as Record<string, unknown>;
    } catch {
      this.cache = {};
    }
    return this.cache;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(this.file, JSON.stringify(this.cache ?? {}, null, 2), 'utf-8');
    });
    return this.writeChain;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const c = await this.load();
    return key in c ? (c[key] as T) : null;
  }

  async set(key: string, value: unknown): Promise<void> {
    const c = await this.load();
    c[key] = value;
    await this.persist();
  }

  async delete(key: string): Promise<void> {
    const c = await this.load();
    delete c[key];
    await this.persist();
  }

  async keys(): Promise<string[]> {
    return Object.keys(await this.load());
  }
}
