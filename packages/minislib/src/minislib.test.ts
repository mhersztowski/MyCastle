import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MObject,
  Signal,
  Connection,
  MProperty,
  MTimer,
  MEventBus,
  MStateMachine,
  MCommandStack,
  MFnCommand,
  MListModel,
  MLogger,
  debounce,
  connectOnce,
} from './index';

// ── MObject & Signal ──────────────────────────────────────────────────────────

describe('Signal', () => {
  it('emits to connected slots', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    sig.connect((n) => received.push(n));
    sig.emit(1);
    sig.emit(2);
    expect(received).toEqual([1, 2]);
  });

  it('disconnect stops emissions', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    const conn = sig.connect((n) => received.push(n));
    sig.emit(1);
    conn.disconnect();
    sig.emit(2);
    expect(received).toEqual([1]);
  });

  it('blockSignals suppresses emissions', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    sig.connect((n) => received.push(n));
    sig.blockSignals(true);
    sig.emit(99);
    sig.blockSignals(false);
    sig.emit(1);
    expect(received).toEqual([1]);
  });
});

describe('MObject', () => {
  it('builds parent/child tree', () => {
    const root = new MObject();
    const child = new MObject(root, 'child');
    expect(root.children).toContain(child);
    expect(child.parent).toBe(root);
  });

  it('cascade destroy removes children', () => {
    const root = new MObject();
    const child = new MObject(root);
    root.destroy();
    expect(root.isDestroyed).toBe(true);
    expect(child.isDestroyed).toBe(true);
  });

  it('auto-disconnects tracked connections on destroy', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    const ctx = new MObject();
    sig.connect((n) => received.push(n), ctx);
    sig.emit(1);
    ctx.destroy();
    sig.emit(2);
    expect(received).toEqual([1]);
  });

  it('findChild by name', () => {
    const root = new MObject(undefined, 'root');
    const a = new MObject(root, 'a');
    const b = new MObject(a, 'b');
    expect(root.findChild('b')).toBe(b);
  });

  it('connect() helper tracks connection', () => {
    const sig = new Signal<[n: number]>();
    const ctx = new MObject();
    const received: number[] = [];
    ctx.connect(sig, (n) => received.push(n));
    sig.emit(5);
    ctx.destroy();
    sig.emit(6);
    expect(received).toEqual([5]);
  });
});

// ── MProperty ─────────────────────────────────────────────────────────────────

describe('MProperty', () => {
  it('emits changed on new value', () => {
    const p = new MProperty(0);
    const log: [number, number][] = [];
    p.changed.connect((n, o) => log.push([n, o]));
    p.value = 1;
    p.value = 2;
    expect(log).toEqual([[1, 0], [2, 1]]);
  });

  it('does not emit when value is the same', () => {
    const p = new MProperty(42);
    const fn = vi.fn();
    p.changed.connect(fn);
    p.value = 42;
    expect(fn).not.toHaveBeenCalled();
  });

  it('validator rejects invalid values', () => {
    const p = new MProperty(5, (v) => v >= 0 && v <= 10);
    p.value = 20;
    expect(p.value).toBe(5);
  });

  it('bindTo mirrors source', () => {
    const src = new MProperty(1);
    const dst = new MProperty(0);
    dst.bindTo(src);
    expect(dst.value).toBe(1);
    src.value = 7;
    expect(dst.value).toBe(7);
  });
});

// ── MTimer ────────────────────────────────────────────────────────────────────

describe('MTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('fires timeout repeatedly', () => {
    const t = new MTimer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.start(100);
    vi.advanceTimersByTime(350);
    expect(fn).toHaveBeenCalledTimes(3);
    t.stop();
    t.destroy();
  });

  it('singleShot fires once', () => {
    const t = new MTimer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.startSingleShot(200);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    t.destroy();
  });

  it('stops on destroy', () => {
    const t = new MTimer();
    const fn = vi.fn();
    t.timeout.connect(fn);
    t.start(100);
    t.destroy();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ── MEventBus ─────────────────────────────────────────────────────────────────

describe('MEventBus', () => {
  it('delivers messages to subscribers', () => {
    const bus = new MEventBus();
    const received: number[] = [];
    bus.subscribe<number>('tick', (v) => received.push(v));
    bus.publish('tick', 1);
    bus.publish('tick', 2);
    expect(received).toEqual([1, 2]);
    bus.destroy();
  });

  it('wildcard subscribeAll receives all topics', () => {
    const bus = new MEventBus();
    const log: string[] = [];
    bus.subscribeAll((topic) => log.push(topic));
    bus.publish('a', 1);
    bus.publish('b', 2);
    expect(log).toEqual(['a', 'b']);
    bus.destroy();
  });
});

// ── MStateMachine ─────────────────────────────────────────────────────────────

describe('MStateMachine', () => {
  it('transitions between states', () => {
    const fsm = new MStateMachine();
    fsm.addState('idle');
    fsm.addState('running');
    fsm.addTransition({ from: 'idle', to: 'running', event: 'start' });
    fsm.addTransition({ from: 'running', to: 'idle', event: 'stop' });
    fsm.start('idle');

    expect(fsm.currentStateId).toBe('idle');
    fsm.send('start');
    expect(fsm.currentStateId).toBe('running');
    fsm.send('stop');
    expect(fsm.currentStateId).toBe('idle');
    fsm.destroy();
  });

  it('guard can block transition', () => {
    const fsm = new MStateMachine();
    fsm.addState('off');
    fsm.addState('on');
    fsm.addTransition<boolean>({
      from: 'off', to: 'on', event: 'toggle',
      guard: (authorized) => authorized,
    });
    fsm.start('off');
    fsm.send('toggle', false);
    expect(fsm.currentStateId).toBe('off');
    fsm.send('toggle', true);
    expect(fsm.currentStateId).toBe('on');
    fsm.destroy();
  });
});

// ── MCommandStack ─────────────────────────────────────────────────────────────

describe('MCommandStack', () => {
  it('execute / undo / redo', () => {
    let value = 0;
    const stack = new MCommandStack();
    stack.push(MFnCommand.create('set 1', () => { value = 1; }, () => { value = 0; }));
    stack.push(MFnCommand.create('set 2', () => { value = 2; }, () => { value = 1; }));
    expect(value).toBe(2);
    stack.undo();
    expect(value).toBe(1);
    stack.undo();
    expect(value).toBe(0);
    stack.redo();
    expect(value).toBe(1);
    stack.destroy();
  });

  it('canUndo / canRedo reflect stack state', () => {
    const stack = new MCommandStack();
    expect(stack.canUndo).toBe(false);
    stack.push(MFnCommand.create('noop', () => {}, () => {}));
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);
    stack.undo();
    expect(stack.canRedo).toBe(true);
    stack.destroy();
  });
});

// ── MListModel ────────────────────────────────────────────────────────────────

describe('MListModel', () => {
  it('append / remove / count', () => {
    const m = new MListModel<string>();
    m.append('a', 'b', 'c');
    expect(m.count).toBe(3);
    m.remove(1);
    expect(m.toArray()).toEqual(['a', 'c']);
    m.destroy();
  });

  it('emits rowsInserted signal', () => {
    const m = new MListModel<number>();
    const log: [number, number][] = [];
    m.rowsInserted.connect((idx, count) => log.push([idx, count]));
    m.append(1, 2, 3);
    expect(log).toEqual([[0, 3]]);
    m.destroy();
  });

  it('modelReset on clear', () => {
    const m = new MListModel([1, 2, 3]);
    const fn = vi.fn();
    m.modelReset.connect(fn);
    m.clear();
    expect(fn).toHaveBeenCalledOnce();
    m.destroy();
  });
});

// ── Utilities ─────────────────────────────────────────────────────────────────

describe('connectOnce', () => {
  it('fires only once then disconnects', () => {
    const sig = new Signal<[n: number]>();
    const received: number[] = [];
    connectOnce(sig, (n) => received.push(n));
    sig.emit(1);
    sig.emit(2);
    expect(received).toEqual([1]);
  });
});

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('batches rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledOnce();
  });
});
