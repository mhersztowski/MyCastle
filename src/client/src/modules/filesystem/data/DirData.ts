import { DirComponent } from '../components/DirComponent';
import { DirModel } from '../models/DirModel';
import { FileData } from './FileData';

export class DirData {
    private name: string;
    private path: string;
    private dirs: DirData[] = [];
    private files: FileData[] = [];
    private components: DirComponent[] = [];

    constructor(name: string, path: string) {
        this.name = name;
        this.path = path;
    }

    public getName(): string {
        return this.name;
    }

    public getPath(): string {
        return this.path;
    }

    public getDirs(): DirData[] {
        return this.dirs;
    }

    public getFiles(): FileData[] {
        return this.files;
    }

    public getFileByName(name: string): FileData | undefined {
        return this.files.find(file => file.getName() === name);
    }

    public getDirByName(name: string): DirData | undefined {
        return this.dirs.find(dir => dir.getName() === name);
    }

    public getFileByPath(path: string): FileData | undefined {
        // Normalize path: replace backslashes with forward slashes
        const normalizedPath = path.replace(/\\/g, '/');
        const pathParts = normalizedPath.split('/').filter(part => part.length > 0);
        if (pathParts.length === 0) return undefined;

        const filename = pathParts.pop();
        if (!filename) return undefined;

        let currentDir: DirData | undefined = this;

        // Skip the root directory name if path starts with it AND root path matches
        // (only skip if root path is like "data" not "." or empty)
        let startIndex = 0;
        if (pathParts.length > 0 && pathParts[0] === this.name && this.path === this.name) {
            startIndex = 1;
        }

        for (let i = startIndex; i < pathParts.length; i++) {
            const dirName = pathParts[i];
            const subDir: DirData | undefined = currentDir.getDirByName(dirName);
            if (!subDir) return undefined;
            currentDir = subDir;
        }
        return currentDir.getFileByName(filename) || undefined;
    }

    public getSubDir(path: string[]): DirData | undefined {
        let dir: DirData | undefined = this;

        // Skip the root directory name if path starts with it AND root path matches
        let startIndex = 0;
        if (path.length > 0 && path[0] === this.name && this.path === this.name) {
            startIndex = 1;
        }

        for (let i = startIndex; i < path.length; i++) {
            dir = dir.getDirByName(path[i]);
            if (!dir) {
                return undefined;
            }
        }
        return dir;
    }

    public createSubDirs(path: string[]): DirData {
        let dir: DirData | undefined = this;
        let pathString = this.path;

        for (const dirName of path) {
            pathString += "/" + dirName;
            let subDir: DirData | undefined = dir?.getDirByName(dirName);
            if (!subDir) {
                subDir = new DirData(dirName, pathString);
                dir.dirs.push(subDir);
            }
            dir = subDir;
        }
        return dir;
    }

    public clear() {
        this.dirs = [];
        this.files = [];
    }

    public getComponents(): DirComponent[] {
        return this.components;
    }

    public addComponentFromModel(model: any) {
        switch (model.type) {
            case "dir_test": {
                break;
            }
        }
    }

    public getComponentByType(type: string): DirComponent | undefined {
        return this.components.find(component => component.getType() === type);
    }

    public setModel(model: DirModel) {
        for (let fileModel of model.files) {
            let fileData: FileData | undefined = this.getFileByName(fileModel.name);
            if (fileData) {
                fileData.setModel(fileModel);
            }
        }
    }
}
