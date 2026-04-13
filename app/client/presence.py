"""Desktop app-session presence tracking.

Publishes hello + heartbeat on a synthetic MQTT topic
``minis/{user}/app-{sessionId}/hello|heartbeat`` so the backend can track
this desktop agent as an "app session" (separate from the IoT device identity).

ActivityTracker uses pynput to detect mouse/keyboard activity.
If pynput is unavailable (e.g. headless server), falls back to always-active.
"""

import json
import logging
import os
import platform
import time
import uuid

log = logging.getLogger("presence")

INACTIVE_THRESHOLD_SEC = 30  # seconds without input → inactive
HEARTBEAT_INTERVAL_SEC = 30  # must match config.HEARTBEAT_INTERVAL

# File-based session ID persistence: survives agent restarts within the same
# run directory but resets on a fresh checkout/deploy.
_SESSION_FILE = os.path.join(os.path.dirname(__file__), ".presence_session_id")


def _get_or_create_session_id() -> str:
    if os.path.exists(_SESSION_FILE):
        try:
            sid = open(_SESSION_FILE).read().strip()
            if sid:
                return sid
        except OSError:
            pass
    sid = str(uuid.uuid4())
    try:
        with open(_SESSION_FILE, "w") as f:
            f.write(sid)
    except OSError:
        pass
    return sid


def _build_label() -> str:
    system = platform.system()
    node = platform.node()
    release = platform.release()
    return f"Desktop / {system} {release} ({node})"


# ──────────────────────────────────────────────────────────────────────────────
# Activity tracker
# ──────────────────────────────────────────────────────────────────────────────

class ActivityTracker:
    """Listens for mouse/keyboard events to determine if user is active.

    Uses pynput in non-blocking (listener thread) mode.
    Falls back gracefully when pynput is not installed or cannot attach
    (e.g. no display, Wayland without XDG_SESSION_TYPE=wayland).
    """

    def __init__(self):
        self._last_activity = time.monotonic()
        self._listeners: list = []
        self._started = False

    def start(self) -> None:
        if self._started:
            return
        try:
            from pynput import mouse, keyboard

            def _bump(*_args, **_kwargs):
                self._last_activity = time.monotonic()

            ml = mouse.Listener(on_move=_bump, on_click=_bump, on_scroll=_bump)
            kl = keyboard.Listener(on_press=_bump)
            ml.daemon = True
            kl.daemon = True
            ml.start()
            kl.start()
            self._listeners = [ml, kl]
            log.info("Activity tracker started (pynput)")
        except Exception as exc:
            log.warning(f"pynput unavailable — activity always reported as True: {exc}")

        self._started = True

    def stop(self) -> None:
        for lsnr in self._listeners:
            try:
                lsnr.stop()
            except Exception:
                pass
        self._listeners.clear()
        self._started = False

    @property
    def is_active(self) -> bool:
        if not self._listeners:
            # No listener attached → conservative: assume active
            return True
        return (time.monotonic() - self._last_activity) < INACTIVE_THRESHOLD_SEC


# ──────────────────────────────────────────────────────────────────────────────
# Presence reporter
# ──────────────────────────────────────────────────────────────────────────────

class PresenceReporter:
    """Sends hello + heartbeat to the app-session MQTT topics."""

    def __init__(self, user: str, publish_fn):
        self._user = user
        self._publish = publish_fn
        self._session_id = _get_or_create_session_id()
        self._activity = ActivityTracker()
        self._prefix = f"minis/{user}/app-{self._session_id}"

    def send_hello(self, _client=None) -> None:
        self._activity.start()
        payload = json.dumps({
            "platform": "desktop",
            "sessionId": self._session_id,
            "label": _build_label(),
            "userAgent": f"Python/{platform.python_version()} {platform.system()}/{platform.release()}",
        })
        self._publish(f"{self._prefix}/hello", payload)
        log.info(f"Presence hello sent (session={self._session_id})")

    def send_heartbeat(self, _client=None) -> None:
        payload = json.dumps({
            "sessionId": self._session_id,
            "intervalSec": HEARTBEAT_INTERVAL_SEC,
            "isInteractive": self._activity.is_active,
        })
        self._publish(f"{self._prefix}/heartbeat", payload)
        log.debug(f"Presence heartbeat (active={self._activity.is_active})")

    def stop(self) -> None:
        self._activity.stop()
