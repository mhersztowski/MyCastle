"""Watchtower designer window — edit `VirtualDesktopDisplay` configs
and publish them over MQTT (or save to disk).

The canvas is a scaled "virtual screen": pixel coordinates of every
annotation map 1:1 to the target display size, so what you draw here is
what the overlay paints on the real desktop.
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from typing import Callable, Optional

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import (
    QAction, QBrush, QColor, QFont, QFontMetricsF, QKeySequence, QPainter,
    QPen,
)
from PySide6.QtWidgets import (
    QColorDialog, QComboBox, QFileDialog, QFormLayout, QHBoxLayout,
    QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow,
    QMessageBox, QPushButton, QSpinBox, QSplitter, QTextEdit, QToolBar,
    QVBoxLayout, QWidget,
)

from apps.watchtower_models import (
    Annotation, AnnotationStyle, Rect, VirtualDesktopDisplay,
    WatchtowerConfig, default_config,
)

log = logging.getLogger("watchtower.designer")

# --- Canvas ---------------------------------------------------------------


class DesignerCanvas(QWidget):
    """Scaled view of a virtual desktop. Mouse drags create / move /
    resize boxes; selection is reported back to the parent window."""

    annotation_selected = Signal(object)  # Annotation | None
    annotation_mutated = Signal()         # invariant: caller should refresh sidebar

    HANDLE_SIZE = 8

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setMinimumSize(640, 360)
        self.setMouseTracking(True)

        self._display: Optional[VirtualDesktopDisplay] = None
        self._selected_id: Optional[str] = None

        self._drag_mode: Optional[str] = None  # 'create' | 'move' | 'resize'
        self._drag_origin: Optional[QPointF] = None
        self._drag_start_rect: Optional[Rect] = None
        self._pending_new_id: Optional[str] = None
        self._next_type: str = "box"

    # ------- public API used by the designer window -------

    def set_display(self, display: Optional[VirtualDesktopDisplay]) -> None:
        self._display = display
        self._selected_id = None
        self.update()

    def set_next_annotation_type(self, type_: str) -> None:
        self._next_type = type_

    def select_annotation(self, ann_id: Optional[str]) -> None:
        self._selected_id = ann_id
        self.update()
        ann = self._find(ann_id) if ann_id else None
        self.annotation_selected.emit(ann)

    def selected_annotation(self) -> Optional[Annotation]:
        return self._find(self._selected_id) if self._selected_id else None

    # ------- coordinate mapping (widget px <-> virtual display px) -------

    def _virtual_size(self) -> tuple[int, int]:
        if not self._display:
            return (1920, 1080)
        return (self._display.screen_width, self._display.screen_height)

    def _scale(self) -> tuple[float, float, float, float]:
        vw, vh = self._virtual_size()
        scale = min(self.width() / vw, self.height() / vh)
        ox = (self.width() - vw * scale) / 2
        oy = (self.height() - vh * scale) / 2
        return scale, scale, ox, oy

    def _to_virtual(self, p: QPointF) -> QPointF:
        sx, _sy, ox, oy = self._scale()
        return QPointF((p.x() - ox) / sx, (p.y() - oy) / sx)

    def _to_widget(self, x: float, y: float) -> QPointF:
        sx, _sy, ox, oy = self._scale()
        return QPointF(ox + x * sx, oy + y * sx)

    def _ann_rect_widget(self, ann: Annotation) -> QRectF:
        sx, _sy, ox, oy = self._scale()
        return QRectF(
            ox + ann.rect.x * sx,
            oy + ann.rect.y * sx,
            ann.rect.w * sx,
            ann.rect.h * sx,
        )

    # ------- painting -------

    def paintEvent(self, _event) -> None:  # noqa: N802
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.fillRect(self.rect(), QColor("#1a1a1a"))

        if not self._display:
            p.setPen(QColor("#666"))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter,
                       "No display loaded — File ▸ New Display")
            return

        # Virtual screen frame (the area the overlay would actually paint on).
        vw, vh = self._virtual_size()
        sx, _sy, ox, oy = self._scale()
        screen_rect = QRectF(ox, oy, vw * sx, vh * sx)
        p.fillRect(screen_rect, QColor("#252526"))
        p.setPen(QPen(QColor("#3a3a3a"), 1))
        self._draw_grid(p, screen_rect, sx)
        p.setPen(QPen(QColor("#555"), 1))
        p.drawRect(screen_rect)

        for ann in self._display.annotations:
            self._draw_annotation(p, ann, ann.id == self._selected_id)

        p.end()

    def _draw_grid(self, p: QPainter, area: QRectF, scale: float) -> None:
        step = 100  # virtual pixels
        widget_step = step * scale
        if widget_step < 20:
            return
        x = area.left()
        while x <= area.right():
            p.drawLine(QPointF(x, area.top()), QPointF(x, area.bottom()))
            x += widget_step
        y = area.top()
        while y <= area.bottom():
            p.drawLine(QPointF(area.left(), y), QPointF(area.right(), y))
            y += widget_step

    def _draw_annotation(self, p: QPainter, ann: Annotation, selected: bool) -> None:
        r = self._ann_rect_widget(ann)
        color = QColor(ann.style.color)
        pen = QPen(color, max(1, ann.style.border_width))
        p.setPen(pen)
        if ann.style.bg_color:
            p.setBrush(QBrush(QColor(ann.style.bg_color)))
        else:
            p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(r, 4, 4)

        if ann.label:
            font = QFont()
            font.setPointSize(max(8, ann.style.font_size))
            p.setFont(font)
            fm = QFontMetricsF(font)
            tag = QRectF(r.left(), r.top() - fm.height() - 2,
                         fm.horizontalAdvance(ann.label) + 12, fm.height() + 4)
            p.setPen(Qt.PenStyle.NoPen)
            tag_bg = QColor(color)
            tag_bg.setAlpha(220)
            p.setBrush(QBrush(tag_bg))
            p.drawRoundedRect(tag, 3, 3)
            p.setPen(QPen(QColor("#000")))
            p.drawText(tag, Qt.AlignmentFlag.AlignCenter, ann.label)

        if selected:
            p.setPen(QPen(QColor("#ffcc00"), 2, Qt.PenStyle.DashLine))
            p.setBrush(Qt.BrushStyle.NoBrush)
            p.drawRect(r.adjusted(-2, -2, 2, 2))
            # Resize handle (bottom-right)
            p.setBrush(QBrush(QColor("#ffcc00")))
            p.setPen(Qt.PenStyle.NoPen)
            p.drawRect(QRectF(r.right() - self.HANDLE_SIZE / 2,
                              r.bottom() - self.HANDLE_SIZE / 2,
                              self.HANDLE_SIZE, self.HANDLE_SIZE))

    # ------- mouse interaction -------

    def mousePressEvent(self, event) -> None:  # noqa: N802
        if not self._display or event.button() != Qt.MouseButton.LeftButton:
            return
        widget_pt = event.position()
        virtual_pt = self._to_virtual(widget_pt)

        # Hit-test selected resize handle first
        sel = self.selected_annotation()
        if sel is not None:
            r = self._ann_rect_widget(sel)
            handle = QRectF(r.right() - self.HANDLE_SIZE / 2,
                            r.bottom() - self.HANDLE_SIZE / 2,
                            self.HANDLE_SIZE, self.HANDLE_SIZE)
            if handle.contains(widget_pt):
                self._drag_mode = "resize"
                self._drag_origin = virtual_pt
                self._drag_start_rect = Rect(**sel.rect.to_dict())
                return

        hit = self._hit_test(widget_pt)
        if hit is not None:
            self.select_annotation(hit.id)
            self._drag_mode = "move"
            self._drag_origin = virtual_pt
            self._drag_start_rect = Rect(**hit.rect.to_dict())
            return

        # Empty area → start a new annotation drag.
        new_ann = Annotation(
            id=str(uuid.uuid4()),
            type=self._next_type,
            rect=Rect(x=virtual_pt.x(), y=virtual_pt.y(), w=0, h=0),
            label="",
            style=AnnotationStyle(),
        )
        self._display.annotations.append(new_ann)
        self._pending_new_id = new_ann.id
        self._drag_mode = "create"
        self._drag_origin = virtual_pt
        self.select_annotation(new_ann.id)

    def mouseMoveEvent(self, event) -> None:  # noqa: N802
        if self._drag_mode is None or self._display is None:
            return
        virtual_pt = self._to_virtual(event.position())

        if self._drag_mode == "create" and self._pending_new_id:
            ann = self._find(self._pending_new_id)
            if ann and self._drag_origin is not None:
                ann.rect.x = min(self._drag_origin.x(), virtual_pt.x())
                ann.rect.y = min(self._drag_origin.y(), virtual_pt.y())
                ann.rect.w = abs(virtual_pt.x() - self._drag_origin.x())
                ann.rect.h = abs(virtual_pt.y() - self._drag_origin.y())
                self.update()
        elif self._drag_mode == "move":
            sel = self.selected_annotation()
            if sel and self._drag_origin is not None and self._drag_start_rect is not None:
                dx = virtual_pt.x() - self._drag_origin.x()
                dy = virtual_pt.y() - self._drag_origin.y()
                sel.rect.x = self._drag_start_rect.x + dx
                sel.rect.y = self._drag_start_rect.y + dy
                self.update()
                self.annotation_selected.emit(sel)
        elif self._drag_mode == "resize":
            sel = self.selected_annotation()
            if sel and self._drag_start_rect is not None:
                sel.rect.w = max(8, virtual_pt.x() - self._drag_start_rect.x)
                sel.rect.h = max(8, virtual_pt.y() - self._drag_start_rect.y)
                self.update()
                self.annotation_selected.emit(sel)

    def mouseReleaseEvent(self, _event) -> None:  # noqa: N802
        if self._drag_mode == "create" and self._pending_new_id and self._display:
            # Drop tiny "click-only" annotations that the user clearly
            # didn't mean to create.
            ann = self._find(self._pending_new_id)
            if ann and (ann.rect.w < 8 or ann.rect.h < 8):
                self._display.annotations.remove(ann)
                self.select_annotation(None)
        self._drag_mode = None
        self._drag_origin = None
        self._drag_start_rect = None
        self._pending_new_id = None
        self.annotation_mutated.emit()
        self.update()

    # ------- helpers -------

    def _hit_test(self, widget_pt: QPointF) -> Optional[Annotation]:
        if not self._display:
            return None
        # Topmost first.
        for ann in reversed(self._display.annotations):
            if self._ann_rect_widget(ann).contains(widget_pt):
                return ann
        return None

    def _find(self, ann_id: Optional[str]) -> Optional[Annotation]:
        if not self._display or not ann_id:
            return None
        return next((a for a in self._display.annotations if a.id == ann_id), None)


# --- Properties panel ----------------------------------------------------


class PropertiesPanel(QWidget):
    """Form bound to the currently selected annotation."""

    changed = Signal()

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self._ann: Optional[Annotation] = None
        self._building = False

        layout = QFormLayout(self)
        self.id_label = QLabel("—")
        self.type_combo = QComboBox()
        self.type_combo.addItems(["box", "label", "arrow", "tooltip"])
        self.label_edit = QLineEdit()
        self.desc_edit = QTextEdit()
        self.desc_edit.setMaximumHeight(80)
        self.x_spin = QSpinBox(); self.x_spin.setRange(0, 10000)
        self.y_spin = QSpinBox(); self.y_spin.setRange(0, 10000)
        self.w_spin = QSpinBox(); self.w_spin.setRange(0, 10000)
        self.h_spin = QSpinBox(); self.h_spin.setRange(0, 10000)
        self.color_btn = QPushButton("Pick…")
        self.bg_btn = QPushButton("Pick…")
        self.font_spin = QSpinBox(); self.font_spin.setRange(6, 96)
        self.font_spin.setValue(12)

        layout.addRow("ID", self.id_label)
        layout.addRow("Type", self.type_combo)
        layout.addRow("Label", self.label_edit)
        layout.addRow("Description", self.desc_edit)
        layout.addRow("X", self.x_spin)
        layout.addRow("Y", self.y_spin)
        layout.addRow("W", self.w_spin)
        layout.addRow("H", self.h_spin)
        layout.addRow("Color", self.color_btn)
        layout.addRow("Background", self.bg_btn)
        layout.addRow("Font size", self.font_spin)

        self.type_combo.currentTextChanged.connect(self._push)
        self.label_edit.textChanged.connect(self._push)
        self.desc_edit.textChanged.connect(self._push)
        for s in (self.x_spin, self.y_spin, self.w_spin, self.h_spin, self.font_spin):
            s.valueChanged.connect(self._push)
        self.color_btn.clicked.connect(lambda: self._pick_color("color"))
        self.bg_btn.clicked.connect(lambda: self._pick_color("bg"))

        self.setEnabled(False)

    def set_annotation(self, ann: Optional[Annotation]) -> None:
        self._ann = ann
        self._building = True
        if ann is None:
            self.id_label.setText("—")
            self.label_edit.clear()
            self.desc_edit.clear()
            for s in (self.x_spin, self.y_spin, self.w_spin, self.h_spin):
                s.setValue(0)
            self.setEnabled(False)
        else:
            self.id_label.setText(ann.id)
            self.type_combo.setCurrentText(ann.type)
            self.label_edit.setText(ann.label)
            self.desc_edit.setPlainText(ann.description)
            self.x_spin.setValue(int(ann.rect.x))
            self.y_spin.setValue(int(ann.rect.y))
            self.w_spin.setValue(int(ann.rect.w))
            self.h_spin.setValue(int(ann.rect.h))
            self.font_spin.setValue(ann.style.font_size)
            self.color_btn.setStyleSheet(f"background:{ann.style.color}")
            self.bg_btn.setStyleSheet(
                f"background:{ann.style.bg_color}" if ann.style.bg_color else ""
            )
            self.setEnabled(True)
        self._building = False

    def _push(self, *_args) -> None:
        if self._building or self._ann is None:
            return
        self._ann.type = self.type_combo.currentText()
        self._ann.label = self.label_edit.text()
        self._ann.description = self.desc_edit.toPlainText()
        self._ann.rect = Rect(
            x=self.x_spin.value(), y=self.y_spin.value(),
            w=self.w_spin.value(), h=self.h_spin.value(),
        )
        self._ann.style.font_size = self.font_spin.value()
        self.changed.emit()

    def _pick_color(self, target: str) -> None:
        if self._ann is None:
            return
        initial = QColor(
            self._ann.style.color if target == "color"
            else (self._ann.style.bg_color or "#000000")
        )
        c = QColorDialog.getColor(initial, self, options=QColorDialog.ColorDialogOption.ShowAlphaChannel)
        if not c.isValid():
            return
        hex_ = c.name(QColor.NameFormat.HexArgb) if c.alpha() < 255 else c.name()
        if target == "color":
            self._ann.style.color = hex_
            self.color_btn.setStyleSheet(f"background:{hex_}")
        else:
            self._ann.style.bg_color = hex_
            self.bg_btn.setStyleSheet(f"background:{hex_}")
        self.changed.emit()


# --- Main window ---------------------------------------------------------


class DesignerWindow(QMainWindow):
    """Designer side of Watchtower — edit & publish virtual-desktop-display configs."""

    def __init__(
        self,
        on_publish: Callable[[WatchtowerConfig], None],
        on_local_change: Callable[[WatchtowerConfig], None],
        on_toggle_overlay: Callable[[], None],
    ) -> None:
        super().__init__()
        self.setWindowTitle("Watchtower — Virtual Desktop Designer")
        self.resize(1280, 800)
        self._on_publish = on_publish
        self._on_local_change = on_local_change
        self._on_toggle_overlay = on_toggle_overlay

        self._config: WatchtowerConfig = default_config()
        self._build_ui()
        self._refresh_display_list()
        self._select_active_display()

    # ------- public API used by Watchtower orchestrator -------

    def set_config(self, config: WatchtowerConfig) -> None:
        """Replace the working config (e.g. when an MQTT update arrived)."""
        self._config = config
        self._refresh_display_list()
        self._select_active_display()

    def current_config(self) -> WatchtowerConfig:
        return self._config

    # ------- UI construction -------

    def _build_ui(self) -> None:
        self._build_menu()
        self._build_toolbar()

        central = QSplitter(Qt.Orientation.Horizontal, self)
        self.setCentralWidget(central)

        # Left: list of displays + add/remove/active
        left = QWidget()
        ll = QVBoxLayout(left); ll.setContentsMargins(8, 8, 8, 8)
        ll.addWidget(QLabel("Displays"))
        self.display_list = QListWidget()
        self.display_list.itemSelectionChanged.connect(self._on_display_selected)
        ll.addWidget(self.display_list, 1)
        row = QHBoxLayout()
        b_add = QPushButton("Add"); b_add.clicked.connect(self._add_display)
        b_del = QPushButton("Remove"); b_del.clicked.connect(self._remove_display)
        b_act = QPushButton("Set Active"); b_act.clicked.connect(self._set_active_display)
        row.addWidget(b_add); row.addWidget(b_del); row.addWidget(b_act)
        ll.addLayout(row)

        name_form = QFormLayout()
        self.display_name_edit = QLineEdit()
        self.display_name_edit.editingFinished.connect(self._rename_display)
        self.display_sw_spin = QSpinBox(); self.display_sw_spin.setRange(320, 16000); self.display_sw_spin.setValue(1920)
        self.display_sh_spin = QSpinBox(); self.display_sh_spin.setRange(240, 16000); self.display_sh_spin.setValue(1080)
        self.display_sw_spin.valueChanged.connect(self._update_display_size)
        self.display_sh_spin.valueChanged.connect(self._update_display_size)
        name_form.addRow("Name", self.display_name_edit)
        name_form.addRow("Screen W", self.display_sw_spin)
        name_form.addRow("Screen H", self.display_sh_spin)
        ll.addLayout(name_form)

        # Center: canvas
        self.canvas = DesignerCanvas()
        self.canvas.annotation_selected.connect(self._on_annotation_selected)
        self.canvas.annotation_mutated.connect(self._on_local_mutation)

        # Right: properties
        self.props = PropertiesPanel()
        self.props.changed.connect(self._on_local_mutation)

        central.addWidget(left)
        central.addWidget(self.canvas)
        central.addWidget(self.props)
        central.setSizes([220, 800, 260])

    def _build_menu(self) -> None:
        bar = self.menuBar()
        m_file = bar.addMenu("&File")
        m_file.addAction(self._action("New Display", "Ctrl+N", self._add_display))
        m_file.addSeparator()
        m_file.addAction(self._action("Open…", "Ctrl+O", self._open_file))
        m_file.addAction(self._action("Save As…", "Ctrl+S", self._save_file))
        m_file.addSeparator()
        m_file.addAction(self._action("Publish (MQTT)", "Ctrl+P", self._publish))
        m_file.addSeparator()
        m_file.addAction(self._action("Quit", QKeySequence.StandardKey.Quit.value, self.close))

        m_view = bar.addMenu("&View")
        m_view.addAction(self._action("Toggle Overlay", "F8", self._on_toggle_overlay))

    def _build_toolbar(self) -> None:
        tb = QToolBar("Tools")
        tb.setMovable(False)
        self.addToolBar(tb)
        for kind in ("box", "label", "arrow", "tooltip"):
            a = QAction(kind.capitalize(), self)
            a.setCheckable(True)
            a.triggered.connect(lambda checked, k=kind: self._set_tool(k))
            tb.addAction(a)
            if kind == "box":
                a.setChecked(True)
        tb.addSeparator()
        tb.addAction(self._action("Delete Selected", "Delete", self._delete_selected))
        tb.addSeparator()
        tb.addAction(self._action("Toggle Overlay", "F8", self._on_toggle_overlay))
        tb.addAction(self._action("Publish", "Ctrl+P", self._publish))

    def _action(self, label: str, shortcut: str, slot: Callable) -> QAction:
        a = QAction(label, self)
        if shortcut:
            a.setShortcut(QKeySequence(shortcut))
        a.triggered.connect(slot)
        return a

    # ------- display list management -------

    def _refresh_display_list(self) -> None:
        self.display_list.blockSignals(True)
        self.display_list.clear()
        for d in self._config.displays:
            tag = " (active)" if d.id == self._config.active_display_id else ""
            item = QListWidgetItem(f"{d.name or d.id}{tag}")
            item.setData(Qt.ItemDataRole.UserRole, d.id)
            self.display_list.addItem(item)
        self.display_list.blockSignals(False)

    def _select_active_display(self) -> None:
        target = self._config.active_display_id
        for i in range(self.display_list.count()):
            if self.display_list.item(i).data(Qt.ItemDataRole.UserRole) == target:
                self.display_list.setCurrentRow(i)
                return
        if self.display_list.count() > 0:
            self.display_list.setCurrentRow(0)

    def _current_display(self) -> Optional[VirtualDesktopDisplay]:
        item = self.display_list.currentItem()
        if item is None:
            return None
        ann_id = item.data(Qt.ItemDataRole.UserRole)
        return next((d for d in self._config.displays if d.id == ann_id), None)

    def _on_display_selected(self) -> None:
        d = self._current_display()
        self.canvas.set_display(d)
        if d is not None:
            self.display_name_edit.setText(d.name)
            self.display_sw_spin.setValue(d.screen_width)
            self.display_sh_spin.setValue(d.screen_height)
        self.props.set_annotation(None)

    def _add_display(self) -> None:
        new = VirtualDesktopDisplay(
            id=str(uuid.uuid4()),
            name=f"Display {len(self._config.displays) + 1}",
        )
        self._config.displays.append(new)
        if self._config.active_display_id is None:
            self._config.active_display_id = new.id
        self._refresh_display_list()
        self._select_active_display()
        self._on_local_mutation()

    def _remove_display(self) -> None:
        d = self._current_display()
        if d is None:
            return
        self._config.displays = [x for x in self._config.displays if x.id != d.id]
        if self._config.active_display_id == d.id:
            self._config.active_display_id = (
                self._config.displays[0].id if self._config.displays else None
            )
        self._refresh_display_list()
        self._select_active_display()
        self._on_local_mutation()

    def _set_active_display(self) -> None:
        d = self._current_display()
        if d is None:
            return
        self._config.active_display_id = d.id
        self._refresh_display_list()
        self._select_active_display()
        self._on_local_mutation()

    def _rename_display(self) -> None:
        d = self._current_display()
        if d is None:
            return
        d.name = self.display_name_edit.text()
        self._refresh_display_list()
        self._select_active_display()
        self._on_local_mutation()

    def _update_display_size(self) -> None:
        d = self._current_display()
        if d is None:
            return
        d.screen_width = self.display_sw_spin.value()
        d.screen_height = self.display_sh_spin.value()
        self.canvas.update()
        self._on_local_mutation()

    # ------- annotation interaction -------

    def _set_tool(self, kind: str) -> None:
        self.canvas.set_next_annotation_type(kind)
        for a in self.findChildren(QAction):
            if a.text().lower() == kind and a.isCheckable():
                continue
            if a.isCheckable() and a.text().lower() in {"box", "label", "arrow", "tooltip"}:
                a.setChecked(a.text().lower() == kind)

    def _on_annotation_selected(self, ann: Optional[Annotation]) -> None:
        self.props.set_annotation(ann)

    def _delete_selected(self) -> None:
        d = self._current_display()
        sel = self.canvas.selected_annotation()
        if d is None or sel is None:
            return
        d.annotations = [a for a in d.annotations if a.id != sel.id]
        self.canvas.set_display(d)
        self.props.set_annotation(None)
        self._on_local_mutation()

    def _on_local_mutation(self) -> None:
        # Push live updates to the overlay without requiring a publish.
        self._on_local_change(self._config)
        self.canvas.update()

    # ------- file I/O -------

    def _open_file(self) -> None:
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Watchtower Config", "", "JSON (*.json)"
        )
        if not path:
            return
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            self.set_config(WatchtowerConfig.from_dict(data))
            self._on_local_change(self._config)
        except Exception as exc:
            QMessageBox.warning(self, "Open failed", str(exc))

    def _save_file(self) -> None:
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Watchtower Config", "watchtower.json", "JSON (*.json)"
        )
        if not path:
            return
        try:
            Path(path).write_text(
                json.dumps(self._config.to_dict(), indent=2), encoding="utf-8",
            )
        except Exception as exc:
            QMessageBox.warning(self, "Save failed", str(exc))

    def _publish(self) -> None:
        try:
            self._on_publish(self._config)
        except Exception as exc:
            log.exception("Publish failed")
            QMessageBox.warning(self, "Publish failed", str(exc))
