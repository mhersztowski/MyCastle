import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('should merge two flat objects, overriding target values', () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 3 });
  });

  it('should add new keys from source', () => {
    const target = { a: 1 } as Record<string, unknown>;
    const source = { b: 2 } as Record<string, unknown>;
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 2 });
  });

  it('should not mutate the target object', () => {
    const target = { a: 1, nested: { x: 1 } };
    const source = { a: 2, nested: { y: 2 } } as Partial<typeof target>;
    const result = deepMerge(target, source);
    expect(target).toEqual({ a: 1, nested: { x: 1 } });
    expect(result).not.toBe(target);
    // nested object in target must remain untouched
    expect(target.nested).toEqual({ x: 1 });
  });

  it('should deeply merge nested objects', () => {
    const target = { nested: { a: 1, b: 2 } };
    const source = { nested: { b: 3, c: 4 } } as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({ nested: { a: 1, b: 3, c: 4 } });
  });

  it('should merge multiple levels of nesting', () => {
    const target = { l1: { l2: { l3: { a: 1, b: 2 } } } };
    const source = { l1: { l2: { l3: { b: 20, c: 3 } } } } as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({
      l1: { l2: { l3: { a: 1, b: 20, c: 3 } } },
    });
  });

  it('should skip source values that are undefined', () => {
    const target = { a: 1, b: 2 };
    const source = { a: undefined, b: 5 } as unknown as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 5 });
  });

  it('should override target with source when source is an array', () => {
    const target = { items: [1, 2, 3] } as Record<string, unknown>;
    const source = { items: [9] } as Record<string, unknown>;
    // arrays are not "objects" per isObject, so they replace wholesale
    expect(deepMerge(target, source)).toEqual({ items: [9] });
  });

  it('should replace a target array with a source object (not merge into array)', () => {
    const target = { val: [1, 2] } as Record<string, unknown>;
    const source = { val: { a: 1 } } as Record<string, unknown>;
    // source object, target array -> not both objects -> source overrides
    expect(deepMerge(target, source)).toEqual({ val: { a: 1 } });
  });

  it('should replace a target object with a source array', () => {
    const target = { val: { a: 1 } } as Record<string, unknown>;
    const source = { val: [1, 2] } as Record<string, unknown>;
    expect(deepMerge(target, source)).toEqual({ val: [1, 2] });
  });

  it('should override an object value when target value is a primitive', () => {
    const target = { val: 5 } as Record<string, unknown>;
    const source = { val: { a: 1 } } as Record<string, unknown>;
    // source is object but target is primitive -> not both objects -> override
    expect(deepMerge(target, source)).toEqual({ val: { a: 1 } });
  });

  it('should override a primitive value when source is a primitive and target is an object', () => {
    const target = { val: { a: 1 } } as Record<string, unknown>;
    const source = { val: 42 } as Record<string, unknown>;
    expect(deepMerge(target, source)).toEqual({ val: 42 });
  });

  it('should handle null source values (null is not an object here) and override', () => {
    const target = { val: { a: 1 } } as Record<string, unknown>;
    const source = { val: null } as Record<string, unknown>;
    // null !== undefined so it overrides; isObject(null) is false
    expect(deepMerge(target, source)).toEqual({ val: null });
  });

  it('should treat a null target value as non-object and override with source object', () => {
    const target = { val: null } as Record<string, unknown>;
    const source = { val: { a: 1 } } as Record<string, unknown>;
    expect(deepMerge(target, source)).toEqual({ val: { a: 1 } });
  });

  it('should return a shallow clone of target when source is empty', () => {
    const target = { a: 1, b: 2 };
    const result = deepMerge(target, {});
    expect(result).toEqual(target);
    expect(result).not.toBe(target);
  });

  it('should preserve target-only nested keys while merging', () => {
    const target = { theme: { colors: { primary: 'red', secondary: 'blue' } } };
    const source = {
      theme: { colors: { primary: 'green' } },
    } as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({
      theme: { colors: { primary: 'green', secondary: 'blue' } },
    });
  });

  it('should handle boolean and falsy (non-undefined) overrides', () => {
    const target = { flag: true, count: 5 };
    const source = { flag: false, count: 0 } as Partial<typeof target>;
    expect(deepMerge(target, source)).toEqual({ flag: false, count: 0 });
  });

  it('should return an object with the same shape as T', () => {
    interface Config {
      a: number;
      nested: { b: string };
    }
    const target: Config = { a: 1, nested: { b: 'x' } };
    const source: Partial<Config> = { nested: { b: 'y' } };
    const result = deepMerge(target, source);
    expect(result.a).toBe(1);
    expect(result.nested.b).toBe('y');
  });
});
