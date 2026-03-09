import { describe, it, expect } from 'vitest';
import { generateValue, describeGenerator } from './generators';
import type { ValueGenerator } from './types';

describe('generateValue', () => {
  describe('constant', () => {
    it('always returns the configured value', () => {
      const gen: ValueGenerator = { type: 'constant', value: 42 };
      expect(generateValue(gen, 0)).toBe(42);
      expect(generateValue(gen, 100)).toBe(42);
      expect(generateValue(gen, 999)).toBe(42);
    });
  });

  describe('random', () => {
    it('returns values within min/max range', () => {
      const gen: ValueGenerator = { type: 'random', min: 10, max: 20, decimals: 1 };
      for (let i = 0; i < 100; i++) {
        const val = generateValue(gen, i);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThanOrEqual(20);
      }
    });

    it('respects decimal places', () => {
      const gen: ValueGenerator = { type: 'random', min: 0, max: 100, decimals: 2 };
      for (let i = 0; i < 50; i++) {
        const val = generateValue(gen, i);
        const parts = val.toString().split('.');
        if (parts.length > 1) {
          expect(parts[1].length).toBeLessThanOrEqual(2);
        }
      }
    });

    it('handles zero decimals', () => {
      const gen: ValueGenerator = { type: 'random', min: 0, max: 10, decimals: 0 };
      for (let i = 0; i < 50; i++) {
        const val = generateValue(gen, i);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });

  describe('sine', () => {
    it('oscillates between min and max', () => {
      const gen: ValueGenerator = { type: 'sine', min: 10, max: 30, periodSec: 60, phaseDeg: 0 };
      const values: number[] = [];
      for (let t = 0; t < 120; t += 1) {
        values.push(generateValue(gen, t));
      }
      expect(Math.min(...values)).toBeGreaterThanOrEqual(10 - 0.01);
      expect(Math.max(...values)).toBeLessThanOrEqual(30 + 0.01);
    });

    it('starts at midpoint with 0 phase', () => {
      const gen: ValueGenerator = { type: 'sine', min: 0, max: 100, periodSec: 60, phaseDeg: 0 };
      expect(generateValue(gen, 0)).toBeCloseTo(50, 1);
    });

    it('reaches max at quarter period', () => {
      const gen: ValueGenerator = { type: 'sine', min: 0, max: 100, periodSec: 60, phaseDeg: 0 };
      expect(generateValue(gen, 15)).toBeCloseTo(100, 1);
    });

    it('respects phase offset', () => {
      const gen: ValueGenerator = { type: 'sine', min: 0, max: 100, periodSec: 60, phaseDeg: 90 };
      // With 90 degree phase, starts at max
      expect(generateValue(gen, 0)).toBeCloseTo(100, 1);
    });
  });

  describe('linear', () => {
    it('interpolates from start to end over duration', () => {
      const gen: ValueGenerator = { type: 'linear', startValue: 0, endValue: 100, durationSec: 10, repeat: false };
      expect(generateValue(gen, 0)).toBeCloseTo(0);
      expect(generateValue(gen, 5)).toBeCloseTo(50);
      expect(generateValue(gen, 10)).toBeCloseTo(100);
    });

    it('clamps at end when repeat is false', () => {
      const gen: ValueGenerator = { type: 'linear', startValue: 0, endValue: 100, durationSec: 10, repeat: false };
      expect(generateValue(gen, 20)).toBeCloseTo(100);
      expect(generateValue(gen, 100)).toBeCloseTo(100);
    });

    it('loops when repeat is true', () => {
      const gen: ValueGenerator = { type: 'linear', startValue: 0, endValue: 100, durationSec: 10, repeat: true };
      expect(generateValue(gen, 0)).toBeCloseTo(0);
      expect(generateValue(gen, 5)).toBeCloseTo(50);
      expect(generateValue(gen, 10)).toBeCloseTo(0); // loops back
      expect(generateValue(gen, 15)).toBeCloseTo(50);
    });

    it('handles reverse direction', () => {
      const gen: ValueGenerator = { type: 'linear', startValue: 100, endValue: 0, durationSec: 10, repeat: false };
      expect(generateValue(gen, 0)).toBeCloseTo(100);
      expect(generateValue(gen, 5)).toBeCloseTo(50);
      expect(generateValue(gen, 10)).toBeCloseTo(0);
    });
  });

  describe('step', () => {
    it('cycles through values', () => {
      const gen: ValueGenerator = { type: 'step', values: [10, 20, 30], stepIntervalSec: 5 };
      expect(generateValue(gen, 0)).toBe(10);
      expect(generateValue(gen, 4)).toBe(10);
      expect(generateValue(gen, 5)).toBe(20);
      expect(generateValue(gen, 10)).toBe(30);
      expect(generateValue(gen, 15)).toBe(10); // wraps
    });

    it('returns 0 for empty values', () => {
      const gen: ValueGenerator = { type: 'step', values: [], stepIntervalSec: 5 };
      expect(generateValue(gen, 0)).toBe(0);
    });

    it('handles single value', () => {
      const gen: ValueGenerator = { type: 'step', values: [42], stepIntervalSec: 5 };
      expect(generateValue(gen, 0)).toBe(42);
      expect(generateValue(gen, 100)).toBe(42);
    });
  });
});

describe('describeGenerator', () => {
  it('describes constant', () => {
    expect(describeGenerator({ type: 'constant', value: 42 })).toBe('constant 42');
  });

  it('describes random', () => {
    expect(describeGenerator({ type: 'random', min: 10, max: 20, decimals: 1 })).toBe('random 10-20');
  });

  it('describes sine', () => {
    expect(describeGenerator({ type: 'sine', min: 0, max: 100, periodSec: 60, phaseDeg: 0 })).toBe('sine 0-100 (60s)');
  });

  it('describes linear', () => {
    expect(describeGenerator({ type: 'linear', startValue: 0, endValue: 100, durationSec: 10, repeat: false })).toBe('linear 0-100 (10s)');
  });

  it('describes step', () => {
    expect(describeGenerator({ type: 'step', values: [1, 2, 3], stepIntervalSec: 5 })).toBe('step [1, 2, 3]');
  });
});
