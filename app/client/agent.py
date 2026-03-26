"""MyCastle Client Agent — IoT device client with VFS extension."""

import asyncio
import json
import logging
import signal
import sys
import threading
import time

import paho.mqtt.client as mqtt

import config
import operations
from extensions.vfs import VfsExtension
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

        if display is not None:
            display.set_publish_fn(
                lambda payload: self.client.publish(
                    config.TOPICS["EXT_SMART_DISPLAY_RES"], payload, qos=1
                )
            )
        self.smart_display_ext = display

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
            if self.smart_display_ext is not None:
                client.subscribe(config.TOPICS["EXT_SMART_DISPLAY_REQ"], qos=1)
            log.info(f"Subscribed | prefix={config.TOPIC_PREFIX} | vfs root={config.DATA_DIR}")
            self._send_hello()
            self._send_heartbeat()
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
        elif topic == config.TOPICS["EXT_SMART_DISPLAY_REQ"]:
            if self.smart_display_ext is not None:
                self.smart_display_ext.handle_request(data)

    # --- Command handling (maps MyCastle commands to operations) ---

    def _handle_command(self, data: dict):
        cmd_id = data.get("id")
        name = data.get("name")
        payload = data.get("payload", {})

        if not name:
            self._ack_command(cmd_id, "FAILED", "Missing 'name' in command")
            return

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

    # --- Hello (state announcement on connect) ---

    def _send_hello(self):
        uptime = int(time.time() - self._start_time)
        extensions = list(config.EXTENSIONS)
        if self.smart_display_ext is not None:
            extensions.append({"type": "smart-display", "enabled": True})
        packet = {"uptime": uptime, "extensions": extensions}
        self.client.publish(config.TOPICS["HELLO"], json.dumps(packet), qos=1)
        log.info(f"Hello sent (extensions={[e['type'] for e in extensions]})")

    # --- Heartbeat ---

    def _send_heartbeat(self):
        if not self.running and self._heartbeat_timer is not None:
            return
        uptime = int(time.time() - self._start_time)
        packet = {"uptime": uptime}
        self.client.publish(config.TOPICS["HEARTBEAT"], json.dumps(packet), qos=1)
        log.debug(f"Heartbeat sent (uptime={uptime}s)")
        self._heartbeat_timer = threading.Timer(
            config.HEARTBEAT_INTERVAL, self._send_heartbeat
        )
        self._heartbeat_timer.daemon = True
        self._heartbeat_timer.start()

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
        self.client.loop_stop()
        self.client.disconnect()
        try:
            self.loop.close()
        except Exception:
            pass
        log.info("Client Agent stopped.")


def main():
    args = sys.argv[1:]
    app_mode = next((a for a in args if a.startswith("app:")), None)

    display = None
    if app_mode == "app:smart-display":
        from apps.smart_display import SmartDisplay
        display = SmartDisplay()

    agent = ClientAgent(display=display)

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
