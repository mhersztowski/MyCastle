"""Smart Display — pygame clock window + smart-display IoT extension handler.

Extension protocol (relative to device base `minis/{user}/{device}`):
  Request  topic: ext/smart-display/req  (server → device)
  Response topic: ext/smart-display/res  (device → server)

Supported extension ops:
  update  { "data": { key: value, ... } }  — merge data into display state
  clear                                     — remove all server-pushed data fields

View cycle:
  Config is fetched from the REST API every SMART_DISPLAY_CONFIG_RELOAD_INTERVAL seconds
  (default 1 h) and immediately on startup or when 'r' is pressed.
  Views cycle at the configured cycleDurationMs interval.
  View types: clock | text | metric
"""

import io
import json
import logging
import os
import tempfile
import threading
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime

import pygame
from PIL import Image, ImageOps

import config
from apps.smart_display_models import SmartDisplayConfig, SmartDisplayView

try:
    import anthropic as _anthropic_sdk
except ImportError:
    _anthropic_sdk = None  # type: ignore

try:
    import pyttsx3 as _pyttsx3
except ImportError:
    _pyttsx3 = None  # type: ignore

log = logging.getLogger("smart_display")


def _check_espeak() -> str | None:
    """Return the espeak binary name if available, else None."""
    import subprocess
    for cmd in ('espeak-ng', 'espeak'):
        try:
            subprocess.run([cmd, '--version'], capture_output=True, timeout=5)
            return cmd
        except (FileNotFoundError, Exception):
            pass
    return None

# --- Layout constants ---
WINDOW_W, WINDOW_H = 800, 480
FPS = 10
WEATHER_REFRESH_INTERVAL = 900   # 15 min

# Colors
BG         = ( 18,  18,  28)
TEXT_PRI   = (230, 230, 245)
TEXT_SEC   = (140, 140, 165)
TEXT_DATA  = (255, 220, 100)
TEXT_LABEL = (100, 160, 220)
DOT_ON     = ( 72, 199, 142)
DOT_OFF    = (200,  80,  80)
DOT_FETCH  = (200, 160,  50)

CLOCK_FONT_SIZE   = 120
DATE_FONT_SIZE    =  36
DATA_FONT_SIZE    =  52
SUBTEXT_FONT_SIZE =  28
LABEL_FONT_SIZE   =  22

# Keys removed by the clear op
_DATA_KEYS = ("text", "subtext")


def _load_contain_surface(data: bytes, w: int, h: int) -> pygame.Surface:
    """Load image bytes, apply EXIF orientation, scale to fit (w, h) with black letterbox bars."""
    pil_img = Image.open(io.BytesIO(data))
    pil_img = ImageOps.exif_transpose(pil_img)
    if pil_img.mode != 'RGB':
        pil_img = pil_img.convert('RGB')

    img_w, img_h = pil_img.size
    scale = min(w / img_w, h / img_h)
    new_w = round(img_w * scale)
    new_h = round(img_h * scale)
    pil_img = pil_img.resize((new_w, new_h), Image.LANCZOS)

    # Centre on black background
    canvas = Image.new('RGB', (w, h), (0, 0, 0))
    left = (w - new_w) // 2
    top  = (h - new_h) // 2
    canvas.paste(pil_img, (left, top))

    buf = io.BytesIO()
    canvas.save(buf, format='BMP')
    buf.seek(0)
    return pygame.image.load(buf, 'img.bmp').convert()


def _spoken_text(raw: str) -> str:
    """Optionally use Claude to make description spoken-friendly; falls back to raw text."""
    if not raw or not config.ANTHROPIC_API_KEY or _anthropic_sdk is None:
        return raw
    try:
        client = _anthropic_sdk.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=120,
            messages=[{
                'role': 'user',
                'content': (
                    'Rewrite the following photo description in one natural sentence '
                    'suitable for reading aloud. Keep the same language. '
                    f'Description: "{raw}"'
                ),
            }],
        )
        return msg.content[0].text.strip()
    except Exception as e:
        log.warning(f"Claude description rewrite failed: {e}")
        return raw


def _tts_to_wav(text: str) -> str | None:
    """Synthesize text to a temporary WAV file. Tries espeak then pyttsx3."""
    if not text:
        return None
    fd, path = tempfile.mkstemp(suffix='.wav', prefix='sd_tts_')
    os.close(fd)

    # --- espeak / espeak-ng (preferred on Linux / Raspberry Pi) ---
    import subprocess
    for cmd in (['espeak-ng', '-w', path, '-s', '140', '--', text],
                ['espeak',    '-w', path, '-s', '140', '--', text]):
        try:
            result = subprocess.run(cmd, timeout=20, capture_output=True)
            if result.returncode == 0 and os.path.getsize(path) > 44:
                log.info(f"TTS: {cmd[0]} wrote {os.path.getsize(path)} bytes → {path}")
                return path
            log.warning(f"TTS {cmd[0]} failed (rc={result.returncode}): {result.stderr.decode().strip()}")
        except FileNotFoundError:
            log.warning(f"TTS: {cmd[0]} not found")
        except Exception as e:
            log.warning(f"TTS {cmd[0]} error: {e}")

    # --- pyttsx3 fallback (Windows / macOS) ---
    if _pyttsx3 is not None:
        try:
            engine = _pyttsx3.init()
            engine.save_to_file(text, path)
            engine.runAndWait()
            engine.stop()
            if os.path.getsize(path) > 44:
                log.info(f"TTS: pyttsx3 wrote {os.path.getsize(path)} bytes → {path}")
                return path
            log.warning("TTS: pyttsx3 produced empty file")
        except Exception as e:
            log.warning(f"TTS pyttsx3 error: {e}")

    try:
        os.unlink(path)
    except OSError:
        pass
    return None


class SmartDisplay:
    """Pygame smart display that also implements the smart-display extension protocol."""

    def __init__(self):
        self._lock = threading.Lock()

        # MQTT state (updated by agent)
        self._connected: bool = False
        self._publish_fn = None

        # View cycle state
        self._cfg: SmartDisplayConfig = SmartDisplayConfig()
        self._view_idx: int = 0
        self._view_started_at: float = time.time()
        self._config_loaded_at: float = 0.0   # 0 → fetch immediately on start

        # Metric values cache: metricKey → display string
        self._metric_cache: dict[str, str] = {}

        # Image cache: imagePath → pygame.Surface (for type=image views)
        self._image_cache: dict[str, pygame.Surface] = {}

        # Random-image sliding window: current + one pre-fetched next (2 surfaces max per view)
        self._rnd_surf: dict[str, pygame.Surface | None] = {}   # currently shown
        self._rnd_next: dict[str, pygame.Surface | None] = {}   # pre-fetched, ready to swap in
        self._rnd_fetching: set[str] = set()                    # view_ids being fetched right now
        # TTS audio paths paired with images (may be None when no description / TTS unavailable)
        self._rnd_wav: dict[str, str | None] = {}               # WAV for current image
        self._rnd_next_wav: dict[str, str | None] = {}          # WAV for next image
        self._pending_audio: str | None = None                   # set by bg thread, played by main loop
        # When TTS was last played per view_id (for 1-hour cooldown)
        self._rnd_tts_played_at: dict[str, float] = {}

        # Weather view: one cached surface per view_id, refreshed every 15 min
        self._weather_surf: dict[str, pygame.Surface | None] = {}
        self._weather_fetching: set[str] = set()
        self._weather_last_fetch: dict[str, float] = {}

        # Fetching flags
        self._fetching_config: bool = False
        self._fetching_metric: bool = False
        self._fetching_images: set[str] = set()

    # --- Extension wiring (called by agent) ---

    def set_publish_fn(self, publish_fn):
        self._publish_fn = publish_fn

    def update(self, data: dict):
        """Called by agent on MQTT connect/disconnect to update connection status."""
        with self._lock:
            if 'connected' in data:
                self._connected = data['connected']

    # --- Extension protocol (called from agent / MQTT thread) ---

    def handle_request(self, payload: dict):
        req_id = payload.get("id")
        op     = payload.get("op")
        try:
            match op:
                case "update":
                    data = payload.get("data")
                    if not isinstance(data, dict):
                        raise ValueError("'data' must be an object")
                    # Server can push metric cache updates
                    with self._lock:
                        if 'metricValue' in data and 'metricKey' in data:
                            self._metric_cache[data['metricKey']] = str(data['metricValue'])
                case "clear":
                    with self._lock:
                        self._metric_cache.clear()
                case _:
                    raise ValueError(f"Unknown op: {op!r}")
            self._respond(req_id, True)
        except Exception as e:
            log.error(f"smart-display op={op!r} error: {e}")
            self._respond(req_id, False, str(e))

    # --- Config fetch (background thread) ---

    def fetch_config(self):
        """Trigger a non-blocking config fetch from the REST API."""
        with self._lock:
            if self._fetching_config:
                return
            self._fetching_config = True
        threading.Thread(target=self._do_fetch_config, daemon=True).start()

    def _do_fetch_config(self):
        url = (
            f"{config.API_BASE_URL}/api/users/{config.MQTT_USER}"
            f"/devices/{config.MQTT_DEVICE}/smart-display"
        )
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            new_cfg = SmartDisplayConfig.from_dict(data)
            with self._lock:
                self._cfg = new_cfg
                self._config_loaded_at = time.time()
                self._view_idx = 0
                self._view_started_at = time.time()
                self._metric_cache.clear()
            log.info(f"Config loaded: {len(new_cfg.views)} views, cycle={new_cfg.cycleDurationMs}ms")
            first_view = new_cfg.views[0] if new_cfg.views else None
            self._maybe_fetch_metric(first_view)
            self._maybe_load_image(first_view)
            self._maybe_fetch_next(first_view)
            for v in new_cfg.views:
                self._maybe_fetch_weather(v)
        except urllib.error.HTTPError as e:
            log.warning(f"Config fetch HTTP {e.code}: {url}")
        except Exception as e:
            log.warning(f"Config fetch failed: {e}")
        finally:
            with self._lock:
                self._fetching_config = False

    def _maybe_fetch_metric(self, view: SmartDisplayView | None):
        if view is None or view.type != 'metric' or not view.metricKey:
            return
        with self._lock:
            if self._fetching_metric:
                return
            self._fetching_metric = True
        threading.Thread(
            target=self._do_fetch_metric,
            args=(view.metricKey, view.metricUnit or '', view.metricDevice),
            daemon=True,
        ).start()

    def _do_fetch_metric(self, metric_key: str, unit: str, device: str | None):
        target_device = device or config.MQTT_DEVICE
        url = (
            f"{config.API_BASE_URL}/api/users/{config.MQTT_USER}"
            f"/devices/{target_device}/telemetry/latest"
        )
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                data = json.loads(resp.read().decode())
            metrics = data.get('metrics', [])
            match = next((m for m in metrics if m.get('key') == metric_key), None)
            if match is not None:
                value = match.get('value', '—')
                display = f"{value}{unit}" if unit else str(value)
                with self._lock:
                    self._metric_cache[metric_key] = display
                log.debug(f"Metric {metric_key}={display} (device={target_device})")
            else:
                with self._lock:
                    self._metric_cache.setdefault(metric_key, '—')
        except Exception as e:
            log.warning(f"Metric fetch {metric_key} failed: {e}")
            with self._lock:
                self._metric_cache.setdefault(metric_key, 'ERR')
        finally:
            with self._lock:
                self._fetching_metric = False

    def _maybe_load_image(self, view: SmartDisplayView | None):
        if view is None or view.type != 'image' or not view.imagePath:
            return
        with self._lock:
            if view.imagePath in self._image_cache or view.imagePath in self._fetching_images:
                return
            self._fetching_images.add(view.imagePath)
        threading.Thread(
            target=self._do_load_image,
            args=(view.imagePath,),
            daemon=True,
        ).start()

    def _do_load_image(self, image_path: str):
        url = f"{config.API_BASE_URL}/files/{image_path}"
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = resp.read()
            surf = _load_contain_surface(data, WINDOW_W, WINDOW_H)
            with self._lock:
                self._image_cache[image_path] = surf
            log.info(f"Image loaded: {image_path}")
        except Exception as e:
            log.warning(f"Image load failed ({image_path}): {e}")
        finally:
            with self._lock:
                self._fetching_images.discard(image_path)

    def _maybe_fetch_weather(self, view: SmartDisplayView | None):
        """Start a background fetch for a weather view if data is missing or stale."""
        if view is None or view.type != 'weather':
            return
        if view.weatherLat is None or view.weatherLon is None:
            return
        with self._lock:
            if view.id in self._weather_fetching:
                return
            last = self._weather_last_fetch.get(view.id, 0.0)
            if time.time() - last < WEATHER_REFRESH_INTERVAL and self._weather_surf.get(view.id) is not None:
                return
            self._weather_fetching.add(view.id)
        threading.Thread(
            target=self._do_fetch_weather,
            args=(view.id, view.weatherLat, view.weatherLon, view.weatherLocationName or ''),
            daemon=True,
        ).start()

    def _do_fetch_weather(self, view_id: str, lat: float, lon: float, location_name: str):
        qs = urllib.parse.urlencode({
            'lat': lat, 'lon': lon, 'w': WINDOW_W, 'h': WINDOW_H,
            'locationName': location_name,
        })
        url = f"{config.API_BASE_URL}/api/weather-image?{qs}"
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = resp.read()
            buf = io.BytesIO(data)
            surf = pygame.image.load(buf, 'weather.png').convert()
            with self._lock:
                self._weather_surf[view_id] = surf
                self._weather_last_fetch[view_id] = time.time()
            log.info(f"Weather image fetched for view {view_id} ({location_name})")
        except Exception as e:
            log.warning(f"Weather fetch failed ({view_id}): {e}")
        finally:
            with self._lock:
                self._weather_fetching.discard(view_id)

    def _maybe_fetch_next(self, view: SmartDisplayView | None):
        """Start fetching the next random image in background if not already fetching."""
        if view is None or view.type != 'random-image' or not view.albumShareUrl:
            return
        with self._lock:
            if view.id in self._rnd_fetching:
                return
            if self._rnd_next.get(view.id) is not None:
                return   # already have one ready
            self._rnd_fetching.add(view.id)
        threading.Thread(
            target=self._do_fetch_next,
            args=(view.id, view.albumShareUrl, view.ttsDescription),
            daemon=True,
        ).start()

    def _do_fetch_next(self, view_id: str, share_url: str, tts_enabled: bool = False):
        qs = urllib.parse.urlencode({
            'shareUrl': share_url,
            'w': WINDOW_W, 'h': WINDOW_H,
            '_t': int(time.time() * 1000),
        })
        url = f"{config.API_BASE_URL}/api/immich/album-image?{qs}"
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                raw_desc = resp.headers.get('X-Immich-Description', '')
                description = urllib.parse.unquote(raw_desc) if raw_desc else ''
                data = resp.read()
            surf = _load_contain_surface(data, WINDOW_W, WINDOW_H)
            # Generate TTS only once per hour per view
            wav_path = None
            if tts_enabled and description:
                with self._lock:
                    last_tts = self._rnd_tts_played_at.get(view_id, 0.0)
                    tts_due = (time.time() - last_tts) >= 3600
                if tts_due:
                    spoken = _spoken_text(description)
                    wav_path = _tts_to_wav(spoken)
                    if wav_path:
                        with self._lock:
                            self._rnd_tts_played_at[view_id] = time.time()
            with self._lock:
                if self._rnd_surf.get(view_id) is None:
                    self._rnd_surf[view_id] = surf
                    self._rnd_wav[view_id] = wav_path
                    self._pending_audio = wav_path
                else:
                    self._rnd_next[view_id] = surf
                    self._rnd_next_wav[view_id] = wav_path
            log.info(f"Fetched next image for view {view_id}" +
                     (f" (desc: {description[:60]})" if description else ""))
        except Exception as e:
            log.warning(f"Fetch next image failed ({view_id}): {e}")
        finally:
            with self._lock:
                self._rnd_fetching.discard(view_id)

    def _advance_random_image(self, view: SmartDisplayView | None):
        """Swap next→current (surface + WAV), delete old WAV, kick off next fetch."""
        if view is None or view.type != 'random-image':
            return
        old_wav = None
        with self._lock:
            nxt = self._rnd_next.pop(view.id, None)
            if nxt is not None:
                old_wav = self._rnd_wav.get(view.id)
                self._rnd_surf[view.id] = nxt
                nxt_wav = self._rnd_next_wav.pop(view.id, None)
                self._rnd_wav[view.id] = nxt_wav
                self._pending_audio = nxt_wav
        if old_wav:
            try:
                os.unlink(old_wav)
            except OSError:
                pass
        self._maybe_fetch_next(view)

    # --- Main loop (must be called from main thread) ---

    def run(self):
        pygame.init()

        # Initialise mixer explicitly so we get a clear error if audio is unavailable
        self._mixer_ok = False
        try:
            pygame.mixer.init()
            self._mixer_ok = True
            log.info("pygame.mixer initialised OK")
        except Exception as e:
            log.warning(f"pygame.mixer init failed — audio disabled: {e}")

        screen = pygame.display.set_mode((WINDOW_W, WINDOW_H))
        pygame.display.set_caption(f"MyCastle — {config.MQTT_DEVICE}")

        fonts = {
            'clock':   pygame.font.SysFont("monospace", CLOCK_FONT_SIZE,   bold=True),
            'date':    pygame.font.SysFont("monospace", DATE_FONT_SIZE),
            'data':    pygame.font.SysFont("monospace", DATA_FONT_SIZE,    bold=True),
            'subtext': pygame.font.SysFont("monospace", SUBTEXT_FONT_SIZE),
            'label':   pygame.font.SysFont("monospace", LABEL_FONT_SIZE),
        }

        tick = pygame.time.Clock()

        # Log TTS availability so the user can see if sound will work
        espeak_bin = _check_espeak()
        if espeak_bin:
            log.info(f"TTS: {espeak_bin} available")
        elif _pyttsx3 is not None:
            log.info("TTS: espeak not found, will use pyttsx3")
        else:
            log.warning("TTS: no TTS engine available (install espeak-ng: apt install espeak-ng)")

        self.fetch_config()   # immediate load on startup

        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    pygame.quit()
                    return
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_ESCAPE:
                        pygame.quit()
                        return
                    if event.key == pygame.K_r:
                        log.info("Manual config reload (r key)")
                        self.fetch_config()

            now = time.time()

            # --- Play pending TTS audio (set by background fetch thread) ---
            with self._lock:
                pending_audio = self._pending_audio
                self._pending_audio = None
            if pending_audio:
                if self._mixer_ok:
                    try:
                        pygame.mixer.music.load(pending_audio)
                        pygame.mixer.music.play()
                        log.info(f"Playing TTS audio: {pending_audio}")
                    except Exception as e:
                        log.warning(f"Audio play failed: {e}")
                else:
                    log.warning("Audio skipped — mixer not available")

            # --- Auto config reload every CONFIG_RELOAD_INTERVAL ---
            with self._lock:
                loaded_at = self._config_loaded_at
                fetching  = self._fetching_config
            if not fetching and now - loaded_at > config.SMART_DISPLAY_CONFIG_RELOAD_INTERVAL:
                self.fetch_config()

            # --- View cycling ---
            with self._lock:
                cfg         = self._cfg
                view_idx    = self._view_idx
                view_started = self._view_started_at
                fetching_cfg = self._fetching_config
                connected   = self._connected

            if cfg.views:
                elapsed_ms = (now - view_started) * 1000
                if elapsed_ms >= cfg.cycleDurationMs:
                    next_idx = (view_idx + 1) % len(cfg.views)
                    with self._lock:
                        self._view_idx       = next_idx
                        self._view_started_at = now
                    view_idx = next_idx
                    next_view = cfg.views[next_idx]
                    self._maybe_fetch_metric(next_view)
                    self._maybe_load_image(next_view)
                    self._advance_random_image(next_view)

            current_view = cfg.views[view_idx] if cfg.views else None

            # --- Render ---
            screen.fill(BG)
            self._render(screen, fonts, now, current_view, connected, fetching_cfg)
            pygame.display.flip()
            tick.tick(FPS)

    # --- Rendering ---

    def _render(self, screen, fonts, now: float, view: SmartDisplayView | None,
                connected: bool, fetching: bool):
        dt = datetime.fromtimestamp(now)
        v_type = view.type if view else 'clock'

        if v_type == 'clock':
            self._draw_clock(screen, fonts, dt, has_data=False)

        elif v_type == 'text':
            text    = view.text    if view else None
            subtext = view.subtext if view else None
            self._draw_clock(screen, fonts, dt, has_data=bool(text))
            if text:
                self._draw_data(screen, fonts, text, subtext)

        elif v_type == 'metric':
            key   = view.metricKey or ''
            unit  = view.metricUnit or ''
            label = view.label or key
            with self._lock:
                value = self._metric_cache.get(key, '…')
            self._draw_clock(screen, fonts, dt, has_data=True)
            self._draw_data(screen, fonts, f"{value}{unit}", label)

        elif v_type == 'image':
            img_path = view.imagePath or '' if view else ''
            with self._lock:
                surf = self._image_cache.get(img_path)
            if surf is not None:
                screen.blit(surf, (0, 0))
            else:
                self._draw_clock(screen, fonts, dt, has_data=False)

        elif v_type == 'random-image':
            with self._lock:
                surf = self._rnd_surf.get(view.id) if view else None
            if surf is not None:
                screen.blit(surf, (0, 0))
            else:
                self._draw_clock(screen, fonts, dt, has_data=False)
                if view:
                    self._maybe_fetch_next(view)

        elif v_type == 'weather':
            with self._lock:
                surf = self._weather_surf.get(view.id) if view else None
            if surf is not None:
                screen.blit(surf, (0, 0))
            else:
                self._draw_clock(screen, fonts, dt, has_data=False)
            if view:
                self._maybe_fetch_weather(view)

        self._draw_status(screen, fonts['label'], connected, fetching, view)

    def _draw_clock(self, screen, fonts, dt: datetime, has_data: bool):
        time_str  = dt.strftime("%H:%M:%S")
        date_str  = dt.strftime("%A, %d %B %Y")
        time_surf = fonts['clock'].render(time_str, True, TEXT_PRI)
        date_surf = fonts['date'].render(date_str, True, TEXT_SEC)

        cx = WINDOW_W // 2
        cy = WINDOW_H // 3 if has_data else WINDOW_H // 2 - 20

        screen.blit(time_surf, time_surf.get_rect(centerx=cx, centery=cy))
        screen.blit(date_surf, date_surf.get_rect(
            centerx=cx, top=cy + time_surf.get_height() // 2 + 12,
        ))

    def _draw_data(self, screen, fonts, text: str, subtext: str | None):
        cx     = WINDOW_W // 2
        data_y = WINDOW_H * 2 // 3

        text_surf = fonts['data'].render(str(text), True, TEXT_DATA)
        screen.blit(text_surf, text_surf.get_rect(centerx=cx, centery=data_y))

        if subtext:
            sub_surf = fonts['subtext'].render(str(subtext), True, TEXT_LABEL)
            screen.blit(sub_surf, sub_surf.get_rect(
                centerx=cx,
                top=data_y + text_surf.get_height() // 2 + 8,
            ))

    def _draw_status(self, screen, label_font, connected: bool, fetching: bool,
                     view: SmartDisplayView | None):
        dot_color = DOT_FETCH if fetching else (DOT_ON if connected else DOT_OFF)
        broker    = f"MQTT  {config.MQTT_BROKER_HOST}:{config.MQTT_BROKER_PORT}"

        margin = 16
        dot_r  = 7
        dot_x  = margin + dot_r
        dot_y  = WINDOW_H - margin - dot_r

        pygame.draw.circle(screen, dot_color, (dot_x, dot_y), dot_r)

        broker_surf = label_font.render(broker, True, TEXT_SEC)
        screen.blit(broker_surf, (dot_x + dot_r + 8, dot_y - broker_surf.get_height() // 2))

        # Right side: device name + view label
        right_parts = [config.MQTT_DEVICE]
        if view and view.label:
            right_parts.append(view.label)
        right_text  = "  ·  ".join(right_parts)
        right_surf  = label_font.render(right_text, True, TEXT_SEC)
        screen.blit(right_surf, right_surf.get_rect(right=WINDOW_W - margin, bottom=WINDOW_H - margin))

    # --- Private ---

    def _respond(self, req_id: str, ok: bool, error_msg: str | None = None):
        if self._publish_fn is None:
            return
        packet: dict = {"id": req_id, "ok": ok}
        if error_msg:
            packet["error"] = {"message": error_msg}
        self._publish_fn(json.dumps(packet))
