/**
 * Graphical (form-based) JSON editor for the Drive right panel + a dialog to
 * pick / change the JSON Schema bound to a `.json` file.
 *
 * A file is bound to a schema via a top-level `$schema` property holding a
 * drive-relative path (e.g. `global/json-schema/trip.schema.json`). The form is
 * rendered by react-jsonschema-form (@rjsf/mui) with live ajv validation.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Alert, CircularProgress, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, List, ListItemButton, ListItemText, Typography, Radio,
  ThemeProvider, createTheme, useTheme,
} from '@mui/material';
import Form from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { readText, writeText, listDir, SCHEMA_DIR } from './driveVfsClient';

// ── Schema binding helpers ────────────────────────────────────────────────

/** Read the `$schema` binding from a JSON file's parsed content, if any. */
export function schemaRefOf(parsed: unknown): string | null {
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const s = (parsed as Record<string, unknown>).$schema;
    // Only treat OUR drive-relative refs as a graphical binding — a bare
    // "http://json-schema.org/..." meta-schema URL must not trigger the form.
    if (typeof s === 'string' && s && !/^https?:\/\//i.test(s)) return s;
  }
  return null;
}

/** Does this JSON text declare a (drive-relative) `$schema` binding? */
export function jsonHasSchemaBinding(text: string): boolean {
  try { return schemaRefOf(JSON.parse(text)) !== null; } catch { return false; }
}

const normSchemaRel = (ref: string) => ref.replace(/^\/+/, '');

// ── Schema picker dialog ──────────────────────────────────────────────────

interface SchemaPickerDialogProps {
  open: boolean;
  userName: string;
  current?: string | null;
  onClose: () => void;
  onSelect: (schemaRel: string | null) => void;
}

export const SchemaPickerDialog: React.FC<SchemaPickerDialogProps> = ({
  open, userName, current, onClose, onSelect,
}) => {
  const [files, setFiles] = useState<string[] | null>(null);
  const [sel, setSel] = useState<string | null>(current ?? null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSel(current ?? null);
    setErr(null);
    setFiles(null);
    (async () => {
      try {
        const entries = await listDir(userName, SCHEMA_DIR);
        setFiles(entries.filter((e) => e.type !== 2 && /\.json$/i.test(e.name)).map((e) => e.name));
      } catch (e) {
        setErr((e as Error).message);
        setFiles([]);
      }
    })();
  }, [open, userName, current]);

  const relFor = (name: string) => `${SCHEMA_DIR}/${name}`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Zmień schema</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary">
          Schematy z <code>{SCHEMA_DIR}/</code>. Wybór zapisze <code>$schema</code> w pliku JSON.
        </Typography>
        {err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
        {files === null ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={22} /></Box>
        ) : files.length === 0 ? (
          <Alert severity="info" sx={{ mt: 1 }}>
            Brak schematów w <code>{SCHEMA_DIR}/</code>. Utwórz plik <code>*.schema.json</code> w tym katalogu.
          </Alert>
        ) : (
          <List dense sx={{ mt: 1 }}>
            {files.map((name) => {
              const rel = relFor(name);
              return (
                <ListItemButton key={name} selected={sel === rel} onClick={() => setSel(rel)}>
                  <Radio edge="start" checked={sel === rel} tabIndex={-1} disableRipple size="small" />
                  <ListItemText primary={name} secondary={rel} />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        {current && (
          <Button color="error" onClick={() => onSelect(null)} sx={{ mr: 'auto' }}>
            Usuń powiązanie
          </Button>
        )}
        <Button onClick={onClose}>Anuluj</Button>
        <Button variant="contained" disabled={!sel} onClick={() => sel && onSelect(sel)}>Wybierz</Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Graphical form panel ──────────────────────────────────────────────────

interface JsonSchemaFormPanelProps {
  userName: string;
  /** Drive-relative path of the JSON data file. */
  rel: string;
}

// Serialize the edited data back to file, re-attaching the `$schema` binding
// (rjsf strips unknown top-level keys under additionalProperties:false).
const serialize = (schemaRel: string | null, data: unknown) =>
  JSON.stringify(schemaRel ? { $schema: schemaRel, ...(data as object) } : data, null, 2) + '\n';

// Tighten every field the rjsf/mui theme renders: small inputs, dense margins,
// small buttons/checkboxes. Merged onto the app theme so dark mode etc. carry over.
function useCompactFormTheme() {
  const outer = useTheme();
  return useMemo(() => createTheme(outer, {
    components: {
      MuiTextField: { defaultProps: { size: 'small', margin: 'none' } },
      MuiFormControl: { defaultProps: { size: 'small', margin: 'none' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiButton: { defaultProps: { size: 'small' } },
      MuiIconButton: { defaultProps: { size: 'small' } },
      MuiCheckbox: { defaultProps: { size: 'small' } },
      MuiRadio: { defaultProps: { size: 'small' } },
    },
  }), [outer]);
}

// Compact spacing/typography overrides applied to the form subtree.
const COMPACT_SX = {
  // rjsf/mui stacks each field in a Grid with spacing={2} (16px gutters) — the
  // main source of the tall gaps. Collapse the container's negative margin and
  // the item top-padding to a tight rhythm.
  '& .MuiGrid-root.MuiGrid-container': { mt: 0, rowGap: 0 },
  '& .MuiGrid-root.MuiGrid-item': { pt: '3px', pb: 0 },
  '& .MuiFormControl-root': { my: 0 },
  '& .MuiInputBase-input': { fontSize: 13, py: '5px' },
  '& .MuiInputLabel-root': { fontSize: 13 },
  '& .MuiFormHelperText-root': { fontSize: 11, mt: 0.25, mb: 0 },
  '& .MuiTypography-h5': { fontSize: '0.95rem', fontWeight: 600, mt: 0.5, mb: 0.25 },
  '& .MuiTypography-h6': { fontSize: '0.85rem', fontWeight: 600, mt: 0.25, mb: 0 },
  // section separators + array-item wrappers — trim padding/margins
  '& hr, & .MuiDivider-root': { my: 0.5 },
  '& .MuiPaper-root': { p: 1, my: 0.5 },
} as const;

export const JsonSchemaFormPanel: React.FC<JsonSchemaFormPanelProps> = ({ userName, rel }) => {
  const compactTheme = useCompactFormTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [schemaRel, setSchemaRel] = useState<string | null>(null);
  const [formData, setFormData] = useState<unknown>(undefined);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setSchema(null); setFormData(undefined);
    (async () => {
      try {
        const parsed = JSON.parse(await readText(userName, rel));
        const sref = schemaRefOf(parsed);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { $schema, ...rest } = parsed as Record<string, unknown>;
        if (!alive) return;
        setFormData(rest);
        setSchemaRel(sref);
        if (sref) {
          const sch = JSON.parse(await readText(userName, normSchemaRel(sref)));
          // ajv8 (rjsf default) is draft-07; drop the 2020-12 $schema meta ref
          // so it uses its own meta — $defs/$ref still resolve structurally.
          delete sch.$schema;
          if (alive) setSchema(sch);
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [userName, rel]);

  const scheduleSave = useCallback((data: unknown) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await writeText(userName, rel, serialize(schemaRel, data));
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      })();
    }, 800);
  }, [userName, rel, schemaRel]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 2 }}><Alert severity="error">Nie udało się wczytać: {error}</Alert></Box>;
  }
  if (!schema) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Ten plik nie ma powiązanego schematu (<code>$schema</code>). Użyj przycisku „Zmień schema", aby wybrać schemat i włączyć edycję graficzną.
        </Alert>
      </Box>
    );
  }

  const uiSchema: UiSchema = { 'ui:submitButtonOptions': { norender: true } };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ px: 1.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          schemat: <code>{schemaRel}</code>
        </Typography>
        <Chip size="small" variant="outlined"
          color={saveState === 'error' ? 'error' : saveState === 'saving' ? 'warning' : 'success'}
          label={saveState === 'saving' ? 'Zapisywanie…' : saveState === 'error' ? 'Błąd zapisu' : 'Zapisano'}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5, ...COMPACT_SX }}>
        <ThemeProvider theme={compactTheme}>
          <Form
            schema={schema}
            uiSchema={uiSchema}
            formData={formData}
            validator={validator}
            liveValidate
            showErrorList="bottom"
            omitExtraData
            onChange={(e) => { setFormData(e.formData); scheduleSave(e.formData); }}
          />
        </ThemeProvider>
      </Box>
    </Box>
  );
};

export default JsonSchemaFormPanel;
