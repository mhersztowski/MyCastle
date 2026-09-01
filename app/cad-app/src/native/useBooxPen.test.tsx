// @vitest-environment jsdom
import { useRef } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useBooxPen } from './useBooxPen';
import type { BooxPenBridge, BooxPenMessage, CanvasPenPoint } from './booxPen';

// jsdom nie zna ResizeObserver, a hook go używa do pilnowania rozmiaru kanwy.
class FakeResizeObserver {
  static last: FakeResizeObserver | null = null;
  callback: () => void;
  constructor(cb: () => void) { this.callback = cb; FakeResizeObserver.last = this; }
  observe() {}
  disconnect() {}
}

const AREA_CSS = { left: 10, top: 20, width: 400, height: 300 };

// getBoundingClientRect w jsdom zawsze zwraca zera — podstawiamy rozmiar,
// bo bez niego hook (słusznie) uzna kanwę za jeszcze nierozłożoną.
// Zmienna, żeby dało się odegrać animację otwierania dialogu: najpierw zero.
let currentRect = { ...AREA_CSS };

function mountCanvas() {
  currentRect = { ...AREA_CSS };
  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      ...currentRect,
      right: currentRect.left + currentRect.width,
      bottom: currentRect.top + currentRect.height,
      x: currentRect.left,
      y: currentRect.top,
      toJSON: () => ({}),
    }),
  });
}

interface HarnessProps {
  active: boolean;
  onStroke: (points: CanvasPenPoint[], erase: boolean) => void;
}

function Harness({ active, onStroke }: HarnessProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const status = useBooxPen({ target: ref, active, strokeWidth: 2, color: '#000', onStroke });
  return (
    <>
      <canvas ref={ref} data-testid="canvas" />
      <span data-testid="engaged">{String(status.engaged)}</span>
      <span data-testid="available">{String(status.available)}</span>
    </>
  );
}

function installBridge(available = true): { bridge: BooxPenBridge; sent: BooxPenMessage[] } {
  const sent: BooxPenMessage[] = [];
  const bridge: BooxPenBridge = {
    available,
    info: available ? 'Boox Go 10.3' : 'to nie jest urządzenie Onyx',
    send: (m) => { sent.push(m); },
    onStroke: null,
  };
  (window as Window & { __booxPen?: BooxPenBridge }).__booxPen = bridge;
  return { bridge, sent };
}

describe('useBooxPen', () => {
  beforeEach(() => {
    mountCanvas();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    delete (window as Window & { __booxPen?: BooxPenBridge }).__booxPen;
    vi.unstubAllGlobals();
  });

  it('bez powłoki natywnej nie robi nic i mówi, że jest niedostępny', () => {
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(getByTestId('available').textContent).toBe('false');
    expect(getByTestId('engaged').textContent).toBe('false');
  });

  it('na zwykłym telefonie mostek jest, ale pióra nie przejmuje', () => {
    const { sent } = installBridge(false);
    const { getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    expect(getByTestId('available').textContent).toBe('false');
    expect(sent).toEqual([]);
  });

  it('włączenie oddaje obszar sterownikowi, a potem włącza tryb surowy', () => {
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);

    // Kolejność jest istotna: `setRawDrawingEnabled` bez wcześniejszego
    // `setLimitRect` przejmuje pióro na całym ekranie, więc dotyk przestaje
    // działać wszędzie, także na przyciskach paska narzędzi.
    expect(sent.map((m) => m.type)).toEqual(['boox:area', 'boox:enabled']);
    expect(sent[0]).toMatchObject({ left: 20, top: 40, width: 800, height: 600, strokeWidth: 4 });
    expect(sent[1]).toMatchObject({ enabled: true });
  });

  it('wyłączenie oddaje pióro z powrotem stronie', () => {
    const { sent } = installBridge();
    const { rerender, getByTestId } = render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    rerender(<Harness active={false} onStroke={vi.fn()} />);
    expect(sent).toContainEqual({ type: 'boox:enabled', enabled: false });
    expect(getByTestId('engaged').textContent).toBe('false');
  });

  it('odmontowanie zwalnia sterownik, nawet gdy nikt nie wyłączył rysowania', () => {
    const { sent, bridge } = installBridge();
    const { unmount } = render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    unmount();
    expect(sent.map((m) => m.type)).toContain('boox:release');
    expect(bridge.onStroke).toBeNull();
  });

  it('gotowe pociągnięcie trafia do strony we współrzędnych kanwy', () => {
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    render(<Harness active onStroke={onStroke} />);

    act(() => {
      bridge.onStroke?.({
        erase: false,
        points: [
          { x: 20, y: 40, pressure: 4096, ts: 1 },
          { x: 220, y: 240, pressure: 2048, ts: 2 },
        ],
      });
    });

    expect(onStroke).toHaveBeenCalledTimes(1);
    const [points, erase] = onStroke.mock.calls[0];
    expect(erase).toBe(false);
    expect(points[0]).toMatchObject({ x: 0, y: 0, pressure: 1 });
    expect(points[1]).toMatchObject({ x: 100, y: 100, pressure: 0.5 });
  });

  it('gumka przychodzi tym samym kanałem, oznaczona', () => {
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    render(<Harness active onStroke={onStroke} />);
    act(() => {
      bridge.onStroke?.({ erase: true, points: [{ x: 20, y: 40, pressure: 1, ts: 1 }] });
    });
    expect(onStroke.mock.calls[0][1]).toBe(true);
  });

  it('pociągnięcie po wyłączeniu jest odrzucane', () => {
    // Sterownik potrafi dostarczyć ostatnie pociągnięcie już po tym, jak
    // strona przełączyła narzędzie — bez tego kreska pojawiłaby się w trybie,
    // w którym użytkownik przesuwał widok, a nie rysował.
    const { bridge } = installBridge();
    const onStroke = vi.fn();
    const { rerender } = render(<Harness active onStroke={onStroke} />);
    rerender(<Harness active={false} onStroke={onStroke} />);
    act(() => {
      bridge.onStroke?.({ erase: false, points: [{ x: 20, y: 40, pressure: 1, ts: 1 }] });
    });
    expect(onStroke).not.toHaveBeenCalled();
  });

  it('nie włącza trybu surowego, dopóki kanwa nie ma rozmiaru', () => {
    // Tryb surowy bez podanego obszaru przejmuje pióro na całym ekranie —
    // razem z paskiem narzędzi i resztą aplikacji. Zerowy rozmiar to nie
    // przypadek brzegowy, tylko normalny stan przez pierwsze klatki animacji
    // otwierania dialogu MUI.
    currentRect = { left: 0, top: 0, width: 0, height: 0 };
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    expect(sent).toEqual([]);
  });

  it('gdy kanwa dostanie rozmiar, tryb surowy włącza się sam', () => {
    currentRect = { left: 0, top: 0, width: 0, height: 0 };
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    currentRect = { ...AREA_CSS };
    act(() => { FakeResizeObserver.last?.callback(); });
    expect(sent.map((m) => m.type)).toEqual(['boox:area', 'boox:enabled']);
  });

  it('zmiana rozmiaru kanwy odświeża obszar u sterownika', () => {
    const { sent } = installBridge();
    render(<Harness active onStroke={vi.fn()} />);
    sent.length = 0;
    act(() => { FakeResizeObserver.last?.callback(); });
    expect(sent.map((m) => m.type)).toContain('boox:area');
  });
});
