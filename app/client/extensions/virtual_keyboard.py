"""VirtualKeyboard extension — simulates keyboard input on Windows via PowerShell.

Runs from WSL; uses a persistent powershell.exe process (see win_input.py).

Supported operations:
  key_press   — { key, modifiers?: [str], delay_ms?: int }
  key_down    — { key }
  key_up      — { key }
  type_text   — { text, delay_ms?: int }
  hotkey      — { keys: [str], delay_ms?: int }

Key names: ctrl, alt, shift, win, enter, esc, tab, backspace, delete,
           space, up, down, left, right, home, end, pageup, pagedown,
           f1-f12, a-z, 0-9
"""

import json
import logging
import time

import config
from .win_input import get_runner

log = logging.getLogger("vkbd")

# Map key names → Windows Virtual Key codes
_VK: dict[str, int] = {
    "backspace": 0x08, "tab": 0x09, "enter": 0x0D, "shift": 0x10,
    "ctrl": 0x11, "alt": 0x12, "esc": 0x1B, "space": 0x20,
    "pageup": 0x21, "pagedown": 0x22, "end": 0x23, "home": 0x24,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "delete": 0x2E, "win": 0x5B,
    **{f"f{i}": 0x6F + i for i in range(1, 13)},
    **{c: ord(c.upper()) for c in "abcdefghijklmnopqrstuvwxyz"},
    **{d: ord(d) for d in "0123456789"},
}


def _vk(key: str) -> int:
    code = _VK.get(key.lower())
    if code is None:
        raise ValueError(f"Unknown key name: {key!r}")
    return code


def _kdown(key: str) -> str:
    return f"[WinInput]::keybd_event({_vk(key)}, 0, [WinInput]::KEYDOWN, [IntPtr]::Zero)"

def _kup(key: str) -> str:
    return f"[WinInput]::keybd_event({_vk(key)}, 0, [WinInput]::KEYUP, [IntPtr]::Zero)"


def _fmt_payload(op: str, p: dict) -> str:
    match op:
        case "key_press":
            mods = p.get("modifiers") or []
            return "+".join(mods + [p.get("key", "?")])
        case "key_down" | "key_up":
            return p.get("key", "?")
        case "type_text":
            text = p.get("text", "")
            preview = text[:40] + ("…" if len(text) > 40 else "")
            return repr(preview)
        case "hotkey":
            return "+".join(p.get("keys", []))
        case _:
            return ""


class VirtualKeyboardExtension:
    def __init__(self, publish_fn):
        self.publish_fn = publish_fn
        if config.VIRTUAL_INPUT_DRY_RUN:
            log.info("VirtualKeyboard extension ready [DRY-RUN]")
        else:
            get_runner()  # eagerly init PS process
            log.info("VirtualKeyboard extension ready")

    def handle_request(self, payload: dict):
        req_id = payload.get("id")
        op = payload.get("op")
        log.info(f">> {op} {_fmt_payload(op, payload)}")
        try:
            data = self._dispatch(op, payload)
            log.info(f"<< {op} OK")
            self._respond(req_id, True, data)
        except Exception as e:
            log.error(f"<< {op} FAILED: {e}")
            self._respond(req_id, False, error={"code": "Error", "message": str(e)})

    def _dispatch(self, op: str, payload: dict) -> dict:
        delay_ms = int(payload.get("delay_ms", 0))
        if delay_ms > 0:
            log.debug(f"   delay {delay_ms} ms")
            time.sleep(delay_ms / 1000)

        if config.VIRTUAL_INPUT_DRY_RUN:
            log.info(f"   [DRY-RUN] skipping execution")
            return {}

        ps = get_runner()
        match op:
            case "key_press":
                key = payload["key"]
                mods = payload.get("modifiers") or []
                lines = [_kdown(m) for m in mods]
                lines += [_kdown(key), _kup(key)]
                lines += [_kup(m) for m in reversed(mods)]
                ps.run("\n".join(lines))
                return {}

            case "key_down":
                ps.run(_kdown(payload["key"]))
                return {}

            case "key_up":
                ps.run(_kup(payload["key"]))
                return {}

            case "type_text":
                text = payload["text"].replace("'", "''")
                script = (
                    f"Set-Clipboard -Value '{text}'\n"
                    + _kdown("ctrl") + "\n"
                    + _kdown("v") + "\n"
                    + _kup("v") + "\n"
                    + _kup("ctrl")
                )
                ps.run(script)
                return {}

            case "hotkey":
                keys = payload["keys"]
                lines = [_kdown(k) for k in keys]
                lines += [_kup(k) for k in reversed(keys)]
                ps.run("\n".join(lines))
                return {}

            case _:
                raise ValueError(f"Unknown vkbd operation: {op!r}")

    def _respond(self, req_id, ok, data=None, error=None):
        packet: dict = {"id": req_id, "ok": ok}
        if data is not None:
            packet["data"] = data
        if error is not None:
            packet["error"] = error
        self.publish_fn(json.dumps(packet))
