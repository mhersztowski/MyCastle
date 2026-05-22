import { forwardRef, useImperativeHandle } from 'react';
import type { VfsProjectContext } from './types';
import type { OutputLine } from './project/types';

/* ── Icons ── */

function IconClear() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

/* ── Line type → color ── */

const lineColors: Record<OutputLine['type'], string> = {
  normal:  '#cccccc',
  error:   '#f48771',
  warning: '#dcdcaa',
  success: '#89d185',
  command: '#888888',
};

/* ── Public handle ── */

export interface ProjectPanelHandle {
  /** Scroll output to bottom (called when new lines arrive) */
  scrollToBottom(): void;
}

/* ── Props ── */

export interface ProjectPanelProps {
  context: VfsProjectContext | null;
  outputLines: OutputLine[];
  running: boolean;
  lastStatus: 'success' | 'error' | null;
  outputOpen: boolean;
  onToggleOutput(): void;
  onClearOutput(): void;
  onStop(): void;
  outputEndRef: React.RefObject<HTMLDivElement | null>;
}

/* ── Component ── */

export const ProjectPanel = forwardRef<ProjectPanelHandle, ProjectPanelProps>(
  function ProjectPanel(
    { context, outputLines, running, lastStatus, outputOpen, onToggleOutput, onClearOutput, onStop, outputEndRef },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      scrollToBottom() {
        outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      },
    }));

    if (!context) return null;

    const statusBorder = lastStatus === 'success' ? '#2d5a2d' :
                         lastStatus === 'error'   ? '#5a1a1a' : '#3c3c3c';
    const statusBg     = lastStatus === 'success' ? '#1a2e1a' :
                         lastStatus === 'error'   ? '#2e1a1a' : '#1e1e1e';

    return (
      <>
        {/* ── Project info strip ── */}
        <div style={{
          borderTop: `1px solid ${statusBorder}`,
          background: statusBg,
          flexShrink: 0,
          transition: 'background 300ms, border-color 300ms',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px 2px' }}>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#666', flexGrow: 1 }}>
              Project
            </span>
            {running && (
              <button onClick={onStop} title="Stop" style={iconBtnStyle('#f48771')}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="3" y="3" width="10" height="10" rx="1" />
                </svg>
              </button>
            )}
            {outputLines.length > 0 && (
              <button onClick={onToggleOutput} title={outputOpen ? 'Hide output' : 'Show output'} style={iconBtnStyle(outputOpen ? '#ccc' : '#666')}>
                <IconChevron open={outputOpen} />
              </button>
            )}
          </div>

          {/* Name */}
          <div style={{ padding: '0 8px 4px', fontSize: 12, color: '#ccc', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {context.name}
          </div>

          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 8px 6px' }}>
            <Badge color="#0e639c" text={context.platform} />
            <Badge color="#3a3a3a" text={context.language} />
            {context.boardProfileKey && <Badge color="#2a2a2a" text={context.boardProfileKey} mono />}
          </div>
        </div>

        {/* ── Output terminal ── */}
        {outputOpen && outputLines.length > 0 && (
          <div style={{ flexShrink: 0, maxHeight: 200, display: 'flex', flexDirection: 'column', background: '#0d1117', borderTop: '1px solid #3c3c3c' }}>
            {/* Terminal header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 6px', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: '#555', flexGrow: 1, fontFamily: 'monospace' }}>OUTPUT</span>
              {running && <span style={{ color: '#aaa', marginRight: 6 }}><Spinner /></span>}
              <button onClick={onClearOutput} title="Clear output" style={iconBtnStyle('#555')}>
                <IconClear />
              </button>
            </div>
            {/* Lines */}
            <div style={{ overflowY: 'auto', flexGrow: 1, padding: '4px 0' }}>
              {outputLines.map((line, i) => (
                <div key={i} style={{
                  fontFamily: 'Consolas, "Courier New", monospace',
                  fontSize: 11, lineHeight: '16px', padding: '0 8px',
                  color: lineColors[line.type],
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {line.text}
                </div>
              ))}
              <div ref={outputEndRef as React.RefObject<HTMLDivElement>} />
            </div>
          </div>
        )}
      </>
    );
  },
);

/* ── Helpers ── */

function Badge({ color, text, mono }: { color: string; text: string; mono?: boolean }) {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 3,
      background: color, color: mono ? '#888' : '#c5c5c5',
      fontFamily: mono ? 'monospace' : 'inherit', fontWeight: 500,
    }}>
      {text}
    </span>
  );
}

function iconBtnStyle(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', cursor: 'pointer', color, padding: '2px 3px', display: 'inline-flex', alignItems: 'center', borderRadius: 2 };
}
