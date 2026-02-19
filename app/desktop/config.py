import os
from dotenv import load_dotenv

load_dotenv()

MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1893"))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", f"mycastle_desktop_{os.getpid()}")

TOPICS = {
    "REQUEST": "mycastle/desktop/request",
    "RESPONSE": "mycastle/desktop/response",
    "STATUS": "mycastle/desktop/status",
}

# Shell command execution limits
SHELL_COMMAND_TIMEOUT = int(os.getenv("SHELL_COMMAND_TIMEOUT", "30"))
SHELL_MAX_OUTPUT_SIZE = int(os.getenv("SHELL_MAX_OUTPUT_SIZE", "65536"))
