import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AddIcon from '@mui/icons-material/Add';

const BOX = '─'; // U+2500 BOX DRAWINGS LIGHT HORIZONTAL

function makeStartMarker(filePath: string): string {
  return `// ${BOX.repeat(3)} included: ${filePath} ${BOX.repeat(3)}`;
}
function makeEndMarker(filePath: string): string {
  return `// ----- ${filePath}`;
}
function makeBlock(filePath: string, content: string): string {
  return `${makeStartMarker(filePath)}\n${content.trimEnd()}\n${makeEndMarker(filePath)}`;
}

/**
 * Remove an embedded block from the code string and return the cleaned code.
 * Strips one surrounding blank line (before or after) to avoid double-spacing.
 */
function removeBlock(code: string, filePath: string): string {
  const lines = code.split('\n');
  const sm = makeStartMarker(filePath);
  const em = makeEndMarker(filePath);
  const startLine = lines.findIndex(l => l === sm);
  if (startLine === -1) return code;
  const endLine = lines.findIndex((l, i) => i > startLine && l.trimEnd() === em);
  if (endLine === -1) return code;
  // Also eat a blank line immediately preceding the block.
  let from = startLine;
  if (from > 0 && lines[from - 1].trim() === '') from--;
  return [...lines.slice(0, from), ...lines.slice(endLine + 1)].join('\n');
}

/**
 * Insert or update an embedded script block so that it sits at the position
 * matching the order defined in allScripts (the array from scripts.json).
 *
 * Always removes the existing block first (if present), then re-inserts at
 * the correct position. This handles both fresh additions AND fixing scripts
 * that were previously embedded in the wrong order.
 *
 * Insertion algorithm:
 *  1. Find the closest PREDECESSOR (highest index < newIdx in allScripts) that
 *     is embedded → insert directly after its closing marker.
 *  2. Otherwise find the closest SUCCESSOR (lowest index > newIdx) →
 *     insert directly before its opening marker.
 *  3. Fallback: prepend at the very top of the code.
 */
export function embedOrUpdateScript(
  code: string,
  filePath: string,
  content: string,
  allScripts: string[] = [],
): string {
  // Always remove first so we can re-insert at the correct position
  // (this also handles "update content of already-embedded block").
  code = removeBlock(code, filePath);

  const block = makeBlock(filePath, content);
  const newIdx = allScripts.indexOf(filePath);

  if (newIdx !== -1 && allScripts.length > 1) {
    type EmbedPos = { scriptIdx: number; start: number; end: number };
    const embedded: EmbedPos[] = [];
    for (let i = 0; i < allScripts.length; i++) {
      if (i === newIdx) continue;
      const sm = makeStartMarker(allScripts[i]);
      const em = makeEndMarker(allScripts[i]);
      const s = code.indexOf(sm);
      if (s === -1) continue;
      const e = code.indexOf(em, s);
      if (e === -1) continue;
      embedded.push({ scriptIdx: i, start: s, end: e + em.length });
    }

    if (embedded.length > 0) {
      // Closest predecessor (highest index < newIdx) → insert after it.
      const predecessors = embedded.filter(e => e.scriptIdx < newIdx);
      if (predecessors.length > 0) {
        const pred = predecessors.reduce((a, b) => a.scriptIdx > b.scriptIdx ? a : b);
        return code.slice(0, pred.end) + '\n' + block + code.slice(pred.end);
      }

      // Closest successor (lowest index > newIdx) → insert before it.
      const successors = embedded.filter(e => e.scriptIdx > newIdx);
      if (successors.length > 0) {
        const succ = successors.reduce((a, b) => a.scriptIdx < b.scriptIdx ? a : b);
        return code.slice(0, succ.start) + block + '\n' + code.slice(succ.start);
      }
    }
  }

  // Fallback: prepend.
  return code ? block + '\n' + code : block;
}

function isEmbedded(code: string, filePath: string): boolean {
  return code.includes(makeStartMarker(filePath));
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentCode: string;
  onChange: (newCode: string) => void;
}

const AutomateUpdateScriptDialog: React.FC<Props> = ({ open, onClose, currentCode, onChange }) => {
  const [scripts, setScripts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/browser-scripts')
      .then(r => r.json())
      .then((data: { scripts?: string[] }) => setScripts(data.scripts ?? []))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const handleEmbed = async (filePath: string) => {
    setUpdating(prev => new Set(prev).add(filePath));
    try {
      const res = await fetch(`/api/browser-scripts/content?path=${encodeURIComponent(filePath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const content = await res.text();
      onChange(embedOrUpdateScript(currentCode, filePath, content, scripts));
    } catch (e: unknown) {
      setError(String(e));
    } finally {
      setUpdating(prev => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <SystemUpdateAltIcon fontSize="small" />
        Update Script
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={32} />
          </Box>
        )}
        {error && <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>}
        {!loading && !error && scripts.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No scripts found in scripts.json.
          </Typography>
        )}
        {!loading && scripts.length > 0 && (
          <List dense disablePadding>
            {scripts.map((filePath, idx) => {
              const name = filePath.split('/').pop() ?? filePath;
              const dir = filePath.split('/').slice(0, -1).join('/');
              const embedded = isEmbedded(currentCode, filePath);
              const busy = updating.has(filePath);
              return (
                <ListItem
                  key={filePath}
                  divider={idx < scripts.length - 1}
                  sx={{ pr: 14 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600}>{name}</Typography>
                        {embedded && (
                          <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: '0.85rem !important' }} />}
                            label="embedded"
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.68rem' }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }}
                      >
                        {dir}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Button
                      size="small"
                      variant={embedded ? 'outlined' : 'contained'}
                      startIcon={
                        busy
                          ? <CircularProgress size={12} />
                          : embedded
                            ? <SystemUpdateAltIcon sx={{ fontSize: '0.9rem !important' }} />
                            : <AddIcon sx={{ fontSize: '0.9rem !important' }} />
                      }
                      onClick={() => void handleEmbed(filePath)}
                      disabled={busy}
                      sx={{ minWidth: 90 }}
                    >
                      {embedded ? 'Update' : 'Add'}
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} size="small">Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutomateUpdateScriptDialog;
