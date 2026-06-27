"""Watchtower overlay window — transparent always-on-top canvas painted on
top of the desktop and every running application.

The window covers the primary screen, draws nothing where there is no
annotation, and forwards every mouse/keyboard event to whatever is below
it so the user can keep working with the app being annotated.
"""

from __future__ import annotations

import logging
from typing import Optional

from PySide6.QtCore import Qt, QRectF, QPointF, QLineF
from PySide6.QtGui import (
    QBrush, QColor, QFont, QFontMetricsF, QPainter, QPen, QPolygonF,
)
from PySide6.QtWidgets import QApplication, QWidget

from apps.watchtower_models import Annotation, VirtualDesktopDisplay

log = logging.getLogger("watchtower.overlay")


class OverlayWindow(QWidget):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
            | Qt.WindowType.WindowTransparentForInput
            | Qt.WindowType.BypassWindowManagerHint
        )
        # Transparent background; mouse events fall through to the app below.
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents)
        self.setAttribute(Qt.WidgetAttribute.WA_ShowWithoutActivating)

        self._display: Optional[VirtualDesktopDisplay] = None
        self._resize_to_primary_screen()

    def _resize_to_primary_screen(self) -> None:
        screen = QApplication.primaryScreen()
        if screen is not None:
            self.setGeometry(screen.geometry())

    def set_display(self, display: Optional[VirtualDesktopDisplay]) -> None:
        self._display = display
        self.update()

    # The overlay covers the full screen but we want the user-defined
    # coordinates to be relative to the *target* display size, not the
    # physical screen. Compute a scale + offset so a 1920×1080 layout
    # still looks right on a 2560×1440 monitor.
    def _scale_factors(self) -> tuple[float, float, float, float]:
        if not self._display:
            return 1.0, 1.0, 0.0, 0.0
        w = self.width()
        h = self.height()
        if self._display.screen_width <= 0 or self._display.screen_height <= 0:
            return 1.0, 1.0, 0.0, 0.0
        scale = min(w / self._display.screen_width, h / self._display.screen_height)
        # Center the (possibly letter-boxed) layout on the actual screen.
        offset_x = (w - self._display.screen_width * scale) / 2
        offset_y = (h - self._display.screen_height * scale) / 2
        return scale, scale, offset_x, offset_y

    def paintEvent(self, _event) -> None:  # noqa: N802 (Qt API)
        if not self._display or not self._display.annotations:
            return
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing)

        sx, sy, ox, oy = self._scale_factors()
        for ann in self._display.annotations:
            try:
                self._draw_annotation(p, ann, sx, sy, ox, oy)
            except Exception as exc:
                log.warning("Failed to draw annotation %s: %s", ann.id, exc)
        p.end()

    def _draw_annotation(
        self, p: QPainter, ann: Annotation,
        sx: float, sy: float, ox: float, oy: float,
    ) -> None:
        r = QRectF(
            ox + ann.rect.x * sx,
            oy + ann.rect.y * sy,
            ann.rect.w * sx,
            ann.rect.h * sy,
        )
        border_color = QColor(ann.style.color)
        text_color = QColor(ann.style.text_color or ann.style.color)

        if ann.type == "box" or ann.type == "tooltip":
            pen = QPen(border_color, max(1, ann.style.border_width))
            p.setPen(pen)
            p.setBrush(QBrush(QColor(ann.style.bg_color)) if ann.style.bg_color
                       else Qt.BrushStyle.NoBrush)
            p.drawRoundedRect(r, 6, 6)

            if ann.type == "tooltip" and ann.description:
                self._draw_tooltip_text(p, r, ann, text_color)
            elif ann.label:
                self._draw_label(p, r, ann, text_color)

        elif ann.type == "label":
            self._draw_label(p, r, ann, text_color, framed=False)

        elif ann.type == "arrow":
            self._draw_arrow(p, r, border_color, ann.style.border_width)
            if ann.label:
                self._draw_label(p, r, ann, text_color, framed=False)

    def _draw_label(
        self, p: QPainter, r: QRectF, ann: Annotation, color: QColor,
        framed: bool = True,
    ) -> None:
        if not ann.label:
            return
        font = QFont()
        font.setPointSize(ann.style.font_size)
        font.setBold(True)
        p.setFont(font)
        fm = QFontMetricsF(font)

        text = ann.label
        text_w = fm.horizontalAdvance(text) + 12
        text_h = fm.height() + 4
        pos = ann.style.label_position

        if framed and pos == "top":
            tag = QRectF(r.left(), r.top() - text_h - 2, text_w, text_h)
        elif framed and pos == "bottom":
            tag = QRectF(r.left(), r.bottom() + 2, text_w, text_h)
        else:
            tag = QRectF(r.left() + 4, r.top() + 4, text_w, text_h)

        p.setPen(Qt.PenStyle.NoPen)
        bg = QColor(color)
        bg.setAlpha(200)
        p.setBrush(QBrush(bg))
        p.drawRoundedRect(tag, 4, 4)
        p.setPen(QPen(QColor("#000000")))
        p.drawText(tag, Qt.AlignmentFlag.AlignCenter, text)

    def _draw_tooltip_text(
        self, p: QPainter, r: QRectF, ann: Annotation, color: QColor,
    ) -> None:
        font = QFont()
        font.setPointSize(ann.style.font_size)
        p.setFont(font)
        p.setPen(QPen(color))
        inset = r.adjusted(8, 8, -8, -8)
        text = ann.label + ("\n" + ann.description if ann.description else "")
        p.drawText(
            inset,
            int(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop |
                Qt.TextFlag.TextWordWrap),
            text,
        )

    def _draw_arrow(
        self, p: QPainter, r: QRectF, color: QColor, width: int,
    ) -> None:
        # Arrow from top-left to bottom-right of the rect.
        start = QPointF(r.left(), r.top())
        end = QPointF(r.right(), r.bottom())
        pen = QPen(color, max(2, width))
        pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(pen)
        p.drawLine(QLineF(start, end))

        # Arrowhead: a small triangle at the end pointing along the line.
        import math
        dx, dy = end.x() - start.x(), end.y() - start.y()
        length = math.hypot(dx, dy) or 1.0
        ux, uy = dx / length, dy / length
        size = 14.0
        left = QPointF(end.x() - size * ux + size * 0.5 * (-uy),
                       end.y() - size * uy + size * 0.5 * ux)
        right = QPointF(end.x() - size * ux - size * 0.5 * (-uy),
                        end.y() - size * uy - size * 0.5 * ux)
        p.setBrush(QBrush(color))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawPolygon(QPolygonF([end, left, right]))
