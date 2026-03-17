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
    "HELLO":           f"{TOPIC_PREFIX}/hello",
    "HEARTBEAT":       f"{TOPIC_PREFIX}/heartbeat",
    "COMMAND_ACK":     f"{TOPIC_PREFIX}/command/ack",
    "EXT_VFS_RES":     f"{TOPIC_PREFIX}/ext/vfs/res",
    "EXT_VKBD_RES":    f"{TOPIC_PREFIX}/ext/vkbd/res",
    "EXT_VMOUSE_RES":  f"{TOPIC_PREFIX}/ext/vmouse/res",
    # server → device
    "COMMAND":         f"{TOPIC_PREFIX}/command",
    "EXT_VFS_REQ":     f"{TOPIC_PREFIX}/ext/vfs/req",
    "EXT_VKBD_REQ":    f"{TOPIC_PREFIX}/ext/vkbd/req",
    "EXT_VMOUSE_REQ":  f"{TOPIC_PREFIX}/ext/vmouse/req",
}

# --- Extensions advertised in hello ---
EXTENSIONS = [
    {"type": "vfs",    "enabled": True},
    {"type": "vkbd",   "enabled": True},
    {"type": "vmouse", "enabled": True},
]

# --- Heartbeat ---
HEARTBEAT_INTERVAL = int(os.getenv("HEARTBEAT_INTERVAL", "30"))   # seconds

# --- VFS extension ---
DATA_DIR = os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

# --- Virtual input extensions ---
# Set to "1" to log actions without executing them (useful when client runs on the same machine as the browser)
VIRTUAL_INPUT_DRY_RUN = os.getenv("VIRTUAL_INPUT_DRY_RUN", "0") == "1"

# --- Shell command execution limits ---
SHELL_COMMAND_TIMEOUT = min(int(os.getenv("SHELL_COMMAND_TIMEOUT", "30")), 120)
SHELL_MAX_OUTPUT_SIZE = int(os.getenv("SHELL_MAX_OUTPUT_SIZE", "65536"))
