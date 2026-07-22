/**
 * Translates raw pointer input (mouse / touch / pen) captured on a transparent
 * overlay into remote actions for a noVNC session, according to the active
 * {@link EventModePreset}.
 *
 * noVNC 1.7 exposes no public "send pointer event" API, but it *does* attach
 * mousedown/mousemove/mouseup/wheel listeners to its own <canvas>. So we drive
 * the session by dispatching synthetic MouseEvent/WheelEvent onto that canvas
 * (noVNC does the framebuffer coordinate conversion for us) and use the public
 * rfb.sendKey() for modifier keys (Ctrl for zoom) and special keys (Space).
 */

import type { EventModePreset, RemoteButton } from './eventModes';

interface RfbLike {
  sendKey(keysym: number, code: string | null, down?: boolean): void;
  focus?(): void;
}

const KEYSYM_CTRL = 0xffe3;

const MOVE_THRESHOLD = 8; // px before a touch becomes a drag
const LONGPRESS_MS = 500;
const TAP_MAX_MS = 300;
const DOUBLE_TAP_MS = 300;
const SCROLL_GAIN = 1; // finger px → wheel delta for two-finger scroll
const PINCH_GAIN = 1.5; // distance px change → wheel delta for pinch zoom

/** Browser MouseEvent.button index for a remote button (0 left, 1 middle, 2 right). */
function buttonIndex(b: RemoteButton): number {
  return b === 'left' ? 0 : b === 'middle' ? 1 : 2;
}
/** MouseEvent.buttons bitmask for a remote button (1 left, 4 middle, 2 right). */
function buttonsMask(b: RemoteButton): number {
  return b === 'left' ? 1 : b === 'middle' ? 4 : 2;
}
/** Map a native mouse button index to a remote button. */
function remoteFromMouseButton(i: number): RemoteButton {
  return i === 1 ? 'middle' : i === 2 ? 'right' : 'left';
}

interface Pt { x: number; y: number; type: string }

type Mode = 'idle' | 'single' | 'multi' | 'suspended';

interface SingleState {
  id: number;
  startX: number; startY: number; startTime: number;
  lastX: number; lastY: number;
  moved: boolean;
  longPressed: boolean;
  dragButton: RemoteButton | null;
  scrollDrag: boolean;
  longPressTimer: number | null;
}

interface MultiState {
  lastCx: number; lastCy: number; lastDist: number;
  panButton: RemoteButton | null; // held button for two-finger "button" drag
  ctrlDown: boolean; // Ctrl held for ctrlWheel zoom
}

export class VncInputController {
  private pointers = new Map<number, Pt>();
  private mode: Mode = 'idle';
  private single: SingleState | null = null;
  private multi: MultiState | null = null;
  private lastTapTime = 0;
  /** Per-pointer remote button for mouse/pen passthrough (so up releases the right one). */
  private passthrough = new Map<number, RemoteButton>();
  private attached = false;

  constructor(
    private canvas: HTMLElement,
    private overlay: HTMLElement,
    private rfb: RfbLike,
    private getPreset: () => EventModePreset,
    private onInteract?: () => void,
  ) {}

  // ── lifecycle ──────────────────────────────────────────────────────────────

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.overlay.style.touchAction = 'none';
    this.overlay.addEventListener('pointerdown', this.onPointerDown);
    this.overlay.addEventListener('pointermove', this.onPointerMove);
    this.overlay.addEventListener('pointerup', this.onPointerUp);
    this.overlay.addEventListener('pointercancel', this.onPointerUp);
    this.overlay.addEventListener('wheel', this.onWheel, { passive: false });
    this.overlay.addEventListener('contextmenu', this.onContextMenu);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.overlay.removeEventListener('pointerdown', this.onPointerDown);
    this.overlay.removeEventListener('pointermove', this.onPointerMove);
    this.overlay.removeEventListener('pointerup', this.onPointerUp);
    this.overlay.removeEventListener('pointercancel', this.onPointerUp);
    this.overlay.removeEventListener('wheel', this.onWheel);
    this.overlay.removeEventListener('contextmenu', this.onContextMenu);
    this.clearLongPress();
  }

  // ── synthetic senders (onto the noVNC canvas) ───────────────────────────────

  private mouse(type: 'mousedown' | 'mouseup' | 'mousemove', x: number, y: number, button: RemoteButton, buttons: number): void {
    this.canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, button: buttonIndex(button), buttons,
    }));
  }
  private down(x: number, y: number, b: RemoteButton) { this.mouse('mousedown', x, y, b, buttonsMask(b)); }
  private up(x: number, y: number, b: RemoteButton) { this.mouse('mouseup', x, y, b, 0); }
  private move(x: number, y: number) { this.mouse('mousemove', x, y, 'left', 0); }
  private click(x: number, y: number, b: RemoteButton) { this.down(x, y, b); this.up(x, y, b); }
  private wheel(x: number, y: number, deltaX: number, deltaY: number): void {
    this.canvas.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, deltaX, deltaY, deltaMode: 0,
    }));
  }

  // ── pointer helpers ──────────────────────────────────────────────────────────

  private touchPoints(): Pt[] {
    return [...this.pointers.values()].filter((p) => p.type === 'touch');
  }
  private centroidDist(pts: Pt[]): { cx: number; cy: number; dist: number } {
    const a = pts[0], b = pts[1];
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    return { cx, cy, dist };
  }
  private clearLongPress(): void {
    if (this.single?.longPressTimer != null) {
      window.clearTimeout(this.single.longPressTimer);
      this.single.longPressTimer = null;
    }
  }

  // ── event handlers ───────────────────────────────────────────────────────────

  private onContextMenu = (e: Event) => { e.preventDefault(); };

  private onWheel = (e: WheelEvent) => {
    // Mouse wheel passes straight through to the remote (apps handle Ctrl+wheel themselves).
    e.preventDefault();
    this.wheel(e.clientX, e.clientY, e.deltaX, e.deltaY);
  };

  private onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    this.onInteract?.();
    try { this.overlay.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const preset = this.getPreset();

    if (e.pointerType === 'mouse') {
      const b = remoteFromMouseButton(e.button);
      this.passthrough.set(e.pointerId, b);
      this.down(e.clientX, e.clientY, b);
      return;
    }
    if (e.pointerType === 'pen') {
      const barrel = e.button === 2 || e.button === 5 || (e.buttons & 2) !== 0;
      const b = barrel ? preset.penBarrel : preset.penTip;
      this.passthrough.set(e.pointerId, b);
      this.down(e.clientX, e.clientY, b);
      return;
    }

    // Touch.
    const touches = this.touchPoints();
    if (touches.length >= 2 && this.mode !== 'multi') {
      // Second finger arrived — abandon any one-finger drag and start multi.
      this.teardownSingleDrag();
      this.clearLongPress();
      this.single = null;
      this.beginMulti();
    } else if (touches.length === 1 && this.mode === 'idle') {
      this.beginSingle(e.pointerId, e.clientX, e.clientY, preset);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    e.preventDefault();

    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      if (this.passthrough.has(e.pointerId)) this.move(e.clientX, e.clientY);
      return;
    }

    if (this.mode === 'multi') { this.handleMultiMove(); return; }
    if (this.mode === 'single' && this.single && this.single.id === e.pointerId) {
      this.handleSingleMove(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    e.preventDefault();
    try { this.overlay.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const b = this.passthrough.get(e.pointerId) ?? 'left';
      this.passthrough.delete(e.pointerId);
      this.up(e.clientX, e.clientY, b);
      return;
    }

    // Touch.
    if (this.mode === 'multi') {
      if (this.touchPoints().length < 2) {
        this.endMulti();
        this.mode = this.touchPoints().length > 0 ? 'suspended' : 'idle';
      }
      return;
    }
    if (this.mode === 'suspended') {
      if (this.touchPoints().length === 0) this.mode = 'idle';
      return;
    }
    if (this.mode === 'single' && this.single && this.single.id === e.pointerId) {
      this.finalizeSingle(p?.x ?? e.clientX, p?.y ?? e.clientY);
      this.single = null;
      this.mode = this.touchPoints().length > 0 ? 'suspended' : 'idle';
    }
  };

  // ── single-finger ────────────────────────────────────────────────────────────

  private beginSingle(id: number, x: number, y: number, preset: EventModePreset): void {
    this.mode = 'single';
    this.single = {
      id, startX: x, startY: y, startTime: performance.now(),
      lastX: x, lastY: y, moved: false, longPressed: false,
      dragButton: null, scrollDrag: false, longPressTimer: null,
    };
    if (preset.longPress !== 'none') {
      this.single.longPressTimer = window.setTimeout(() => {
        const s = this.single;
        if (!s || s.moved || this.mode !== 'single') return;
        s.longPressed = true;
        this.click(s.startX, s.startY, preset.longPress as RemoteButton);
        if (navigator.vibrate) { try { navigator.vibrate(10); } catch { /* ignore */ } }
      }, LONGPRESS_MS);
    }
  }

  private handleSingleMove(x: number, y: number): void {
    const s = this.single;
    if (!s) return;
    const preset = this.getPreset();
    if (!s.moved) {
      if (Math.hypot(x - s.startX, y - s.startY) < MOVE_THRESHOLD) return;
      s.moved = true;
      this.clearLongPress();
      if (s.longPressed) return; // long-press already fired → don't start a drag
      const a = preset.oneFingerDrag;
      if (a.kind === 'button') { this.down(s.startX, s.startY, a.button); s.dragButton = a.button; }
      else if (a.kind === 'scroll') { s.scrollDrag = true; }
      // 'move' → just cursor moves, no button
    }
    if (s.dragButton) this.move(x, y);
    else if (s.scrollDrag) { this.wheel(x, y, (s.lastX - x) * SCROLL_GAIN, (s.lastY - y) * SCROLL_GAIN); }
    else if (s.moved && !s.longPressed) this.move(x, y);
    s.lastX = x; s.lastY = y;
  }

  private finalizeSingle(x: number, y: number): void {
    const s = this.single;
    if (!s) return;
    this.clearLongPress();
    const preset = this.getPreset();
    if (s.dragButton) { this.up(x, y, s.dragButton); return; }
    if (s.longPressed || s.scrollDrag || s.moved) return;
    // Tap (quick, no movement).
    const now = performance.now();
    if (now - s.startTime > TAP_MAX_MS) return;
    if (preset.doubleTap && now - this.lastTapTime < DOUBLE_TAP_MS) {
      this.click(s.startX, s.startY, preset.tap);
      this.click(s.startX, s.startY, preset.tap);
      this.lastTapTime = 0;
    } else {
      this.click(s.startX, s.startY, preset.tap);
      this.lastTapTime = now;
    }
  }

  private teardownSingleDrag(): void {
    const s = this.single;
    if (s?.dragButton) this.up(s.lastX, s.lastY, s.dragButton);
  }

  // ── two-finger ────────────────────────────────────────────────────────────────

  private beginMulti(): void {
    this.mode = 'multi';
    const pts = this.touchPoints();
    if (pts.length < 2) return;
    const { cx, cy, dist } = this.centroidDist(pts);
    this.multi = { lastCx: cx, lastCy: cy, lastDist: dist, panButton: null, ctrlDown: false };
  }

  private handleMultiMove(): void {
    const m = this.multi;
    const pts = this.touchPoints();
    if (!m || pts.length < 2) return;
    const preset = this.getPreset();
    const { cx, cy, dist } = this.centroidDist(pts);
    const dCx = cx - m.lastCx, dCy = cy - m.lastCy, dDist = dist - m.lastDist;

    // Two-finger drag (pan or scroll).
    const drag = preset.twoFingerDrag;
    if (drag.kind === 'scroll') {
      if (dCx || dCy) this.wheel(cx, cy, -dCx * SCROLL_GAIN, -dCy * SCROLL_GAIN);
    } else if (drag.kind === 'button') {
      if (!m.panButton) { this.down(cx, cy, drag.button); m.panButton = drag.button; }
      this.move(cx, cy);
    } else {
      this.move(cx, cy);
    }

    // Pinch → zoom.
    if (preset.pinch !== 'none' && Math.abs(dDist) > 0.5) {
      if (preset.pinch === 'ctrlWheel' && !m.ctrlDown) {
        this.rfb.sendKey(KEYSYM_CTRL, 'ControlLeft', true);
        m.ctrlDown = true;
      }
      // Pinch out (dDist > 0) = zoom in = wheel up = negative deltaY.
      this.wheel(cx, cy, 0, -dDist * PINCH_GAIN);
    }

    m.lastCx = cx; m.lastCy = cy; m.lastDist = dist;
  }

  private endMulti(): void {
    const m = this.multi;
    if (!m) return;
    if (m.panButton) this.up(m.lastCx, m.lastCy, m.panButton);
    if (m.ctrlDown) this.rfb.sendKey(KEYSYM_CTRL, 'ControlLeft', false);
    this.multi = null;
  }
}
