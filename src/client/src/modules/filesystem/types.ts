import { DirData } from './data/DirData';
import { FileData } from './data/FileData';

export interface FilesystemState {
  rootDir: DirData | null;
  currentPath: string;
  selectedFile: FileData | null;
  isLoading: boolean;
  error: string | null;
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'list';
  path: string;
  content?: string;
}
