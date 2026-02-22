import { DirData } from './data/DirData';
import { FileData } from './data/FileData';
import { Calendar } from './data/Calendar';
import { DataSource } from './data/DataSource';

export interface FilesystemState {
  rootDir: DirData | null;
  currentPath: string;
  selectedFile: FileData | null;
  isLoading: boolean;
  isDataLoaded: boolean;
  error: string | null;
  calendar: Calendar;
  dataSource: DataSource;
}

export interface FileOperation {
  type: 'read' | 'write' | 'delete' | 'list';
  path: string;
  content?: string;
}
