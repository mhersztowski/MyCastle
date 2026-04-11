import type { CadRenderer } from '../renderer/CadRenderer';
import type { DimensionLabel } from '../tools/types';

interface Props {
  labels: DimensionLabel[];
  renderer: CadRenderer | null;
}

/**
 * HTML overlay that renders live dimension labels (length, radius, angle, etc.)
 * while drawing or editing entities. Positioned absolutely over the canvas.
 * Uses pointer-events: none so it never interferes with canvas interaction.
 */
export function DimensionOverlay({ labels, renderer }: Props) {
  if (!renderer || labels.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {labels.map((label, i) => {
        const screen = renderer.worldToScreen(label.worldX, label.worldY);
        const x = screen.x + (label.offsetX ?? 0);
        const y = screen.y + (label.offsetY ?? 0);
        const isPrimary = !label.variant || label.variant === 'primary';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: 'translate(-50%, -50%)',
              background: isPrimary ? 'rgba(10,20,30,0.82)' : 'rgba(10,20,30,0.65)',
              color: isPrimary ? '#4fc3f7' : '#a0d8ef',
              fontSize: 11,
              fontFamily: 'monospace',
              fontWeight: isPrimary ? 600 : 400,
              padding: '2px 5px',
              borderRadius: 3,
              whiteSpace: 'nowrap',
              border: `1px solid ${isPrimary ? 'rgba(79,195,247,0.45)' : 'rgba(79,195,247,0.2)'}`,
              letterSpacing: '0.02em',
              userSelect: 'none',
            }}
          >
            {label.text}
          </div>
        );
      })}
    </div>
  );
}
