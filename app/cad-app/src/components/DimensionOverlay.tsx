import { useState } from 'react';
import type { CadRenderer } from '../renderer/CadRenderer';
import type { DimensionLabel } from '../tools/types';

interface Props {
  labels: DimensionLabel[];
  renderer: CadRenderer | null;
  /** Called after the user commits a dimension edit — triggers canvas redraw in the parent. */
  onCommit?: () => void;
}

/** Extract the trailing numeric part from a dimension text such as "L: 45.23" or "R: 12.50". */
function extractNumber(text: string): string {
  const m = text.match(/(\d+\.?\d*)\s*[°%]?\s*$/);
  return m ? m[1] : '0';
}

export function DimensionOverlay({ labels, renderer, onCommit }: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  if (!renderer || labels.length === 0) return null;

  const startEdit = (i: number, label: DimensionLabel) => {
    setEditingIndex(i);
    setEditValue(extractNumber(label.text));
  };

  const commitEdit = (label: DimensionLabel) => {
    const v = parseFloat(editValue);
    if (!isNaN(v) && v > 0 && label.onEdit) {
      label.onEdit(v);
      onCommit?.();
    }
    setEditingIndex(null);
  };

  const cancelEdit = () => setEditingIndex(null);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {labels.map((label, i) => {
        const screen = renderer.worldToScreen(label.worldX, label.worldY);
        const x = screen.x + (label.offsetX ?? 0);
        const y = screen.y + (label.offsetY ?? 0);
        const isPrimary = !label.variant || label.variant === 'primary';
        const isEditable = !!label.editable && !!label.onEdit;
        const isEditing = editingIndex === i;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: isEditable ? 'auto' : 'none',
              zIndex: isEditing ? 10 : 1,
            }}
          >
            {isEditing ? (
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="number"
                value={editValue}
                step="any"
                min="0"
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitEdit(label); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                  e.stopPropagation();
                }}
                onBlur={() => commitEdit(label)}
                style={{
                  width: 72,
                  background: '#0d1b2a',
                  color: '#4fc3f7',
                  border: '1.5px solid #4fc3f7',
                  borderRadius: 3,
                  padding: '2px 5px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                  boxShadow: '0 0 6px rgba(79,195,247,0.35)',
                }}
              />
            ) : (
              <div
                onClick={isEditable ? (e) => { e.stopPropagation(); startEdit(i, label); } : undefined}
                style={{
                  background: isPrimary ? 'rgba(10,20,30,0.82)' : 'rgba(10,20,30,0.65)',
                  color: isPrimary ? '#4fc3f7' : '#a0d8ef',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: isPrimary ? 600 : 400,
                  padding: '2px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  border: `1px solid ${isPrimary
                    ? (isEditable ? 'rgba(79,195,247,0.7)' : 'rgba(79,195,247,0.45)')
                    : 'rgba(79,195,247,0.2)'}`,
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                  cursor: isEditable ? 'text' : 'default',
                  textDecoration: isEditable ? 'underline dotted rgba(79,195,247,0.55)' : 'none',
                }}
              >
                {label.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
