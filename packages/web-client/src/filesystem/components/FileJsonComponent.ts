import { FileData } from '../data/FileData';
import { FileJsonComponentModel } from '@mhersztowski/core';
import { FileComponent } from './FileComponent';

export class FileJsonComponent extends FileComponent {
    private data: any = undefined;
    private schemaPath: string = "";
    private objectType: string = "";
    private visible: boolean = true;

    constructor(file: FileData, model: FileJsonComponentModel) {
        super("file_json", file);
        this.schemaPath = model.schemaPath;
        this.objectType = model.objectType;
        this.visible = model.visible;

        this.parseAndLoad();
    }

    private parseAndLoad() {
        let validateOk: boolean = true;

        if (validateOk) {
            let json = JSON.parse(this.file.toString());
            this.data = json;
            console.log("json file loaded " + this.file.getPath());
        }
    }

    public getSchemaPath(): string {
        return this.schemaPath;
    }

    public getObjectType(): string {
        return this.objectType;
    }

    public getData(): any {
        return this.data;
    }

    public getVisible(): boolean {
        return this.visible;
    }
}
