import { DirData } from './data/DirData';
import { FileData } from './data/FileData';
import { mqttClient } from '../mqttclient';
import { DirectoryTree } from '../mqttclient/types';

export class FilesystemService {
  private rootDir: DirData | null = null;

  async loadDirectory(path: string = ''): Promise<DirData> {
    const tree = await mqttClient.listDirectory(path);
    this.rootDir = this.buildDirData(tree);
    return this.rootDir;
  }

  async readFile(path: string): Promise<FileData | null> {
    if (!this.rootDir) return null;

    const fileData = this.rootDir.getFileByPath(path);
    if (!fileData) return null;

    const mqttFile = await mqttClient.readFile(path);
    const encoder = new TextEncoder();
    fileData.setData(encoder.encode(mqttFile.content));

    return fileData;
  }

  async writeFile(path: string, content: string): Promise<FileData | null> {
    await mqttClient.writeFile(path, content);

    if (!this.rootDir) return null;

    const fileData = this.rootDir.getFileByPath(path);
    if (fileData) {
      const encoder = new TextEncoder();
      fileData.setData(encoder.encode(content));
      return fileData;
    }

    return null;
  }

  async deleteFile(path: string): Promise<boolean> {
    const result = await mqttClient.deleteFile(path);
    return result.success;
  }

  getRootDir(): DirData | null {
    return this.rootDir;
  }

  private buildDirData(tree: DirectoryTree, parent?: DirData): DirData {
    const dirData = new DirData(tree.name, tree.path);

    if (tree.children) {
      for (const child of tree.children) {
        if (child.type === 'directory') {
          const subDir = this.buildDirData(child, dirData);
          dirData.getDirs().push(subDir);
        } else {
          const fileData = new FileData(child.name, child.path, dirData);
          dirData.getFiles().push(fileData);
        }
      }
    }

    return dirData;
  }
}

export const filesystemService = new FilesystemService();
