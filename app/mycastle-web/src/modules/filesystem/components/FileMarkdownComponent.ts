import { FileData } from '../data/FileData';
import { FileMarkdownComponentModel } from '@mhersztowski/core';
import { FileComponent } from './FileComponent';

export class FileMarkdownComponent extends FileComponent {
    private content: string = "";
    private visible: boolean = true;

    constructor(file: FileData, model: FileMarkdownComponentModel) {
        super("file_markdown", file);
        this.visible = model.visible;

        this.parseAndLoad();
    }

    private parseAndLoad() {
        this.content = this.file.toString();
        console.log("markdown file loaded " + this.file.getPath());
    }

    public getContent(): string {
        return this.content;
    }

    public getVisible(): boolean {
        return this.visible;
    }
}
