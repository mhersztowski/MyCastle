import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Shared plugin secret store — server-side, per-owner, encrypted at rest.
 *
 * Each user (the "owner") has a `plugin-secrets.json` holding credentials/keys
 * that their web plugins write. A secret marked `shared` can be read by anyone
 * (even anonymously, e.g. a viewer of the owner's page); a private secret is
 * readable only by the owner/admin. Values are encrypted with AES-256-GCM.
 */

interface StoredSecret {
  /** AES-256-GCM blob: `iv:authTag:ciphertext`, each part base64. */
  value: string;
  shared: boolean;
  updatedAt: number;
}

type SecretsFile = Record<string, Record<string, StoredSecret>>;

export interface SecretMetadata {
  key: string;
  shared: boolean;
  updatedAt: number;
}

export class SecretsService {
  private key!: Buffer;
  private readonly cache = new Map<string, SecretsFile>();
  private readonly writeChains = new Map<string, Promise<void>>();

  constructor(private readonly rootDir: string) {}

  /** Load (or generate + persist) the AES key. Must be called before use. */
  async initialize(): Promise<void> {
    const envKey = process.env.SECRETS_KEY;
    if (envKey) {
      // Derive a 32-byte key from the passphrase — env value can be any length.
      this.key = scryptSync(envKey, 'mycastle-secrets', 32);
      console.log('SecretsService: using encryption key from SECRETS_KEY env');
      return;
    }
    const keyFile = join(this.rootDir, '.secrets-key');
    try {
      const hex = (await readFile(keyFile, 'utf-8')).trim();
      const buf = Buffer.from(hex, 'hex');
      if (buf.length !== 32) throw new Error('bad key length');
      this.key = buf;
    } catch {
      this.key = randomBytes(32);
      await mkdir(dirname(keyFile), { recursive: true });
      await writeFile(keyFile, this.key.toString('hex'), 'utf-8');
      console.log('SecretsService: generated new encryption key at .secrets-key');
    }
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  }

  private decrypt(blob: string): string {
    const [ivB64, tagB64, ctB64] = blob.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf-8');
  }

  private fileFor(owner: string): string {
    return join(this.rootDir, 'Minis', 'Users', owner, 'plugin-secrets.json');
  }

  private async load(owner: string): Promise<SecretsFile> {
    const cached = this.cache.get(owner);
    if (cached) return cached;
    let data: SecretsFile = {};
    try {
      data = JSON.parse(await readFile(this.fileFor(owner), 'utf-8')) as SecretsFile;
    } catch {
      data = {};
    }
    this.cache.set(owner, data);
    return data;
  }

  /** Serialize writes per-owner so concurrent set/delete cannot clobber the file. */
  private persist(owner: string): Promise<void> {
    const chain = (this.writeChains.get(owner) ?? Promise.resolve()).then(async () => {
      const file = this.fileFor(owner);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(this.cache.get(owner) ?? {}, null, 2), 'utf-8');
    });
    this.writeChains.set(owner, chain);
    return chain;
  }

  /** Key metadata (no values) for one plugin. */
  async list(owner: string, pluginId: string): Promise<SecretMetadata[]> {
    const data = await this.load(owner);
    const plugin = data[pluginId] ?? {};
    return Object.entries(plugin).map(([key, s]) => ({
      key,
      shared: s.shared,
      updatedAt: s.updatedAt,
    }));
  }

  /** Decrypted value + shared flag, or null when the key does not exist. */
  async get(owner: string, pluginId: string, key: string): Promise<{ value: string; shared: boolean } | null> {
    const data = await this.load(owner);
    const s = data[pluginId]?.[key];
    if (!s) return null;
    try {
      return { value: this.decrypt(s.value), shared: s.shared };
    } catch {
      // Corrupt blob or key rotated — treat as missing rather than crashing callers.
      return null;
    }
  }

  async set(owner: string, pluginId: string, key: string, value: string, shared: boolean): Promise<void> {
    const data = await this.load(owner);
    if (!data[pluginId]) data[pluginId] = {};
    data[pluginId][key] = { value: this.encrypt(value), shared, updatedAt: Date.now() };
    await this.persist(owner);
  }

  async delete(owner: string, pluginId: string, key: string): Promise<void> {
    const data = await this.load(owner);
    if (data[pluginId] && key in data[pluginId]) {
      delete data[pluginId][key];
      if (Object.keys(data[pluginId]).length === 0) delete data[pluginId];
      await this.persist(owner);
    }
  }
}
