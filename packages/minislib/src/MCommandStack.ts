import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

/**
 * Abstract base for undoable commands (Qt's QUndoCommand).
 * Subclass and implement execute() + undo().
 */
export abstract class MCommand {
  abstract readonly description: string;

  abstract execute(): void;
  abstract undo(): void;

  /** Optional: merge with the previous command of the same type. */
  mergeWith(_prev: MCommand): boolean {
    return false;
  }
}

/**
 * Functional command — create commands without subclassing.
 *
 * Usage:
 *   const cmd = MFnCommand.create(
 *     'Set name',
 *     () => { obj.name = 'new'; },
 *     () => { obj.name = 'old'; },
 *   );
 */
export class MFnCommand extends MCommand {
  readonly description: string;
  readonly #executeFn: () => void;
  readonly #undoFn: () => void;

  constructor(description: string, executeFn: () => void, undoFn: () => void) {
    super();
    this.description = description;
    this.#executeFn = executeFn;
    this.#undoFn = undoFn;
  }

  execute(): void {
    this.#executeFn();
  }

  undo(): void {
    this.#undoFn();
  }

  static create(
    description: string,
    executeFn: () => void,
    undoFn: () => void,
  ): MFnCommand {
    return new MFnCommand(description, executeFn, undoFn);
  }
}

/**
 * Undo/redo command stack (Qt's QUndoStack).
 *
 * Usage:
 *   const stack = new MCommandStack(parent, { maxSize: 50 });
 *   stack.push(MFnCommand.create('Move', () => move(), () => unmove()));
 *   stack.undo();
 *   stack.redo();
 */
export class MCommandStack extends MObject {
  readonly changed = new Signal();
  readonly canUndoChanged = new Signal<[canUndo: boolean]>();
  readonly canRedoChanged = new Signal<[canRedo: boolean]>();

  #undoStack: MCommand[] = [];
  #redoStack: MCommand[] = [];
  readonly #maxSize: number;

  constructor(parent?: MObject, options: { maxSize?: number } = {}) {
    super(parent, 'MCommandStack');
    this.#maxSize = options.maxSize ?? 100;
  }

  /** Execute `cmd` and push it onto the undo stack. Clears the redo stack. */
  push(cmd: MCommand): void {
    const prevCanUndo = this.canUndo;
    const prevCanRedo = this.canRedo;

    cmd.execute();

    // Try merge with the top command
    const top = this.#undoStack[this.#undoStack.length - 1];
    if (top && cmd.mergeWith(top)) {
      // merged — don't push separately
    } else {
      this.#undoStack.push(cmd);
      if (this.#undoStack.length > this.#maxSize) {
        this.#undoStack.shift();
      }
    }

    this.#redoStack = [];
    this.#emitIfChanged(prevCanUndo, prevCanRedo);
  }

  undo(): boolean {
    const cmd = this.#undoStack.pop();
    if (!cmd) return false;
    const prevCanUndo = this.canUndo;
    const prevCanRedo = this.canRedo;
    cmd.undo();
    this.#redoStack.push(cmd);
    this.#emitIfChanged(prevCanUndo, prevCanRedo);
    return true;
  }

  redo(): boolean {
    const cmd = this.#redoStack.pop();
    if (!cmd) return false;
    const prevCanUndo = this.canUndo;
    const prevCanRedo = this.canRedo;
    cmd.execute();
    this.#undoStack.push(cmd);
    this.#emitIfChanged(prevCanUndo, prevCanRedo);
    return true;
  }

  clear(): void {
    const prevCanUndo = this.canUndo;
    const prevCanRedo = this.canRedo;
    this.#undoStack = [];
    this.#redoStack = [];
    this.#emitIfChanged(prevCanUndo, prevCanRedo);
  }

  get canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  get undoDescription(): string | null {
    return this.#undoStack[this.#undoStack.length - 1]?.description ?? null;
  }

  get redoDescription(): string | null {
    return this.#redoStack[this.#redoStack.length - 1]?.description ?? null;
  }

  get undoStackSize(): number {
    return this.#undoStack.length;
  }

  get redoStackSize(): number {
    return this.#redoStack.length;
  }

  #emitIfChanged(prevCanUndo: boolean, prevCanRedo: boolean): void {
    this.changed.emit();
    if (this.canUndo !== prevCanUndo) this.canUndoChanged.emit(this.canUndo);
    if (this.canRedo !== prevCanRedo) this.canRedoChanged.emit(this.canRedo);
  }
}
