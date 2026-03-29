"""
entities — IotEntity helpers for the MyCastle desktop client

Mirrors the TypeScript IotEntity types from
packages/core/src/models/IotModels.ts and the MicroPython
minis_entities.py in libs/uMinisLib.

Entities are registered via ClientAgent.add_entity() and announced in
the hello message so MyCastle renders the correct UI controls.

Writable entity types (Switch, Number, Button, Select) handle incoming
commands whose name matches the entity id and auto-acknowledge them.

Read-only entity types (Sensor, BinarySensor) are metadata declarations;
their values must be published via ClientAgent.send_telemetry() using the
entity id as the metric key.
"""

from __future__ import annotations


class IotEntity:
    """Base class — not used directly."""

    def __init__(
        self,
        entity_id: str,
        entity_type: str,
        name: str,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        self.id           = entity_id
        self.type         = entity_type
        self.name         = name
        self.icon         = icon
        self.device_class = device_class

    def to_dict(self) -> dict:
        d: dict = {"id": self.id, "type": self.type, "name": self.name}
        if self.icon:
            d["icon"] = self.icon
        if self.device_class:
            d["deviceClass"] = self.device_class
        return d

    def handle_command(self, payload: dict) -> None:
        """Called by ClientAgent when a command matching this entity id arrives."""
        pass


# ── Read-only entities ────────────────────────────────────────────────────────

class SensorEntity(IotEntity):
    """
    Read-only numeric sensor. Report value via ClientAgent.send_telemetry().

    :param entity_id:    Unique id — must match the telemetry metric key.
    :param name:         Human-readable label shown in MyCastle.
    :param unit:         Unit string, e.g. ``'%'``, ``'°C'``, ``'MB'``.
    :param icon:         Optional icon name.
    :param device_class: Optional HA-style class, e.g. ``'power_factor'``.
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        unit: str = "",
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "sensor", name, icon, device_class)
        self.unit = unit

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["unit"] = self.unit
        return d


class BinarySensorEntity(IotEntity):
    """
    Read-only boolean sensor. Report value via ClientAgent.send_telemetry().

    :param entity_id:    Unique id — must match the telemetry metric key.
    :param name:         Human-readable label.
    :param on_label:     Text shown when ``True``.
    :param off_label:    Text shown when ``False``.
    :param icon:         Optional icon name.
    :param device_class: Optional HA-style class, e.g. ``'motion'``.
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        on_label: str | None = None,
        off_label: str | None = None,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "binary_sensor", name, icon, device_class)
        self.on_label  = on_label
        self.off_label = off_label

    def to_dict(self) -> dict:
        d = super().to_dict()
        if self.on_label:
            d["onLabel"] = self.on_label
        if self.off_label:
            d["offLabel"] = self.off_label
        return d


# ── Writable entities ─────────────────────────────────────────────────────────

class SwitchEntity(IotEntity):
    """
    Writable boolean toggle.

    Command payload: ``{"state": true | false}``
    Callback signature: ``callback(state: bool) -> None``
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        callback: "Callable[[bool], None] | None" = None,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "switch", name, icon, device_class)
        self._cb = callback

    def handle_command(self, payload: dict) -> None:
        if self._cb is not None and "state" in payload:
            self._cb(bool(payload["state"]))


class NumberEntity(IotEntity):
    """
    Writable numeric value with min/max/step constraints.

    Command payload: ``{"value": <number>}``
    Callback signature: ``callback(value: float) -> None``
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        min_val: float,
        max_val: float,
        step: float,
        unit: str | None = None,
        callback: "Callable[[float], None] | None" = None,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "number", name, icon, device_class)
        self.min  = min_val
        self.max  = max_val
        self.step = step
        self.unit = unit
        self._cb  = callback

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["min"]  = self.min
        d["max"]  = self.max
        d["step"] = self.step
        if self.unit is not None:
            d["unit"] = self.unit
        return d

    def handle_command(self, payload: dict) -> None:
        if self._cb is not None and "value" in payload:
            self._cb(float(payload["value"]))


class ButtonEntity(IotEntity):
    """
    Writable momentary button.

    Command payload: ``{}`` (empty)
    Callback signature: ``callback() -> None``
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        callback: "Callable[[], None] | None" = None,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "button", name, icon, device_class)
        self._cb = callback

    def handle_command(self, payload: dict) -> None:
        if self._cb is not None:
            self._cb()


class SelectEntity(IotEntity):
    """
    Writable enum selector.

    Command payload: ``{"value": "<option>"}``
    Callback signature: ``callback(value: str) -> None``
    Unknown option values are silently ignored.
    """

    def __init__(
        self,
        entity_id: str,
        name: str,
        options: list[str],
        callback: "Callable[[str], None] | None" = None,
        icon: str | None = None,
        device_class: str | None = None,
    ) -> None:
        super().__init__(entity_id, "select", name, icon, device_class)
        self.options = list(options)
        self._cb     = callback

    def to_dict(self) -> dict:
        d = super().to_dict()
        d["options"] = self.options
        return d

    def handle_command(self, payload: dict) -> None:
        if self._cb is None:
            return
        val = payload.get("value") or payload.get("option", "")
        if val and val in self.options:
            self._cb(val)
