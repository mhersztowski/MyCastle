"""VirtualMouse extension — simulates mouse input on Windows via PowerShell.

Runs from WSL; uses a persistent powershell.exe process (see win_input.py).

Supported operations:
  move         — absolute move:           { x, y }
  move_rel     — relative move:           { dx, dy }
  click        — click:                   { button?: 'left'|'right'|'middle', x?, y? }
  double_click — double-click:            { button?: 'left'|'right'|'middle', x?, y? }
  press        — hold button:             { button?: 'left'|'right'|'middle' }
  release      — release button:          { button?: 'left'|'right'|'middle' }
  scroll       — scroll wheel:            { dy, dx?, x?, y? }
  drag         — drag to target:          { x1, y1, x2, y2, button?: 'left' }
  get_pos      — cursor position:         {} → { x, y }
  get_size     — screen resolution:       {} → { width, height }
"""

import json
import logging

import config
from .win_input import get_runner

log = logging.getLogger("vmouse")

_BTN_DOWN = {"left": "MOUSEEVENTF_LEFTDOWN", "right": "MOUSEEVENTF_RIGHTDOWN", "middle": "MOUSEEVENTF_MIDDLEDOWN"}
_BTN_UP   = {"left": "MOUSEEVENTF_LEFTUP",   "right": "MOUSEEVENTF_RIGHTUP",   "middle": "MOUSEEVENTF_MIDDLEUP"}


def _mev(flag: str, data: int = 0) -> str:
    return f"[WinInput]::mouse_event([WinInput]::{flag}, 0, 0, {data}, [IntPtr]::Zero)"

def _moveto(x: int, y: int) -> str:
    return f"[WinInput]::SetCursorPos({x}, {y}) | Out-Null"


def _fmt_payload(op: str, p: dict) -> str:
    match op:
        case "move":
            return f"({p.get('x')}, {p.get('y')})"
        case "move_rel":
            return f"dx={p.get('dx')}, dy={p.get('dy')}"
        case "click" | "double_click":
            btn = p.get("button", "left")
            pos = f" @ ({p['x']}, {p['y']})" if "x" in p and "y" in p else ""
            return f"{btn}{pos}"
        case "press" | "release":
            return p.get("button", "left")
        case "scroll":
            dy, dx = p.get("dy", 0), p.get("dx", 0)
            pos = f" @ ({p['x']}, {p['y']})" if "x" in p and "y" in p else ""
            return f"dy={dy} dx={dx}{pos}"
        case "drag":
            return f"({p.get('x1')},{p.get('y1')}) → ({p.get('x2')},{p.get('y2')}) [{p.get('button','left')}]"
        case _:
            return ""


class VirtualMouseExtension:
    def __init__(self, publish_fn):
        self.publish_fn = publish_fn
        if config.VIRTUAL_INPUT_DRY_RUN:
            log.info("VirtualMouse extension ready [DRY-RUN]")
        else:
            get_runner()  # eagerly init PS process
            log.info("VirtualMouse extension ready")

    def handle_request(self, payload: dict):
        req_id = payload.get("id")
        op = payload.get("op")
        log.info(f">> {op} {_fmt_payload(op, payload)}")
        try:
            data = self._dispatch(op, payload)
            log.info(f"<< {op} OK" + (f" → {data}" if data else ""))
            self._respond(req_id, True, data)
        except Exception as e:
            log.error(f"<< {op} FAILED: {e}")
            self._respond(req_id, False, error={"code": "Error", "message": str(e)})

    def _dispatch(self, op: str, payload: dict) -> dict:
        if config.VIRTUAL_INPUT_DRY_RUN:
            log.info(f"   [DRY-RUN] skipping execution")
            # For get_pos / get_size return dummy data so UI doesn't error
            if op == "get_pos":
                return {"x": 0, "y": 0}
            if op == "get_size":
                return {"width": 1920, "height": 1080}
            return {}

        ps = get_runner()
        match op:
            case "move":
                ps.run(_moveto(int(payload["x"]), int(payload["y"])))
                return {}

            case "move_rel":
                ps.run(
                    "$p = New-Object System.Drawing.Point\n"
                    "[WinInput]::GetCursorPos([ref]$p) | Out-Null\n"
                    f"[WinInput]::SetCursorPos($p.X + {int(payload['dx'])}, $p.Y + {int(payload['dy'])}) | Out-Null"
                )
                return {}

            case "click":
                btn = payload.get("button", "left")
                lines = []
                if "x" in payload and "y" in payload:
                    lines.append(_moveto(int(payload["x"]), int(payload["y"])))
                lines += [_mev(_BTN_DOWN[btn]), _mev(_BTN_UP[btn])]
                ps.run("\n".join(lines))
                return {}

            case "double_click":
                btn = payload.get("button", "left")
                lines = []
                if "x" in payload and "y" in payload:
                    lines.append(_moveto(int(payload["x"]), int(payload["y"])))
                for _ in range(2):
                    lines += [_mev(_BTN_DOWN[btn]), _mev(_BTN_UP[btn])]
                ps.run("\n".join(lines))
                return {}

            case "press":
                ps.run(_mev(_BTN_DOWN[payload.get("button", "left")]))
                return {}

            case "release":
                ps.run(_mev(_BTN_UP[payload.get("button", "left")]))
                return {}

            case "scroll":
                dy = int(payload.get("dy", 0))
                dx = int(payload.get("dx", 0))
                lines = []
                if "x" in payload and "y" in payload:
                    lines.append(_moveto(int(payload["x"]), int(payload["y"])))
                if dy:
                    lines.append(_mev("MOUSEEVENTF_WHEEL", dy * 120))
                if dx:
                    lines.append(_mev("MOUSEEVENTF_HWHEEL", dx * 120))
                ps.run("\n".join(lines))
                return {}

            case "drag":
                btn = payload.get("button", "left")
                ps.run("\n".join([
                    _moveto(int(payload["x1"]), int(payload["y1"])),
                    _mev(_BTN_DOWN[btn]),
                    _moveto(int(payload["x2"]), int(payload["y2"])),
                    _mev(_BTN_UP[btn]),
                ]))
                return {}

            case "get_pos":
                out = ps.run(
                    "$p = New-Object System.Drawing.Point\n"
                    "[WinInput]::GetCursorPos([ref]$p) | Out-Null\n"
                    'Write-Output "$($p.X),$($p.Y)"'
                )
                x, y = out.split(",")
                return {"x": int(x), "y": int(y)}

            case "get_size":
                out = ps.run(
                    "$w = [WinInput]::GetSystemMetrics([WinInput]::SM_CXSCREEN)\n"
                    "$h = [WinInput]::GetSystemMetrics([WinInput]::SM_CYSCREEN)\n"
                    'Write-Output "$w,$h"'
                )
                w, h = out.split(",")
                return {"width": int(w), "height": int(h)}

            case _:
                raise ValueError(f"Unknown vmouse operation: {op!r}")

    def _respond(self, req_id, ok, data=None, error=None):
        packet: dict = {"id": req_id, "ok": ok}
        if data is not None:
            packet["data"] = data
        if error is not None:
            packet["error"] = error
        self.publish_fn(json.dumps(packet))
