import { DirData } from '../data/DirData';

export class DirComponent {
    constructor(public type: string, public dir: DirData) {
        this.type = type;
        this.dir = dir;
    }

    public getType(): string {
        return this.type;
    }

    public getDir(): DirData {
        return this.dir;
    }
}
