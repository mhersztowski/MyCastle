"""MyCastle Client Agent — IoT device client with VFS extension."""

import asyncio
import json
import logging
import os
import platform
import signal
import sys
import threading
import time
import uuid

import paho.mqtt.client as mqtt
import psutil

import config
import operations
from entities import IotEntity
from extensions.vfs import VfsExtension
from presence import ActivityTracker, PresenceReporter
from extensions.virtual_keyboard import VirtualKeyboardExtension
from extensions.virtual_mouse import VirtualMouseExtension

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent")


class ClientAgent:
    def __init__(self, display=None):
        self._display = display
        self.client = mqtt.Client(
            client_id=config.MQTT_CLIENT_ID,
            transport=config.MQTT_TRANSPORT,
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        self.running = False
        self.loop = asyncio.new_event_loop()
        self._start_time = time.time()
        self._heartbeat_timer: threading.Timer | None = None
        self._telemetry_timer: threading.Timer | None = None
        self._entities: dict[str, IotEntity] = {}

        # App-session presence (separate from IoT device identity)
        self._presence = PresenceReporter(
            user=config.MQTT_USER,
            publish_fn=lambda topic, payload: self.client.publish(topic, payload, qos=1),
        )

        self.vfs = VfsExtension(
            root_dir=config.DATA_DIR,
            publish_fn=lambda payload: self.client.publish(
                config.TOPICS["EXT_VFS_RES"], payload, qos=1
            ),
        )
        self.vkbd = VirtualKeyboardExtension(
            publish_fn=lambda payload: self.client.publish(
                config.TOPICS["EXT_VKBD_RES"], payload, qos=1
            ),
        )
        self.vmouse = VirtualMouseExtension(
            publish_fn=lambda payload: self.client.publish(
                config.TOPICS["EXT_VMOUSE_RES"], payload, qos=1
            ),
        )

        # Display contract is generic — any object with an `extension_type`
        # attribute is wired onto `ext/{type}/req` ⇄ `ext/{type}/res`.
        # Legacy displays without the attribute keep the original smart-display routing.
        if display is not None:
            ext_type = getattr(display, "extension_type", "smart-display")
            self._display_req_topic = f"{config.TOPIC_PREFIX}/ext/{ext_type}/req"
            self._display_res_topic = f"{config.TOPIC_PREFIX}/ext/{ext_type}/res"
            display.set_publish_fn(
                lambda payload: self.client.publish(
                    self._display_res_topic, payload, qos=1
                )
            )
        else:
            self._display_req_topic = None
            self._display_res_topic = None
        self.smart_display_ext = display

    # --- Entity registration ---

    def add_entity(self, entity: IotEntity) -> None:
        """Register an IotEntity before start().

        Entities are announced in the hello message. Writable entities
        (Switch, Number, Button, Select) intercept incoming commands whose
        name matches the entity id and auto-acknowledge them.

        Read-only entities (Sensor, BinarySensor) are metadata only — push
        their values via send_telemetry().
        """
        self._entities[entity.id] = entity

    # --- Telemetry publishing ---

    def send_telemetry(self, metrics: list[tuple]) -> None:
        """Publish sensor readings to MyCastle.

        :param metrics: list of ``(key, value)`` or ``(key, value, unit)`` tuples.
        """
        payload: dict = {"metrics": []}
        for m in metrics:
            entry: dict = {"key": m[0], "value": m[1]}
            if len(m) >= 3:
                entry["unit"] = m[2]
            payload["metrics"].append(entry)
        self.client.publish(config.TOPICS["TELEMETRY"], json.dumps(payload), qos=1)
        log.debug(f"Telemetry sent: {[m[0] for m in metrics]}")

    # --- MQTT callbacks ---

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            if self._display:
                self._display.update({"connected": True})
            log.info(
                f"Connected to MQTT broker at "
                f"{config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT} "
                f"(transport={config.MQTT_TRANSPORT})"
            )
            client.subscribe(config.TOPICS["COMMAND"], qos=1)
            client.subscribe(config.TOPICS["EXT_VFS_REQ"], qos=1)
            client.subscribe(config.TOPICS["EXT_VKBD_REQ"], qos=1)
            client.subscribe(config.TOPICS["EXT_VMOUSE_REQ"], qos=1)
            if self.smart_display_ext is not None and self._display_req_topic:
                client.subscribe(self._display_req_topic, qos=1)
            log.info(f"Subscribed | prefix={config.TOPIC_PREFIX} | vfs root={config.DATA_DIR}")
            self._send_register_request()
            self._send_hello()
            self._presence.send_hello(client)
            self._send_heartbeat()
            if self._entities:
                self._publish_system_telemetry()
                self._schedule_telemetry()
        else:
            log.error(f"Connection failed with code: {reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        if self._display:
            self._display.update({"connected": False})
        if reason_code != 0:
            log.warning(f"Unexpected disconnect (code: {reason_code}), reconnecting...")

    def _on_message(self, client, userdata, msg):
        topic = msg.topic
        try:
            data = json.loads(msg.payload.decode())
        except json.JSONDecodeError:
            log.error(f"Received invalid JSON on topic: {topic}")
            return

        if topic == config.TOPICS["COMMAND"]:
            self._handle_command(data)
        elif topic == config.TOPICS["EXT_VFS_REQ"]:
            self.vfs.handle_request(data)
        elif topic == config.TOPICS["EXT_VKBD_REQ"]:
            self.vkbd.handle_request(data)
        elif topic == config.TOPICS["EXT_VMOUSE_REQ"]:
            self.vmouse.handle_request(data)
        elif self._display_req_topic and topic == self._display_req_topic:
            if self.smart_display_ext is not None:
                self.smart_display_ext.handle_request(data)

    # --- Command handling (maps MyCastle commands to operations) ---

    def _handle_command(self, data: dict):
        cmd_id  = data.get("id")
        name    = data.get("name")
        payload = data.get("payload", {})

        if not name:
            self._ack_command(cmd_id, "FAILED", "Missing 'name' in command")
            return

        # Entity commands: auto-dispatch + auto-ack, skip operations
        entity = self._entities.get(name)
        if entity is not None:
            log.info(f"Entity command: {name} (id={cmd_id})")
            try:
                entity.handle_command(payload)
                self._ack_command(cmd_id, "ACKNOWLEDGED")
            except Exception as e:
                log.error(f"Entity command failed: {name} — {e}")
                self._ack_command(cmd_id, "FAILED", str(e))
            return

        # Regular operations
        log.info(f"Executing command: {name} (id={cmd_id})")
        try:
            self.loop.run_until_complete(operations.execute(name, payload))
            self._ack_command(cmd_id, "ACKNOWLEDGED")
            log.info(f"Command completed: {name}")
        except Exception as e:
            log.error(f"Command failed: {name} — {e}")
            self._ack_command(cmd_id, "FAILED", str(e))

    def _ack_command(self, cmd_id: str, status: str, reason: str | None = None):
        packet: dict = {"id": cmd_id, "status": status}
        if reason:
            packet["reason"] = reason
        self.client.publish(config.TOPICS["COMMAND_ACK"], json.dumps(packet), qos=1)

    # --- Prośba o dopisanie do listy urządzeń użytkownika ---

    def _send_register_request(self):
        """Prosi o dodanie do Electronics → Devices.

        Wysyłane przy każdym połączeniu — backend trzyma jedno zgłoszenie na
        urządzenie, więc powtórki tylko odświeżają wpis. Samo zgłoszenie niczego
        nie tworzy: dopiero użytkownik akceptuje je w panelu.
        """
        packet = {
            "label": config.MQTT_DEVICE,
            "kind": "desktop",
            "version": getattr(config, "CLIENT_VERSION", None) or "client.py",
        }
        sn = os.getenv("MINIS_DEVICE_SN")
        if sn:
            packet["sn"] = sn
        self.client.publish(config.TOPICS["REGISTER_REQUEST"], json.dumps(packet), qos=1)
        log.info("Register request sent (czeka na akceptację w Electronics → Devices)")

    # --- Hello (state announcement on connect) ---

    def _send_hello(self):
        uptime = int(time.time() - self._start_time)
        extensions = list(config.EXTENSIONS)
        if self.smart_display_ext is not None:
            ext_type = getattr(self.smart_display_ext, "extension_type", "smart-display")
            extensions.append({"type": ext_type, "enabled": True})
        packet: dict = {"uptime": uptime, "extensions": extensions}
        if self._entities:
            packet["entities"] = [e.to_dict() for e in self._entities.values()]
        self.client.publish(config.TOPICS["HELLO"], json.dumps(packet), qos=1)
        log.info(
            f"Hello sent (extensions={[e['type'] for e in extensions]}"
            f" entities={list(self._entities.keys())})"
        )

    # --- Heartbeat ---

    def _send_heartbeat(self):
        if not self.running and self._heartbeat_timer is not None:
            return
        uptime = int(time.time() - self._start_time)
        packet = {"uptime": uptime}
        self.client.publish(config.TOPICS["HEARTBEAT"], json.dumps(packet), qos=1)
        self._presence.send_heartbeat(self.client)
        log.debug(f"Heartbeat sent (uptime={uptime}s)")
        self._heartbeat_timer = threading.Timer(
            config.HEARTBEAT_INTERVAL, self._send_heartbeat
        )
        self._heartbeat_timer.daemon = True
        self._heartbeat_timer.start()

    # --- Telemetry timer ---

    def _schedule_telemetry(self):
        if not self.running:
            return
        self._telemetry_timer = threading.Timer(
            config.TELEMETRY_INTERVAL, self._telemetry_tick
        )
        self._telemetry_timer.daemon = True
        self._telemetry_timer.start()

    def _telemetry_tick(self):
        if not self.running:
            return
        try:
            self._publish_system_telemetry()
        except Exception as e:
            log.warning(f"Telemetry tick error: {e}")
        self._schedule_telemetry()

    def _publish_system_telemetry(self):
        """Read system metrics and publish them. Called periodically by the timer."""
        cpu = psutil.cpu_percent(interval=0.5)
        ram = psutil.virtual_memory().percent
        self.send_telemetry([
            ("cpu",      cpu,        "%"),
            ("ram",      ram,        "%"),
            ("cpu_high", cpu >= 80),
        ])

    # --- Lifecycle ---

    def start(self):
        operations.load_all()

        if config.MQTT_TRANSPORT == "websockets":
            self.client.ws_set_options(path=config.MQTT_WS_PATH)

        log.info(
            f"Connecting to {config.MQTT_TRANSPORT}://"
            f"{config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT}..."
        )
        self.client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT)

        self.running = True
        self.client.loop_start()

        log.info("Client Agent is running. Press Ctrl+C to stop.")
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()

    def stop(self):
        if not self.running and not self._heartbeat_timer:
            return   # already stopped
        log.info("Shutting down...")
        self.running = False
        if self._heartbeat_timer:
            self._heartbeat_timer.cancel()
            self._heartbeat_timer = None
        if self._telemetry_timer:
            self._telemetry_timer.cancel()
            self._telemetry_timer = None
        self._presence.stop()
        self.client.loop_stop()
        self.client.disconnect()
        try:
            self.loop.close()
        except Exception:
            pass
        log.info("Client Agent stopped.")


def _setup_example_entities(agent: ClientAgent) -> None:
    """Register example IotEntities on the agent.

    Read-only sensors (cpu, ram) are reported via the built-in telemetry
    timer. Writable entities have callbacks that execute platform commands.
    """
    import subprocess
    import platform

    from entities import (
        SensorEntity, BinarySensorEntity,
        SwitchEntity, NumberEntity, ButtonEntity, SelectEntity,
    )

    # ── Read-only ─────────────────────────────────────────────────────────────
    # Values sent automatically by _publish_system_telemetry() every
    # TELEMETRY_INTERVAL seconds. Entity declarations tell MyCastle what
    # unit and device class to use for the sparkline / history views.

    agent.add_entity(SensorEntity("cpu", "CPU Usage", unit="%"))
    agent.add_entity(SensorEntity("ram", "RAM Usage", unit="%"))
    agent.add_entity(BinarySensorEntity(
        "cpu_high", "CPU High Load",
        on_label="High", off_label="Normal",
    ))

    # ── Writable ──────────────────────────────────────────────────────────────

    def on_lock_screen():
        if platform.system() == "Windows":
            import ctypes
            ctypes.windll.user32.LockWorkStation()
        else:
            subprocess.run(["loginctl", "lock-session"], check=False)

    def on_mute(state: bool):
        if platform.system() == "Windows":
            # Toggle system mute via PowerShell (no external tools needed)
            ps = (
                "$obj = New-Object -ComObject WScript.Shell;"
                "$obj.SendKeys([char]173)"  # VK_VOLUME_MUTE
            )
            subprocess.run(["powershell", "-Command", ps], check=False)
        log.info(f"Mute toggled: {state}")

    def on_volume(value: float):
        vol = max(0, min(100, int(value)))
        if platform.system() == "Windows":
            ps = (
                f"$wsh = New-Object -ComObject WScript.Shell;"
                f"1..50 | ForEach-Object {{ $wsh.SendKeys([char]174) }};"  # mute all the way down
                f"1..{vol // 2} | ForEach-Object {{ $wsh.SendKeys([char]175) }}"  # raise to target
            )
            subprocess.run(["powershell", "-Command", ps], check=False)
        log.info(f"Volume set to {vol}%")

    def on_power_plan(value: str):
        plans = {
            "balanced":    "381b4222-f694-41f0-9685-ff5bb260df2e",
            "performance": "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c",
            "power_saver": "a1841308-3541-4fab-bc81-f71556f20b4a",
        }
        guid = plans.get(value)
        if guid and platform.system() == "Windows":
            subprocess.run(["powercfg", "/setactive", guid], check=False)
        log.info(f"Power plan set to {value}")

    agent.add_entity(ButtonEntity(
        "lock_screen", "Lock Screen",
        callback=on_lock_screen,
        device_class="restart",
    ))
    agent.add_entity(SwitchEntity(
        "mute", "Mute Audio",
        callback=on_mute,
    ))
    agent.add_entity(NumberEntity(
        "volume", "Volume",
        min_val=0, max_val=100, step=5,
        unit="%",
        callback=on_volume,
    ))
    agent.add_entity(SelectEntity(
        "power_plan", "Power Plan",
        options=["balanced", "performance", "power_saver"],
        callback=on_power_plan,
    ))


def main():
    args = sys.argv[1:]
    app_mode = next((a for a in args if a.startswith("app:")), None)

    display = None
    if app_mode == "app:smart-display":
        from apps.smart_display import SmartDisplay
        display = SmartDisplay()
    elif app_mode == "app:watchtower":
        from apps.watchtower import Watchtower
        display = Watchtower()

    agent = ClientAgent(display=display)
    _setup_example_entities(agent)

    def signal_handler(sig, frame):
        agent.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    if display is not None:
        # pygame requires the main thread — run agent in background
        agent_thread = threading.Thread(target=agent.start, daemon=True)
        agent_thread.start()
        display.run()          # blocks until window is closed
        agent.stop()
    else:
        agent.start()


if __name__ == "__main__":
    main()
