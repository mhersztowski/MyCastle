import { FileData } from '../data/FileData';

export class FileComponent {
    constructor(public type: string, public file: FileData) {
        this.type = type;
        this.file = file;
    }

    public getType(): string {
        return this.type;
    }

    public getFile(): FileData {
        return this.file;
    }
}
