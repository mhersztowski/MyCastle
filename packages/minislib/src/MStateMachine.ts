import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

export type GuardFn<TEvent = void> = (event: TEvent) => boolean;
export type ActionFn<TEvent = void> = (event: TEvent) => void;

/** A single state in the machine. */
export class MState extends MObject {
  /** Emitted when this state is entered. `from` is the previous state (null for initial). */
  readonly entered = new Signal<[from: MState | null]>();
  /** Emitted when this state is exited. `to` is the next state. */
  readonly exited = new Signal<[to: MState]>();

  onEnter?: (from: MState | null) => void;
  onExit?: (to: MState) => void;

  constructor(public readonly id: string, parent?: MObject) {
    super(parent, id);
  }
}

export interface TransitionDef<TEvent = void> {
  from: string;
  to: string;
  event: string;
  guard?: GuardFn<TEvent>;
  action?: ActionFn<TEvent>;
}

/**
 * Hierarchical-flat finite state machine.
 *
 * Usage:
 *   const fsm = new MStateMachine(parent);
 *   fsm.addState('idle');
 *   fsm.addState('running');
 *   fsm.addTransition({ from: 'idle', to: 'running', event: 'start' });
 *   fsm.addTransition({ from: 'running', to: 'idle',    event: 'stop' });
 *   fsm.start('idle');
 *
 *   fsm.stateChanged.connect((next, prev) => console.log(prev?.id, '->', next.id));
 *   fsm.send('start');
 */
export class MStateMachine extends MObject {
  readonly stateChanged = new Signal<[next: MState, prev: MState | null]>();
  readonly transitionFailed = new Signal<[event: string, from: string]>();

  #states = new Map<string, MState>();
  #transitions: TransitionDef<unknown>[] = [];
  #current: MState | null = null;
  #started = false;

  constructor(parent?: MObject) {
    super(parent, 'MStateMachine');
  }

  addState(idOrState: string | MState): MState {
    const state =
      typeof idOrState === 'string'
        ? new MState(idOrState, this)
        : idOrState;
    this.#states.set(state.id, state);
    return state;
  }

  addTransition<TEvent = void>(def: TransitionDef<TEvent>): void {
    this.#transitions.push(def as TransitionDef<unknown>);
  }

  /** Start the machine in `initialStateId`. */
  start(initialStateId: string): void {
    if (this.#started) throw new Error('MStateMachine already started');
    const state = this.#states.get(initialStateId);
    if (!state) throw new Error(`Unknown state: "${initialStateId}"`);
    this.#started = true;
    this.#enter(state, null);
  }

  stop(): void {
    this.#started = false;
    this.#current = null;
  }

  /** Dispatch an event, possibly triggering a transition. */
  send<TEvent = void>(event: string, payload?: TEvent): boolean {
    if (!this.#started || !this.#current) return false;

    const match = this.#transitions.find(
      (t) =>
        t.event === event &&
        t.from === this.#current!.id &&
        (!t.guard || t.guard(payload as unknown)),
    );

    if (!match) {
      this.transitionFailed.emit(event, this.#current.id);
      return false;
    }

    const nextState = this.#states.get(match.to);
    if (!nextState) throw new Error(`Unknown target state: "${match.to}"`);

    match.action?.(payload as unknown);
    this.#exit(this.#current, nextState);
    this.#enter(nextState, this.#current);
    return true;
  }

  get currentState(): MState | null {
    return this.#current;
  }

  get currentStateId(): string | null {
    return this.#current?.id ?? null;
  }

  is(stateId: string): boolean {
    return this.#current?.id === stateId;
  }

  get started(): boolean {
    return this.#started;
  }

  state(id: string): MState | undefined {
    return this.#states.get(id);
  }

  get states(): readonly MState[] {
    return [...this.#states.values()];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  #enter(state: MState, from: MState | null): void {
    const prev = this.#current;
    this.#current = state;
    state.onEnter?.(from);
    state.entered.emit(from);
    this.stateChanged.emit(state, prev);
  }

  #exit(state: MState, to: MState): void {
    state.onExit?.(to);
    state.exited.emit(to);
  }
}
