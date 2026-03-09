import { FileModel } from '../models/FileModel';
import { FileData } from '../data/FileData';

export class FileNode extends FileData {
  selected = false;
  expanded = false;
  loading = false;

  constructor(model: FileModel) {
    super(model);
  }

  select(): void {
    this.selected = true;
  }

  deselect(): void {
    this.selected = false;
  }

  setLoading(loading: boolean): void {
    this.loading = loading;
  }
}
