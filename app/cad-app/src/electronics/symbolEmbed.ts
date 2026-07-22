/**
 * Osadzanie symboli schematycznych (z edytora PCB, `/api/symbols`) na kanwie
 * Electronics. Konwertuje geometrię symbolu (El[]) na `PartDef` z bodyShape
 * 'symbol', tak aby:
 *   • piny symbolu były punktami przyłączeniowymi dla wire'ów układu,
 *   • piny o „dziwnym rozstawie" (poza siatką 2.54 mm) zostały połączone
 *     z najbliższym węzłem siatki krótkimi „schodkami" (lead) blisko pinu.
 *
 * Skala: w edytorze symboli PcbView jedna komórka siatki (= 2.54 mm / 0.1")
 * to 10 jednostek świata (domyślne snapSize/gridSize = 10). Dzielimy więc
 * współrzędne świata przez 10, żeby dostać jednostki siatki Electronics.
 */

import type { PartDef, Pin, SymShape, WirePoint } from './types';

/** Jednostki świata symbolu na jedną komórkę siatki Electronics (2.54 mm). */
const SYM_GRID = 10;
/** Margines wokół symbolu (komórki) — miejsce na etykiety pinów i schodki. */
const MARGIN = 1.5;

/** Element symbolu — luźno typowany, bo pochodzi z bogatego modelu El z PcbView. */
type RawEl = Record<string, unknown> & { t?: string };

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

/** Punkt przyłączeniowy pinu (kropka) = baza (x, y). */
function pinConn(p: RawEl): WirePoint { return { x: num(p.x), y: num(p.y) }; }
/** Koniec pinu od strony korpusu (tam idzie kreska pinu i nazwa). */
function pinBody(p: RawEl): WirePoint {
  const r = (num(p.rotation) * Math.PI) / 180, len = num(p.length, 20);
  return { x: num(p.x) + Math.cos(r) * len, y: num(p.y) + Math.sin(r) * len };
}

/** Spłaszcza grupy do listy elementów rysunkowych. */
function flatten(els: RawEl[]): RawEl[] {
  const out: RawEl[] = [];
  for (const e of els) {
    if (e && e.t === 'group' && Array.isArray((e as { children?: RawEl[] }).children)) out.push(...flatten((e as { children: RawEl[] }).children));
    else if (e) out.push(e);
  }
  return out;
}

/** Wszystkie punkty świata elementu — do policzenia bboxa. */
function elPoints(e: RawEl): WirePoint[] {
  switch (e.t) {
    case 'pin': return [pinConn(e), pinBody(e)];
    case 'line': case 'polygon': case 'freehand': case 'bezier': case 'wire': case 'bus':
      return Array.isArray(e.pts) ? (e.pts as WirePoint[]).map((p) => ({ x: num(p.x), y: num(p.y) })) : [];
    case 'rect': return [{ x: num(e.x), y: num(e.y) }, { x: num(e.x) + num(e.w), y: num(e.y) + num(e.h) }];
    case 'ellipse': case 'arc': case 'pie':
      return [{ x: num(e.cx) - num(e.rx), y: num(e.cy) - num(e.ry) }, { x: num(e.cx) + num(e.rx), y: num(e.cy) + num(e.ry) }];
    case 'text': return [{ x: num(e.x), y: num(e.y) }];
    default: return [];
  }
}

/** Manhattan-owe „schodki" od realnego punktu pinu A do węzła siatki G. */
function stair(a: WirePoint, g: WirePoint): WirePoint[] {
  // Krótki jog tuż przy pinie: najpierw w poziomie, potem w pionie.
  if (Math.abs(a.x - g.x) < 0.01) return [a, g];
  if (Math.abs(a.y - g.y) < 0.01) return [a, g];
  return [a, { x: g.x, y: a.y }, g];
}

export interface EmbeddedBuildResult {
  part: PartDef;
  /** Ile pinów wymagało schodków (rozstaw poza siatką). */
  offGrid: number;
}

/**
 * Buduje `PartDef` (bodyShape 'symbol') z surowej geometrii symbolu.
 * @param name  unikalna nazwa symbolu (klucz w /api/symbols)
 * @param title etykieta wyświetlana
 * @param elementsIn geometria symbolu (El[] z /api/symbols/{name})
 */
export function buildEmbeddedPart(name: string, title: string, elementsIn: unknown): EmbeddedBuildResult {
  const els = flatten(Array.isArray(elementsIn) ? (elementsIn as RawEl[]) : []);

  // 1. bbox w jednostkach świata
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) for (const p of elPoints(e)) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = SYM_GRID; maxY = SYM_GRID; }

  // 2. przesunięcie do jednostek siatki (min w okolicy MARGIN)
  let shiftX = -minX / SYM_GRID + MARGIN;
  let shiftY = -minY / SYM_GRID + MARGIN;
  // Dopasuj tak, by PIERWSZY pin trafił w środek komórki (.5). Dzięki temu
  // symbole o standardowym rastrze 2.54 mm łączą się bez schodków, a tylko
  // piny o nietypowym rozstawie dostają „schodki".
  const firstPin = els.find((e) => e.t === 'pin');
  if (firstPin) {
    const rx = num(firstPin.x) / SYM_GRID + shiftX;
    const ry = num(firstPin.y) / SYM_GRID + shiftY;
    const fracX = rx - Math.floor(rx), fracY = ry - Math.floor(ry);
    shiftX += ((0.5 - fracX) % 1 + 1) % 1;
    shiftY += ((0.5 - fracY) % 1 + 1) % 1;
  }
  const L = (p: WirePoint): WirePoint => ({ x: p.x / SYM_GRID + shiftX, y: p.y / SYM_GRID + shiftY });
  const sc = (v: number) => v / SYM_GRID; // długość/promień świata → jednostki siatki

  // 3. wymiary korpusu
  const maxLX = maxX / SYM_GRID + shiftX, maxLY = maxY / SYM_GRID + shiftY;
  const width = Math.max(1, Math.ceil(maxLX + MARGIN));
  const height = Math.max(1, Math.ceil(maxLY + MARGIN));

  // 4. kształty + piny
  const shapes: SymShape[] = [];
  const pins: Pin[] = [];
  let offGrid = 0;
  let pinIdx = 0;

  for (const e of els) {
    const stroke = str((e as { stroke?: unknown }).stroke, '#333');
    const w = Math.max(0.06, sc(num((e as { strokeWidth?: unknown }).strokeWidth, 1)));
    const fillRaw = str((e as { fill?: unknown }).fill, 'none');
    const fill = fillRaw && fillRaw !== 'none' ? fillRaw : undefined;
    switch (e.t) {
      case 'pin': {
        pinIdx++;
        const conn = L(pinConn(e)), body = L(pinBody(e));
        const pinColor = str((e as { pinColor?: unknown }).pinColor, '#9b1c1c');
        // kreska pinu (od kropki do korpusu)
        shapes.push({ k: 'poly', pts: [conn, body], color: pinColor, width: 0.09 });
        // nazwa pinu przy końcu od strony korpusu
        const nm = str((e as { name?: unknown }).name);
        if (nm && (e as { showName?: boolean }).showName !== false) {
          const outward = body.x >= conn.x;
          shapes.push({ k: 'text', x: body.x + (outward ? 0.25 : -0.25), y: body.y + 0.18, text: nm, size: 0.55, color: '#1c4fd6', anchor: outward ? 'start' : 'end' });
        }
        // węzeł siatki = środek najbliższej komórki
        const gx = Math.round(conn.x - 0.5), gy = Math.round(conn.y - 0.5);
        const center: WirePoint = { x: gx + 0.5, y: gy + 0.5 };
        if (Math.hypot(center.x - conn.x, center.y - conn.y) > 0.03) {
          shapes.push({ k: 'lead', pts: stair(conn, center), color: '#4fc3f7' });
          offGrid++;
        }
        pins.push({ id: `p${pinIdx}`, x: gx, y: gy, label: nm || str((e as { number?: unknown }).number) || String(pinIdx) });
        break;
      }
      case 'line': case 'freehand': case 'wire': case 'bus':
        if (Array.isArray(e.pts)) shapes.push({ k: 'poly', pts: (e.pts as WirePoint[]).map(L), color: stroke, width: w });
        break;
      case 'polygon':
        if (Array.isArray(e.pts)) shapes.push({ k: 'poly', pts: (e.pts as WirePoint[]).map(L), closed: true, color: stroke, width: w, fill });
        break;
      case 'bezier': {
        const p = Array.isArray(e.pts) ? (e.pts as WirePoint[]) : [];
        if (p.length >= 3) { const [a, b, c] = p.map(L); const out: WirePoint[] = []; for (let i = 0; i <= 8; i++) { const t = i / 8, mt = 1 - t; out.push({ x: mt * mt * a.x + 2 * mt * t * b.x + t * t * c.x, y: mt * mt * a.y + 2 * mt * t * b.y + t * t * c.y }); } shapes.push({ k: 'poly', pts: out, color: stroke, width: w }); }
        else if (p.length === 2) shapes.push({ k: 'poly', pts: p.map(L), color: stroke, width: w });
        break;
      }
      case 'rect': {
        const x = sc(Math.min(num(e.x), num(e.x) + num(e.w))) + shiftX;
        const y = sc(Math.min(num(e.y), num(e.y) + num(e.h))) + shiftY;
        shapes.push({ k: 'rect', x, y, w: Math.abs(sc(num(e.w))), h: Math.abs(sc(num(e.h))), color: stroke, width: w, fill });
        break;
      }
      case 'ellipse': case 'arc': case 'pie': {
        const c = L({ x: num(e.cx), y: num(e.cy) });
        shapes.push({ k: 'ellipse', cx: c.x, cy: c.y, rx: Math.abs(sc(num(e.rx))), ry: Math.abs(sc(num(e.ry))), color: stroke, width: w, fill });
        break;
      }
      case 'text': {
        const c = L({ x: num(e.x), y: num(e.y) });
        const fs = parseInt(str((e as { fontSize?: unknown }).fontSize, '9')) || 9;
        shapes.push({ k: 'text', x: c.x, y: c.y, text: str((e as { text?: unknown }).text), size: Math.max(0.4, sc(fs)), color: str((e as { color?: unknown }).color, '#1c4fd6') });
        break;
      }
      default: break;
    }
  }

  const part: PartDef = {
    id: `sym:${name}`,
    name: title || name,
    category: 'active',
    description: `Osadzony symbol: ${title || name}`,
    width, height,
    pins,
    bodyColor: '#ffffff',
    bodyShape: 'symbol',
    label: title || name,
    symbolShapes: shapes,
  };
  return { part, offGrid };
}
