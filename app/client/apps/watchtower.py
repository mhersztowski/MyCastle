"""Watchtower — desktop UI annotation overlay for MyCastle.

A Qt (PySide6) application that runs as a MyCastle IoT extension and
draws a transparent always-on-top layer on top of the desktop. The
visible layer is driven by a `VirtualDesktopDisplay` config which
describes how a real app's UI is laid out (menus, panels, buttons) so a
human (or a guide bot) can navigate the GUI.

Two modes live in the same process:

* **Designer** — a normal window where the user composes the layout by
  dragging boxes / labels / arrows / tooltips. Publishing a config sends
  it to MyCastle over MQTT, so other devices subscribed to the same
  topic mirror the change.
* **Overlay** — a frameless, click-through full-screen window that
  paints the active `VirtualDesktopDisplay` on top of every other app.

Both consume the same `WatchtowerConfig` model. The `Watchtower` class
acts as the `display=` object expected by `ClientAgent`:

    extension_type  = 'virtual-desktop-display'
    set_publish_fn(publish_fn)
    update(data)
    handle_request(payload)
    run()                       # blocks main thread (Qt event loop)

Wire protocol on `minis/{user}/{device}/ext/virtual-desktop-display/req`:

    { "op": "update", "config": <WatchtowerConfig> }
    { "op": "clear" }
    { "op": "get" }   # device responds on .../res with { "op": "state", "config": ... }
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Callable, Optional

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtGui import QAction, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import QApplication, QMenu, QSystemTrayIcon

from apps.watchtower_models import WatchtowerConfig, default_config
from apps.watchtower_overlay import OverlayWindow
from apps.watchtower_designer import DesignerWindow

log = logging.getLogger("watchtower")

# Local persistence so a config survives a restart even if MQTT is offline.
_CONFIG_PATH = Path(__file__).parent.parent / "data" / "watchtower.json"


class _Bridge(QObject):
    """Thread-safe channel: MQTT callbacks run on the paho thread but Qt
    widgets must only be touched from the main (GUI) thread. Signals
    bridge the gap via Qt's queued connection."""

    config_received = Signal(object)  # WatchtowerConfig
    cleared = Signal()


class Watchtower:
    """Display object passed to `ClientAgent(display=...)`."""

    # Used by ClientAgent to build the MQTT topic and to announce the
    # extension in the hello packet.
    extension_type = "virtual-desktop-display"

    def __init__(self) -> None:
        self._publish_fn: Optional[Callable[[str], None]] = None
        self._config: WatchtowerConfig = self._load_persisted_config()

        # Qt setup — must happen on the thread that will own `run()`.
        self.app = QApplication.instance() or QApplication(sys.argv)
        self.app.setQuitOnLastWindowClosed(False)  # tray keeps us alive

        self._bridge = _Bridge()
        self._bridge.config_received.connect(self._apply_config_from_mqtt)
        self._bridge.cleared.connect(self._apply_clear_from_mqtt)

        self.overlay = OverlayWindow()
        self.overlay.set_display(self._config.active_display())

        self.designer = DesignerWindow(
            on_publish=self._publish_config,
            on_local_change=self._apply_local_change,
            on_toggle_overlay=self._toggle_overlay,
        )
        self.designer.set_config(self._config)

        self._tray = self._build_tray()

    # ----- display contract used by ClientAgent ----------------------

    def set_publish_fn(self, publish_fn: Callable[[str], None]) -> None:
        self._publish_fn = publish_fn

    def update(self, data: dict) -> None:
        connected = data.get("connected")
        if connected is True:
            log.info("MQTT connected — Watchtower is online.")
        elif connected is False:
            log.warning("MQTT disconnected — Watchtower will retry.")

    def handle_request(self, payload: dict) -> None:
        op = payload.get("op")
        if op == "update":
            try:
                cfg = WatchtowerConfig.from_dict(payload.get("config", {}))
            except Exception as exc:
                log.error("Invalid update payload: %s", exc)
                return
            self._bridge.config_received.emit(cfg)
        elif op == "clear":
            self._bridge.cleared.emit()
        elif op == "get":
            self._respond_state()
        else:
            log.warning("Unknown op: %r", op)

    def run(self) -> None:
        """Blocks the main thread until the user quits via tray menu."""
        self.designer.show()
        # Don't auto-show overlay — user toggles via tray / F8 / button.
        self.app.exec()

    # ----- internal --------------------------------------------------

    def _build_tray(self) -> QSystemTrayIcon:
        tray = QSystemTrayIcon(self._tray_icon(), self.app)
        tray.setToolTip("Watchtower")

        menu = QMenu()
        a_designer = QAction("Open Designer", menu)
        a_designer.triggered.connect(self._show_designer)
        menu.addAction(a_designer)

        a_overlay = QAction("Toggle Overlay", menu)
        a_overlay.triggered.connect(self._toggle_overlay)
        menu.addAction(a_overlay)

        menu.addSeparator()
        a_quit = QAction("Quit", menu)
        a_quit.triggered.connect(self.app.quit)
        menu.addAction(a_quit)

        tray.setContextMenu(menu)
        tray.activated.connect(self._on_tray_activated)
        tray.show()
        return tray

    def _tray_icon(self) -> QIcon:
        # Avoid shipping an icon file — paint a small "W" badge at runtime.
        pix = QPixmap(32, 32)
        pix.fill(Qt.GlobalColor.transparent)
        p = QPainter(pix)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setBrush(Qt.GlobalColor.darkCyan)
        p.setPen(Qt.PenStyle.NoPen)
        p.drawRoundedRect(2, 2, 28, 28, 6, 6)
        p.setPen(Qt.GlobalColor.white)
        f = p.font(); f.setBold(True); f.setPointSize(16); p.setFont(f)
        p.drawText(pix.rect(), Qt.AlignmentFlag.AlignCenter, "W")
        p.end()
        return QIcon(pix)

    def _on_tray_activated(self, reason: QSystemTrayIcon.ActivationReason) -> None:
        if reason == QSystemTrayIcon.ActivationReason.Trigger:
            self._toggle_overlay()

    def _show_designer(self) -> None:
        self.designer.show()
        self.designer.raise_()
        self.designer.activateWindow()

    def _toggle_overlay(self) -> None:
        if self.overlay.isVisible():
            self.overlay.hide()
        else:
            self.overlay.set_display(self._config.active_display())
            self.overlay.show()

    # Local edits in the designer flow through here so the overlay
    # stays in sync without forcing a network round-trip.
    def _apply_local_change(self, cfg: WatchtowerConfig) -> None:
        self._config = cfg
        self.overlay.set_display(cfg.active_display())
        self._persist_config()

    def _apply_config_from_mqtt(self, cfg: WatchtowerConfig) -> None:
        log.info("MQTT update: %d display(s), active=%s",
                 len(cfg.displays), cfg.active_display_id)
        self._config = cfg
        self.designer.set_config(cfg)
        self.overlay.set_display(cfg.active_display())
        self._persist_config()

    def _apply_clear_from_mqtt(self) -> None:
        log.info("MQTT clear")
        self._config = WatchtowerConfig()
        self.designer.set_config(self._config)
        self.overlay.set_display(None)
        self._persist_config()

    def _publish_config(self, cfg: WatchtowerConfig) -> None:
        # Designer's Publish action — mirror our state to the broker.
        self._config = cfg
        self.overlay.set_display(cfg.active_display())
        self._persist_config()
        if self._publish_fn is None:
            log.warning("Publish requested but MQTT is not connected.")
            return
        payload = json.dumps({"op": "state", "config": cfg.to_dict()})
        self._publish_fn(payload)
        log.info("Published config to broker.")

    def _respond_state(self) -> None:
        if self._publish_fn is None:
            return
        payload = json.dumps({"op": "state", "config": self._config.to_dict()})
        self._publish_fn(payload)

    # ----- persistence ----------------------------------------------

    def _load_persisted_config(self) -> WatchtowerConfig:
        try:
            if _CONFIG_PATH.exists():
                data = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
                return WatchtowerConfig.from_dict(data)
        except Exception as exc:
            log.warning("Could not load persisted config: %s", exc)
        return default_config()

    def _persist_config(self) -> None:
        try:
            _CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
            _CONFIG_PATH.write_text(
                json.dumps(self._config.to_dict(), indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            log.warning("Could not persist config: %s", exc)
