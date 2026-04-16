import { MProperty, MObject } from '@mhersztowski/minislib';
import { section, sub, ok, log, signal, cyan } from '../print.js';

export function demoProperties(): void {
  section('🔗', 'MPROPERTIES — observable values');

  sub('Basic get/set with changed signal');
  {
    const temperature = new MProperty(20.0);
    const history: number[] = [];

    temperature.changed.connect((next, prev) => {
      history.push(next);
      signal('sensor', 'temperature.changed', `${prev}°C`, `${next}°C`);
    });

    temperature.value = 21.5;
    temperature.value = 23.0;
    temperature.value = 23.0; // same — no emit
    temperature.value = 19.8;

    ok(`History (same-value set skipped): ${cyan(history.join(', '))}`);
    log('current value', temperature.value);
    log('emits for 4 sets', history.length);
  }

  sub('Validator — clamp range');
  {
    const brightness = new MProperty(50, (v) => v >= 0 && v <= 100);
    brightness.value = 80;
    brightness.value = 150; // rejected
    brightness.value = -10; // rejected
    log('After clamped sets', brightness.value);
    ok('Invalid values silently ignored');
  }

  sub('setSilent — update without notifying');
  {
    const prop = new MProperty('initial');
    let notified = false;
    prop.changed.connect(() => { notified = true; });
    prop.setSilent('silent-update');
    log('value after setSilent', prop.value);
    log('notified?', notified);
    ok('setSilent changes value without emitting');
  }

  sub('bindTo — one-way data binding');
  {
    const src = new MProperty(100);
    const mirror1 = new MProperty(0);
    const mirror2 = new MProperty(0);

    mirror1.bindTo(src);
    mirror2.bindTo(src);

    log('before src change', { src: src.value, m1: mirror1.value, m2: mirror2.value });
    src.value = 42;
    log('after  src=42    ', { src: src.value, m1: mirror1.value, m2: mirror2.value });
    ok('Both mirrors updated automatically');
  }

  sub('Lifetime: auto-unbind when context destroyed');
  {
    const src = new MProperty(1);
    const dst = new MProperty(0);
    const ctx = new MObject();

    src.changed.connect((v) => { dst.value = v; }, ctx);

    src.value = 5;
    log('while ctx alive', dst.value);

    ctx.destroy();
    src.value = 99;
    log('after  ctx.destroy()', dst.value);
    ok('Binding severed by destroy — dst unchanged');
  }

  sub('Complex property chain');
  {
    const x = new MProperty(0);
    const y = new MProperty(0);
    const dist = new MProperty(0.0);

    // dist = √(x²+y²)
    const update = () => {
      dist.value = Math.sqrt(x.value ** 2 + y.value ** 2);
    };
    x.changed.connect(update);
    y.changed.connect(update);

    x.value = 3;
    y.value = 4;

    log('x', x.value); log('y', y.value);
    log('distance √(3²+4²)', dist.value);
    ok('Derived property computed from two sources');
  }
}
