"""client_desktop — Qt desktop MQTT client for MyCastle's server-logic layer.

Registers three virtual devices (mouse, keyboard, display) as independent
clients on the ``{user}/desktop-native/{id}`` control plane and lets you
enable/disable each one from a Qt UI. Run:

    python -m apps.client_desktop        # from app/client
    run_client_desktop.bat               # Windows
    ./run_client_desktop.sh              # Linux/WSL

Broker defaults come from config.py / .env (MQTT_BROKER_HOST, MQTT_USER, …)
and can be overridden in the connection bar.
"""

from __future__ import annotations

import logging
import os
import sys

from PySide6.QtCore import QObject, Qt, Signal
from PySide6.QtGui import QAction, QColor, QIcon, QPainter, QPixmap
from PySide6.QtWidgets import (
    QApplication, QCheckBox, QComboBox, QFileDialog, QGridLayout, QGroupBox,
    QHBoxLayout, QLabel, QLineEdit, QMainWindow, QMenu, QPlainTextEdit,
    QPushButton, QSpinBox, QSystemTrayIcon, QVBoxLayout, QWidget,
)

import config
from .client_desktop_client import ServerLogicClient
from .client_desktop_devices import (
    VirtualDisplayDevice, VirtualKeyboardDevice, VirtualMouseDevice,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("client_desktop")

# The backend serves MQTT as a WebSocket at /mqtt on the HTTP port (1894) in
# shared mode — same path the browser uses. Prefer that over the plain-TCP
# broker (1884), which only exists when MQTT_PORT is set. Env-overridable.
DEFAULT_PORT = int(os.getenv("CLIENT_DESKTOP_PORT", "1894"))
DEFAULT_TRANSPORT = os.getenv("CLIENT_DESKTOP_TRANSPORT", "websockets")


def _dot(color: str) -> QIcon:
    """Small round status dot as a QIcon."""
    pm = QPixmap(16, 16)
    pm.fill(Qt.transparent)
    p = QPainter(pm)
    p.setRenderHint(QPainter.Antialiasing)
    p.setBrush(QColor(color))
    p.setPen(Qt.NoPen)
    p.drawEllipse(2, 2, 12, 12)
    p.end()
    return QIcon(pm)


class DisplayBridge(QObject):
    """Marshals virtual-display content changes onto the Qt main thread."""
    changed = Signal(dict)


class DevicePanel(QGroupBox):
    """A card for one virtual device: enable toggle, status, test controls."""

    def __init__(self, device, client: ServerLogicClient, parent=None):
        super().__init__(device.name, parent)
        self.device = device
        self.client = client

        root = QVBoxLayout(self)

        # Header: enable toggle + registration status.
        header = QHBoxLayout()
        self.toggle = QCheckBox("Enabled")
        self.toggle.toggled.connect(self._on_toggle)
        header.addWidget(self.toggle)
        header.addStretch(1)
        self.status = QLabel("● offline")
        self.status.setStyleSheet("color: #888;")
        header.addWidget(self.status)
        root.addLayout(header)

        caps = QLabel("caps: " + ", ".join(device.capabilities()))
        caps.setStyleSheet("color: #888; font-size: 11px;")
        caps.setWordWrap(True)
        root.addWidget(caps)

        # Device-specific test controls (drive device.handle() locally).
        controls = self._build_controls()
        if controls is not None:
            root.addWidget(controls)

        self.activity = QLabel("—")
        self.activity.setStyleSheet("color: #4fc3f7; font-size: 11px;")
        self.activity.setWordWrap(True)
        root.addWidget(self.activity)

    # ── Test controls per device type ─────────────────────────────────────────

    def _build_controls(self) -> QWidget | None:
        name = self.device.id
        if name == "vmouse":
            w = QWidget()
            lay = QGridLayout(w)
            lay.setContentsMargins(0, 4, 0, 0)
            b_center = QPushButton("Move to center")
            b_center.clicked.connect(self._mouse_center)
            b_click = QPushButton("Click")
            b_click.clicked.connect(lambda: self._test("click", {}))
            b_up = QPushButton("Scroll ↑")
            b_up.clicked.connect(lambda: self._test("scroll", {"dy": 3}))
            b_down = QPushButton("Scroll ↓")
            b_down.clicked.connect(lambda: self._test("scroll", {"dy": -3}))
            lay.addWidget(b_center, 0, 0)
            lay.addWidget(b_click, 0, 1)
            lay.addWidget(b_up, 1, 0)
            lay.addWidget(b_down, 1, 1)
            return w
        if name == "vkeyboard":
            w = QWidget()
            lay = QHBoxLayout(w)
            lay.setContentsMargins(0, 4, 0, 0)
            self.kb_input = QLineEdit()
            self.kb_input.setPlaceholderText("text to type…")
            b = QPushButton("Type")
            b.clicked.connect(
                lambda: self._test("type_text", {"text": self.kb_input.text()})
            )
            lay.addWidget(self.kb_input, 1)
            lay.addWidget(b)
            return w
        if name == "vdisplay":
            w = QWidget()
            lay = QVBoxLayout(w)
            lay.setContentsMargins(0, 4, 0, 0)
            self.preview = QLabel("(empty)")
            self.preview.setAlignment(Qt.AlignCenter)
            self.preview.setMinimumHeight(80)
            self.preview.setStyleSheet(
                "background: #101418; color: #e0e0e0; border-radius: 6px;"
            )
            row = QHBoxLayout()
            self.disp_input = QLineEdit()
            self.disp_input.setPlaceholderText("text to show…")
            b = QPushButton("Show")
            b.clicked.connect(
                lambda: self._test("show_text", {"text": self.disp_input.text()})
            )
            b_clear = QPushButton("Clear")
            b_clear.clicked.connect(lambda: self._test("clear", {}))
            row.addWidget(self.disp_input, 1)
            row.addWidget(b)
            row.addWidget(b_clear)
            lay.addWidget(self.preview)
            lay.addLayout(row)
            return w
        return None

    def _mouse_center(self):
        screen = QApplication.primaryScreen().geometry()
        self._test("move", {"x": screen.width() // 2, "y": screen.height() // 2})

    def _test(self, cmd_type: str, payload: dict):
        """Run a command locally (same path the server would trigger)."""
        try:
            self.device.handle(cmd_type, payload)
        except Exception as e:
            self.activity.setText(f"error: {e}")

    # ── State updates ─────────────────────────────────────────────────────────

    def _on_toggle(self, checked: bool):
        if checked:
            self.client.enable_device(self.device.id)
        else:
            self.client.disable_device(self.device.id)
        self._refresh_status(checked and self.client.connected)

    def set_registered(self, registered: bool):
        self._refresh_status(registered)

    def _refresh_status(self, registered: bool):
        if not self.device.enabled:
            self.status.setText("● disabled")
            self.status.setStyleSheet("color: #888;")
        elif registered:
            self.status.setText("● registered")
            self.status.setStyleSheet("color: #66bb6a;")
        else:
            self.status.setText("● waiting")
            self.status.setStyleSheet("color: #ffa726;")

    def set_activity(self, text: str):
        self.activity.setText(text)

    def update_preview(self, content: dict):
        if self.device.id != "vdisplay":
            return
        text = content.get("text") or "(empty)"
        self.preview.setText(text)
        self.preview.setStyleSheet(
            f"background: {content.get('background', '#101418')};"
            f"color: {content.get('color', '#e0e0e0')}; border-radius: 6px;"
        )


class MainWindow(QMainWindow):
    def __init__(self, client: ServerLogicClient):
        super().__init__()
        self.client = client
        self.setWindowTitle("MyCastle — Desktop Client")
        self.resize(560, 640)

        central = QWidget()
        self.setCentralWidget(central)
        root = QVBoxLayout(central)

        root.addWidget(self._build_connection_bar())

        # Device panels.
        self.panels: dict[str, DevicePanel] = {}
        for dev in client.devices.values():
            panel = DevicePanel(dev, client)
            self.panels[dev.id] = panel
            root.addWidget(panel)

        # Log.
        log_box = QGroupBox("Log")
        log_lay = QVBoxLayout(log_box)
        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.log_view.setMaximumBlockCount(500)
        self.log_view.setStyleSheet("font-family: monospace; font-size: 11px;")
        log_lay.addWidget(self.log_view)
        root.addWidget(log_box, 1)

        # Display device → preview bridge (thread-safe).
        self._disp_bridge = DisplayBridge()
        self._disp_bridge.changed.connect(self._on_display_changed)
        disp = client.devices.get("vdisplay")
        if disp is not None:
            disp.on_content_change = self._disp_bridge.changed.emit

        # Wire client signals to the UI.
        s = client.signals
        s.connectionChanged.connect(self._on_connection_changed)
        s.deviceRegistered.connect(self._on_device_registered)
        s.activity.connect(self._on_activity)
        s.logLine.connect(self._append_log)

        self._build_tray()

    # ── Connection bar ─────────────────────────────────────────────────────────

    def _build_connection_bar(self) -> QWidget:
        box = QGroupBox("Broker")
        grid = QGridLayout(box)

        grid.addWidget(QLabel("User"), 0, 0)
        self.user_input = QLineEdit(config.MQTT_USER)
        grid.addWidget(self.user_input, 0, 1)

        grid.addWidget(QLabel("Host"), 0, 2)
        self.host_input = QLineEdit(config.MQTT_BROKER_HOST)
        grid.addWidget(self.host_input, 0, 3)

        grid.addWidget(QLabel("Port"), 1, 0)
        self.port_input = QSpinBox()
        self.port_input.setRange(1, 65535)
        self.port_input.setValue(DEFAULT_PORT)
        grid.addWidget(self.port_input, 1, 1)

        grid.addWidget(QLabel("Transport"), 1, 2)
        self.transport_input = QComboBox()
        self.transport_input.addItems(["tcp", "websockets"])
        self.transport_input.setCurrentText(DEFAULT_TRANSPORT)
        grid.addWidget(self.transport_input, 1, 3)

        # Katalog wystawiany jako VFS urządzenia (rozszerzenie IoT `ext/vfs`).
        # Domyślnie katalog roboczy skryptu; backend zamontuje go pod
        # /devices/{nazwa-urządzenia} po zaakceptowaniu urządzenia.
        grid.addWidget(QLabel("VFS"), 2, 0)
        self.vfs_input = QLineEdit(self.client.vfs_root)
        self.vfs_input.setToolTip("Katalog udostępniany przez rozszerzenie VFS urządzenia")
        grid.addWidget(self.vfs_input, 2, 1, 1, 2)
        vfs_btn = QPushButton("Wybierz…")
        vfs_btn.clicked.connect(self._pick_vfs_dir)
        grid.addWidget(vfs_btn, 2, 3)

        bottom = QHBoxLayout()
        self.conn_status = QLabel("● disconnected")
        self.conn_status.setStyleSheet("color: #888;")
        bottom.addWidget(self.conn_status)
        bottom.addStretch(1)
        self.connect_btn = QPushButton("Connect")
        self.connect_btn.clicked.connect(self._toggle_connection)
        bottom.addWidget(self.connect_btn)
        grid.addLayout(bottom, 3, 0, 1, 4)
        return box

    def _pick_vfs_dir(self):
        chosen = QFileDialog.getExistingDirectory(
            self, "Katalog udostępniany przez VFS", self.vfs_input.text().strip() or ".",
        )
        if chosen:
            self.vfs_input.setText(chosen)

    def _toggle_connection(self):
        if self.client.connected:
            self.client.disconnect()
            return
        self.client.configure(
            user=self.user_input.text().strip() or "admin",
            host=self.host_input.text().strip() or "localhost",
            port=self.port_input.value(),
            transport=self.transport_input.currentText(),
            ws_path=config.MQTT_WS_PATH,
            password=None,
            vfs_root=self.vfs_input.text().strip() or None,
        )
        try:
            self.client.connect()
        except Exception as e:
            self._append_log(f"Connect error: {e}")

    # ── Signal slots ───────────────────────────────────────────────────────────

    def _on_connection_changed(self, connected: bool):
        self.conn_status.setText("● connected" if connected else "● disconnected")
        self.conn_status.setStyleSheet(
            "color: #66bb6a;" if connected else "color: #888;"
        )
        self.connect_btn.setText("Disconnect" if connected else "Connect")
        for field in (self.user_input, self.host_input, self.port_input,
                      self.transport_input):
            field.setEnabled(not connected)
        for panel in self.panels.values():
            panel.set_registered(connected and panel.device.enabled)

    def _on_device_registered(self, device_id: str, registered: bool):
        panel = self.panels.get(device_id)
        if panel is not None:
            panel.set_registered(registered)

    def _on_activity(self, device_id: str, text: str):
        panel = self.panels.get(device_id)
        if panel is not None:
            panel.set_activity(text)
        self._append_log(f"[{device_id}] {text}")

    def _on_display_changed(self, content: dict):
        panel = self.panels.get("vdisplay")
        if panel is not None:
            panel.update_preview(content)

    def _append_log(self, line: str):
        self.log_view.appendPlainText(line)

    # ── System tray ────────────────────────────────────────────────────────────

    def _build_tray(self):
        self.tray = QSystemTrayIcon(_dot("#4fc3f7"), self)
        self.tray.setToolTip("MyCastle Desktop Client")
        menu = QMenu()
        act_show = QAction("Show", self)
        act_show.triggered.connect(self._show_window)
        act_quit = QAction("Quit", self)
        act_quit.triggered.connect(self._quit)
        menu.addAction(act_show)
        menu.addSeparator()
        menu.addAction(act_quit)
        self.tray.setContextMenu(menu)
        self.tray.activated.connect(
            lambda reason: self._show_window()
            if reason == QSystemTrayIcon.Trigger else None
        )
        self.tray.show()

    def _show_window(self):
        self.showNormal()
        self.raise_()
        self.activateWindow()

    def _quit(self):
        self.client.disconnect()
        QApplication.quit()

    def closeEvent(self, event):
        # Minimize to tray instead of quitting.
        if self.tray.isVisible():
            self.hide()
            self.tray.showMessage(
                "MyCastle Desktop Client",
                "Still running in the tray. Right-click → Quit to exit.",
                QSystemTrayIcon.Information, 3000,
            )
            event.ignore()
        else:
            self.client.disconnect()
            event.accept()


def main():
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    devices = [
        VirtualMouseDevice(
            screen_size_fn=lambda: (
                QApplication.primaryScreen().geometry().width(),
                QApplication.primaryScreen().geometry().height(),
            )
        ),
        VirtualKeyboardDevice(),
        VirtualDisplayDevice(),
    ]
    client = ServerLogicClient(devices)

    window = MainWindow(client)
    window.show()
    exit_code = app.exec()
    client.disconnect()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
