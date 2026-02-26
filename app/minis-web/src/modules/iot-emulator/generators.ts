import type { ValueGenerator } from './types';

export function generateValue(generator: ValueGenerator, elapsedSec: number): number {
  switch (generator.type) {
    case 'constant':
      return generator.value;

    case 'random': {
      const raw = generator.min + Math.random() * (generator.max - generator.min);
      const factor = Math.pow(10, generator.decimals);
      return Math.round(raw * factor) / factor;
    }

    case 'sine': {
      const phaseRad = (generator.phaseDeg * Math.PI) / 180;
      const t = (2 * Math.PI * elapsedSec) / generator.periodSec + phaseRad;
      const normalized = (Math.sin(t) + 1) / 2;
      return generator.min + normalized * (generator.max - generator.min);
    }

    case 'linear': {
      let progress = elapsedSec / generator.durationSec;
      if (generator.repeat) {
        progress = progress % 1;
      } else {
        progress = Math.min(progress, 1);
      }
      return generator.startValue + progress * (generator.endValue - generator.startValue);
    }

    case 'step': {
      if (generator.values.length === 0) return 0;
      const stepIndex = Math.floor(elapsedSec / generator.stepIntervalSec) % generator.values.length;
      return generator.values[stepIndex];
    }
  }
}

export function describeGenerator(generator: ValueGenerator): string {
  switch (generator.type) {
    case 'constant':
      return `constant ${generator.value}`;
    case 'random':
      return `random ${generator.min}-${generator.max}`;
    case 'sine':
      return `sine ${generator.min}-${generator.max} (${generator.periodSec}s)`;
    case 'linear':
      return `linear ${generator.startValue}-${generator.endValue} (${generator.durationSec}s)`;
    case 'step':
      return `step [${generator.values.join(', ')}]`;
  }
}
