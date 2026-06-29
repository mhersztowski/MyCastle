// ProjectAssetFs — a FileSystemProvider for the project's "application data
// package": an in-project bundle of text assets (notably *.qtui.json scenes).
//
// Per the chosen storage model it persists server-side WITHOUT any backend
// change, by mapping VFS operations onto the existing Arduino sketch-file REST
// API, using a single reserved sketch folder as the package root. Files live at
//   Projects/<platform>/<project>/sketches/<ASSET_SKETCH>/<relPath>
// so the package travels with the project and is reusable later (e.g. flashed to
// a device data partition).
//
// Assets are treated as UTF-8 text (JSON scenes / config); binary blobs are out
// of scope for this REST surface.

import {
  FileType,
  FileChangeType,
  VfsError,
  VfsEventEmitter,
  normalize,
} from '@mhersztowski/core';
import type {
  FileSystemProvider,
  FileSystemCapabilities,
  FileStat,
  DirectoryEntry,
  FileChangeEvent,
  WriteFileOptions,
  DeleteOptions,
  RenameOptions,
  CopyOptions,
  VfsEvent,
} from '@mhersztowski/core';
import { minisApi } from '../../services/MinisApiService';

/** Reserved sketch folder that holds the application data package. */
export const ASSET_SKETCH = '__appfs';

const dec = new TextDecoder();
const enc = new TextEncoder();

export class ProjectAssetFs implements FileSystemProvider {
  readonly scheme = 'appfs';
  readonly capabilities: FileSystemCapabilities = { readonly: false, watch: false };

  private emitter = new VfsEventEmitter<FileChangeEvent[]>();
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]> = this.emitter.event;

  // Cached flat list of relative file paths (no leading slash).
  private files: string[] = [];
  private loaded = false;
  // Directories created via mkdir() that hold no file yet (flat store has no
  // real empty dirs) — surfaced in listings until a file lands inside them.
  private emptyDirs = new Set<string>();

  constructor(private userName: string, private projectId: string) {}

  private rel(path: string): string {
    return normalize(path).replace(/^\/+/, '');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.refresh();
  }

  /** Re-fetch the package file list from the server. */
  async refresh(): Promise<void> {
    try {
      this.files = await minisApi.listSketchFiles(this.userName, this.projectId, ASSET_SKETCH);
    } catch {
      this.files = [];   // sketch not created yet
    }
    this.loaded = true;
  }

  private fire(path: string, type: FileChangeType) {
    this.emitter.fire([{ type, path: '/' + this.rel(path) }]);
  }

  async stat(path: string): Promise<FileStat> {
    await this.ensureLoaded();
    const rel = this.rel(path);
    const now = Date.now();
    if (rel === '') return { type: FileType.Directory, size: 0, ctime: now, mtime: now };
    if (this.files.includes(rel)) return { type: FileType.File, size: 0, ctime: now, mtime: now };
    const dirPrefix = rel + '/';
    if (this.files.some((f) => f.startsWith(dirPrefix)) || this.emptyDirs.has(rel)) {
      return { type: FileType.Directory, size: 0, ctime: now, mtime: now };
    }
    throw VfsError.fileNotFound(path);
  }

  async readDirectory(path: string): Promise<DirectoryEntry[]> {
    await this.ensureLoaded();
    const rel = this.rel(path);
    const prefix = rel === '' ? '' : rel + '/';
    const names = new Map<string, FileType>();
    for (const f of this.files) {
      if (prefix && !f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      if (!rest) continue;
      const slash = rest.indexOf('/');
      if (slash === -1) names.set(rest, FileType.File);
      else names.set(rest.slice(0, slash), FileType.Directory);
    }
    for (const d of this.emptyDirs) {
      if (prefix && !d.startsWith(prefix)) continue;
      const rest = d.slice(prefix.length);
      if (rest && !rest.includes('/')) names.set(rest, FileType.Directory);
    }
    return [...names].map(([name, type]) => ({ name, type }));
  }

  async readFile(path: string): Promise<Uint8Array> {
    const rel = this.rel(path);
    const text = await minisApi.readSketchFile(this.userName, this.projectId, ASSET_SKETCH, rel);
    return enc.encode(text);
  }

  async writeFile(path: string, content: Uint8Array, _options?: WriteFileOptions): Promise<void> {
    const rel = this.rel(path);
    await minisApi.writeSketchFile(this.userName, this.projectId, ASSET_SKETCH, rel, dec.decode(content));
    // Drop any empty-dir placeholders now satisfied by a real file.
    for (const d of [...this.emptyDirs]) if (rel.startsWith(d + '/')) this.emptyDirs.delete(d);
    if (!this.files.includes(rel)) this.files.push(rel);
    this.fire(path, FileChangeType.Created);
  }

  async delete(path: string, options?: DeleteOptions): Promise<void> {
    await this.ensureLoaded();
    const rel = this.rel(path);
    const isFile = this.files.includes(rel);
    if (isFile) {
      await minisApi.deleteSketchFile(this.userName, this.projectId, ASSET_SKETCH, rel);
      this.files = this.files.filter((f) => f !== rel);
    } else {
      // Directory: remove every file beneath it.
      const prefix = rel + '/';
      const victims = this.files.filter((f) => f.startsWith(prefix));
      if (victims.length && options?.recursive === false) throw VfsError.noPermissions(path);
      for (const f of victims) await minisApi.deleteSketchFile(this.userName, this.projectId, ASSET_SKETCH, f);
      this.files = this.files.filter((f) => !f.startsWith(prefix));
      this.emptyDirs.delete(rel);
    }
    this.fire(path, FileChangeType.Deleted);
  }

  async rename(oldPath: string, newPath: string, _options?: RenameOptions): Promise<void> {
    await this.ensureLoaded();
    const from = this.rel(oldPath);
    const to = this.rel(newPath);
    if (this.files.includes(from)) {
      const text = await minisApi.readSketchFile(this.userName, this.projectId, ASSET_SKETCH, from);
      await minisApi.writeSketchFile(this.userName, this.projectId, ASSET_SKETCH, to, text);
      await minisApi.deleteSketchFile(this.userName, this.projectId, ASSET_SKETCH, from);
      this.files = this.files.filter((f) => f !== from);
      this.files.push(to);
    } else {
      // Directory: move each contained file, preserving sub-paths.
      const prefix = from + '/';
      const victims = this.files.filter((f) => f.startsWith(prefix));
      for (const f of victims) {
        const dest = to + '/' + f.slice(prefix.length);
        const text = await minisApi.readSketchFile(this.userName, this.projectId, ASSET_SKETCH, f);
        await minisApi.writeSketchFile(this.userName, this.projectId, ASSET_SKETCH, dest, text);
        await minisApi.deleteSketchFile(this.userName, this.projectId, ASSET_SKETCH, f);
      }
      this.files = this.files.filter((f) => !f.startsWith(prefix)).concat(
        victims.map((f) => to + '/' + f.slice(prefix.length)),
      );
    }
    this.fire(oldPath, FileChangeType.Deleted);
    this.fire(newPath, FileChangeType.Created);
  }

  async copy(source: string, destination: string, _options?: CopyOptions): Promise<void> {
    await this.ensureLoaded();
    const from = this.rel(source);
    const to = this.rel(destination);
    if (this.files.includes(from)) {
      const text = await minisApi.readSketchFile(this.userName, this.projectId, ASSET_SKETCH, from);
      await minisApi.writeSketchFile(this.userName, this.projectId, ASSET_SKETCH, to, text);
      if (!this.files.includes(to)) this.files.push(to);
    } else {
      const prefix = from + '/';
      for (const f of this.files.filter((f) => f.startsWith(prefix))) {
        const dest = to + '/' + f.slice(prefix.length);
        const text = await minisApi.readSketchFile(this.userName, this.projectId, ASSET_SKETCH, f);
        await minisApi.writeSketchFile(this.userName, this.projectId, ASSET_SKETCH, dest, text);
        if (!this.files.includes(dest)) this.files.push(dest);
      }
    }
    this.fire(destination, FileChangeType.Created);
  }

  async mkdir(path: string): Promise<void> {
    // Flat store has no real directories; remember it so it shows up until a
    // file is created inside it.
    this.emptyDirs.add(this.rel(path));
    this.fire(path, FileChangeType.Created);
  }
}
