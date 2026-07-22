/**
 * EventMode presets — how touch / pen gestures are translated into remote
 * pointer/keyboard actions for a noVNC session. Mouse input is always passed
 * through 1:1; the presets only shape touch and pen behaviour, which is what
 * differs between "just use the desktop" and "drive a CAD app from a tablet".
 *
 * The concrete mappings come from the apps' own navigation defaults:
 *  - FreeCAD: use the *Gesture* navigation style on the server (1-finger =
 *    rotate = left-drag, 2-finger = pan = right-drag, pinch = wheel zoom).
 *  - CircuitMaker (Altium engine): pan = right-button drag, zoom = Ctrl+wheel,
 *    context menu = right click, rotate-while-placing = Space.
 */

/** A remote mouse button. */
export type RemoteButton = 'left' | 'middle' | 'right';

/** What a drag gesture does on the remote side. */
export type DragAction =
  | { kind: 'button'; button: RemoteButton } // hold this button and move (select / pan / rotate)
  | { kind: 'move' } // move the cursor without pressing a button
  | { kind: 'scroll' }; // translate movement into wheel scrolling

/** How a pinch maps to zoom on the remote side. */
export type PinchAction = 'wheel' | 'ctrlWheel' | 'none';

export interface EventModePreset {
  id: string;
  label: string;
  /** One-line summary shown next to the picker. */
  summary: string;
  /** Longer help text describing the exact mappings. */
  description: string;

  // ── touch gestures ──
  /** Single-finger drag. */
  oneFingerDrag: DragAction;
  /** Two-finger drag (after the pinch component is removed). */
  twoFingerDrag: DragAction;
  /** Pinch in/out. */
  pinch: PinchAction;
  /** Tap = click with this button. */
  tap: RemoteButton;
  /** Long-press = click with this button (context menu when 'right'). */
  longPress: RemoteButton | 'none';
  /** Double-tap sends a double left click. */
  doubleTap: boolean;

  // ── pen / stylus ──
  /** Pen tip acts as this button. */
  penTip: RemoteButton;
  /** Pen barrel (side) button acts as this button. */
  penBarrel: RemoteButton;

  /** Optional note shown in the help popover (e.g. server-side setup hint). */
  serverHint?: string;
}

export const EVENT_MODES: EventModePreset[] = [
  {
    id: 'generalDesktop',
    label: 'General Desktop',
    summary: 'Defaults for most desktop apps (mouse-like touch).',
    description:
      'Standard remote-desktop input. Mouse passes through 1:1 (left = click, ' +
      'right = context menu, wheel = scroll). Touch emulates a mouse: tap = left ' +
      'click, long-press = right click, one-finger drag = left drag, two-finger ' +
      'drag = scroll, pinch = wheel zoom.',
    oneFingerDrag: { kind: 'button', button: 'left' },
    twoFingerDrag: { kind: 'scroll' },
    pinch: 'wheel',
    tap: 'left',
    longPress: 'right',
    doubleTap: true,
    penTip: 'left',
    penBarrel: 'right',
  },
  {
    id: 'generalMobile',
    label: 'General Mobile',
    summary: 'Touch/pen defaults for controlling desktop apps from a tablet.',
    description:
      'Tuned for touch and pen on a tablet. Tap = left click, long-press = right ' +
      'click, one-finger drag = left drag (select/move), two-finger drag = scroll, ' +
      'pinch = mouse-wheel zoom. Pen tip = left ' +
      'button, pen side button = right button. Double-tap = double click.',
    oneFingerDrag: { kind: 'button', button: 'left' },
    twoFingerDrag: { kind: 'scroll' },
    pinch: 'wheel',
    tap: 'left',
    longPress: 'right',
    doubleTap: true,
    penTip: 'left',
    penBarrel: 'right',
  },
  {
    id: 'mobileFreeCadWindows',
    label: 'FreeCAD (Mobile → Windows)',
    summary: 'FreeCAD Gesture navigation from a touch/pen client.',
    description:
      'Matches FreeCAD\'s *Gesture* navigation style. One-finger drag = rotate ' +
      '(left drag), two-finger drag = pan (right drag), pinch = wheel zoom, ' +
      'tap = select (left), long-press = context menu (right). Pen tip = left, ' +
      'pen side button = right.',
    oneFingerDrag: { kind: 'button', button: 'left' }, // Gesture: left drag = orbit
    twoFingerDrag: { kind: 'button', button: 'right' }, // Gesture: right drag = pan
    pinch: 'wheel', // FreeCAD zoom = wheel
    tap: 'left',
    longPress: 'right',
    doubleTap: false,
    penTip: 'left',
    penBarrel: 'right',
    serverHint:
      'On the server, set FreeCAD navigation style to "Gesture" ' +
      '(status bar, bottom-right, or Preferences → Display → Navigation). ' +
      'The CAD default style needs the middle mouse button and does not work well over touch.',
  },
  {
    id: 'mobileCircuitMakerWindows',
    label: 'CircuitMaker (Mobile → Windows)',
    summary: 'CircuitMaker/Altium navigation from a touch/pen client.',
    description:
      'Matches CircuitMaker (Altium) defaults. Tap = select (left), one-finger ' +
      'drag = left drag (select/move), two-finger drag = pan (right-button drag), ' +
      'pinch = mouse-wheel zoom, long-press = context menu (right). Rotate while ' +
      'placing with the Space key (toolbar button). Pen tip = left, side = right.',
    oneFingerDrag: { kind: 'button', button: 'left' },
    twoFingerDrag: { kind: 'button', button: 'right' }, // pan = RMB drag
    pinch: 'wheel', // zoom = mouse wheel
    tap: 'left',
    longPress: 'right',
    doubleTap: false,
    penTip: 'left',
    penBarrel: 'right',
    serverHint:
      'CircuitMaker pans with right-button drag and zooms with Ctrl+wheel — both ' +
      'are emulated here. While placing a component, press Space to rotate.',
  },
];

export const DEFAULT_EVENT_MODE = 'generalDesktop';

export function getEventMode(id: string): EventModePreset {
  return EVENT_MODES.find((m) => m.id === id) ?? EVENT_MODES[0];
}
