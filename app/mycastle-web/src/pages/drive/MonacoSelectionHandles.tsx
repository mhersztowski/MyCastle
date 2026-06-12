/**
 * Touch-friendly selection handles for standalone Monaco Editor instances.
 * Mirrors the Android-style drag pins implemented in MonacoMultiEditor.
 *
 * Usage: render <MonacoSelectionHandles editor={editorInstance} /> adjacent
 * to the <Editor> component.  Pass null to clean up (e.g. when the editor
 * unmounts or a different file is loading).
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { editor as MonacoEditorTypes } from 'monaco-editor';

interface HandlePos { x: number; y: number; lineHeight: number }

interface Props {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null;
}

export function MonacoSelectionHandles({ editor }: Props) {
  const [selHandles, setSelHandles] = useState<{ start: HandlePos; end: HandlePos | null } | null>(null);
  const dragAnchorRef = useRef<{ lineNumber: number; column: number } | null>(null);

  // ── Drag: update Monaco selection as the handle moves ──────────────────────
  const applyHandleDrag = useCallback((
    which: 'start' | 'end' | 'cursor',
    clientX: number,
    clientY: number,
  ) => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const target = editor.getTargetAtClientPoint(clientX, clientY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPos = (target as any)?.position as { lineNumber: number; column: number } | null | undefined;
    if (!newPos) return;

    if (which === 'cursor') {
      const anchor = dragAnchorRef.current;
      if (!anchor) return;
      const { lineNumber: anchorLn, column: anchorCol } = anchor;
      if (newPos.lineNumber > anchorLn || (newPos.lineNumber === anchorLn && newPos.column > anchorCol)) {
        editor.setSelection({ startLineNumber: anchorLn, startColumn: anchorCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      } else {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: anchorLn, endColumn: anchorCol });
      }
      return;
    }

    const sel = editor.getSelection();
    if (!sel) return;
    if (which === 'start') {
      const endLn = sel.endLineNumber; const endCol = sel.endColumn;
      if (newPos.lineNumber < endLn || (newPos.lineNumber === endLn && newPos.column <= endCol)) {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: endLn, endColumn: endCol });
      } else {
        editor.setSelection({ startLineNumber: endLn, startColumn: endCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      }
    } else {
      const startLn = sel.startLineNumber; const startCol = sel.startColumn;
      if (newPos.lineNumber > startLn || (newPos.lineNumber === startLn && newPos.column >= startCol)) {
        editor.setSelection({ startLineNumber: startLn, startColumn: startCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      } else {
        editor.setSelection({ startLineNumber: newPos.lineNumber, startColumn: newPos.column, endLineNumber: startLn, endColumn: startCol });
      }
    }
  }, [editor]);

  // ── Pointer-down on a handle gizmo ─────────────────────────────────────────
  const handlePointerDownOnHandle = useCallback((
    which: 'start' | 'end' | 'cursor',
    e: React.PointerEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (which === 'cursor' && editor) {
      const pos = editor.getPosition();
      dragAnchorRef.current = pos ? { lineNumber: pos.lineNumber, column: pos.column } : null;
    }

    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const DRAG_THRESHOLD = 8;
    let hasMoved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      ev.preventDefault();
      if (!hasMoved) {
        if (Math.abs(ev.clientX - startX) > DRAG_THRESHOLD || Math.abs(ev.clientY - startY) > DRAG_THRESHOLD) {
          hasMoved = true;
        }
      }
      if (hasMoved) applyHandleDrag(which, ev.clientX, ev.clientY);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      if (editor) {
        if (!hasMoved && which === 'cursor') {
          // Pure tap on the cursor handle — move cursor to that position.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const target = editor.getTargetAtClientPoint(ev.clientX, ev.clientY);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newPos = (target as any)?.position as { lineNumber: number; column: number } | null | undefined;
          if (newPos) editor.setPosition(newPos);
        }
        editor.focus();
      }
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
  }, [applyHandleDrag, editor]);

  // ── Set up Monaco event listeners whenever the editor instance changes ──────
  useEffect(() => {
    if (!editor) {
      setSelHandles(null);
      return;
    }

    const me = editor;

    // Recompute handle positions from Monaco's scroll/layout state.
    const updateHandles = () => {
      const sel = me.getSelection();
      const container = me.getDomNode();
      if (!container) { setSelHandles(null); return; }
      const rect = container.getBoundingClientRect();
      // EditorOption.lineHeight = 56
      const lineH = (me.getOption(56) as unknown as number) || 20;

      const isCollapsed = !sel || (
        sel.startLineNumber === sel.endLineNumber &&
        sel.startColumn === sel.endColumn
      );

      const startLine = isCollapsed ? (me.getPosition()?.lineNumber ?? 1) : sel.startLineNumber;
      const startCol  = isCollapsed ? (me.getPosition()?.column   ?? 1) : sel.startColumn;

      const startPos = me.getScrolledVisiblePosition({ lineNumber: startLine, column: startCol });
      if (!startPos || startPos.top < 0 || startPos.top > rect.height) {
        setSelHandles(null);
        return;
      }

      if (isCollapsed) {
        setSelHandles({
          start: { x: rect.left + startPos.left, y: rect.top + startPos.top, lineHeight: lineH },
          end: null,
        });
        return;
      }

      const endPos = me.getScrolledVisiblePosition({ lineNumber: sel.endLineNumber, column: sel.endColumn });
      const ep = endPos ?? { left: rect.width - 4, top: rect.height - lineH, height: lineH };

      setSelHandles({
        start: { x: rect.left + startPos.left, y: rect.top + startPos.top, lineHeight: lineH },
        end:   { x: rect.left + ep.left,        y: rect.top + ep.top,        lineHeight: (ep as { height?: number }).height ?? lineH },
      });
    };

    // ── Double-tap word selection ───────────────────────────────────────────
    const pendingWordRangeRef: { current: ReturnType<typeof me.getSelection> | null } = { current: null };
    let pendingWordRangeTtl: ReturnType<typeof setTimeout> | null = null;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    const dSel = me.onDidChangeCursorSelection(() => {
      const sel = me.getSelection();
      const isCollapsed = !sel || (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);
      if (pendingWordRangeRef.current && isCollapsed) {
        me.setSelection(pendingWordRangeRef.current);
        return;
      }
      updateHandles();
    });
    const dCursor = me.onDidChangeCursorPosition(updateHandles);
    const dScroll = me.onDidScrollChange(updateHandles);
    const dLayout = me.onDidLayoutChange(updateHandles);

    const onDocPointerDown = (e: PointerEvent) => {
      const now = Date.now();
      const dx = Math.abs(e.clientX - lastTapX);
      const dy = Math.abs(e.clientY - lastTapY);
      const dt = now - lastTapTime;
      const isDouble = dt < 400 && dx < 40 && dy < 40;
      lastTapTime = isDouble ? 0 : now;
      lastTapX = e.clientX;
      lastTapY = e.clientY;

      if (!isDouble) return;

      setTimeout(() => {
        const model = me.getModel();
        if (!model) return;
        const pos = me.getPosition();
        if (!pos) return;
        const wordRange = model.getWordAtPosition(pos)
          ?? model.getWordAtPosition({ lineNumber: pos.lineNumber, column: Math.max(1, pos.column - 1) });
        if (!wordRange) return;

        pendingWordRangeRef.current = {
          selectionStartLineNumber: pos.lineNumber,
          selectionStartColumn: wordRange.startColumn,
          positionLineNumber: pos.lineNumber,
          positionColumn: wordRange.endColumn,
        } as unknown as ReturnType<typeof me.getSelection>;

        if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
        pendingWordRangeTtl = setTimeout(() => {
          pendingWordRangeRef.current = null;
          pendingWordRangeTtl = null;
        }, 600);

        me.setSelection({
          startLineNumber: pos.lineNumber,
          startColumn: wordRange.startColumn,
          endLineNumber: pos.lineNumber,
          endColumn: wordRange.endColumn,
        });
        updateHandles();
      }, 50);
    };

    document.addEventListener('pointerdown', onDocPointerDown, true);

    // Initial position
    updateHandles();

    return () => {
      dSel.dispose();
      dCursor.dispose();
      dScroll.dispose();
      dLayout.dispose();
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
      setSelHandles(null);
    };
  }, [editor]);

  if (!selHandles) return null;

  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 99999 }}>
      {/* Start handle (or cursor handle when collapsed) */}
      <div
        onPointerDown={(e) => handlePointerDownOnHandle(selHandles.end === null ? 'cursor' : 'start', e)}
        style={{
          position: 'fixed',
          left: selHandles.start.x - 22,
          top:  selHandles.start.y,
          width: 44,
          height: Math.max(selHandles.start.lineHeight + 16, 44),
          pointerEvents: 'all',
          touchAction: 'none',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ width: 2, flexGrow: 1, minHeight: 8, background: '#4fc3f7', borderRadius: '1px 1px 0 0' }} />
        <div style={{
          width: 16, height: 16, flexShrink: 0,
          background: '#4fc3f7',
          borderRadius: selHandles.end === null ? '50%' : '50% 0 50% 50%',
          transform:   selHandles.end === null ? 'none'  : 'rotate(-135deg)',
        }} />
      </div>

      {/* End handle — only shown when there is a real (non-collapsed) selection */}
      {selHandles.end !== null && (
        <div
          onPointerDown={(e) => handlePointerDownOnHandle('end', e)}
          style={{
            position: 'fixed',
            left: selHandles.end.x - 22,
            top:  selHandles.end.y,
            width: 44,
            height: Math.max(selHandles.end.lineHeight + 16, 44),
            pointerEvents: 'all',
            touchAction: 'none',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div style={{ width: 2, flexGrow: 1, minHeight: 8, background: '#4fc3f7', borderRadius: '1px 1px 0 0' }} />
          <div style={{
            width: 16, height: 16, flexShrink: 0,
            background: '#4fc3f7',
            borderRadius: '0 50% 50% 50%',
            transform: 'rotate(-45deg)',
          }} />
        </div>
      )}
    </div>,
    document.body,
  );
}
