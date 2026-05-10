"""Dev Runner — web UI to start / stop / stream npm/pnpm scripts from local projects.

Configuration (via .env.dev-runner or environment):
  DEV_APPS          semicolon-separated absolute paths to npm project directories
  DEV_RUNNER_PORT   HTTP port to listen on (default 7891)

Run directly:
  python apps/dev_runner.py
Or via helper:
  ./run_dev_runner.sh
"""

import base64 as _b64
import hashlib as _hashlib
import json
import logging
import os
import re
import select as _select_mod
import signal
import struct as _struct_mod
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from socketserver import ThreadingMixIn

try:
    import fcntl as _fcntl_mod
    import pty as _pty_mod
    import termios as _termios_mod
    _PTY_AVAILABLE = True
except ImportError:
    _PTY_AVAILABLE = False

log = logging.getLogger("dev_runner")

PORT = int(os.getenv("DEV_RUNNER_PORT", "7891"))
_RAW_APPS = os.getenv("DEV_APPS", "")

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


# ── WebSocket helpers ──────────────────────────────────────────────────────────

_WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def _ws_accept(key: str) -> str:
    return _b64.b64encode(
        _hashlib.sha1((key + _WS_GUID).encode()).digest()
    ).decode()


def _ws_recv_bytes(sock, n: int) -> bytes:
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("socket closed")
        buf += chunk
    return buf


def _ws_read_frame(sock):
    """Returns (opcode, payload_bytes) or None on error."""
    try:
        two = _ws_recv_bytes(sock, 2)
        b0, b1 = two[0], two[1]
        opcode = b0 & 0x0F
        masked = bool(b1 & 0x80)
        length = b1 & 0x7F
        if length == 126:
            length = int.from_bytes(_ws_recv_bytes(sock, 2), "big")
        elif length == 127:
            length = int.from_bytes(_ws_recv_bytes(sock, 8), "big")
        mask_key = _ws_recv_bytes(sock, 4) if masked else b""
        payload = _ws_recv_bytes(sock, length) if length else b""
        if masked and payload:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
        return opcode, payload
    except Exception:
        return None


def _ws_write_frame(sock, data: bytes, opcode: int = 0x02) -> bool:
    """Send one unmasked WebSocket frame. Returns False on error."""
    try:
        n = len(data)
        h = bytes([0x80 | opcode])
        if n < 126:
            h += bytes([n])
        elif n < 65536:
            h += bytes([126]) + n.to_bytes(2, "big")
        else:
            h += bytes([127]) + n.to_bytes(8, "big")
        sock.sendall(h + data)
        return True
    except Exception:
        return False


# ── App discovery ──────────────────────────────────────────────────────────────

def _load_apps() -> list[dict]:
    result: list[dict] = []
    for raw in _RAW_APPS.split(";"):
        raw = raw.strip()
        if not raw:
            continue
        path = Path(raw).expanduser().resolve()
        pkg_file = path / "package.json"
        if not pkg_file.exists():
            log.warning("No package.json at %s — skipped", path)
            continue
        try:
            pkg = json.loads(pkg_file.read_text(encoding="utf-8"))
        except Exception as exc:
            log.warning("Failed to parse %s: %s — skipped", pkg_file, exc)
            continue
        scripts: dict[str, str] = {k: v for k, v in pkg.get("scripts", {}).items()}
        result.append({
            "id":      str(path),
            "name":    pkg.get("name", path.name),
            "version": pkg.get("version", ""),
            "path":    str(path),
            "scripts": scripts,
        })
        log.info("Loaded '%s'  %d scripts  %s", result[-1]["name"], len(scripts), path)
    if not result:
        log.warning("No apps loaded — set DEV_APPS env var")
    return result


_apps: list[dict] = []
_apps_lock = threading.Lock()


# ── Process registry ───────────────────────────────────────────────────────────

_procs: dict[str, dict] = {}
_procs_lock = threading.Lock()


def _start_process(app_id: str, script: str, pkg_manager: str = "pnpm") -> str:
    with _apps_lock:
        app = next((a for a in _apps if a["id"] == app_id), None)
    if app is None:
        raise ValueError(f"App not found: {app_id!r}")
    if script not in app["scripts"]:
        raise ValueError(f"Script '{script}' not in {list(app['scripts'])}")

    proc_id = uuid.uuid4().hex[:8]
    env = os.environ.copy()
    env.update({"FORCE_COLOR": "0", "NO_COLOR": "1"})

    bins = [[pkg_manager], [pkg_manager + ".cmd"]] if os.name == "nt" else [[pkg_manager]]
    if os.name == "nt":
        extra_kwargs: dict = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    else:
        extra_kwargs = {"preexec_fn": os.setsid}

    proc = None
    last_exc: Exception | None = None
    for cmd in bins:
        try:
            proc = subprocess.Popen(
                cmd + ["run", script],
                cwd=app["path"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                env=env,
                **extra_kwargs,
            )
            break
        except FileNotFoundError as exc:
            last_exc = exc
    if proc is None:
        raise RuntimeError(f"{pkg_manager!r} not found in PATH: {last_exc}")

    info: dict = {
        "id":           proc_id,
        "app_id":       app_id,
        "app_name":     app["name"],
        "script":       script,
        "pkg_manager":  pkg_manager,
        "proc":         proc,
        "output":       [],
        "output_lock":  threading.Lock(),
        "done_event":   threading.Event(),
        "started_at":   time.time(),
        "ended_at":     None,
        "return_code":  None,
    }
    with _procs_lock:
        _procs[proc_id] = info

    t_out = threading.Thread(target=_drain_stream, args=(info, "out"), daemon=True)
    t_err = threading.Thread(target=_drain_stream, args=(info, "err"), daemon=True)
    info["_t_out"] = t_out
    info["_t_err"] = t_err
    t_out.start()
    t_err.start()
    threading.Thread(target=_wait_proc, args=(info,), daemon=True).start()

    log.info("Started %s  [%s > %s run %s]  pid=%d",
             proc_id, pkg_manager, app["name"], script, proc.pid)
    return proc_id


def _drain_stream(info: dict, stream: str) -> None:
    pipe = info["proc"].stdout if stream == "out" else info["proc"].stderr
    assert pipe
    try:
        for raw in pipe:
            line = _ANSI_RE.sub("", raw.rstrip("\r\n"))
            with info["output_lock"]:
                info["output"].append({"s": stream, "t": line})
    except Exception as exc:
        log.debug("Stream %s closed for %s: %s", stream, info["id"], exc)


def _wait_proc(info: dict) -> None:
    info["_t_out"].join()
    info["_t_err"].join()
    info["proc"].wait()
    info["return_code"] = info["proc"].returncode
    info["ended_at"] = time.time()
    info["done_event"].set()
    log.info("Ended %s  rc=%s  [%s > %s]",
             info["id"], info["proc"].returncode,
             info["app_name"], info["script"])


def _kill_process(proc_id: str) -> bool:
    with _procs_lock:
        info = _procs.get(proc_id)
    if not info or info["return_code"] is not None:
        return False
    proc = info["proc"]
    try:
        if os.name == "nt":
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
        return True
    except ProcessLookupError:
        return False
    except Exception as exc:
        log.warning("killpg failed for %s: %s — falling back to terminate()", proc_id, exc)
        try:
            proc.terminate()
        except Exception:
            pass
        return False


def _proc_status(info: dict) -> dict:
    return {
        "id":          info["id"],
        "appId":       info["app_id"],
        "appName":     info["app_name"],
        "script":      info["script"],
        "pkgManager":  info["pkg_manager"],
        "startedAt":   info["started_at"],
        "endedAt":     info["ended_at"],
        "returnCode":  info["return_code"],
        "running":     info["return_code"] is None,
    }


# ── Terminal registry ──────────────────────────────────────────────────────────

# term_id → {id, app_id, app_name, master_fd, proc, started_at}
_terms: dict[str, dict] = {}
_terms_lock = threading.Lock()


def _set_winsize(fd: int, cols: int, rows: int) -> None:
    if not _PTY_AVAILABLE:
        return
    try:
        _fcntl_mod.ioctl(
            fd, _termios_mod.TIOCSWINSZ,
            _struct_mod.pack("HHHH", rows, cols, 0, 0),
        )
    except Exception:
        pass


def _spawn_terminal(app_id: str, cols: int = 120, rows: int = 30) -> str:
    if not _PTY_AVAILABLE:
        raise RuntimeError("PTY not available on this platform")
    with _apps_lock:
        app = next((a for a in _apps if a["id"] == app_id), None)
    if app is None:
        raise ValueError(f"App not found: {app_id!r}")

    term_id = uuid.uuid4().hex[:8]
    master_fd, slave_fd = _pty_mod.openpty()
    _set_winsize(slave_fd, cols, rows)

    env = os.environ.copy()
    env.update({
        "TERM": "xterm-256color",
        "COLUMNS": str(cols),
        "LINES": str(rows),
    })

    def _preexec():
        os.setsid()
        _fcntl_mod.ioctl(0, _termios_mod.TIOCSCTTY, 0)

    shell = os.environ.get("SHELL", "/bin/bash")
    proc = subprocess.Popen(
        [shell],
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        cwd=app["path"],
        env=env,
        preexec_fn=_preexec,
        close_fds=True,
    )
    os.close(slave_fd)

    info = {
        "id":         term_id,
        "app_id":     app_id,
        "app_name":   app["name"],
        "master_fd":  master_fd,
        "proc":       proc,
        "started_at": time.time(),
    }
    with _terms_lock:
        _terms[term_id] = info

    log.info("Terminal %s  [%s]  pid=%d", term_id, app["name"], proc.pid)
    return term_id


def _kill_terminal(term_id: str) -> None:
    with _terms_lock:
        info = _terms.pop(term_id, None)
    if info is None:
        return
    try:
        info["proc"].terminate()
    except Exception:
        pass
    try:
        os.close(info["master_fd"])
    except Exception:
        pass
    log.info("Terminal %s closed", term_id)


def _resize_terminal(term_id: str, cols: int, rows: int) -> None:
    with _terms_lock:
        info = _terms.get(term_id)
    if info:
        _set_winsize(info["master_fd"], cols, rows)


# ── HTTP handler ───────────────────────────────────────────────────────────────

class _Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/":
            body = _HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        elif path == "/api/apps":
            with _apps_lock:
                data = [{"id": a["id"], "name": a["name"],
                         "version": a["version"], "scripts": a["scripts"]}
                        for a in _apps]
            self._json(200, data)

        elif path == "/api/processes":
            with _procs_lock:
                data = [_proc_status(i) for i in _procs.values()]
            self._json(200, data)

        elif path == "/api/terminals":
            with _terms_lock:
                data = [{"id": t["id"], "appId": t["app_id"], "appName": t["app_name"],
                         "startedAt": t["started_at"]} for t in _terms.values()]
            self._json(200, data)

        elif path.startswith("/api/output/"):
            proc_id = path[len("/api/output/"):]
            with _procs_lock:
                info = _procs.get(proc_id)
            if info is None:
                self._json(404, {"error": "Process not found"})
                return
            self._stream_sse(info)

        elif path.startswith("/ws/terminal/"):
            term_id = path[len("/ws/terminal/"):]
            self._handle_ws_upgrade(term_id)

        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length", 0))
        body_raw = self.rfile.read(length) if length else b"{}"
        try:
            body: dict = json.loads(body_raw)
        except Exception:
            self._json(400, {"error": "Invalid JSON"})
            return

        if path == "/api/run":
            app_id = body.get("appId", "")
            script = body.get("script", "")
            pkg_manager = body.get("pkgManager", "pnpm")
            if not app_id or not script:
                self._json(400, {"error": "appId and script are required"})
                return
            try:
                proc_id = _start_process(app_id, script, pkg_manager)
                self._json(200, {"processId": proc_id})
            except Exception as exc:
                log.error("Run failed: %s", exc)
                self._json(500, {"error": str(exc)})

        elif path.startswith("/api/kill/"):
            proc_id = path[len("/api/kill/"):]
            ok = _kill_process(proc_id)
            self._json(200, {"ok": ok})

        elif path == "/api/terminal":
            if not _PTY_AVAILABLE:
                self._json(500, {"error": "PTY not available on this platform"})
                return
            app_id = body.get("appId", "")
            cols = int(body.get("cols", 120))
            rows = int(body.get("rows", 30))
            if not app_id:
                self._json(400, {"error": "appId is required"})
                return
            try:
                term_id = _spawn_terminal(app_id, cols, rows)
                self._json(200, {"termId": term_id})
            except Exception as exc:
                log.error("Terminal spawn failed: %s", exc)
                self._json(500, {"error": str(exc)})

        elif path.startswith("/api/terminal/kill/"):
            term_id = path[len("/api/terminal/kill/"):]
            _kill_terminal(term_id)
            self._json(200, {"ok": True})

        elif path == "/api/reload":
            global _apps
            with _apps_lock:
                _apps = _load_apps()
            self._json(200, {"count": len(_apps)})

        else:
            self._json(404, {"error": "Not found"})

    # ── WebSocket upgrade ──────────────────────────────────────────────────────

    def _handle_ws_upgrade(self, term_id: str):
        if self.headers.get("Upgrade", "").lower() != "websocket":
            self._json(400, {"error": "Expected WebSocket upgrade"})
            return
        with _terms_lock:
            info = _terms.get(term_id)
        if info is None:
            self._json(404, {"error": "Terminal not found"})
            return

        key = self.headers.get("Sec-WebSocket-Key", "")
        accept = _ws_accept(key)

        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept)
        self.end_headers()
        self.wfile.flush()

        self.close_connection = True
        self._handle_ws_terminal(term_id, info)

    def _handle_ws_terminal(self, term_id: str, info: dict):
        sock = self.connection
        master_fd = info["master_fd"]
        write_lock = threading.Lock()
        alive = threading.Event()
        alive.set()

        def pty_reader():
            while alive.is_set():
                try:
                    r, _, _ = _select_mod.select([master_fd], [], [], 0.1)
                    if not r:
                        continue
                    data = os.read(master_fd, 4096)
                    if not data:
                        break
                    with write_lock:
                        if not _ws_write_frame(sock, data, 0x02):
                            break
                except OSError:
                    break
                except Exception as exc:
                    log.debug("PTY reader error %s: %s", term_id, exc)
                    break
            alive.clear()
            try:
                with write_lock:
                    _ws_write_frame(sock, b"", 0x08)
            except Exception:
                pass

        reader = threading.Thread(target=pty_reader, daemon=True)
        reader.start()

        try:
            sock.settimeout(1.0)
            while alive.is_set():
                frame = _ws_read_frame(sock)
                if frame is None:
                    break
                opcode, data = frame
                if opcode == 0x08:
                    break
                if opcode == 0x09:
                    with write_lock:
                        _ws_write_frame(sock, data, 0x0A)
                    continue
                if not data:
                    continue
                if data[0:1] == b"\x00":
                    try:
                        ctrl = json.loads(data[1:].decode("utf-8", errors="replace"))
                        if ctrl.get("type") == "resize":
                            _resize_terminal(term_id,
                                             int(ctrl.get("cols", 80)),
                                             int(ctrl.get("rows", 24)))
                    except Exception:
                        pass
                else:
                    try:
                        os.write(master_fd, data)
                    except OSError:
                        break
        finally:
            alive.clear()
            reader.join(timeout=2.0)
            _kill_terminal(term_id)

    # ── SSE streaming ──────────────────────────────────────────────────────────

    def _stream_sse(self, info: dict):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors()
        self.end_headers()

        idx = 0
        keepalive_ticks = 0

        while True:
            with info["output_lock"]:
                new_items = info["output"][idx:]
                done = info["done_event"].is_set()

            try:
                for item in new_items:
                    self._sse_write("line", json.dumps({"s": item["s"], "t": item["t"]}))
                idx += len(new_items)
            except Exception:
                return

            if done:
                with info["output_lock"]:
                    tail = info["output"][idx:]
                try:
                    for item in tail:
                        self._sse_write("line", json.dumps({"s": item["s"], "t": item["t"]}))
                    self._sse_write("done", json.dumps({"returnCode": info.get("return_code", -1)}))
                except Exception:
                    pass
                return

            info["done_event"].wait(timeout=0.1)

            keepalive_ticks += 1
            if keepalive_ticks >= 300:
                keepalive_ticks = 0
                try:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                except Exception:
                    return

    def _sse_write(self, event: str, data: str):
        safe = data.replace("\n", " ").replace("\r", "")
        self.wfile.write(f"event: {event}\ndata: {safe}\n\n".encode("utf-8"))
        self.wfile.flush()

    # ── helpers ────────────────────────────────────────────────────────────────

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


class _ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        exc_type = sys.exc_info()[0]
        if exc_type and issubclass(exc_type, (BrokenPipeError, ConnectionResetError, OSError)):
            return
        super().handle_error(request, client_address)


# ── DevRunner class ────────────────────────────────────────────────────────────

class DevRunner:
    def __init__(self, port: int = PORT):
        self.port = port

    def run(self):
        global _apps
        with _apps_lock:
            _apps = _load_apps()
        server = _ThreadedHTTPServer(("", self.port), _Handler)
        log.info("Dev Runner  →  http://localhost:%d", self.port)
        log.info("Apps: %s", [a["name"] for a in _apps] or "(none — set DEV_APPS)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
            with _procs_lock:
                running = [i for i in _procs.values() if i["return_code"] is None]
            for info in running:
                _kill_process(info["id"])
            with _terms_lock:
                term_ids = list(_terms.keys())
            for tid in term_ids:
                _kill_terminal(tid)
            log.info("Dev Runner stopped")


# ── Embedded web UI ────────────────────────────────────────────────────────────

_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Dev Runner</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg:       #1e1e1e;
  --bg2:      #252526;
  --bg3:      #2d2d2d;
  --bg4:      #333333;
  --border:   #3c3c3c;
  --text:     #cccccc;
  --dim:      #858585;
  --blue:     #0e639c;
  --blue-lt:  #4fc1ff;
  --green:    #4ec94e;
  --red:      #f44747;
  --orange:   #ce9178;
  --yellow:   #dcdcaa;
  --sw: 240px;
}
html, body { height: 100%; background: var(--bg); color: var(--text);
             font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; overflow: hidden; }

/* ── Topbar ── */
#topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 0 10px; height: 36px;
  background: var(--bg2); border-bottom: 1px solid var(--border); flex-shrink: 0;
}
#topbar h1 { font-size: 13px; font-weight: 600; letter-spacing: .4px; }
#port-label { color: var(--dim); font-size: 11px; }
.spacer { flex: 1; }

.pkg-group { display: flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.pkgbtn {
  padding: 3px 10px; border: none; background: transparent;
  color: var(--dim); cursor: pointer; font-size: 12px; font-weight: 500;
}
.pkgbtn:hover { background: var(--bg3); color: var(--text); }
.pkgbtn.active { background: var(--blue); color: #fff; }

#btn-reload {
  padding: 3px 10px; border-radius: 3px; border: 1px solid var(--border);
  background: transparent; color: var(--text); cursor: pointer; font-size: 12px;
}
#btn-reload:hover { background: var(--bg3); }

/* ── Layout ── */
#layout { display: flex; height: calc(100vh - 36px); }

/* ── Sidebar ── */
#sidebar {
  width: var(--sw); flex-shrink: 0; display: flex; flex-direction: column;
  background: var(--bg2); border-right: 1px solid var(--border);
}
#sidebar-tabs {
  display: flex; flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}
.stab {
  flex: 1; padding: 6px 0; border: none; background: transparent;
  color: var(--dim); cursor: pointer; font-size: 12px; font-weight: 500;
  border-bottom: 2px solid transparent;
}
.stab:hover { color: var(--text); }
.stab.active { color: var(--text); border-bottom-color: var(--blue); }
#sidebar-body { flex: 1; overflow-y: auto; }

/* ── Apps view ── */
.app-section { padding: 0 0 10px; }
.app-header {
  padding: 8px 10px 4px; font-size: 11px; font-weight: 700;
  letter-spacing: .6px; text-transform: uppercase; color: var(--dim);
  display: flex; align-items: center; justify-content: space-between;
}
.app-hdr-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-version { font-weight: 400; text-transform: none; letter-spacing: 0; }
.term-btn {
  padding: 2px 7px; border-radius: 3px; border: 1px solid var(--border);
  background: transparent; color: var(--dim); cursor: pointer; font-size: 11px;
  font-weight: 500; text-transform: none; letter-spacing: 0; flex-shrink: 0;
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
}
.term-btn:hover { background: var(--bg3); color: var(--text); }
.script-list { padding: 2px 8px 0; display: flex; flex-wrap: wrap; gap: 4px; }
.script-btn {
  padding: 3px 10px; border-radius: 3px; border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); cursor: pointer; font-size: 12px;
  transition: background .12s, border-color .12s;
}
.script-btn:hover { background: var(--blue); border-color: var(--blue); }
.no-apps { padding: 16px 12px; color: var(--dim); font-size: 12px; line-height: 1.7; }
.no-apps code { color: var(--orange); }

/* ── Processes view ── */
#view-procs { padding: 6px 0; }
.proc-item {
  padding: 6px 10px; border-bottom: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 4px;
}
.proc-item:last-child { border-bottom: none; }
.proc-row1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.proc-icon { font-size: 12px; flex-shrink: 0; }
.proc-icon.running { animation: spin 1s linear infinite; display: inline-block; }
.proc-icon.ok { color: var(--green); }
.proc-icon.fail { color: var(--red); }
.proc-label { font-size: 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.proc-meta { font-size: 11px; color: var(--dim); padding-left: 18px; }
.proc-row2 { display: flex; gap: 4px; padding-left: 18px; }
.proc-row2 button {
  padding: 2px 8px; border-radius: 3px; border: 1px solid var(--border);
  background: var(--bg3); color: var(--text); cursor: pointer; font-size: 11px;
}
.proc-row2 button:hover { background: var(--bg4); }
.proc-row2 .btn-kill { color: var(--red); border-color: #5a2020; }
.proc-row2 .btn-kill:hover { background: #3a1010; }
.no-procs { padding: 16px 12px; color: var(--dim); font-size: 12px; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* ── Main ── */
#main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

/* ── Tab bar ── */
#tab-bar {
  display: flex; align-items: stretch; flex-shrink: 0; min-height: 34px;
  background: var(--bg3); border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
#tab-bar::-webkit-scrollbar { height: 3px; }
#tab-bar::-webkit-scrollbar-thumb { background: var(--border); }
#no-tabs { color: var(--dim); font-size: 12px; padding: 8px 14px; align-self: center; }
.tab {
  display: flex; align-items: center; gap: 5px; padding: 0 5px 0 12px;
  border-right: 1px solid var(--border); background: var(--bg3);
  cursor: pointer; white-space: nowrap; font-size: 12px; color: var(--dim);
  flex-shrink: 0; border-bottom: 2px solid transparent;
}
.tab.active { background: var(--bg); color: var(--text); border-bottom-color: var(--blue); }
.tab:not(.active):hover { background: var(--bg2); }
.tab-label { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.tab-icon { font-size: 10px; }
.tab-icon.running { animation: spin 1s linear infinite; display: inline-block; }
.tab-icon.ok { color: var(--green); }
.tab-icon.fail { color: var(--red); }
.tab-close {
  padding: 2px 4px; border: none; background: transparent;
  color: var(--dim); cursor: pointer; border-radius: 3px; font-size: 13px; line-height: 1;
}
.tab-close:hover { background: var(--border); color: var(--text); }

/* ── Output panes ── */
#output-container { flex: 1; position: relative; overflow: hidden; }
.output-pane {
  position: absolute; inset: 0; display: none; flex-direction: column; overflow: hidden;
}
.output-pane.active { display: flex; }
.pane-header {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  padding: 4px 10px; background: var(--bg2); border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.pane-title { color: var(--dim); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pane-title strong { color: var(--text); }
.stream-btns { display: flex; gap: 2px; flex-shrink: 0; }
.sfbtn {
  padding: 2px 8px; border-radius: 3px; border: 1px solid transparent;
  background: transparent; color: var(--dim); cursor: pointer; font-size: 11px;
}
.sfbtn:hover { background: var(--bg3); color: var(--text); }
.sfbtn.active { background: var(--bg3); border-color: var(--border); color: var(--text); }
.pane-lines {
  flex: 1; overflow-y: auto; padding: 6px 10px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace; font-size: 12px;
  line-height: 1.45; white-space: pre-wrap; word-break: break-all;
}
.pane-lines::-webkit-scrollbar { width: 6px; }
.pane-lines::-webkit-scrollbar-thumb { background: var(--border); }
.out-line { padding: 0 2px; }
.out-cmd  { color: var(--blue-lt); margin-bottom: 2px; }
.out-err  { color: var(--orange); }
.out-done-ok   { color: var(--green); font-weight: 600; margin-top: 4px; }
.out-done-fail { color: var(--red);   font-weight: 600; margin-top: 4px; }

/* ── Terminal panes ── */
.terminal-pane .term-container {
  flex: 1; overflow: hidden; background: #1e1e1e; padding: 4px;
}
.terminal-pane .pane-title { color: var(--text); }

#empty-state {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  color: var(--dim); gap: 8px; pointer-events: none;
}
#empty-state h2 { font-size: 15px; font-weight: 400; }
#empty-state p  { font-size: 12px; }
</style>
</head>
<body>

<div id="topbar">
  <h1>&#9654; Dev Runner</h1>
  <span id="port-label"></span>
  <span class="spacer"></span>
  <div class="pkg-group">
    <button class="pkgbtn" data-pkg="npm">npm</button>
    <button class="pkgbtn" data-pkg="pnpm">pnpm</button>
  </div>
  <button id="btn-reload" title="Reload apps from DEV_APPS">&#8635; Reload</button>
</div>

<div id="layout">
  <aside id="sidebar">
    <div id="sidebar-tabs">
      <button class="stab active" data-view="apps">Apps</button>
      <button class="stab" data-view="procs">Processes <span id="proc-badge"></span></button>
    </div>
    <div id="sidebar-body">
      <div id="view-apps"><div class="no-apps">Loading…</div></div>
      <div id="view-procs" hidden><div class="no-procs">No processes yet</div></div>
    </div>
  </aside>

  <main id="main">
    <div id="tab-bar"><span id="no-tabs">&#8592; Run a script or open a terminal</span></div>
    <div id="output-container">
      <div id="empty-state">
        <h2>No output yet</h2>
        <p>Click a script button or &#62;_ terminal in the sidebar</p>
      </div>
    </div>
  </main>
</div>

<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
<script>
'use strict';
const $ = id => document.getElementById(id);

// ── Package manager ────────────────────────────────────────────────────────────

let pkgManager = localStorage.getItem('dev-runner-pkg') || 'pnpm';

function initPkgToggle() {
  document.querySelectorAll('.pkgbtn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.pkg === pkgManager);
    btn.addEventListener('click', () => {
      pkgManager = btn.dataset.pkg;
      localStorage.setItem('dev-runner-pkg', pkgManager);
      document.querySelectorAll('.pkgbtn').forEach(b =>
        b.classList.toggle('active', b.dataset.pkg === pkgManager));
    });
  });
  $('port-label').textContent =
    `localhost:${location.port || (location.protocol === 'https:' ? 443 : 80)}`;
}

// ── Sidebar tabs ───────────────────────────────────────────────────────────────

document.querySelectorAll('.stab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $('view-apps').hidden  = (btn.dataset.view !== 'apps');
    $('view-procs').hidden = (btn.dataset.view !== 'procs');
  });
});

// ── State ──────────────────────────────────────────────────────────────────────

// processId → { appName, script, pkgManager, pane, linesEl, tab, autoScroll, filter, running, returnCode, startedAt, endedAt, eventSource }
const procs = new Map();
// termId → { appId, appName, termId, pane, tab, xterm, fitAddon, ws, ro }
const terms = new Map();
let activeTab = null;

// ── Apps sidebar ───────────────────────────────────────────────────────────────

async function loadApps() {
  const res = await fetch('/api/apps');
  const apps = await res.json();
  const el = $('view-apps');
  if (apps.length === 0) {
    el.innerHTML =
      '<div class="no-apps">No apps found.<br>Set <code>DEV_APPS</code><br>in <code>.env.dev-runner</code>.</div>';
    return;
  }
  el.innerHTML = '';
  for (const app of apps) {
    const sec = document.createElement('div');
    sec.className = 'app-section';

    const hdr = document.createElement('div');
    hdr.className = 'app-header';
    hdr.innerHTML =
      `<span class="app-hdr-name">${esc(app.name)}` +
      (app.version ? `<span class="app-version">&nbsp;${esc(app.version)}</span>` : '') +
      `</span>` +
      `<button class="term-btn" title="Open terminal in ${esc(app.name)}">&#62;_</button>`;
    hdr.querySelector('.term-btn').addEventListener('click', e => {
      e.stopPropagation();
      openTerminal(app.id, app.name);
    });

    const list = document.createElement('div');
    list.className = 'script-list';
    for (const [name, cmd] of Object.entries(app.scripts)) {
      const btn = document.createElement('button');
      btn.className = 'script-btn';
      btn.textContent = name;
      btn.title = cmd;
      btn.addEventListener('click', () => runScript(app.id, app.name, name));
      list.appendChild(btn);
    }
    sec.appendChild(hdr);
    sec.appendChild(list);
    el.appendChild(sec);
  }
}

// ── Processes list ─────────────────────────────────────────────────────────────

function renderProcsList() {
  const el = $('view-procs');
  if (procs.size === 0) {
    el.innerHTML = '<div class="no-procs">No processes yet</div>';
    $('proc-badge').textContent = '';
    return;
  }

  const running = [...procs.values()].filter(st => st.running).length;
  $('proc-badge').textContent = running > 0 ? `(${running})` : '';

  el.innerHTML = '';
  for (const [procId, st] of procs) {
    const item = document.createElement('div');
    item.className = 'proc-item';
    item.id = 'pitem-' + procId;

    const row1 = document.createElement('div');
    row1.className = 'proc-row1';

    const icon = document.createElement('span');
    icon.id = 'picon-' + procId;
    if (st.running) {
      icon.className = 'proc-icon running'; icon.textContent = '⠋';
    } else if (st.returnCode === 0) {
      icon.className = 'proc-icon ok'; icon.textContent = '✓';
    } else {
      icon.className = 'proc-icon fail'; icon.textContent = '✗';
    }

    const label = document.createElement('span');
    label.className = 'proc-label';
    label.textContent = `${st.appName} › ${st.script}`;
    label.title = label.textContent;

    row1.appendChild(icon);
    row1.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'proc-meta';
    meta.id = 'pmeta-' + procId;
    meta.textContent = st.running
      ? `${st.pkgManager} run ${st.script}  •  running`
      : `rc: ${st.returnCode}  •  ${fmtDuration(st.startedAt, st.endedAt)}`;

    const row2 = document.createElement('div');
    row2.className = 'proc-row2';

    const btnView = document.createElement('button');
    btnView.textContent = 'View output';
    btnView.addEventListener('click', () => {
      activateTab(procId);
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      document.querySelector('.stab[data-view="apps"]').classList.add('active');
      $('view-apps').hidden = false;
      $('view-procs').hidden = true;
    });
    row2.appendChild(btnView);

    if (st.running) {
      const btnKill = document.createElement('button');
      btnKill.className = 'btn-kill';
      btnKill.textContent = 'Kill';
      btnKill.addEventListener('click', async () => {
        await fetch(`/api/kill/${procId}`, { method: 'POST' });
      });
      row2.appendChild(btnKill);
    }

    item.appendChild(row1);
    item.appendChild(meta);
    item.appendChild(row2);
    el.appendChild(item);
  }
}

function fmtDuration(start, end) {
  if (!end) return '';
  const s = Math.round(end - start);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s/60)}m ${s%60}s`;
}

function updateProcIcon(procId, rc) {
  const st = procs.get(procId);
  if (!st) return;
  st.running = false;
  st.returnCode = rc;

  const icon = $('picon-' + procId);
  if (icon) {
    icon.classList.remove('running');
    if (rc === 0) { icon.className = 'proc-icon ok'; icon.textContent = '✓'; }
    else          { icon.className = 'proc-icon fail'; icon.textContent = '✗'; }
  }
  const meta = $('pmeta-' + procId);
  if (meta) {
    meta.textContent = `rc: ${rc}  •  ${fmtDuration(st.startedAt, Date.now()/1000)}`;
  }
  const item = $('pitem-' + procId);
  if (item) {
    const killBtn = item.querySelector('.btn-kill');
    if (killBtn) killBtn.remove();
  }
  const runCount = [...procs.values()].filter(s => s.running).length;
  $('proc-badge').textContent = runCount > 0 ? `(${runCount})` : '';
}

// ── Process output ─────────────────────────────────────────────────────────────

async function runScript(appId, appName, script) {
  let procId;
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, script, pkgManager }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Error'); return; }
    procId = data.processId;
  } catch (e) {
    alert('Failed to start: ' + e.message);
    return;
  }
  createProcess(procId, appName, script, pkgManager);
}

function createProcess(procId, appName, script, pkg, alreadyDone, returnCode) {
  const pane = document.createElement('div');
  pane.className = 'output-pane';
  pane.id = 'out-' + procId;

  const hdr = document.createElement('div');
  hdr.className = 'pane-header';
  hdr.innerHTML =
    `<span class="pane-title">${esc(appName)} <strong>›</strong> ${esc(script)}</span>` +
    `<div class="stream-btns">` +
    `<button class="sfbtn active" data-f="all">All</button>` +
    `<button class="sfbtn" data-f="out">Stdout</button>` +
    `<button class="sfbtn" data-f="err">Stderr</button>` +
    `</div>`;

  const lines = document.createElement('div');
  lines.className = 'pane-lines';
  lines.id = 'lines-' + procId;

  const cmdLine = document.createElement('div');
  cmdLine.className = 'out-line out-cmd';
  cmdLine.textContent = `> ${pkg || pkgManager} run ${script}`;
  lines.appendChild(cmdLine);

  pane.appendChild(hdr);
  pane.appendChild(lines);
  $('output-container').appendChild(pane);

  hdr.querySelectorAll('.sfbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      hdr.querySelectorAll('.sfbtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setFilter(procId, btn.dataset.f);
    });
  });

  const noTabs = $('no-tabs');
  if (noTabs) noTabs.remove();
  $('empty-state').style.display = 'none';

  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.dataset.procId = procId;
  tab.innerHTML =
    `<span class="tab-label">${esc(appName)} › ${esc(script)}</span>` +
    `<span class="tab-icon running" id="ticon-${procId}">⠋</span>` +
    `<button class="tab-close" title="Kill &amp; close">×</button>`;
  tab.addEventListener('click', e => { if (!e.target.closest('.tab-close')) activateTab(procId); });
  tab.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation(); closeTab(procId);
  });
  $('tab-bar').appendChild(tab);

  const st = {
    appName, script,
    pkgManager: pkg || pkgManager,
    pane, linesEl: lines, tab,
    autoScroll: true, filter: 'all',
    running: !alreadyDone,
    returnCode: alreadyDone ? returnCode : null,
    startedAt: Date.now() / 1000,
    endedAt: null,
    eventSource: null,
  };
  procs.set(procId, st);
  activateTab(procId);
  renderProcsList();

  if (alreadyDone) {
    markDone(procId, returnCode);
    return;
  }

  const es = new EventSource(`/api/output/${procId}`);
  st.eventSource = es;

  es.addEventListener('line', e => {
    try {
      const { s, t } = JSON.parse(e.data);
      appendLine(procId, t, s);
    } catch (_) {
      appendLine(procId, e.data, 'out');
    }
  });

  es.addEventListener('done', e => {
    es.close();
    const { returnCode: rc } = JSON.parse(e.data);
    markDone(procId, rc);
  });

  es.onerror = () => es.close();
}

function appendLine(procId, text, stream) {
  const st = procs.get(procId);
  if (!st) return;
  const div = document.createElement('div');
  div.className = 'out-line' + (stream === 'err' ? ' out-err' : '');
  div.dataset.stream = stream;
  div.textContent = text;
  if (st.filter !== 'all' && st.filter !== stream) div.style.display = 'none';
  st.linesEl.appendChild(div);
  if (st.autoScroll && div.style.display !== 'none') scrollToBottom(procId);
}

function setFilter(procId, filter) {
  const st = procs.get(procId);
  if (!st) return;
  st.filter = filter;
  st.linesEl.querySelectorAll('.out-line[data-stream]').forEach(div => {
    div.style.display = (filter === 'all' || div.dataset.stream === filter) ? '' : 'none';
  });
  if (st.autoScroll) scrollToBottom(procId);
}

function markDone(procId, rc) {
  const st = procs.get(procId);
  if (!st) return;
  st.running = false;
  st.returnCode = rc;
  st.endedAt = Date.now() / 1000;

  const ticon = $('ticon-' + procId);
  if (ticon) {
    ticon.classList.remove('running');
    if (rc === 0) { ticon.className = 'tab-icon ok'; ticon.textContent = '✓'; }
    else          { ticon.className = 'tab-icon fail'; ticon.textContent = '✗'; }
  }

  const msgDiv = document.createElement('div');
  msgDiv.className = rc === 0 ? 'out-done-ok' : 'out-done-fail';
  msgDiv.textContent = rc === 0 ? '[Process exited successfully]' : `[Process exited with code ${rc}]`;
  st.linesEl.appendChild(msgDiv);
  scrollToBottom(procId);
  updateProcIcon(procId, rc);
}

function scrollToBottom(procId) {
  const st = procs.get(procId);
  if (st) st.linesEl.scrollTop = st.linesEl.scrollHeight;
}

// ── Terminal support ───────────────────────────────────────────────────────────

async function openTerminal(appId, appName) {
  if (typeof Terminal === 'undefined') {
    alert('xterm.js failed to load from CDN. Check your internet connection.');
    return;
  }
  try {
    const res = await fetch('/api/terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, cols: 120, rows: 30 }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Error'); return; }
    createTerminalTab(data.termId, appName, appId);
  } catch (e) {
    alert('Failed to open terminal: ' + e.message);
  }
}

function createTerminalTab(termId, appName, appId) {
  // pane
  const pane = document.createElement('div');
  pane.className = 'output-pane terminal-pane';
  pane.id = 'term-' + termId;

  const hdr = document.createElement('div');
  hdr.className = 'pane-header';
  hdr.innerHTML = `<span class="pane-title">&#62;_ <strong>${esc(appName)}</strong></span>`;

  const container = document.createElement('div');
  container.className = 'term-container';
  container.id = 'tc-' + termId;

  pane.appendChild(hdr);
  pane.appendChild(container);
  $('output-container').appendChild(pane);

  // tab
  const noTabs = $('no-tabs');
  if (noTabs) noTabs.remove();
  $('empty-state').style.display = 'none';

  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.innerHTML =
    `<span class="tab-label">&#62;_ ${esc(appName)}</span>` +
    `<button class="tab-close" title="Close terminal">×</button>`;
  tab.addEventListener('click', e => {
    if (!e.target.closest('.tab-close')) activateTab(termId);
  });
  tab.querySelector('.tab-close').addEventListener('click', e => {
    e.stopPropagation(); closeTab(termId);
  });
  $('tab-bar').appendChild(tab);

  const ts = { appId, appName, termId, pane, tab, xterm: null, fitAddon: null, ws: null, ro: null };
  terms.set(termId, ts);
  activateTab(termId);

  requestAnimationFrame(() => initXterm(termId, ts, container));
}

function initXterm(termId, ts, container) {
  const xterm = new Terminal({
    theme: {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#ffffff',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#3a3a3a',
      black: '#1e1e1e',   brightBlack: '#555555',
      red: '#f44747',     brightRed: '#f44747',
      green: '#4ec94e',   brightGreen: '#4ec94e',
      yellow: '#dcdcaa',  brightYellow: '#dcdcaa',
      blue: '#4fc1ff',    brightBlue: '#4fc1ff',
      magenta: '#c586c0', brightMagenta: '#c586c0',
      cyan: '#9cdcfe',    brightCyan: '#9cdcfe',
      white: '#cccccc',   brightWhite: '#ffffff',
    },
    fontSize: 13,
    fontFamily: "'Cascadia Code','Fira Code',Consolas,monospace",
    cursorBlink: true,
    scrollback: 5000,
  });

  const fitAddon = new FitAddon.FitAddon();
  xterm.loadAddon(fitAddon);
  xterm.open(container);
  try { fitAddon.fit(); } catch (e) {}

  ts.xterm = xterm;
  ts.fitAddon = fitAddon;

  const ro = new ResizeObserver(() => {
    if (activeTab === termId && ts.fitAddon) {
      try { ts.fitAddon.fit(); } catch (e) {}
    }
  });
  ro.observe(container);
  ts.ro = ro;

  // WebSocket
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws/terminal/${termId}`);
  ws.binaryType = 'arraybuffer';
  ts.ws = ws;

  ws.onopen = () => sendTermResize(ts);

  ws.onmessage = e => xterm.write(new Uint8Array(e.data));

  ws.onerror = () => xterm.writeln('\r\x1b[31m[WebSocket error]\x1b[0m');

  ws.onclose = () => {
    xterm.writeln('\r\x1b[33m[Terminal closed]\x1b[0m');
    const t = terms.get(termId);
    if (t) t.ws = null;
  };

  xterm.onData(data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  xterm.onResize(() => sendTermResize(ts));
}

function sendTermResize(ts) {
  if (!ts.ws || ts.ws.readyState !== WebSocket.OPEN || !ts.xterm) return;
  const msg = '\x00' + JSON.stringify({ type: 'resize', cols: ts.xterm.cols, rows: ts.xterm.rows });
  ts.ws.send(msg);
}

// ── Tab management ─────────────────────────────────────────────────────────────

function activateTab(id) {
  if (activeTab) {
    const op = procs.get(activeTab);
    const ot = terms.get(activeTab);
    if (op) { op.pane.classList.remove('active'); op.tab.classList.remove('active'); }
    if (ot) { ot.pane.classList.remove('active'); ot.tab.classList.remove('active'); }
  }
  const np = procs.get(id);
  const nt = terms.get(id);
  if (np) { np.pane.classList.add('active'); np.tab.classList.add('active'); }
  if (nt) {
    nt.pane.classList.add('active'); nt.tab.classList.add('active');
    setTimeout(() => {
      if (nt.fitAddon) { try { nt.fitAddon.fit(); } catch (e) {} }
    }, 50);
  }
  activeTab = id;
  $('empty-state').style.display = 'none';
}

function closeTab(id) {
  const proc = procs.get(id);
  const term = terms.get(id);

  if (proc) {
    fetch(`/api/kill/${id}`, { method: 'POST' }).catch(() => {});
    if (proc.eventSource) proc.eventSource.close();
    proc.pane.remove();
    proc.tab.remove();
    procs.delete(id);
  }

  if (term) {
    fetch(`/api/terminal/kill/${id}`, { method: 'POST' }).catch(() => {});
    if (term.ro) term.ro.disconnect();
    if (term.ws) { try { term.ws.close(); } catch (e) {} }
    if (term.xterm) { try { term.xterm.dispose(); } catch (e) {} }
    term.pane.remove();
    term.tab.remove();
    terms.delete(id);
  }

  if (activeTab === id) {
    activeTab = null;
    const remaining = [...procs.keys(), ...terms.keys()];
    if (remaining.length > 0) {
      activateTab(remaining[remaining.length - 1]);
    } else {
      $('empty-state').style.display = '';
      if (!$('no-tabs')) {
        const span = document.createElement('span');
        span.id = 'no-tabs';
        span.textContent = '← Run a script or open a terminal';
        $('tab-bar').prepend(span);
      }
    }
  }
  renderProcsList();
}

// ── Scroll tracking ────────────────────────────────────────────────────────────

$('output-container').addEventListener('scroll', e => {
  const linesEl = e.target.closest('.pane-lines');
  if (!linesEl) return;
  const procId = linesEl.id.replace('lines-', '');
  const st = procs.get(procId);
  if (st) {
    st.autoScroll = linesEl.scrollHeight - linesEl.clientHeight - linesEl.scrollTop < 40;
  }
}, true);

// ── Restore processes on reload ────────────────────────────────────────────────

async function restoreProcesses() {
  try {
    const res = await fetch('/api/processes');
    const list = await res.json();
    for (const p of list) {
      createProcess(p.id, p.appName, p.script, p.pkgManager,
                    !p.running, p.returnCode);
    }
  } catch (_) {}
}

// ── Reload button ──────────────────────────────────────────────────────────────

$('btn-reload').addEventListener('click', async () => {
  await fetch('/api/reload', { method: 'POST' });
  await loadApps();
});

// ── Utils ──────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────

(async () => {
  initPkgToggle();
  await loadApps();
  await restoreProcesses();
})();
</script>
</body>
</html>"""


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    DevRunner().run()
