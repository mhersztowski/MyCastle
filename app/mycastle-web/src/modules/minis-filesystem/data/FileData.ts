import { FileModel } from '../models/FileModel';

export class FileData implements FileModel {
  name: string;
  path: string;
  size: number;
  modified: string;
  content?: string;

  constructor(model: FileModel) {
    this.name = model.name;
    this.path = model.path;
    this.size = model.size;
    this.modified = model.modified;
    this.content = model.content;
  }

  get extension(): string {
    const parts = this.name.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  }

  get isJson(): boolean {
    return this.extension === 'json';
  }

  get modifiedDate(): Date {
    return new Date(this.modified);
  }

  toModel(): FileModel {
    return {
      name: this.name,
      path: this.path,
      size: this.size,
      modified: this.modified,
      content: this.content,
    };
  }
}
