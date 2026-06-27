import type {
  FileSystemProvider, FileSystemCapabilities, FileStat, DirectoryEntry,
  VfsEvent, FileChangeEvent,
} from '@mhersztowski/core';

/**
 * Wraps a {@link FileSystemProvider} and removes every mutating operation.
 * `capabilities.readonly` is forced to true so the editor (and the agent)
 * hide write actions instead of round-tripping a request the wrapper would
 * silently drop.
 */
export class ReadOnlyFS implements FileSystemProvider {
  readonly scheme: string;
  readonly capabilities: FileSystemCapabilities;
  readonly onDidChangeFile: VfsEvent<FileChangeEvent[]>;

  constructor(private readonly inner: FileSystemProvider) {
    this.scheme = inner.scheme;
    this.capabilities = { readonly: true, watch: inner.capabilities.watch };
    this.onDidChangeFile = inner.onDidChangeFile;
  }

  stat(path: string): Promise<FileStat> { return this.inner.stat(path); }
  readDirectory(path: string): Promise<DirectoryEntry[]> { return this.inner.readDirectory(path); }
  readFile(path: string): Promise<Uint8Array> { return this.inner.readFile(path); }
}
