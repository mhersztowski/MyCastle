import { renderHook, act } from '@testing-library/react';
import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with an empty toasts array', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  describe('addToast', () => {
    it('should add a toast with default type "info"', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Hello');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Hello');
      expect(result.current.toasts[0].type).toBe('info');
    });

    it('should add a toast with a specified type', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Error occurred', 'error');
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].type).toBe('error');
    });

    it('should add a toast with type "success"', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Done!', 'success');
      });

      expect(result.current.toasts[0].type).toBe('success');
    });

    it('should add a toast with type "warning"', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Watch out', 'warning');
      });

      expect(result.current.toasts[0].type).toBe('warning');
    });

    it('should add multiple toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('First');
      });
      act(() => {
        result.current.addToast('Second');
      });
      act(() => {
        result.current.addToast('Third');
      });

      expect(result.current.toasts).toHaveLength(3);
      expect(result.current.toasts[0].message).toBe('First');
      expect(result.current.toasts[1].message).toBe('Second');
      expect(result.current.toasts[2].message).toBe('Third');
    });

    it('should assign unique IDs to each toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('First');
      });
      act(() => {
        result.current.addToast('Second');
      });

      const ids = result.current.toasts.map((t) => t.id);
      expect(new Set(ids).size).toBe(2);
    });

    it('should store the duration on the toast', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Custom duration', 'info', 5000);
      });

      expect(result.current.toasts[0].duration).toBe(5000);
    });

    it('should use default duration of 3000', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Default duration');
      });

      expect(result.current.toasts[0].duration).toBe(3000);
    });
  });

  describe('auto-remove after duration', () => {
    it('should auto-remove a toast after the default duration (3000ms)', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Temporary');
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.toasts).toHaveLength(0);
    });

    it('should auto-remove a toast after a custom duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Custom', 'info', 5000);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(4999);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.toasts).toHaveLength(0);
    });

    it('should not auto-remove a toast when duration is 0', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Persistent', 'info', 0);
      });
      expect(result.current.toasts).toHaveLength(1);

      act(() => {
        vi.advanceTimersByTime(10000);
      });

      expect(result.current.toasts).toHaveLength(1);
    });

    it('should auto-remove toasts independently based on their own duration', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Short', 'info', 1000);
      });
      act(() => {
        result.current.addToast('Long', 'info', 5000);
      });
      expect(result.current.toasts).toHaveLength(2);

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Long');

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(result.current.toasts).toHaveLength(0);
    });
  });

  describe('removeToast', () => {
    it('should remove a specific toast by ID', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('First');
      });
      act(() => {
        result.current.addToast('Second');
      });

      const idToRemove = result.current.toasts[0].id;

      act(() => {
        result.current.removeToast(idToRemove);
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].message).toBe('Second');
    });

    it('should do nothing when removing a non-existent ID', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('Only');
      });

      act(() => {
        result.current.removeToast('non-existent-id');
      });

      expect(result.current.toasts).toHaveLength(1);
    });
  });

  describe('clearAll', () => {
    it('should remove all toasts', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.addToast('First');
      });
      act(() => {
        result.current.addToast('Second');
      });
      act(() => {
        result.current.addToast('Third');
      });
      expect(result.current.toasts).toHaveLength(3);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.toasts).toEqual([]);
    });

    it('should work on an already-empty toasts array', () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.toasts).toEqual([]);
    });
  });

  it('should maintain stable function references across re-renders', () => {
    const { result, rerender } = renderHook(() => useToast());

    const firstAddToast = result.current.addToast;
    const firstRemoveToast = result.current.removeToast;
    const firstClearAll = result.current.clearAll;

    rerender();

    expect(result.current.addToast).toBe(firstAddToast);
    expect(result.current.removeToast).toBe(firstRemoveToast);
    expect(result.current.clearAll).toBe(firstClearAll);
  });
});
