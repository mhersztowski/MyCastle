"""Virtual devices exposed by the desktop client.

Each device is a *client* in the server-logic sense: it registers under
``{user}/desktop-native/{id}`` and answers Envelope commands that arrive on
its inbox. Device logic here is Qt-free — mouse/keyboard drive the OS through
``pynput``; the display holds render state and notifies the UI via a callback
so the actual painting happens on the Qt main thread.

Command vocabulary (Envelope.type → payload):

  virtual-mouse:
    move            {x, y}
    move_rel        {dx, dy}
    click           {button?: left|right|middle, x?, y?, count?}
    scroll          {dx?, dy?}
    press/release   {button?}
    get_pos         {}            → {x, y}
    get_size        {}            → {width, height}

  virtual-keyboard:
    type_text       {text}
    key_press       {key, modifiers?: [str]}
    hotkey          {keys: [str]}

  virtual-display:
    show_text       {text, color?, background?}
    clear           {}
    get             {}            → {content}
"""

from __future__ import annotations

import logging
from typing import Callable, Optional

log = logging.getLogger("client_desktop.devices")


class Device:
    """Base class for a togglable virtual device.

    :param device_id: topic segment id, e.g. ``'vmouse'``.
    :param name:      human-readable label shown in the UI.
    :param kind:      capability tag advertised in ``hello`` (e.g. ``'virtual-mouse'``).
    """

    def __init__(self, device_id: str, name: str, kind: str) -> None:
        self.id = device_id
        self.name = name
        self.kind = kind
        self.enabled = False
        # UI hook: called with a short human string on every handled command.
        self.on_activity: Optional[Callable[[str], None]] = None

    def capabilities(self) -> list[str]:
        return []

    def handle(self, cmd_type: str, payload: dict) -> Optional[dict]:
        """Execute a command. Return a response payload dict, or None for no data.

        Raise on failure — the client turns exceptions into an ``error`` envelope.
        """
        raise NotImplementedError

    def _activity(self, text: str) -> None:
        if self.on_activity is not None:
            try:
                self.on_activity(text)
            except Exception:
                pass


# ── Virtual mouse ─────────────────────────────────────────────────────────────

class VirtualMouseDevice(Device):
    """Drives the system pointer via pynput.

    :param screen_size_fn: optional ``() -> (w, h)`` so ``get_size`` can answer
        without a hard Qt dependency (the UI injects the real screen size).
    """

    def __init__(self, screen_size_fn: Optional[Callable[[], tuple[int, int]]] = None) -> None:
        super().__init__("vmouse", "Virtual Mouse", "virtual-mouse")
        self._screen_size_fn = screen_size_fn
        self._ctrl = None
        self._Button = None

    def _controller(self):
        if self._ctrl is None:
            from pynput.mouse import Button, Controller
            self._ctrl = Controller()
            self._Button = Button
        return self._ctrl

    def _button(self, name: str):
        self._controller()
        return {"left": self._Button.left,
                "right": self._Button.right,
                "middle": self._Button.middle}.get(name, self._Button.left)

    def capabilities(self) -> list[str]:
        return ["move", "move_rel", "click", "scroll", "press", "release",
                "get_pos", "get_size"]

    def handle(self, cmd_type: str, payload: dict) -> Optional[dict]:
        c = self._controller()
        if cmd_type == "move":
            c.position = (int(payload["x"]), int(payload["y"]))
            self._activity(f"move → ({payload['x']}, {payload['y']})")
            return None
        if cmd_type == "move_rel":
            c.move(int(payload.get("dx", 0)), int(payload.get("dy", 0)))
            self._activity(f"move_rel ({payload.get('dx', 0)}, {payload.get('dy', 0)})")
            return None
        if cmd_type == "click":
            btn = self._button(payload.get("button", "left"))
            if "x" in payload and "y" in payload:
                c.position = (int(payload["x"]), int(payload["y"]))
            count = int(payload.get("count", 1))
            c.click(btn, count)
            self._activity(f"click {payload.get('button', 'left')} ×{count}")
            return None
        if cmd_type == "scroll":
            c.scroll(int(payload.get("dx", 0)), int(payload.get("dy", 0)))
            self._activity(f"scroll ({payload.get('dx', 0)}, {payload.get('dy', 0)})")
            return None
        if cmd_type == "press":
            c.press(self._button(payload.get("button", "left")))
            return None
        if cmd_type == "release":
            c.release(self._button(payload.get("button", "left")))
            return None
        if cmd_type == "get_pos":
            x, y = c.position
            return {"x": int(x), "y": int(y)}
        if cmd_type == "get_size":
            w, h = self._screen_size_fn() if self._screen_size_fn else (0, 0)
            return {"width": int(w), "height": int(h)}
        raise ValueError(f"Unknown vmouse command: {cmd_type!r}")


# ── Virtual keyboard ──────────────────────────────────────────────────────────

class VirtualKeyboardDevice(Device):
    """Drives the system keyboard via pynput."""

    def __init__(self) -> None:
        super().__init__("vkeyboard", "Virtual Keyboard", "virtual-keyboard")
        self._ctrl = None
        self._Key = None

    def _controller(self):
        if self._ctrl is None:
            from pynput.keyboard import Controller, Key
            self._ctrl = Controller()
            self._Key = Key
        return self._ctrl

    def _resolve(self, name: str):
        """Map a key name to a pynput Key or a single character."""
        self._controller()
        name = name.lower()
        special = {
            "ctrl": self._Key.ctrl, "control": self._Key.ctrl,
            "alt": self._Key.alt, "shift": self._Key.shift,
            "win": self._Key.cmd, "cmd": self._Key.cmd, "super": self._Key.cmd,
            "enter": self._Key.enter, "return": self._Key.enter,
            "esc": self._Key.esc, "escape": self._Key.esc,
            "tab": self._Key.tab, "space": self._Key.space,
            "backspace": self._Key.backspace, "delete": self._Key.delete,
            "up": self._Key.up, "down": self._Key.down,
            "left": self._Key.left, "right": self._Key.right,
            "home": self._Key.home, "end": self._Key.end,
            "pageup": self._Key.page_up, "pagedown": self._Key.page_down,
        }
        if name in special:
            return special[name]
        if len(name) == 1:
            return name
        # f1..f12
        if name.startswith("f") and name[1:].isdigit():
            fn = getattr(self._Key, name, None)
            if fn is not None:
                return fn
        raise ValueError(f"Unknown key name: {name!r}")

    def capabilities(self) -> list[str]:
        return ["type_text", "key_press", "hotkey"]

    def handle(self, cmd_type: str, payload: dict) -> Optional[dict]:
        c = self._controller()
        if cmd_type == "type_text":
            text = str(payload.get("text", ""))
            c.type(text)
            preview = text[:40] + ("…" if len(text) > 40 else "")
            self._activity(f"type {preview!r}")
            return None
        if cmd_type == "key_press":
            mods = [self._resolve(m) for m in (payload.get("modifiers") or [])]
            key = self._resolve(payload["key"])
            for m in mods:
                c.press(m)
            c.press(key)
            c.release(key)
            for m in reversed(mods):
                c.release(m)
            self._activity("+".join((payload.get("modifiers") or []) + [payload["key"]]))
            return None
        if cmd_type == "hotkey":
            keys = [self._resolve(k) for k in payload["keys"]]
            for k in keys:
                c.press(k)
            for k in reversed(keys):
                c.release(k)
            self._activity("+".join(payload["keys"]))
            return None
        raise ValueError(f"Unknown vkeyboard command: {cmd_type!r}")


# ── Virtual display ───────────────────────────────────────────────────────────

class VirtualDisplayDevice(Device):
    """Holds render state for a small on-screen panel.

    The device itself never touches Qt. It stores the latest ``content`` dict
    and calls ``on_content_change`` (set by the UI) so the actual painting is
    marshalled onto the Qt main thread.
    """

    def __init__(self) -> None:
        super().__init__("vdisplay", "Virtual Display", "virtual-display")
        self.content: dict = {"text": "", "color": "#e0e0e0", "background": "#101418"}
        self.on_content_change: Optional[Callable[[dict], None]] = None

    def _emit(self) -> None:
        if self.on_content_change is not None:
            try:
                self.on_content_change(dict(self.content))
            except Exception:
                pass

    def capabilities(self) -> list[str]:
        return ["show_text", "clear", "get"]

    def handle(self, cmd_type: str, payload: dict) -> Optional[dict]:
        if cmd_type == "show_text":
            self.content = {
                "text": str(payload.get("text", "")),
                "color": payload.get("color", "#e0e0e0"),
                "background": payload.get("background", "#101418"),
            }
            self._emit()
            preview = self.content["text"][:40]
            self._activity(f"show_text {preview!r}")
            return None
        if cmd_type == "clear":
            self.content = {"text": "", "color": "#e0e0e0", "background": "#101418"}
            self._emit()
            self._activity("clear")
            return None
        if cmd_type == "get":
            return {"content": dict(self.content)}
        raise ValueError(f"Unknown vdisplay command: {cmd_type!r}")
