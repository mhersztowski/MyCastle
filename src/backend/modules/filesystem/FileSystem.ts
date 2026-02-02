import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileData {
  path: string;
  content: string;
  lastModified: Date;
}

export interface BinaryFileData {
  path: string;
  data: string; // Base64 encoded
  mimeType: string;
  size: number;
  lastModified: Date;
}

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryTree[];
}

export class FileSystem {
  private rootDir: string;
  private cache: Map<string, FileData>;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
    this.cache = new Map();
  }

  async initialize(): Promise<void> {
    try {
      await fs.access(this.rootDir);
    } catch {
      await fs.mkdir(this.rootDir, { recursive: true });
    }
  }

  private getAbsolutePath(relativePath: string): string {
    const normalized = path.normalize(relativePath);
    const absolute = path.join(this.rootDir, normalized);

    if (!absolute.startsWith(this.rootDir)) {
      throw new Error('Access denied: path outside root directory');
    }

    return absolute;
  }

  private getRelativePath(absolutePath: string): string {
    return path.relative(this.rootDir, absolutePath);
  }

  async readFile(filePath: string): Promise<FileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const cached = this.cache.get(relativePath);
    if (cached) {
      return cached;
    }

    const content = await fs.readFile(absolutePath, 'utf-8');
    const stats = await fs.stat(absolutePath);

    const fileData: FileData = {
      path: relativePath,
      content,
      lastModified: stats.mtime,
    };

    this.cache.set(relativePath, fileData);
    return fileData;
  }

  async writeFile(filePath: string, content: string): Promise<FileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(absolutePath, content, 'utf-8');
    const stats = await fs.stat(absolutePath);

    const fileData: FileData = {
      path: relativePath,
      content,
      lastModified: stats.mtime,
    };

    this.cache.set(relativePath, fileData);
    return fileData;
  }

  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    await fs.unlink(absolutePath);
    this.cache.delete(relativePath);
  }

  async listDirectory(dirPath: string = ''): Promise<DirectoryTree> {
    const absolutePath = this.getAbsolutePath(dirPath);
    const relativePath = this.getRelativePath(absolutePath);

    return this.buildDirectoryTree(absolutePath, relativePath || '.');
  }

  private async buildDirectoryTree(absolutePath: string, relativePath: string): Promise<DirectoryTree> {
    const stats = await fs.stat(absolutePath);
    const name = path.basename(absolutePath) || path.basename(this.rootDir);

    if (!stats.isDirectory()) {
      return {
        name,
        path: relativePath,
        type: 'file',
      };
    }

    const entries = await fs.readdir(absolutePath);
    const children: DirectoryTree[] = [];

    for (const entry of entries) {
      const entryAbsPath = path.join(absolutePath, entry);
      const entryRelPath = path.join(relativePath, entry);
      children.push(await this.buildDirectoryTree(entryAbsPath, entryRelPath));
    }

    return {
      name,
      path: relativePath,
      type: 'directory',
      children: children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    };
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.getAbsolutePath(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async writeBinaryFile(filePath: string, base64Data: string, mimeType: string): Promise<BinaryFileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(absolutePath, buffer);
    const stats = await fs.stat(absolutePath);

    return {
      path: relativePath,
      data: base64Data,
      mimeType,
      size: buffer.length,
      lastModified: stats.mtime,
    };
  }

  async readBinaryFile(filePath: string): Promise<BinaryFileData> {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);

    const buffer = await fs.readFile(absolutePath);
    const stats = await fs.stat(absolutePath);
    const base64Data = buffer.toString('base64');

    // Detect mime type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.ogg': 'audio/ogg',
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    return {
      path: relativePath,
      data: base64Data,
      mimeType,
      size: buffer.length,
      lastModified: stats.mtime,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  invalidateCache(filePath: string): void {
    const absolutePath = this.getAbsolutePath(filePath);
    const relativePath = this.getRelativePath(absolutePath);
    this.cache.delete(relativePath);
  }
}
