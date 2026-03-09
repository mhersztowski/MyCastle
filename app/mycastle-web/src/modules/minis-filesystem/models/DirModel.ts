import { FileModel } from './FileModel';

export interface DirModel {
  name: string;
  path: string;
  files: FileModel[];
  dirs: DirModel[];
}
