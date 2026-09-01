import { describe, it, expect, vi } from 'vitest';
import {
  getBooxPen,
  isBooxPenAvailable,
  areaMessage,
  normalizeStrokePressure,
  toCanvasPoints,
  fractionOutside,
  type BooxPenBridge,
  type NativeStroke,
} from './booxPen';

// Prostokąt kanwy w pikselach urządzenia, względem lewego górnego rogu WebView.
const AREA = { left: 40, top: 200, width: 800, height: 600 };

function bridge(overrides: Partial<BooxPenBridge> = {}): BooxPenBridge {
  return { available: true, send: vi.fn(), onStroke: null, ...overrides };
}

describe('wykrywanie mostka', () => {
  const win = () => ({} as Window & { __booxPen?: BooxPenBridge });

  it('bez powłoki natywnej nie ma mostka', () => {
    expect(getBooxPen(win())).toBeNull();
    expect(isBooxPenAvailable(win())).toBe(false);
  });

  it('powłoka na urządzeniu bez piórka zgłasza się jako niedostępna', () => {
    const w = win();
    w.__booxPen = bridge({ available: false });
    // Mostek istnieje (można zapytać o powód), ale rysowania natywnego nie ma.
    expect(getBooxPen(w)).not.toBeNull();
    expect(isBooxPenAvailable(w)).toBe(false);
  });

  it('na Booksie z SDK mostek jest dostępny', () => {
    const w = win();
    w.__booxPen = bridge();
    expect(isBooxPenAvailable(w)).toBe(true);
  });
});

describe('areaMessage — obszar rysowania w pikselach urządzenia', () => {
  it('przelicza prostokąt CSS przez gęstość ekranu', () => {
    const msg = areaMessage(
      { left: 20, top: 100, width: 400, height: 300 },
      2,
      { strokeWidth: 2.5, color: '#1976d2' },
    );
    expect(msg).toMatchObject({
      type: 'boox:area',
      left: 40, top: 200, width: 800, height: 600,
      strokeWidth: 5,
    });
  });

  it('zaokrągla do pełnych pikseli — sterownik EPD nie zna ułamków', () => {
    const msg = areaMessage({ left: 10.4, top: 10.6, width: 100.5, height: 100.5 }, 1.5, {
      strokeWidth: 1, color: '#000',
    });
    expect(Number.isInteger(msg.left)).toBe(true);
    expect(Number.isInteger(msg.top)).toBe(true);
    expect(Number.isInteger(msg.width)).toBe(true);
    expect(Number.isInteger(msg.height)).toBe(true);
  });

  it('grubość nigdy nie schodzi do zera — pióro o zerowej szerokości nic nie rysuje', () => {
    const msg = areaMessage({ left: 0, top: 0, width: 10, height: 10 }, 1, {
      strokeWidth: 0.05, color: '#000',
    });
    expect(msg.strokeWidth).toBeGreaterThanOrEqual(1);
  });
});

describe('normalizeStrokePressure', () => {
  it('skala sterownika (0..4096) sprowadzana jest do 0..1', () => {
    const out = normalizeStrokePressure([0, 2048, 4096]);
    expect(out).toEqual([0, 0.5, 1]);
  });

  it('decyzja o skali zapada raz na pociągnięcie, nie na punkt', () => {
    // 1 to w skali sterownika nacisk prawie zerowy. Gdyby próg działał na
    // pojedynczym punkcie, ten punkt dostałby nacisk maksymalny i kreska
    // zgrubiałaby dokładnie tam, gdzie pióro ledwo dotknęło ekranu.
    const out = normalizeStrokePressure([1, 4096]);
    expect(out[0]).toBeCloseTo(1 / 4096, 6);
    expect(out[1]).toBe(1);
  });

  it('urządzenie podające już 0..1 zostaje bez zmian', () => {
    expect(normalizeStrokePressure([0.25, 0.5, 1])).toEqual([0.25, 0.5, 1]);
  });

  it('wartości powyżej skali są przycinane, nie przepuszczane', () => {
    expect(normalizeStrokePressure([8192])).toEqual([1]);
  });

  it('pociągnięcie bez nacisku dostaje wartość neutralną zamiast zera', () => {
    // Same zera znaczą „sterownik nie podaje nacisku". Zero po normalizacji
    // dałoby kreskę o zerowej grubości, czyli pociągnięcie niewidoczne.
    expect(normalizeStrokePressure([0, 0, 0])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe('toCanvasPoints — z pikseli urządzenia na współrzędne kanwy', () => {
  const stroke: NativeStroke = {
    erase: false,
    points: [
      { x: 40, y: 200, pressure: 2048, ts: 1 },
      { x: 240, y: 400, pressure: 4096, ts: 2 },
    ],
  };

  it('lewy górny róg obszaru to początek układu kanwy', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('odległości dzielone są przez gęstość ekranu', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[1]).toMatchObject({ x: 100, y: 100 });
  });

  it('nacisk przychodzi znormalizowany', () => {
    const pts = toCanvasPoints(stroke, AREA, 2);
    expect(pts[0].pressure).toBe(0.5);
    expect(pts[1].pressure).toBe(1);
  });

  it('puste pociągnięcie nie wywraca przeliczenia', () => {
    expect(toCanvasPoints({ erase: false, points: [] }, AREA, 2)).toEqual([]);
  });
});

describe('fractionOutside — wykrycie przesunięcia układu współrzędnych', () => {
  it('pociągnięcie w obszarze daje zero', () => {
    const pts = [
      { x: 100, y: 300, pressure: 1, ts: 0 },
      { x: 200, y: 400, pressure: 1, ts: 0 },
    ];
    expect(fractionOutside(pts, AREA)).toBe(0);
  });

  it('pociągnięcie całkiem poza obszarem daje jeden', () => {
    // Tak wygląda pomyłka o wysokość paska stanu: kreski lądują konsekwentnie
    // obok kanwy. Bez tej miary objaw to „pióro nie działa", bez wskazówki.
    const pts = [
      { x: 100, y: 10, pressure: 1, ts: 0 },
      { x: 200, y: 20, pressure: 1, ts: 0 },
    ];
    expect(fractionOutside(pts, AREA)).toBe(1);
  });

  it('brak punktów to brak podstaw do wnioskowania', () => {
    expect(fractionOutside([], AREA)).toBe(0);
  });
});
