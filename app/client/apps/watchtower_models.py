"""Watchtower data models — Python mirror of the virtual-desktop-display protocol.

A `VirtualDesktopDisplay` is the unit of UI metadata that gets rendered on
the always-on-top overlay: a collection of `Annotation`s (boxes, labels,
arrows, tooltips) describing how a real desktop application is laid out
so a guide / pilot can navigate the GUI.

The full `WatchtowerConfig` holds many displays — one per target application
or screen — plus the id of the currently active one.

Serialization uses snake_case in Python and camelCase on the wire so the
backend (TypeScript) can consume the same JSON without translation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

# Annotation kinds rendered by OverlayWindow.
# - box      : outlined rectangle with optional label
# - label    : standalone text caption (no border)
# - arrow    : line from rect.(x,y) to rect.(x+w, y+h) with an arrowhead
# - tooltip  : box + text body, used for richer multi-line descriptions
AnnotationType = str  # one of: 'box' | 'label' | 'arrow' | 'tooltip'


@dataclass
class Rect:
    x: float = 0.0
    y: float = 0.0
    w: float = 0.0
    h: float = 0.0

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Rect":
        return cls(
            x=float(d.get("x", 0.0)),
            y=float(d.get("y", 0.0)),
            w=float(d.get("w", 0.0)),
            h=float(d.get("h", 0.0)),
        )

    def to_dict(self) -> dict[str, float]:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}


@dataclass
class AnnotationStyle:
    color: str = "#4fc3f7"            # border + default text colour
    bg_color: Optional[str] = None    # fill (8-digit hex incl. alpha is fine)
    text_color: Optional[str] = None  # overrides color for the label
    font_size: int = 12
    border_width: int = 2
    label_position: str = "top"       # 'top' | 'bottom' | 'inside'

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "AnnotationStyle":
        return cls(
            color=d.get("color", "#4fc3f7"),
            bg_color=d.get("bgColor") or d.get("bg_color"),
            text_color=d.get("textColor") or d.get("text_color"),
            font_size=int(d.get("fontSize", d.get("font_size", 12))),
            border_width=int(d.get("borderWidth", d.get("border_width", 2))),
            label_position=d.get("labelPosition", d.get("label_position", "top")),
        )

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "color": self.color,
            "fontSize": self.font_size,
            "borderWidth": self.border_width,
            "labelPosition": self.label_position,
        }
        if self.bg_color is not None:
            out["bgColor"] = self.bg_color
        if self.text_color is not None:
            out["textColor"] = self.text_color
        return out


@dataclass
class Annotation:
    id: str
    type: AnnotationType = "box"
    rect: Rect = field(default_factory=Rect)
    label: str = ""
    description: str = ""
    style: AnnotationStyle = field(default_factory=AnnotationStyle)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Annotation":
        return cls(
            id=str(d.get("id", "")),
            type=str(d.get("type", "box")),
            rect=Rect.from_dict(d.get("rect", {})),
            label=str(d.get("label", "")),
            description=str(d.get("description", "")),
            style=AnnotationStyle.from_dict(d.get("style", {})),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "rect": self.rect.to_dict(),
            "label": self.label,
            "description": self.description,
            "style": self.style.to_dict(),
        }


@dataclass
class VirtualDesktopDisplay:
    """A single annotated desktop layout — one per target app or screen."""

    id: str
    name: str = ""
    screen_width: int = 1920
    screen_height: int = 1080
    annotations: list[Annotation] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "VirtualDesktopDisplay":
        return cls(
            id=str(d.get("id", "")),
            name=str(d.get("name", "")),
            screen_width=int(d.get("screenWidth", d.get("screen_width", 1920))),
            screen_height=int(d.get("screenHeight", d.get("screen_height", 1080))),
            annotations=[Annotation.from_dict(a) for a in d.get("annotations", [])],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "screenWidth": self.screen_width,
            "screenHeight": self.screen_height,
            "annotations": [a.to_dict() for a in self.annotations],
        }


@dataclass
class WatchtowerConfig:
    """Top-level config exchanged over MQTT and persisted to disk."""

    type: str = "virtual-desktop-display-config"
    active_display_id: Optional[str] = None
    displays: list[VirtualDesktopDisplay] = field(default_factory=list)

    def active_display(self) -> Optional[VirtualDesktopDisplay]:
        if not self.active_display_id:
            return self.displays[0] if self.displays else None
        return next((d for d in self.displays if d.id == self.active_display_id), None)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "WatchtowerConfig":
        return cls(
            type=str(d.get("type", "virtual-desktop-display-config")),
            active_display_id=d.get("activeDisplayId") or d.get("active_display_id"),
            displays=[VirtualDesktopDisplay.from_dict(x) for x in d.get("displays", [])],
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "activeDisplayId": self.active_display_id,
            "displays": [d.to_dict() for d in self.displays],
        }


def default_config() -> WatchtowerConfig:
    """Built-in example so a fresh install renders something on first launch."""
    sample = VirtualDesktopDisplay(
        id="sample",
        name="Sample Layout",
        screen_width=1920,
        screen_height=1080,
        annotations=[
            Annotation(
                id="sample-1",
                type="box",
                rect=Rect(x=40, y=40, w=320, h=80),
                label="Top bar",
                description="Global app actions live here.",
                style=AnnotationStyle(color="#4fc3f7", bg_color="#4fc3f733"),
            ),
        ],
    )
    return WatchtowerConfig(active_display_id="sample", displays=[sample])
