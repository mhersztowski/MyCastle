import {
  MObject, MProperty, MCommandStack, MFnCommand, Signal,
} from '@mhersztowski/minislib';

export class Light extends MObject {
  readonly brightness = new MProperty<number>(0, (v) => v >= 0 && v <= 100);
  readonly on         = new MProperty<boolean>(false);
  readonly changed    = new Signal<[brightness: number, on: boolean]>();

  readonly #stack: MCommandStack;

  constructor(name: string, parent?: MObject) {
    super(parent, name);
    this.#stack = new MCommandStack(this, { maxSize: 20 });

    this.brightness.changed.connect(() =>
      this.changed.emit(this.brightness.value, this.on.value),
    );
    this.on.changed.connect(() =>
      this.changed.emit(this.brightness.value, this.on.value),
    );
  }

  setBrightness(level: number): void {
    const prev = this.brightness.value;
    const prevOn = this.on.value;
    this.#stack.push(MFnCommand.create(
      `setBrightness(${level})`,
      () => { this.brightness.value = level; this.on.value = level > 0; },
      () => { this.brightness.value = prev;  this.on.value = prevOn; },
    ));
  }

  toggle(): void {
    this.on.value
      ? this.setBrightness(0)
      : this.setBrightness(this.brightness.value > 0 ? this.brightness.value : 80);
  }

  get canUndo(): boolean { return this.#stack.canUndo; }
  get undoDescription(): string | null { return this.#stack.undoDescription; }

  undo(): boolean { return this.#stack.undo(); }
  redo(): boolean { return this.#stack.redo(); }
}
