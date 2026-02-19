import logging
from operations import operation

log = logging.getLogger(__name__)

try:
    import pygetwindow as gw
    HAS_PYGETWINDOW = True
except ImportError:
    HAS_PYGETWINDOW = False
    log.warning("pygetwindow not available - window operations disabled")


def _require_pygetwindow():
    if not HAS_PYGETWINDOW:
        raise RuntimeError("pygetwindow is not installed - window operations unavailable")


def _find_window(title: str | None = None, hwnd: int | None = None):
    _require_pygetwindow()
    if hwnd:
        for w in gw.getAllWindows():
            if w._hWnd == hwnd:
                return w
        raise ValueError(f"Window with hwnd={hwnd} not found")
    if title:
        matches = [w for w in gw.getAllWindows() if title.lower() in w.title.lower()]
        if not matches:
            raise ValueError(f"No window matching title '{title}'")
        return matches[0]
    raise ValueError("title or hwnd is required")


@operation("list_windows")
def list_windows(params: dict) -> dict:
    _require_pygetwindow()
    windows = []
    for w in gw.getAllWindows():
        if not w.title:
            continue
        windows.append({
            "title": w.title,
            "hwnd": w._hWnd,
            "x": w.left,
            "y": w.top,
            "width": w.width,
            "height": w.height,
            "visible": w.visible,
        })
    return {"windows": windows}


@operation("focus_window")
def focus_window(params: dict) -> dict:
    w = _find_window(params.get("title"), params.get("hwnd"))
    w.activate()
    return {"success": True, "title": w.title}


@operation("minimize_window")
def minimize_window(params: dict) -> dict:
    w = _find_window(params.get("title"), params.get("hwnd"))
    w.minimize()
    return {"success": True, "title": w.title}


@operation("maximize_window")
def maximize_window(params: dict) -> dict:
    w = _find_window(params.get("title"), params.get("hwnd"))
    w.maximize()
    return {"success": True, "title": w.title}


@operation("close_window")
def close_window(params: dict) -> dict:
    w = _find_window(params.get("title"), params.get("hwnd"))
    title = w.title
    w.close()
    return {"success": True, "title": title}
