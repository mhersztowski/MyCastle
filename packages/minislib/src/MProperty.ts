import { MObject } from './core/MObject';
import { Signal } from './core/Signal';

/**
 * Qt-style observable property.
 *
 * Emits `changed(newValue, oldValue)` whenever the value is set to a different value.
 * Supports optional validator and transformer.
 *
 * Usage:
 *   const width = new MProperty(100);
 *   width.changed.connect((next, prev) => console.log(prev, '->', next));
 *   width.value = 200;  // triggers changed
 */
export class MProperty<T> {
  readonly changed = new Signal<[newValue: T, oldValue: T]>();

  #value: T;
  #validator?: (v: T) => boolean;

  constructor(initialValue: T, validator?: (v: T) => boolean) {
    this.#value = initialValue;
    this.#validator = validator;
  }

  get value(): T {
    return this.#value;
  }

  set value(next: T) {
    if (this.#validator && !this.#validator(next)) return;
    if (Object.is(this.#value, next)) return;
    const old = this.#value;
    this.#value = next;
    this.changed.emit(next, old);
  }

  /** Set without emitting changed. */
  setSilent(next: T): void {
    this.#value = next;
  }

  /** Bind this property to another: whenever `source` changes, this mirrors it. */
  bindTo(source: MProperty<T>, context?: MObject): void {
    source.changed.connect((v) => {
      this.value = v;
    }, context);
    this.value = source.value;
  }

  toString(): string {
    return String(this.#value);
  }
}
