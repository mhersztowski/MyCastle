import { renderHook, act } from '@testing-library/react';
import { useDialog } from './useDialog';

describe('useDialog', () => {
  it('should default to closed', () => {
    const { result } = renderHook(() => useDialog());
    expect(result.current.isOpen).toBe(false);
  });

  it('should accept an initial open state of true', () => {
    const { result } = renderHook(() => useDialog(true));
    expect(result.current.isOpen).toBe(true);
  });

  it('should accept an initial open state of false', () => {
    const { result } = renderHook(() => useDialog(false));
    expect(result.current.isOpen).toBe(false);
  });

  describe('open', () => {
    it('should set isOpen to true', () => {
      const { result } = renderHook(() => useDialog());

      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should remain true when called multiple times', () => {
      const { result } = renderHook(() => useDialog());

      act(() => {
        result.current.open();
      });
      act(() => {
        result.current.open();
      });

      expect(result.current.isOpen).toBe(true);
    });
  });

  describe('close', () => {
    it('should set isOpen to false', () => {
      const { result } = renderHook(() => useDialog(true));

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should remain false when called on already-closed dialog', () => {
      const { result } = renderHook(() => useDialog(false));

      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('toggle', () => {
    it('should toggle from closed to open', () => {
      const { result } = renderHook(() => useDialog(false));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should toggle from open to closed', () => {
      const { result } = renderHook(() => useDialog(true));

      act(() => {
        result.current.toggle();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should toggle back and forth correctly', () => {
      const { result } = renderHook(() => useDialog(false));

      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.toggle();
      });
      expect(result.current.isOpen).toBe(true);
    });
  });

  it('should support open then close workflow', () => {
    const { result } = renderHook(() => useDialog());

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should maintain stable function references across re-renders', () => {
    const { result, rerender } = renderHook(() => useDialog());

    const firstOpen = result.current.open;
    const firstClose = result.current.close;
    const firstToggle = result.current.toggle;

    rerender();

    expect(result.current.open).toBe(firstOpen);
    expect(result.current.close).toBe(firstClose);
    expect(result.current.toggle).toBe(firstToggle);
  });
});
