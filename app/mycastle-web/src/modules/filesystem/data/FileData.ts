import { FileComponent } from '../components/FileComponent';
import { FileJsonComponent } from '../components/FileJsonComponent';
import { FileMarkdownComponent } from '../components/FileMarkdownComponent';
import { FileModel, FileJsonComponentModel, FileMarkdownComponentModel } from '@mhersztowski/core';
import type { DirData } from './DirData';

export class FileData {
    private dir: DirData;
    private name: string;
    private path: string;
    private data: Uint8Array = new Uint8Array();
    private components: FileComponent[] = [];

    constructor(name: string, path: string, dir: DirData) {
        this.name = name;
        this.path = path;
        this.dir = dir;
    }

    public getName(): string {
        return this.name;
    }

    public getDir(): DirData {
        return this.dir;
    }

    public getPath(): string {
        return this.path;
    }

    public getExt(): string {
        let index = this.path.lastIndexOf(".");
        if (index > 0) {
            return this.path.slice(index + 1);
        }
        return "";
    }

    public getDirPath() {
        let index = this.path.lastIndexOf("/");
        if (index > 0) {
            return this.path.slice(0, index);
        }
        return this.path;
    }

    public getData(): Uint8Array {
        return this.data;
    }

    public setData(data: Uint8Array) {
        this.data = data;
    }

    public toBase64(): string {
        const binary = String.fromCharCode(...this.data);
        return btoa(binary);
    }

    public toString(): string {
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(this.data);
        return text;
    }

    public fromBase64(base64: string) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        this.data = bytes;
    }

    public getComponents(): FileComponent[] {
        return this.components;
    }

    public addComponent(component: FileComponent) {
        this.components.push(component);
    }

    public getComponentByType(type: string): FileComponent | undefined {
        return this.components.find(component => component.getType() === type);
    }

    public setModel(model: FileModel) {
        for (const component of model.components) {
            switch (component.type) {
                case "file_test":
                    break;
                case "file_json": {
                    let jsonModel: FileJsonComponentModel = component as FileJsonComponentModel;
                    let fileComponent: FileJsonComponent = new FileJsonComponent(this, jsonModel);
                    this.addComponent(fileComponent);
                    switch (fileComponent.getObjectType()) {
                        case "project": {
                            break;
                        }
                        default:
                            break;
                    }
                    break;
                }
                case "file_markdown": {
                    let mdModel: FileMarkdownComponentModel = component as FileMarkdownComponentModel;
                    let mdComponent: FileMarkdownComponent = new FileMarkdownComponent(this, mdModel);
                    this.addComponent(mdComponent);
                    break;
                }
                default: {
                    console.error(" unknown component type " + component.type + " in file " + this.path);
                    break;
                }
            }
        }
    }
}
