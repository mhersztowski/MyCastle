import { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { MjdDocument, MjdFieldDef, MjdFieldType, MjdViewDef } from '@mhersztowski/core';
import { createMjdField, createMjdView, generateJsonSchema } from '@mhersztowski/core';

export interface MjdDefEditorProps {
  value: MjdDocument;
  onChange: (doc: MjdDocument) => void;
}

const FIELD_TYPES: MjdFieldType[] = ['string', 'number', 'boolean', 'date', 'enum', 'array'];

// --- Sub-components ---

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{title}</Typography>
        {action}
      </Box>
      {children}
    </Box>
  );
}

function TagManager({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {tags.map((t) => (
        <Chip key={t} label={t} size="small" onDelete={() => onChange(tags.filter((x) => x !== t))} />
      ))}
      <TextField
        size="small"
        placeholder="New tag..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        sx={{ width: 120 }}
      />
      <Button size="small" onClick={addTag} disabled={!input.trim()}>Add</Button>
    </Box>
  );
}

function FieldRow({
  field,
  index,
  allTags,
  onUpdate,
  onDelete,
}: {
  field: MjdFieldDef;
  index: number;
  allTags: string[];
  onUpdate: (index: number, field: MjdFieldDef) => void;
  onDelete: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [enumInput, setEnumInput] = useState('');

  const update = (partial: Partial<MjdFieldDef>) => {
    onUpdate(index, { ...field, ...partial });
  };

  const handleTypeChange = (type: MjdFieldType) => {
    const updated: Partial<MjdFieldDef> = { type };
    if (type === 'enum' && !field.options) updated.options = [];
    if (type === 'array' && !field.itemType) updated.itemType = 'string';
    if (type !== 'enum') updated.options = undefined;
    if (type !== 'array') updated.itemType = undefined;
    update(updated);
  };

  const addEnumOption = () => {
    const opt = enumInput.trim();
    if (opt && !(field.options ?? []).includes(opt)) {
      update({ options: [...(field.options ?? []), opt] });
    }
    setEnumInput('');
  };

  const toggleTag = (tag: string) => {
    const tags = field.tags.includes(tag)
      ? field.tags.filter((t) => t !== tag)
      : [...field.tags, tag];
    update({ tags });
  };

  return (
    <>
      <TableRow hover onClick={() => setExpanded(!expanded)} sx={{ cursor: 'pointer' }}>
        <TableCell>{field.name}</TableCell>
        <TableCell>
          <Chip label={field.type} size="small" variant="outlined" />
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {field.tags.map((t) => <Chip key={t} label={t} size="small" />)}
          </Box>
        </TableCell>
        <TableCell align="right">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(index); }} title="Delete">
            <Typography variant="body2">\u2715</Typography>
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={4} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
          <Collapse in={expanded}>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField
                  label="Name"
                  size="small"
                  value={field.name}
                  onChange={(e) => update({ name: e.target.value })}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Label"
                  size="small"
                  value={field.label ?? ''}
                  onChange={(e) => update({ label: e.target.value || undefined })}
                  sx={{ flex: 1 }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={field.type}
                    label="Type"
                    onChange={(e) => handleTypeChange(e.target.value as MjdFieldType)}
                  >
                    {FIELD_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>

              <TextField
                label="Description"
                size="small"
                value={field.description ?? ''}
                onChange={(e) => update({ description: e.target.value || undefined })}
                fullWidth
              />

              <FormControlLabel
                control={<Switch checked={field.required ?? false} onChange={(e) => update({ required: e.target.checked })} />}
                label="Required"
              />

              {/* Tags */}
              <Box>
                <Typography variant="caption" color="text.secondary">Tags</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {allTags.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      size="small"
                      color={field.tags.includes(t) ? 'primary' : 'default'}
                      onClick={() => toggleTag(t)}
                    />
                  ))}
                  {allTags.length === 0 && (
                    <Typography variant="caption" color="text.secondary">No tags defined yet</Typography>
                  )}
                </Box>
              </Box>

              {/* Enum options */}
              {field.type === 'enum' && (
                <Box>
                  <Typography variant="caption" color="text.secondary">Enum options</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
                    {(field.options ?? []).map((opt) => (
                      <Chip
                        key={opt}
                        label={opt}
                        size="small"
                        onDelete={() => update({ options: (field.options ?? []).filter((o) => o !== opt) })}
                      />
                    ))}
                    <TextField
                      size="small"
                      placeholder="Add option..."
                      value={enumInput}
                      onChange={(e) => setEnumInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEnumOption(); } }}
                      sx={{ width: 120 }}
                    />
                    <Button size="small" onClick={addEnumOption} disabled={!enumInput.trim()}>Add</Button>
                  </Box>
                </Box>
              )}

              {/* Array item type */}
              {field.type === 'array' && (
                <FormControl size="small" sx={{ maxWidth: 200 }}>
                  <InputLabel>Item type</InputLabel>
                  <Select
                    value={field.itemType ?? 'string'}
                    label="Item type"
                    onChange={(e) => update({ itemType: e.target.value as MjdFieldType })}
                  >
                    {FIELD_TYPES.filter((t) => t !== 'array').map((t) => (
                      <MenuItem key={t} value={t}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

function ViewRow({
  view,
  index,
  allTags,
  onUpdate,
  onDelete,
}: {
  view: MjdViewDef;
  index: number;
  allTags: string[];
  onUpdate: (index: number, view: MjdViewDef) => void;
  onDelete: (index: number) => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <TableRow hover>
      <TableCell>
        {editing ? (
          <TextField
            size="small"
            value={view.name}
            onChange={(e) => onUpdate(index, { ...view, name: e.target.value })}
            onBlur={() => setEditing(false)}
            autoFocus
          />
        ) : (
          <Typography variant="body2" onClick={() => setEditing(true)} sx={{ cursor: 'pointer' }}>
            {view.name}
          </Typography>
        )}
      </TableCell>
      <TableCell>{view.type}</TableCell>
      <TableCell>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select
            value={view.tag}
            onChange={(e) => onUpdate(index, { ...view, tag: e.target.value })}
          >
            {allTags.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
      </TableCell>
      <TableCell align="right">
        <IconButton size="small" onClick={() => onDelete(index)} title="Delete">
          <Typography variant="body2">{'\u2715'}</Typography>
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

// --- Main Component ---

export function MjdDefEditor({ value, onChange }: MjdDefEditorProps) {
  const [output, setOutput] = useState<{ type: 'mjd' | 'schema'; content: string } | null>(null);

  const updateField = useCallback((index: number, field: MjdFieldDef) => {
    const fields = [...value.fields];
    fields[index] = field;
    onChange({ ...value, fields });
  }, [value, onChange]);

  const deleteField = useCallback((index: number) => {
    onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) });
  }, [value, onChange]);

  const addField = useCallback(() => {
    const name = `field${value.fields.length + 1}`;
    onChange({ ...value, fields: [...value.fields, createMjdField(name, 'string')] });
  }, [value, onChange]);

  const updateView = useCallback((index: number, view: MjdViewDef) => {
    const views = [...value.views];
    views[index] = view;
    onChange({ ...value, views });
  }, [value, onChange]);

  const deleteView = useCallback((index: number) => {
    onChange({ ...value, views: value.views.filter((_, i) => i !== index) });
  }, [value, onChange]);

  const addView = useCallback(() => {
    const tag = value.tags[0] ?? '';
    onChange({ ...value, views: [...value.views, createMjdView(`View ${value.views.length + 1}`, tag)] });
  }, [value, onChange]);

  const handleGenerateMjd = useCallback(() => {
    setOutput({ type: 'mjd', content: JSON.stringify(value, null, 2) });
  }, [value]);

  const handleGenerateSchema = useCallback(() => {
    const schema = generateJsonSchema(value);
    setOutput({ type: 'schema', content: JSON.stringify(schema, null, 2) });
  }, [value]);

  const copyOutput = useMemo(() => () => {
    if (output) navigator.clipboard?.writeText(output.content);
  }, [output]);

  return (
    <Box sx={{ p: 2 }}>
      {/* Version */}
      <Section title="Version">
        <TextField
          size="small"
          value={value.version}
          onChange={(e) => onChange({ ...value, version: e.target.value })}
          sx={{ width: 120 }}
        />
      </Section>

      {/* Tags */}
      <Section title="Tags">
        <TagManager tags={value.tags} onChange={(tags) => onChange({ ...value, tags })} />
      </Section>

      {/* Fields */}
      <Section title="Fields" action={<Button size="small" onClick={addField}>+ Add Field</Button>}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Tags</TableCell>
              <TableCell align="right" width={50} />
            </TableRow>
          </TableHead>
          <TableBody>
            {value.fields.map((field, i) => (
              <FieldRow
                key={`${field.name}-${i}`}
                field={field}
                index={i}
                allTags={value.tags}
                onUpdate={updateField}
                onDelete={deleteField}
              />
            ))}
            {value.fields.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">No fields defined</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      {/* Views */}
      <Section title="Views" action={<Button size="small" onClick={addView} disabled={value.tags.length === 0}>+ Add View</Button>}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Tag</TableCell>
              <TableCell align="right" width={50} />
            </TableRow>
          </TableHead>
          <TableBody>
            {value.views.map((view, i) => (
              <ViewRow
                key={`${view.name}-${i}`}
                view={view}
                index={i}
                allTags={value.tags}
                onUpdate={updateView}
                onDelete={deleteView}
              />
            ))}
            {value.views.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">No views defined</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Section>

      {/* Actions */}
      <Section title="Generate">
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={handleGenerateMjd}>Generate .mjd</Button>
          <Button variant="outlined" size="small" onClick={handleGenerateSchema}>Generate JSON Schema</Button>
        </Box>
      </Section>

      {/* Output */}
      {output && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2">
              {output.type === 'mjd' ? 'MJD Definition' : 'JSON Schema (draft-07)'}
            </Typography>
            <Button size="small" onClick={copyOutput}>Copy</Button>
            <Button size="small" onClick={() => setOutput(null)}>Close</Button>
          </Box>
          <Box
            sx={{
              bgcolor: '#1e1e1e',
              color: '#d4d4d4',
              p: 2,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'pre',
              overflow: 'auto',
              maxHeight: 400,
            }}
          >
            {output.content}
          </Box>
        </Box>
      )}
    </Box>
  );
}
