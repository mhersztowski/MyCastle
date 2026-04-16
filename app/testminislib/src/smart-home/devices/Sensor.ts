import {
  MObject, MTimer, MProperty, Signal,
} from '@mhersztowski/minislib';

export interface Reading { value: number; unit: string; at: number; }

/** Temperature/humidity sensor that polls on a timer and emits readings. */
export class Sensor extends MObject {
  readonly reading = new Signal<[r: Reading]>();

  readonly current = new MProperty<number>(0);
  readonly unit: string;

  #timer: MTimer;
  #genFn: () => number;

  constructor(
    name: string,
    unit: string,
    genFn: () => number,
    intervalMs: number,
    parent?: MObject,
  ) {
    super(parent, name);
    this.unit  = unit;
    this.#genFn = genFn;
    this.#timer = new MTimer(this);
    this.#timer.timeout.connect(() => this.#poll());
    this.#timer.start(intervalMs);
  }

  #poll(): void {
    const value = parseFloat(this.#genFn().toFixed(1));
    this.current.value = value;
    this.reading.emit({ value, unit: this.unit, at: Date.now() });
  }

  stop(): void { this.#timer.stop(); }
}
