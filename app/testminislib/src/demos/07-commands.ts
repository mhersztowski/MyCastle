import { MCommandStack, MCommand, MFnCommand } from '@mhersztowski/minislib';
import { section, sub, ok, log, cyan } from '../print.js';

// ── Custom command subclass ───────────────────────────────────────────────────

interface DrawCommand { type: string; x: number; y: number; }

class DrawRect extends MCommand {
  get description() { return `DrawRect(${this.cmd.x},${this.cmd.y})`; }
  constructor(
    private readonly canvas: DrawCommand[],
    private readonly cmd: DrawCommand,
  ) { super(); }
  execute(): void { this.canvas.push(this.cmd); }
  undo():    void { this.canvas.pop(); }
}

// ── Mergeable counter command ─────────────────────────────────────────────────

class IncrementCommand extends MCommand {
  get description() { return `Increment(${this.amount})`; }
  constructor(
    private target: { count: number },
    public amount: number,
  ) { super(); }
  execute(): void { this.target.count += this.amount; }
  undo():    void { this.target.count -= this.amount; }
  override mergeWith(prev: MCommand): boolean {
    if (prev instanceof IncrementCommand) {
      prev.amount += this.amount; // absorb into previous
      return true;
    }
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function demoCommandStack(): void {
  section('↩️', 'MCOMMANDSTACK — undo / redo');

  sub('MFnCommand (no subclassing)');
  {
    let name = 'Alice';
    const stack = new MCommandStack();

    stack.push(MFnCommand.create('rename→Bob',   () => { name = 'Bob'; },   () => { name = 'Alice'; }));
    stack.push(MFnCommand.create('rename→Carol', () => { name = 'Carol'; }, () => { name = 'Bob'; }));

    log('current name', name);
    log('undoDescription', stack.undoDescription);

    stack.undo();
    log('after undo', name);
    log('redoDescription', stack.redoDescription);

    stack.redo();
    log('after redo', name);

    ok('MFnCommand works without subclassing');
    stack.destroy();
  }

  sub('Custom MCommand subclass — canvas drawing');
  {
    const canvas: DrawCommand[] = [];
    const stack  = new MCommandStack();

    stack.push(new DrawRect(canvas, { type: 'rect', x: 10, y: 10 }));
    stack.push(new DrawRect(canvas, { type: 'rect', x: 50, y: 30 }));
    stack.push(new DrawRect(canvas, { type: 'rect', x: 80, y: 60 }));

    log('canvas after 3 draws', canvas.map(c => `(${c.x},${c.y})`));

    stack.undo();
    log('canvas after 1 undo', canvas.map(c => `(${c.x},${c.y})`));

    stack.undo();
    log('canvas after 2 undos', canvas.map(c => `(${c.x},${c.y})`));

    stack.redo();
    log('canvas after 1 redo', canvas.map(c => `(${c.x},${c.y})`));

    ok('Draw commands undo/redo correctly');
    stack.destroy();
  }

  sub('canUndo / canRedo signals');
  {
    const stack = new MCommandStack();
    const events: string[] = [];
    stack.canUndoChanged.connect((v) => events.push(`canUndo→${v}`));
    stack.canRedoChanged.connect((v) => events.push(`canRedo→${v}`));

    stack.push(MFnCommand.create('noop', () => {}, () => {}));
    stack.undo();
    stack.redo();

    for (const e of events) ok(cyan(e));
    stack.destroy();
  }

  sub('maxSize — bounded history');
  {
    const stack = new MCommandStack(undefined, { maxSize: 3 });
    let val = 0;
    for (let i = 1; i <= 5; i++) {
      const saved = val;
      const next  = i;
      stack.push(MFnCommand.create(`set ${i}`, () => { val = next; }, () => { val = saved; }));
    }
    log('undoStackSize (max 3)', stack.undoStackSize);
    log('current value', val);

    stack.undo(); stack.undo(); stack.undo();
    log('after 3 undos', val);
    log('canUndo after max undos', stack.canUndo);
    ok('Oldest commands were evicted');
    stack.destroy();
  }

  sub('Mergeable commands — rapid increments collapse');
  {
    const counter = { count: 0 };
    const stack   = new MCommandStack();

    // Push 5 increments — should merge into 1
    for (let i = 0; i < 5; i++) {
      stack.push(new IncrementCommand(counter, 1));
    }

    log('undoStackSize (merged)', stack.undoStackSize);
    log('counter.count', counter.count);

    stack.undo();
    log('after undo', counter.count);
    ok('5 increments merged into 1 undo step');
    stack.destroy();
  }

  sub('clear()');
  {
    const stack = new MCommandStack();
    stack.push(MFnCommand.create('a', () => {}, () => {}));
    stack.push(MFnCommand.create('b', () => {}, () => {}));
    log('before clear — canUndo', stack.canUndo);
    stack.clear();
    log('after  clear — canUndo', stack.canUndo);
    log('undoStackSize', stack.undoStackSize);
    ok('Stack cleared');
    stack.destroy();
  }
}
