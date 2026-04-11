export interface Operation {
  type: string;
  description: string;
  undo: () => void;
  redo: () => void;
}

export class HistoryManager {
  private stack: Operation[] = [];
  private pointer = -1;
  private maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  push(op: Operation): void {
    // Remove everything after current pointer (discard redo history)
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push(op);
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    }
    this.pointer = this.stack.length - 1;
  }

  undo(): Operation | undefined {
    if (this.pointer < 0) return undefined;
    const op = this.stack[this.pointer];
    op.undo();
    this.pointer--;
    return op;
  }

  redo(): Operation | undefined {
    if (this.pointer >= this.stack.length - 1) return undefined;
    this.pointer++;
    const op = this.stack[this.pointer];
    op.redo();
    return op;
  }

  canUndo(): boolean {
    return this.pointer >= 0;
  }

  canRedo(): boolean {
    return this.pointer < this.stack.length - 1;
  }

  clear(): void {
    this.stack = [];
    this.pointer = -1;
  }

  getDescription(): { undoLabel?: string; redoLabel?: string } {
    return {
      undoLabel: this.canUndo() ? this.stack[this.pointer].description : undefined,
      redoLabel: this.canRedo() ? this.stack[this.pointer + 1].description : undefined,
    };
  }
}
