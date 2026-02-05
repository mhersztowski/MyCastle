import base64
import io
import logging
from operations import operation

log = logging.getLogger(__name__)

try:
    from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
    from comtypes import CLSCTX_ALL
    HAS_PYCAW = True
except ImportError:
    HAS_PYCAW = False
    log.warning("pycaw not available - volume operations disabled")


def _get_volume_interface():
    if not HAS_PYCAW:
        raise RuntimeError("pycaw is not installed - volume operations unavailable")
    devices = AudioUtilities.GetSpeakers()
    interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    return interface.QueryInterface(IAudioEndpointVolume)


@operation("screenshot")
def screenshot(params: dict) -> dict:
    from PIL import ImageGrab

    img = ImageGrab.grab()
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "image": b64,
        "width": img.width,
        "height": img.height,
        "format": "png",
    }


@operation("get_volume")
def get_volume(params: dict) -> dict:
    vol = _get_volume_interface()
    level = round(vol.GetMasterVolumeLevelScalar() * 100)
    muted = bool(vol.GetMute())
    return {"level": level, "muted": muted}


@operation("set_volume")
def set_volume(params: dict) -> dict:
    vol = _get_volume_interface()

    level = params.get("level")
    muted = params.get("muted")

    if level is not None:
        level = max(0, min(100, int(level)))
        vol.SetMasterVolumeLevelScalar(level / 100, None)

    if muted is not None:
        vol.SetMute(bool(muted), None)

    return {
        "level": round(vol.GetMasterVolumeLevelScalar() * 100),
        "muted": bool(vol.GetMute()),
    }
