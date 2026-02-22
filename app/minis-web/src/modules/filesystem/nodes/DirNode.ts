import { DirModel } from '../models/DirModel';
import { FileNode } from './FileNode';

export class DirNode {
  name: string;
  path: string;
  files: FileNode[];
  dirs: DirNode[];
  expanded = false;
  selected = false;
  loading = false;

  constructor(model: DirModel) {
    this.name = model.name;
    this.path = model.path;
    this.files = model.files.map((f) => new FileNode(f));
    this.dirs = model.dirs.map((d) => new DirNode(d));
  }

  expand(): void {
    this.expanded = true;
  }

  collapse(): void {
    this.expanded = false;
  }

  toggle(): void {
    this.expanded = !this.expanded;
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

  findNode(path: string): FileNode | DirNode | null {
    if (this.path === path) {
      return this;
    }
    for (const file of this.files) {
      if (file.path === path) {
        return file;
      }
    }
    for (const dir of this.dirs) {
      const found = dir.findNode(path);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
