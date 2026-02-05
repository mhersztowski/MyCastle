"""MyCastle Desktop Agent - MQTT-connected system automation agent."""

import asyncio
import json
import logging
import signal
import sys
import time
import uuid

import paho.mqtt.client as mqtt

import config
import operations

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("agent")


class DesktopAgent:
    def __init__(self):
        self.client = mqtt.Client(
            client_id=config.MQTT_CLIENT_ID,
            transport="websockets",
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        )
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self.running = False
        self.loop = asyncio.new_event_loop()

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            log.info(f"Connected to MQTT broker at {config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT}")
            client.subscribe(config.TOPICS["REQUEST"], qos=1)
            self._publish_status("online")
        else:
            log.error(f"Connection failed with code: {reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        if reason_code != 0:
            log.warning(f"Unexpected disconnect (code: {reason_code}), reconnecting...")

    def _on_message(self, client, userdata, msg):
        if msg.topic != config.TOPICS["REQUEST"]:
            return

        try:
            data = json.loads(msg.payload.decode())
            request_id = data.get("id")
            payload = data.get("payload", {})
            action = payload.get("action")
            params = payload.get("params", {})

            if not action:
                self._publish_error(request_id, "Missing 'action' in payload")
                return

            log.info(f"Executing: {action} (id: {request_id[:8]}...)")

            # Run operation (supports both sync and async)
            result = self.loop.run_until_complete(operations.execute(action, params))

            self._publish_response(request_id, result)
            log.info(f"Completed: {action}")

        except json.JSONDecodeError:
            log.error("Received invalid JSON")
        except Exception as e:
            log.error(f"Operation failed: {e}")
            request_id = data.get("id") if "data" in dir() else None
            if request_id:
                self._publish_error(request_id, str(e))

    def _publish_response(self, request_id: str, data: dict):
        packet = {
            "type": "response",
            "id": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "payload": {
                "requestId": request_id,
                "data": data,
            },
        }
        self.client.publish(config.TOPICS["RESPONSE"], json.dumps(packet), qos=1)

    def _publish_error(self, request_id: str, message: str):
        packet = {
            "type": "error",
            "id": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "payload": {
                "requestId": request_id,
                "message": message,
            },
        }
        self.client.publish(config.TOPICS["RESPONSE"], json.dumps(packet), qos=1)

    def _publish_status(self, status: str):
        packet = {
            "type": "status",
            "id": str(uuid.uuid4()),
            "timestamp": int(time.time() * 1000),
            "payload": {
                "status": status,
                "operations": operations.list_operations(),
                "clientId": config.MQTT_CLIENT_ID,
            },
        }
        self.client.publish(config.TOPICS["STATUS"], json.dumps(packet), qos=1, retain=True)
        log.info(f"Published status: {status} ({len(operations.list_operations())} operations available)")

    def start(self):
        operations.load_all()

        log.info(f"Connecting to ws://{config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT}...")
        self.client.ws_set_options(path="/")
        self.client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT)

        self.running = True
        self.client.loop_start()

        log.info("Desktop Agent is running. Press Ctrl+C to stop.")

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()

    def stop(self):
        log.info("Shutting down...")
        self.running = False
        self._publish_status("offline")
        time.sleep(0.5)  # Let the offline status message be sent
        self.client.loop_stop()
        self.client.disconnect()
        self.loop.close()
        log.info("Desktop Agent stopped.")


def main():
    agent = DesktopAgent()

    def signal_handler(sig, frame):
        agent.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    agent.start()


if __name__ == "__main__":
    main()
