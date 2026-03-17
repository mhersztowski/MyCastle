import os
from dotenv import load_dotenv

load_dotenv()

# --- MQTT broker ---
MQTT_BROKER_HOST = os.getenv("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", "1884"))     # plain TCP
MQTT_TRANSPORT   = os.getenv("MQTT_TRANSPORT", "tcp")             # "tcp" | "websockets"
MQTT_WS_PATH     = os.getenv("MQTT_WS_PATH", "/mqtt")            # used only when transport=websockets

# --- IoT device identity ---
MQTT_USER   = os.getenv("MQTT_USER",   "admin")
MQTT_DEVICE = os.getenv("MQTT_DEVICE", "desktop")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", f"minis_{MQTT_USER}_{MQTT_DEVICE}_{os.getpid()}")

TOPIC_PREFIX = f"minis/{MQTT_USER}/{MQTT_DEVICE}"

TOPICS = {
    # device → server
    "HEARTBEAT":   f"{TOPIC_PREFIX}/heartbeat",
    "COMMAND_ACK": f"{TOPIC_PREFIX}/command/ack",
    "EXT_VFS_RES": f"{TOPIC_PREFIX}/ext/vfs/res",
    # server → device
    "COMMAND":     f"{TOPIC_PREFIX}/command",
    "EXT_VFS_REQ": f"{TOPIC_PREFIX}/ext/vfs/req",
}

# --- Heartbeat ---
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "30"))   # seconds

# --- VFS extension ---
DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

# --- Shell command execution limits ---
SHELL_COMMAND_TIMEOUT = min(int(os.getenv("SHELL_COMMAND_TIMEOUT", "30")), 120)
SHELL_MAX_OUTPUT_SIZE = int(os.getenv("SHELL_MAX_OUTPUT_SIZE", "65536"))
