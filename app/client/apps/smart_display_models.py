"""Python mirror of packages/core/src/models/SmartDisplayModel.ts."""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SmartDisplayView:
    id: str
    type: str                    # 'clock' | 'text' | 'metric'
    label: Optional[str] = None
    # type=text
    text: Optional[str] = None
    subtext: Optional[str] = None
    # type=metric
    metricKey: Optional[str] = None
    metricUnit: Optional[str] = None
    metricDevice: Optional[str] = None  # device to fetch telemetry from
    imagePath: Optional[str] = None     # type=image: path relative to data root
    albumShareUrl: Optional[str] = None  # type=random-image: Immich shared album URL
    ttsDescription: bool = False          # type=random-image: speak description via TTS
    weatherLat: Optional[float] = None   # type=weather: latitude
    weatherLon: Optional[float] = None   # type=weather: longitude
    weatherLocationName: Optional[str] = None  # type=weather: display name

    @staticmethod
    def from_dict(d: dict) -> 'SmartDisplayView':
        return SmartDisplayView(
            id=d.get('id', ''),
            type=d.get('type', 'clock'),
            label=d.get('label') or None,
            text=d.get('text') or None,
            subtext=d.get('subtext') or None,
            metricKey=d.get('metricKey') or None,
            metricUnit=d.get('metricUnit') or None,
            metricDevice=d.get('metricDevice') or None,
            imagePath=d.get('imagePath') or None,
            albumShareUrl=d.get('albumShareUrl') or None,
            ttsDescription=bool(d.get('ttsDescription', False)),
            weatherLat=float(d['weatherLat']) if d.get('weatherLat') is not None else None,
            weatherLon=float(d['weatherLon']) if d.get('weatherLon') is not None else None,
            weatherLocationName=d.get('weatherLocationName') or None,
        )


@dataclass
class SmartDisplayConfig:
    cycleDurationMs: int = 900_000          # 15 min default
    views: List[SmartDisplayView] = field(default_factory=list)

    @staticmethod
    def from_dict(d: dict) -> 'SmartDisplayConfig':
        return SmartDisplayConfig(
            cycleDurationMs=int(d.get('cycleDurationMs', 900_000)),
            views=[SmartDisplayView.from_dict(v) for v in d.get('views', [])],
        )
