"""Server-logic MQTT client for the desktop app.

Speaks the control-plane protocol from ``packages/server-logic/src`` (see
docs/ServerLogic.md). One desktop client logs in, then registers each virtual
peripheral as a **device** sub-entity:

  * client identity   ``{user}/desktop-native/{clientId}``
  * lifecycle         on the client outbox: ``client-login`` / ``client-logout``
                      / ``client-device-new`` / ``client-device-remove`` / ``heartbeat``
  * device commands   arrive on ``{...}/device/{deviceId}/inbox`` as Envelopes,
                      answered on ``{...}/device/{deviceId}/outbox``

Enable/disable a device → register/unregister it under the logged-in client.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import threading
import time
import uuid

import paho.mqtt.client as mqtt

from extensions.vfs import VfsExtension
from PySide6.QtCore import QObject, Signal

from .client_desktop_devices import Device

log = logging.getLogger("client_desktop.client")

DEVICE_KIND = "desktop"
CLIENT_TYPE = "native"
DEVICE_SEGMENT = f"{DEVICE_KIND}-{CLIENT_TYPE}"


def _default_client_id() -> str:
    env = os.getenv("CLIENT_DESKTOP_ID")
    if env:
        return env
    host = (socket.gethostname() or "desktop").split(".")[0]
    return "".join(c if c.isalnum() or c in "-_" else "-" for c in host) or "desktop"


class ClientSignals(QObject):
    """Bridge: network-thread events → Qt main thread."""

    connectionChanged = Signal(bool)          # connected?
    deviceRegistered = Signal(str, bool)      # device_id, registered?
    activity = Signal(str, str)               # device_id, human text
    logLine = Signal(str)                     # free-form log line


class ServerLogicClient:
    def __init__(self, devices: list[Device]) -> None:
        self.devices = {d.id: d for d in devices}
        self.signals = ClientSignals()

        # Defaults match how the browser reaches the broker: MQTT is served as a
        # WebSocket at /mqtt on the HTTP port (1894) in shared mode.
        self.user = "admin"
        self.host = "localhost"
        self.port = 1894
        self.transport = "websockets"
        self.ws_path = "/mqtt"
        self.password: str | None = None
        self.client_id = _default_client_id()
        # Katalog wystawiany jako VFS urządzenia. Domyślnie katalog roboczy
        # skryptu (`run_client_desktop.sh` robi cd do app/client).
        self.vfs_root = os.getenv("CLIENT_DESKTOP_VFS_ROOT") or os.getcwd()

        self._client: mqtt.Client | None = None
        self._connected = False
        self._started_at = time.time()
        self._vfs: VfsExtension | None = None
        # The server prunes clients unseen for ~60s; refresh well under that.
        self._hb_interval = 25
        self._hb_timer: threading.Timer | None = None

        for d in self.devices.values():
            d.on_activity = (lambda text, _id=d.id: self.signals.activity.emit(_id, text))

    # ── Identity / topics ──────────────────────────────────────────────────────

    @property
    def _client_key(self) -> str:
        return f"{self.user}/{DEVICE_SEGMENT}/{self.client_id}"

    def _client_outbox(self) -> str:
        return f"{self._client_key}/outbox"

    def _device_inbox(self, device_id: str) -> str:
        return f"{self._client_key}/device/{device_id}/inbox"

    def _device_outbox(self, device_id: str) -> str:
        return f"{self._client_key}/device/{device_id}/outbox"

    def _iot_topic(self, suffix: str) -> str:
        """Topik warstwy IoT — nazwa urządzenia ta sama co w zgłoszeniu."""
        return f"minis/{self.user}/{self.client_id}/{suffix}"

    def _client_identity(self) -> dict:
        return {"userName": self.user, "device": DEVICE_KIND,
                "clientType": CLIENT_TYPE, "id": self.client_id}

    # ── Connection lifecycle ──────────────────────────────────────────────────

    @property
    def connected(self) -> bool:
        return self._connected

    def configure(self, *, user: str, host: str, port: int,
                  transport: str = "tcp", ws_path: str = "/mqtt",
                  password: str | None = None, vfs_root: str | None = None) -> None:
        self.user = user
        self.host = host
        self.port = port
        self.transport = transport
        self.ws_path = ws_path
        self.password = password or None
        if vfs_root:
            self.vfs_root = vfs_root

    def connect(self) -> None:
        if self._client is not None:
            self.disconnect()
        cid = f"desktop_{self.user}_{uuid.uuid4().hex[:8]}"
        self._client = mqtt.Client(
            client_id=cid,
            transport=self.transport,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )
        if self.transport == "websockets":
            self._client.ws_set_options(path=self.ws_path)
        if self.password is not None:
            self._client.username_pw_set(self.user, self.password)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        self.signals.logLine.emit(
            f"Connecting to {self.transport}://{self.host}:{self.port} as "
            f"{self._client_key}…"
        )
        self._client.connect(self.host, self.port)
        self._client.loop_start()

    def disconnect(self) -> None:
        if self._client is None:
            return
        if self._hb_timer is not None:
            self._hb_timer.cancel()
            self._hb_timer = None
        if self._connected:
            for d in self.devices.values():
                if d.enabled:
                    self._publish_device_remove(d)
            self._publish_client(logout=True)
        try:
            self._client.loop_stop()
            self._client.disconnect()
        except Exception:
            pass
        self._client = None
        self._connected = False
        self.signals.connectionChanged.emit(False)
        for d in self.devices.values():
            self.signals.deviceRegistered.emit(d.id, False)

    # ── Device enable/disable ─────────────────────────────────────────────────

    def enable_device(self, device_id: str) -> None:
        d = self.devices[device_id]
        d.enabled = True
        if self._connected:
            self._subscribe_device(d)
            self._publish_device_new(d)
            self.signals.deviceRegistered.emit(d.id, True)

    def disable_device(self, device_id: str) -> None:
        d = self.devices[device_id]
        if self._connected:
            self._publish_device_remove(d)
            self._unsubscribe_device(d)
        d.enabled = False
        self.signals.deviceRegistered.emit(d.id, False)

    # ── MQTT callbacks ─────────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code != 0:
            self.signals.logLine.emit(f"Connection failed: {reason_code}")
            return
        self._connected = True
        self.signals.connectionChanged.emit(True)
        self.signals.logLine.emit("Connected.")
        self._publish_register_request()            # prośba o dopisanie do listy
        self._start_vfs()                           # rozszerzenie IoT: ext/vfs
        self._publish_iot_hello()                   # obecność w IoT (status online)
        self._publish_client(logout=False)          # client-login
        for d in self.devices.values():
            if d.enabled:
                self._subscribe_device(d)
                self._publish_device_new(d)
                self.signals.deviceRegistered.emit(d.id, True)
        self._schedule_heartbeat()

    def _schedule_heartbeat(self) -> None:
        if self._hb_timer is not None:
            self._hb_timer.cancel()
        if not self._connected:
            return
        self._publish_env(self._client_outbox(), {"type": "heartbeat"})
        self._publish_iot_heartbeat()
        self._hb_timer = threading.Timer(self._hb_interval, self._schedule_heartbeat)
        self._hb_timer.daemon = True
        self._hb_timer.start()

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self._connected = False
        if self._hb_timer is not None:
            self._hb_timer.cancel()
            self._hb_timer = None
        self.signals.connectionChanged.emit(False)
        for d in self.devices.values():
            self.signals.deviceRegistered.emit(d.id, False)
        if reason_code != 0:
            self.signals.logLine.emit(f"Disconnected ({reason_code}), auto-reconnecting…")

    def _on_message(self, client, userdata, msg):
        try:
            env = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.signals.logLine.emit(f"Bad payload on {msg.topic}")
            return
        # Rozszerzenia IoT mają własną przestrzeń topików (minis/…), niezależną
        # od warstwy server-logic obsługiwanej niżej.
        if msg.topic == self._iot_topic("ext/vfs/req"):
            if self._vfs is not None:
                self._vfs.handle_request(env)
            return

        # {user}/desktop-native/{clientId}/device/{deviceId}/inbox
        parts = msg.topic.split("/")
        if len(parts) < 6 or parts[-1] != "inbox" or parts[-3] != "device":
            return
        device_id = parts[-2]
        device = self.devices.get(device_id)
        if device is None or not device.enabled:
            return
        self._dispatch(device, env)

    # ── Command dispatch ───────────────────────────────────────────────────────

    def _dispatch(self, device: Device, env: dict) -> None:
        cmd_type = env.get("type")
        req_id = env.get("reqId")
        payload = env.get("payload") or {}
        if not cmd_type:
            return
        outbox = self._device_outbox(device.id)
        try:
            data = device.handle(cmd_type, payload)
            self._publish_env(outbox, {
                "type": f"{cmd_type}.ok",
                "reqId": req_id,
                "payload": data if data is not None else {},
            })
        except Exception as e:
            log.error(f"{device.id} {cmd_type} failed: {e}")
            self.signals.activity.emit(device.id, f"error: {cmd_type} — {e}")
            self._publish_env(outbox, {
                "type": "error",
                "reqId": req_id,
                "payload": {"command": cmd_type, "message": str(e)},
            })

    # ── Outbound helpers ───────────────────────────────────────────────────────

    def _publish_env(self, topic: str, env: dict) -> None:
        if self._client is None:
            return
        env.setdefault("from", self._client_key)
        env.setdefault("ts", int(time.time() * 1000))
        self._client.publish(topic, json.dumps(env), qos=1)

    def _publish_register_request(self) -> None:
        """Prosi o dopisanie do Electronics → Devices.

        Warstwa server-logic (`client-login`) ma własny rejestr, który nie jest
        widoczny na liście urządzeń — bez tego zgłoszenia klient nigdzie się nie
        pokazuje. Wpis powstaje dopiero po akceptacji w panelu.
        """
        topic = f"minis/{self.user}/{self.client_id}/register-request"
        payload = {
            "label": f"{DEVICE_KIND} ({CLIENT_TYPE})",
            "kind": "desktop",
            "description": "Klient desktop: wirtualna mysz, klawiatura i ekran",
        }
        try:
            self._client.publish(topic, json.dumps(payload), qos=1)
            self.signals.logLine.emit("Wysłano prośbę o dodanie urządzenia.")
        except Exception as exc:                     # noqa: BLE001 — log i jedziemy dalej
            self.signals.logLine.emit(f"Register request failed: {exc}")

    def _start_vfs(self) -> None:
        """Uruchamia rozszerzenie IoT `vfs` — udostępnia lokalny katalog.

        Backend montuje je pod `/devices/{deviceName}` w swoim CompositeFS, gdy
        zobaczy wpis `vfs` w `hello`, i rozmawia z nim przez `ext/vfs/req|res`.
        """
        try:
            self._vfs = VfsExtension(
                root_dir=self.vfs_root,
                publish_fn=lambda payload: self._client.publish(
                    self._iot_topic("ext/vfs/res"), payload, qos=1,
                ),
            )
            self._client.subscribe(self._iot_topic("ext/vfs/req"), qos=1)
            self.signals.logLine.emit(f"VFS udostępnia: {self._vfs.root_dir}")
        except Exception as exc:                     # noqa: BLE001 — brak VFS nie blokuje reszty
            self._vfs = None
            self.signals.logLine.emit(f"VFS start failed: {exc}")

    def _publish_iot_hello(self) -> None:
        """Ogłasza obecność w warstwie IoT.

        Status online/offline na liście urządzeń liczy się z `hello`/`heartbeat`
        na topikach `minis/{user}/{device}/…`. Warstwa server-logic
        (`client-login`) ma własny rejestr i nie wpływa na ten status — bez tej
        wiadomości urządzenie stoi na liście jako offline mimo połączenia.
        """
        payload = {
            "uptime": int(time.time() - self._started_at),
            "extensions": [
                {"type": "vmouse", "enabled": True},
                {"type": "vkbd", "enabled": True},
                {"type": "vfs", "enabled": True},
            ],
        }
        try:
            self._client.publish(self._iot_topic("hello"), json.dumps(payload), qos=1)
        except Exception as exc:                     # noqa: BLE001 — log i jedziemy dalej
            self.signals.logLine.emit(f"IoT hello failed: {exc}")

    def _publish_iot_heartbeat(self) -> None:
        try:
            self._client.publish(
                self._iot_topic("heartbeat"),
                json.dumps({"uptime": int(time.time() - self._started_at)}),
                qos=1,
            )
        except Exception as exc:                     # noqa: BLE001
            self.signals.logLine.emit(f"IoT heartbeat failed: {exc}")

    def _publish_client(self, *, logout: bool) -> None:
        self._publish_env(self._client_outbox(), {
            "type": "client-logout" if logout else "client-login",
            "payload": {"client": self._client_identity(),
                        "name": f"Desktop ({self.client_id})"},
        })
        self.signals.logLine.emit(
            f"{'client-logout' if logout else 'client-login'} → {self._client_key}"
        )

    def _publish_device_new(self, device: Device) -> None:
        self._publish_env(self._client_outbox(), {
            "type": "client-device-new",
            "payload": {"entity": {
                "id": device.id,
                "name": device.name,
                "kind": device.kind,
                "capabilities": device.capabilities(),
            }},
        })
        self.signals.logLine.emit(f"client-device-new → {device.id}")

    def _publish_device_remove(self, device: Device) -> None:
        self._publish_env(self._client_outbox(), {
            "type": "client-device-remove",
            "payload": {"entity": {"id": device.id}},
        })
        self.signals.logLine.emit(f"client-device-remove → {device.id}")

    def _subscribe_device(self, device: Device) -> None:
        if self._client is not None:
            self._client.subscribe(self._device_inbox(device.id), qos=1)

    def _unsubscribe_device(self, device: Device) -> None:
        if self._client is not None:
            self._client.unsubscribe(self._device_inbox(device.id))
