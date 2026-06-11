/**
 * Touch-friendly selection handles for standalone Monaco Editor instances.
 *
 * Full-fidelity port of the Android-style selection system from MonacoMultiEditor
 * (the one powering the electronics/editor). Beyond the draggable drag-pins it
 * includes the pieces that make mobile selection actually usable:
 *   - draggable start/end/cursor handles,
 *   - double-tap word selection,
 *   - Gboard spacebar-swipe cursor control (shadow-cursor on the hidden textarea),
 *   - scroll-vs-tap keyboard suppression,
 *   - reliable handle positioning via getScrolledVisiblePosition().height.
 *
 * Usage: render <MonacoSelectionHandles editor={editorInstance} /> adjacent to
 * the <Editor> component. Pass null to clean up.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { editor as MonacoEditorTypes } from 'monaco-editor';

interface HandlePos { x: number; y: number; lineHeight: number }
type Pos = { lineNumber: number; column: number };

interface Props {
  editor: MonacoEditorTypes.IStandaloneCodeEditor | null;
}

export function MonacoSelectionHandles({ editor }: Props) {
  const [selHandles, setSelHandles] = useState<{ start: HandlePos; end: HandlePos | null } | null>(null);
  const dragAnchorRef = useRef<Pos | null>(null);

  // ── Drag: update Monaco selection as the handle moves ──────────────────────
  const applyHandleDrag = useCallback((which: 'start' | 'end' | 'cursor', clientX: number, clientY: number) => {
    if (!editor) return;
    const target = editor.getTargetAtClientPoint(clientX, clientY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPos = (target as any)?.position as Pos | null | undefined;
    if (!newPos) return;

    if (which === 'cursor') {
      const anchor = dragAnchorRef.current;
      if (!anchor) return;
      const { lineNumber: anchorLn, column: anchorCol } = anchor;
      if (newPos.lineNumber > anchorLn || (newPos.lineNumber === anchorLn && newPos.column > anchorCol)) {
        editor.setSelection({ startLineNumber: anchorLn, startColumn: anchorCol, endLineNumber: newPos.lineNumber, endColumn: newPos.column });
      } else if (newPos.lineNumber < anchorLn || newPos.column < anchorCol) {
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
  const handlePointerDownOnHandle = useCallback((which: 'start' | 'end' | 'cursor', e: React.PointerEvent) => {
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
          const target = editor.getTargetAtClientPoint(ev.clientX, ev.clientY);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newPos = (target as any)?.position as Pos | null | undefined;
          if (newPos) editor.setPosition(newPos);
        }
        editor.focus();
      }
    };

    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
  }, [applyHandleDrag, editor]);

  // ── Monaco listeners + Android selection plumbing ──────────────────────────
  useEffect(() => {
    if (!editor) { setSelHandles(null); return; }
    const me = editor;

    // Recompute handle positions. lineHeight comes from getScrolledVisiblePosition
    // (the authoritative rendered height) rather than a fragile getOption() index.
    const updateHandles = () => {
      const sel = me.getSelection();
      if (!sel) { setSelHandles(null); return; }
      const rect = me.getDomNode()?.getBoundingClientRect();
      if (!rect) { setSelHandles(null); return; }

      const isCollapsed = sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn;
      const startPos = me.getScrolledVisiblePosition({ lineNumber: sel.startLineNumber, column: sel.startColumn });
      if (!startPos) { setSelHandles(null); return; }
      const lineH = startPos.height ?? 18;

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

    // ── Double-tap word selection ──────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingWordRangeRef: { current: any | null } = { current: null };
    let pendingWordRangeTtl: ReturnType<typeof setTimeout> | null = null;
    let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

    // Gboard gesture activity — suppress Monaco's own pointer handler mid-gesture.
    const gboardState = { lastActive: 0 };

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
      // During a Gboard spacebar swipe the sliding finger can fire a touch
      // pointerdown inside the editor — Monaco would jump the cursor. Suppress
      // touch events for 800ms after the last Gboard delta.
      if (e.pointerType === 'touch' && Date.now() - gboardState.lastActive < 800) {
        e.stopPropagation();
        return;
      }

      const now = Date.now();
      const isDouble = now - lastTapTime < 400 && Math.abs(e.clientX - lastTapX) < 40 && Math.abs(e.clientY - lastTapY) < 40;
      lastTapTime = isDouble ? 0 : now;
      lastTapX = e.clientX;
      lastTapY = e.clientY;
      if (!isDouble) return;

      setTimeout(() => {
        const model = me.getModel();
        const pos = me.getPosition();
        if (!model || !pos) return;
        const wordRange = model.getWordAtPosition(pos)
          ?? model.getWordAtPosition({ lineNumber: pos.lineNumber, column: Math.max(1, pos.column - 1) });
        if (!wordRange) return;
        pendingWordRangeRef.current = {
          startLineNumber: pos.lineNumber, startColumn: wordRange.startColumn,
          endLineNumber: pos.lineNumber, endColumn: wordRange.endColumn,
        };
        if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
        pendingWordRangeTtl = setTimeout(() => { pendingWordRangeRef.current = null; pendingWordRangeTtl = null; }, 600);
        me.setSelection(pendingWordRangeRef.current);
        updateHandles();
      }, 50);
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);

    // ── Gboard spacebar cursor-control (Android only) — shadow cursor ────────
    let gboardCleanup: (() => void) | null = null;
    if (/Android/i.test(navigator.userAgent)) {
      const ta = me.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea');
      if (ta) {
        const SHADOW = '                     '; // 21 spaces
        const SHADOW_MID = 10;
        const nativeValDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!;
        const nativeSsr = HTMLTextAreaElement.prototype.setSelectionRange;

        nativeValDesc.set!.call(ta, SHADOW);
        Object.defineProperty(ta, 'value', {
          get() { return ''; },
          set(v: string) { if (v !== '') nativeValDesc.set!.call(ta, v); },
          configurable: true,
        });
        Object.defineProperty(ta, 'setSelectionRange', {
          value() { /* block Monaco; Gboard's C++ setSelection bypasses JS */ },
          configurable: true, writable: true,
        });

        const resetShadow = () => {
          nativeValDesc.set!.call(ta, SHADOW);
          nativeSsr.call(ta, SHADOW_MID, SHADOW_MID);
        };

        const tmp = document.createElement('textarea');
        tmp.style.cssText = 'position:fixed;opacity:0;top:-9999px;left:-9999px;width:1px;height:1px;';
        document.body.appendChild(tmp);

        const doBlurFocusCycle = () => {
          resetShadow();
          tmp.focus();
          requestAnimationFrame(() => {
            ta.focus();
            requestAnimationFrame(resetShadow);
          });
        };
        const initTimer = setTimeout(doBlurFocusCycle, 300);

        let cycleInProgress = false;
        const onFocus = () => {
          if (cycleInProgress) return;
          cycleInProgress = true;
          setTimeout(() => {
            doBlurFocusCycle();
            setTimeout(() => { cycleInProgress = false; }, 400);
          }, 50);
        };
        ta.addEventListener('focus', onFocus);

        let applyingDelta = false;
        const onGboardSel = () => {
          const nativeSS = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'selectionStart')!.get!.call(ta) as number;
          const delta = nativeSS - SHADOW_MID;
          if (document.activeElement !== ta || applyingDelta || delta === 0) return;
          resetShadow();
          const model = me.getModel();
          const pos = me.getPosition();
          if (!model || !pos) return;
          const newOffset = Math.max(0, Math.min(model.getValueLength(), model.getOffsetAt(pos) + delta));
          applyingDelta = true;
          gboardState.lastActive = Date.now();
          me.setPosition(model.getPositionAt(newOffset));
          me.revealPositionInCenter(model.getPositionAt(newOffset));
          requestAnimationFrame(() => { applyingDelta = false; });
        };
        document.addEventListener('selectionchange', onGboardSel);

        gboardCleanup = () => {
          clearTimeout(initTimer);
          document.removeEventListener('selectionchange', onGboardSel);
          ta.removeEventListener('focus', onFocus);
          delete (ta as unknown as Record<string, unknown>).value;
          delete (ta as unknown as Record<string, unknown>).setSelectionRange;
          tmp.remove();
        };
      }
    }

    // ── Scroll-vs-tap: hide soft keyboard when the user pans the editor ──────
    const container = me.getDomNode();
    let scrollGestureActive = false, scrollOnWidget = false, scrollOriginX = 0, scrollOriginY = 0;
    const onContainerPDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      scrollGestureActive = false;
      scrollOnWidget = !!(e.target as Element | null)?.closest('.suggest-widget, .editor-widget, .monaco-menu, .context-view');
      if (scrollOnWidget) return;
      scrollOriginX = e.clientX; scrollOriginY = e.clientY;
    };
    const onContainerPMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || scrollGestureActive || scrollOnWidget) return;
      if (Math.abs(e.clientX - scrollOriginX) > 8 || Math.abs(e.clientY - scrollOriginY) > 8) scrollGestureActive = true;
    };
    const onContainerPUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !scrollGestureActive) return;
      scrollGestureActive = false;
      const innerTa = me.getDomNode()?.querySelector<HTMLTextAreaElement>('textarea.inputarea');
      if (!innerTa) return;
      innerTa.readOnly = true;
      innerTa.blur();
      setTimeout(() => { innerTa.readOnly = false; }, 300);
    };
    if (container) {
      container.addEventListener('pointerdown', onContainerPDown, true);
      container.addEventListener('pointermove', onContainerPMove, { capture: true, passive: true });
      container.addEventListener('pointerup', onContainerPUp, true);
    }

    updateHandles();

    return () => {
      gboardCleanup?.();
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      if (container) {
        container.removeEventListener('pointerdown', onContainerPDown, true);
        container.removeEventListener('pointermove', onContainerPMove, true);
        container.removeEventListener('pointerup', onContainerPUp, true);
      }
      if (pendingWordRangeTtl) clearTimeout(pendingWordRangeTtl);
      dSel.dispose();
      dCursor.dispose();
      dScroll.dispose();
      dLayout.dispose();
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
