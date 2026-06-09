/**
 * Single settings dialog for an Automate Script block — consolidates Auto/
 * Manual run, view-mode (code vs HTML), the library picker entry-point and
 * a new per-script tag list into one place. Previously these were scattered
 * across the block header (autorun + view mode) and the fullscreen dialog
 * title bar (library button), so a casual user had no obvious "where do I
 * configure this block?" surface. One ⚙ button → one dialog.
 *
 * The dialog itself is dumb — it owns no persistence. Every change is
 * forwarded through the corresponding callback so the host can run
 * `updateAttributes(...)` on the TipTap node and let Markdown round-tripping
 * happen as usual.
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  Switch,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Chip,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Slider,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import HtmlIcon from '@mui/icons-material/Html';
import LibraryAddIcon from '@mui/icons-material/LibraryAdd';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import HeightIcon from '@mui/icons-material/Height';

/** Sensible bounds for the windowHeight slider. Below 150px the header
 *  alone barely fits; above 1200px the block would scroll the document
 *  by itself which defeats the embedded-component story. */
const WINDOW_HEIGHT_MIN = 150;
const WINDOW_HEIGHT_MAX = 1200;
const WINDOW_HEIGHT_DEFAULT_FIXED = 360;

export interface AutomateScriptSettingsDialogProps {
  open: boolean;
  onClose: () => void;

  /** Current attribute values — read by the dialog at open time and kept
   *  in sync via the on*Change callbacks. */
  autorun: boolean;
  viewMode: 'code' | 'html';
  tags: string[];
  /** Component height in px for the in-document view. `null` = auto-size
   *  (textarea grows up to ~400px, output panel up to 300px). When a
   *  number, the whole block becomes a fixed-height flex column. */
  windowHeight: number | null;

  /** Persistence callbacks — implementations typically call
   *  updateAttributes({...}) on the host TipTap node. */
  onAutorunChange: (next: boolean) => void;
  onViewModeChange: (next: 'code' | 'html') => void;
  onTagsChange: (next: string[]) => void;
  onWindowHeightChange: (next: number | null) => void;

  /** Opens the library picker dialog. Kept as a separate entry-point
   *  because the picker has its own state machine and code-rewriting
   *  side effects — folding it into this dialog would tangle two
   *  unrelated workflows. */
  onOpenLibraryPicker: () => void;
}

const AutomateScriptSettingsDialog: React.FC<AutomateScriptSettingsDialogProps> = ({
  open,
  onClose,
  autorun,
  viewMode,
  tags,
  windowHeight,
  onAutorunChange,
  onViewModeChange,
  onTagsChange,
  onWindowHeightChange,
  onOpenLibraryPicker,
}) => {
  // Slider drives the height directly via the change callback. We also
  // accept a hand-typed value (TextField) — useful when the user wants an
  // exact pixel count. Both stay clamped to [MIN, MAX].
  const clampHeight = (n: number): number =>
    Math.max(WINDOW_HEIGHT_MIN, Math.min(WINDOW_HEIGHT_MAX, Math.round(n)));
  // Local draft for the in-progress tag input — committed on Enter or "+".
  // We don't want every keystroke to fire onTagsChange (would thrash both
  // React tree and Markdown roundtrip).
  const [tagDraft, setTagDraft] = useState('');

  const commitTag = useCallback(() => {
    const trimmed = tagDraft.trim();
    if (!trimmed) return;
    // Reject commas — the Markdown serializer uses `,` as the tag separator
    // in the fence param token, and embedded commas would silently split a
    // tag in two on the next roundtrip. Substitute hyphens — cheap and the
    // user will see immediately that something got normalised.
    const safe = trimmed.replace(/,/g, '-');
    if (tags.includes(safe)) {
      setTagDraft('');
      return;
    }
    onTagsChange([...tags, safe]);
    setTagDraft('');
  }, [tagDraft, tags, onTagsChange]);

  const removeTag = useCallback((tag: string) => {
    onTagsChange(tags.filter(t => t !== tag));
  }, [tags, onTagsChange]);

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTag();
    } else if (e.key === 'Backspace' && !tagDraft && tags.length > 0) {
      // Convenience: backspace on empty input deletes the last chip — same
      // pattern Gmail/Slack use for email/recipient chips.
      e.preventDefault();
      onTagsChange(tags.slice(0, -1));
    }
  }, [commitTag, tagDraft, tags, onTagsChange]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <SettingsIcon fontSize="small" />
        <Typography variant="subtitle1" fontWeight={600}>
          Ustawienia skryptu
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>

          {/* ── Auto on/off ─────────────────────────────────────────── */}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
              Uruchamianie
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={autorun}
                  onChange={e => onAutorunChange(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Auto-uruchom</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Skrypt wystartuje automatycznie po załadowaniu dokumentu.
                  </Typography>
                </Box>
              }
            />
          </Box>

          <Divider />

          {/* ── View mode ───────────────────────────────────────────── */}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Widok w dokumencie
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              size="small"
              onChange={(_, next) => { if (next) onViewModeChange(next); }}
            >
              <ToggleButton value="code">
                <CodeIcon fontSize="small" sx={{ mr: 0.5 }} />
                Kod
              </ToggleButton>
              <ToggleButton value="html">
                <HtmlIcon fontSize="small" sx={{ mr: 0.5 }} />
                HTML
              </ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              {viewMode === 'code'
                ? 'Pokazuje pełną powierzchnię edytora skryptu.'
                : 'Pokazuje wyłącznie wyrenderowany wynik (display.html / display.dom).'}
            </Typography>
          </Box>

          <Divider />

          {/* ── Library picker entry ────────────────────────────────── */}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Biblioteki zewnętrzne
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<LibraryAddIcon />}
              onClick={onOpenLibraryPicker}
            >
              Użyj biblioteki…
            </Button>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Otwiera katalog (Three.js, Lit, …). Wybranie biblioteki wstawi do
              kodu marker <code>// @library: nazwa</code>.
            </Typography>
          </Box>

          <Divider />

          {/* ── Window height ───────────────────────────────────────── */}
          {/* Toggle between auto (current default — textarea grows up to
              ~400px, output panel adds itself below) and a fixed pixel
              height. Fixed mode is the right pick for embedded canvases
              (Three.js, Lit, dashboards) where you want a stable layout.
              Disabled-state slider/input greys out when in auto mode so
              the affordance is clear. */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <HeightIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              <Typography variant="body2" fontWeight={600}>
                Wysokość okna (widok MD)
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={windowHeight === null}
                  onChange={e => onWindowHeightChange(
                    e.target.checked ? null : clampHeight(windowHeight ?? WINDOW_HEIGHT_DEFAULT_FIXED),
                  )}
                />
              }
              label={
                <Typography variant="body2">
                  Auto-rozmiar {windowHeight === null && (
                    <Typography component="span" variant="caption" color="text.secondary">
                      (textarea rośnie do 400px, output panel do 300px)
                    </Typography>
                  )}
                </Typography>
              }
            />
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
              <Slider
                value={windowHeight ?? WINDOW_HEIGHT_DEFAULT_FIXED}
                min={WINDOW_HEIGHT_MIN}
                max={WINDOW_HEIGHT_MAX}
                step={10}
                disabled={windowHeight === null}
                onChange={(_, v) => onWindowHeightChange(clampHeight(Array.isArray(v) ? v[0] : v))}
                valueLabelDisplay="auto"
                valueLabelFormat={v => `${v}px`}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                type="number"
                disabled={windowHeight === null}
                value={windowHeight ?? WINDOW_HEIGHT_DEFAULT_FIXED}
                onChange={e => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) onWindowHeightChange(clampHeight(n));
                }}
                InputProps={{ endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>px</Typography> }}
                sx={{ width: 110 }}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Stała wysokość przydaje się dla embed-owanych canvas-ów (Three.js,
              Lit) — układ pozostaje stabilny, edytor i wynik dzielą się
              przestrzenią flex.
            </Typography>
          </Box>

          <Divider />

          {/* ── Tags ────────────────────────────────────────────────── */}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
              Tagi skryptu
            </Typography>
            <Box sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mb: 1,
              minHeight: 32,
              p: 0.5,
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}>
              {tags.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ p: 0.5 }}>
                  Brak tagów — dodaj poniżej.
                </Typography>
              ) : tags.map(tag => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  onDelete={() => removeTag(tag)}
                />
              ))}
            </Box>
            <Stack direction="row" spacing={1}>
              <TextField
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="np. demo, statystyki, backup"
                size="small"
                fullWidth
              />
              <Tooltip title="Dodaj tag (Enter)">
                <span>
                  <IconButton
                    size="small"
                    onClick={commitTag}
                    disabled={!tagDraft.trim()}
                    sx={{ border: 1, borderColor: 'divider' }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
              Tagi są zapisywane razem z blokiem w Markdown. Przydaje się do
              filtrowania / grupowania skryptów w przyszłych narzędziach.
            </Typography>
          </Box>

        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Gotowe</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutomateScriptSettingsDialog;
