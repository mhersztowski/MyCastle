import { renderHook, act } from '@testing-library/react';
import { useToggle } from './useToggle';

describe('useToggle', () => {
  it('should default to false', () => {
    const { result } = renderHook(() => useToggle());
    const [value] = result.current;
    expect(value).toBe(false);
  });

  it('should accept an initial value of true', () => {
    const { result } = renderHook(() => useToggle(true));
    const [value] = result.current;
    expect(value).toBe(true);
  });

  it('should accept an initial value of false', () => {
    const { result } = renderHook(() => useToggle(false));
    const [value] = result.current;
    expect(value).toBe(false);
  });

  it('should return a tuple of [value, toggle, setValue]', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current).toHaveLength(3);
    expect(typeof result.current[0]).toBe('boolean');
    expect(typeof result.current[1]).toBe('function');
    expect(typeof result.current[2]).toBe('function');
  });

  describe('toggle', () => {
    it('should toggle from false to true', () => {
      const { result } = renderHook(() => useToggle(false));

      act(() => {
        result.current[1]();
      });

      expect(result.current[0]).toBe(true);
    });

    it('should toggle from true to false', () => {
      const { result } = renderHook(() => useToggle(true));

      act(() => {
        result.current[1]();
      });

      expect(result.current[0]).toBe(false);
    });

    it('should toggle back and forth correctly', () => {
      const { result } = renderHook(() => useToggle(false));

      act(() => {
        result.current[1]();
      });
      expect(result.current[0]).toBe(true);

      act(() => {
        result.current[1]();
      });
      expect(result.current[0]).toBe(false);

      act(() => {
        result.current[1]();
      });
      expect(result.current[0]).toBe(true);
    });
  });

  describe('setValue', () => {
    it('should set value to true explicitly', () => {
      const { result } = renderHook(() => useToggle(false));

      act(() => {
        result.current[2](true);
      });

      expect(result.current[0]).toBe(true);
    });

    it('should set value to false explicitly', () => {
      const { result } = renderHook(() => useToggle(true));

      act(() => {
        result.current[2](false);
      });

      expect(result.current[0]).toBe(false);
    });

    it('should set value to the same value without error', () => {
      const { result } = renderHook(() => useToggle(true));

      act(() => {
        result.current[2](true);
      });

      expect(result.current[0]).toBe(true);
    });
  });

  it('should support combined usage of toggle and setValue', () => {
    const { result } = renderHook(() => useToggle(false));

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[2](false);
    });
    expect(result.current[0]).toBe(false);

    act(() => {
      result.current[1]();
    });
    expect(result.current[0]).toBe(true);
  });

  it('should maintain stable toggle function reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useToggle());

    const firstToggle = result.current[1];

    rerender();

    expect(result.current[1]).toBe(firstToggle);
  });
});
