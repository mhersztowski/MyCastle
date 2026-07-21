/**
 * "Moje elementy" — CRUD dialog for the user's personal library of electronic
 * parts. A form (top) edits one element at a time; a live text filter narrows
 * the list; the list itself is grouped by category, and categories are ordered
 * by an assignable weight. The library (categories + elements) is loaded from
 * and saved to the VFS ({@link loadLibrary} / {@link saveLibrary}).
 */

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Button, IconButton, TextField, Autocomplete, MenuItem, InputAdornment,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Typography, Tooltip, CircularProgress, Alert, Collapse,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  type MyElement, type Category, type MyElementsLibrary,
  COMPONENT_TYPES, VALUE_UNITS, PACKAGE_TYPES,
  isValidLcsc, loadLibrary, saveLibrary,
} from '../../electronics/myElements';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided, each row shows an "insert" action that places the element on the sheet/PCB. */
  onInsert?: (el: MyElement) => void;
  /** When provided, an element's LCSC number renders its EasyEDA symbol/footprint preview. */
  renderLcscPreview?: (lcsc: string) => ReactNode;
}

/** Label used for elements with no category assigned. */
const UNCATEGORISED = 'Bez kategorii';

/** A blank draft used both for "add new" and as the reset state after saving. */
function emptyDraft(): MyElement {
  return {
    id: '',
    name: '',
    description: '',
    componentType: '',
    value: '',
    valueUnit: '—',
    packageType: '',
    mpn: '',
    lcsc: '',
    category: '',
    quantity: 0,
  };
}

/** One searchable blob per element so the text filter can match any field. */
function haystack(e: MyElement): string {
  return [e.name, e.description, e.componentType, e.value, e.valueUnit, e.packageType, e.mpn, e.lcsc, e.category, String(e.quantity)]
    .join(' ')
    .toLowerCase();
}

export function MyElementsDialog({ open, onClose, onInsert, renderLcscPreview }: Props) {
  const [elements, setElements] = useState<MyElement[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<MyElement>(emptyDraft);
  const [filter, setFilter] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [previewLcsc, setPreviewLcsc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the library each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadLibrary()
      .then(lib => {
        if (cancelled) return;
        setElements(lib.elements);
        setCategories(lib.categories);
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const isEditing = draft.id !== '';
  const lcscValid = isValidLcsc(draft.lcsc);
  const canSave = draft.name.trim() !== '' && lcscValid;

  const patch = useCallback((p: Partial<MyElement>) => setDraft(d => ({ ...d, ...p })), []);
  const resetForm = useCallback(() => setDraft(emptyDraft()), []);

  const toggleCollapse = useCallback((name: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  }), []);

  // Category names in display (weight) order — used for the form's picker.
  const orderedCategoryNames = useMemo(
    () => [...categories].sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name)).map(c => c.name),
    [categories],
  );

  // Persist a whole library to the VFS and reflect it in local state.
  const persist = useCallback(async (nextElements: MyElement[], nextCategories: Category[]) => {
    setSaving(true);
    setError(null);
    const lib: MyElementsLibrary = { categories: nextCategories, elements: nextElements };
    try {
      await saveLibrary(lib);
      setElements(nextElements);
      setCategories(nextCategories);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  // ── element CRUD ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!canSave) return;
    const cat = draft.category.trim();
    const clean: MyElement = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      lcsc: draft.lcsc.trim(),
      mpn: draft.mpn.trim(),
      category: cat,
    };
    const nextElements = isEditing
      ? elements.map(e => (e.id === clean.id ? clean : e))
      : [...elements, clean];
    // Auto-register a brand-new category name (appended at the end by weight).
    let nextCategories = categories;
    if (cat && !categories.some(c => c.name === cat)) {
      const maxWeight = categories.reduce((m, c) => Math.max(m, c.weight), -1);
      nextCategories = [...categories, { name: cat, weight: maxWeight + 1 }];
    }
    try {
      await persist(nextElements, nextCategories);
      resetForm();
    } catch { /* error already surfaced */ }
  }, [canSave, draft, isEditing, elements, categories, persist, resetForm]);

  const handleEdit = useCallback((el: MyElement) => setDraft({ ...el }), []);

  const handleDelete = useCallback(async (id: string) => {
    const next = elements.filter(e => e.id !== id);
    try {
      await persist(next, categories);
      setDraft(d => (d.id === id ? emptyDraft() : d));
    } catch { /* error already surfaced */ }
  }, [elements, categories, persist]);

  // ── category management ───────────────────────────────────────────────────────

  const addCategory = useCallback(async () => {
    const name = newCategory.trim();
    if (!name || categories.some(c => c.name === name)) return;
    const maxWeight = categories.reduce((m, c) => Math.max(m, c.weight), -1);
    try {
      await persist(elements, [...categories, { name, weight: maxWeight + 1 }]);
      setNewCategory('');
    } catch { /* error already surfaced */ }
  }, [newCategory, categories, elements, persist]);

  const setCategoryWeight = useCallback(async (name: string, weight: number) => {
    const next = categories.map(c => (c.name === name ? { ...c, weight } : c));
    try { await persist(elements, next); } catch { /* surfaced */ }
  }, [categories, elements, persist]);

  const deleteCategory = useCallback(async (name: string) => {
    const nextCategories = categories.filter(c => c.name !== name);
    // Detach the deleted category from any element that still references it.
    const nextElements = elements.map(e => (e.category === name ? { ...e, category: '' } : e));
    try { await persist(nextElements, nextCategories); } catch { /* surfaced */ }
  }, [categories, elements, persist]);

  // ── grouped + filtered view ───────────────────────────────────────────────────

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = needle ? elements.filter(e => haystack(e).includes(needle)) : elements;

    const weightOf = (name: string): number => {
      if (name === '') return Number.MAX_SAFE_INTEGER;              // uncategorised → last
      const c = categories.find(cat => cat.name === name);
      return c ? c.weight : Number.MAX_SAFE_INTEGER - 1;            // unknown category → just before uncategorised
    };

    const byName = new Map<string, MyElement[]>();
    for (const e of visible) {
      const key = e.category ?? '';
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(e);
    }

    return [...byName.entries()]
      .map(([name, items]) => ({
        name,
        label: name === '' ? UNCATEGORISED : name,
        weight: weightOf(name),
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.weight - b.weight || a.label.localeCompare(b.label));
  }, [elements, categories, filter]);

  const totalVisible = groups.reduce((n, g) => n + g.items.length, 0);
  const orderedCategories = useMemo(
    () => [...categories].sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name)),
    [categories],
  );

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
        Moje elementy
        <Typography component="span" variant="caption" color="text.secondary">
          — osobista biblioteka części
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* ── Editor form ── */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 1.5,
            mb: 1,
          }}
        >
          <TextField
            label="Nazwa" size="small" required autoFocus
            value={draft.name}
            onChange={e => patch({ name: e.target.value })}
          />

          <Autocomplete
            freeSolo options={COMPONENT_TYPES} size="small"
            value={draft.componentType}
            onInputChange={(_, v) => patch({ componentType: v })}
            renderInput={p => <TextField {...p} label="Typ elementu" />}
          />

          <Autocomplete
            freeSolo options={orderedCategoryNames} size="small"
            value={draft.category}
            onInputChange={(_, v) => patch({ category: v })}
            renderInput={p => <TextField {...p} label="Kategoria" />}
          />

          <Autocomplete
            freeSolo options={PACKAGE_TYPES} size="small"
            value={draft.packageType}
            onInputChange={(_, v) => patch({ packageType: v })}
            renderInput={p => <TextField {...p} label="Obudowa" />}
          />

          {/* Wartość + jednostka w jednej komórce siatki */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Wartość" size="small" sx={{ flex: 1 }}
              value={draft.value}
              onChange={e => patch({ value: e.target.value })}
            />
            <TextField
              label="Jedn." size="small" select sx={{ width: 96 }}
              value={draft.valueUnit}
              onChange={e => patch({ valueUnit: e.target.value })}
            >
              {VALUE_UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
            </TextField>
          </Box>

          <TextField
            label="Ilość" size="small" type="number"
            value={draft.quantity}
            onChange={e => patch({ quantity: Math.max(0, Number(e.target.value) || 0) })}
            inputProps={{ min: 0 }}
          />

          <TextField
            label="Oznaczenie producenta (MPN)" size="small"
            value={draft.mpn}
            onChange={e => patch({ mpn: e.target.value })}
          />

          <TextField
            label="Numer LCSC" size="small"
            placeholder="C25804"
            value={draft.lcsc}
            error={!lcscValid}
            helperText={!lcscValid ? 'Musi zaczynać się od „C" i cyfr' : ' '}
            onChange={e => patch({ lcsc: e.target.value })}
          />

          <TextField
            label="Opis" size="small" multiline minRows={1}
            sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }}
            value={draft.description}
            onChange={e => patch({ description: e.target.value })}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button
            variant="contained" size="small"
            startIcon={<AddIcon />}
            disabled={!canSave || saving}
            onClick={handleSubmit}
          >
            {isEditing ? 'Zaktualizuj element' : 'Dodaj element'}
          </Button>
          {isEditing && (
            <Button size="small" onClick={resetForm} disabled={saving}>Anuluj edycję</Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button
            size="small" variant="outlined"
            startIcon={<LabelOutlinedIcon />}
            onClick={() => setShowCategories(v => !v)}
          >
            Kategorie
          </Button>
          {saving && <CircularProgress size={20} sx={{ alignSelf: 'center' }} />}
        </Box>

        {/* ── Category manager ── */}
        <Collapse in={showCategories} unmountOnExit>
          <Box sx={{ mb: 2, p: 1.5, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Kategorie (waga = kolejność na liście, rosnąco)
            </Typography>
            {orderedCategories.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Brak kategorii — dodaj pierwszą poniżej lub wpisz nazwę w polu „Kategoria" przy elemencie.
              </Typography>
            )}
            {orderedCategories.map(c => (
              <Box key={c.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <TextField
                  type="number" size="small" label="Waga" sx={{ width: 90 }}
                  value={c.weight}
                  onChange={e => setCategoryWeight(c.name, Number(e.target.value) || 0)}
                />
                <Typography sx={{ flex: 1 }}>{c.name}</Typography>
                <Tooltip title="Usuń kategorię">
                  <IconButton size="small" color="error" onClick={() => deleteCategory(c.name)}>
                    <DeleteOutlineIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                size="small" label="Nowa kategoria" sx={{ flex: 1, maxWidth: 280 }}
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
              />
              <Button size="small" startIcon={<AddIcon />} onClick={addCategory} disabled={!newCategory.trim()}>
                Dodaj
              </Button>
            </Box>
          </Box>
        </Collapse>

        {/* ── Filter ── */}
        <TextField
          fullWidth size="small" placeholder="Filtruj po nazwie, typie, wartości, obudowie, MPN, LCSC, kategorii…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          sx={{ mb: 1.5 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
            ),
            endAdornment: filter ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setFilter('')}><CloseIcon fontSize="small" /></IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

        {/* ── Library table, grouped by category ── */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : elements.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Brak elementów — dodaj pierwszą część powyżej.
          </Typography>
        ) : totalVisible === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            Brak elementów pasujących do filtra.
          </Typography>
        ) : (
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell>Wartość</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Obudowa</TableCell>
                  <TableCell>MPN</TableCell>
                  <TableCell>LCSC</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map(g => {
                  const isCollapsed = collapsed.has(g.name);
                  return (
                  <Fragment key={`grp-${g.name}`}>
                    <TableRow
                      hover
                      onClick={() => toggleCollapse(g.name)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell
                        colSpan={8}
                        sx={{ bgcolor: 'action.hover', fontWeight: 600, py: 0.5 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {isCollapsed
                            ? <KeyboardArrowRightIcon fontSize="small" />
                            : <KeyboardArrowDownIcon fontSize="small" />}
                          {g.label}
                          <Typography component="span" variant="caption" color="text.secondary">({g.items.length})</Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed && g.items.map(el => (
                      <TableRow key={el.id} hover selected={el.id === draft.id}>
                        <TableCell sx={{ pl: 4 }}>
                          {el.name}
                          {el.description && (
                            <Typography variant="caption" color="text.secondary" display="block" noWrap>
                              {el.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{el.componentType || '—'}</TableCell>
                        <TableCell>
                          {el.value ? `${el.value}${el.valueUnit && el.valueUnit !== '—' ? ' ' + el.valueUnit : ''}` : '—'}
                        </TableCell>
                        <TableCell align="right">{el.quantity}</TableCell>
                        <TableCell>{el.packageType || '—'}</TableCell>
                        <TableCell>{el.mpn || '—'}</TableCell>
                        <TableCell>{el.lcsc || '—'}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {renderLcscPreview && isValidLcsc(el.lcsc) && el.lcsc.trim() && (
                            <Tooltip title="Podgląd EasyEDA (symbol/footprint)">
                              <IconButton size="small" onClick={() => setPreviewLcsc(el.lcsc.trim())}>
                                <VisibilityOutlinedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {onInsert && (
                            <Tooltip title="Wstaw na schemat/PCB">
                              <IconButton size="small" color="primary" onClick={() => onInsert(el)}>
                                <PlaceOutlinedIcon fontSize="inherit" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edytuj">
                            <IconButton size="small" onClick={() => handleEdit(el)}>
                              <EditIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń">
                            <IconButton size="small" color="error" onClick={() => handleDelete(el.id)}>
                              <DeleteOutlineIcon fontSize="inherit" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Zamknij</Button>
      </DialogActions>
    </Dialog>

    {/* EasyEDA symbol/footprint preview — opened as a separate action per element. */}
    <Dialog open={previewLcsc != null} onClose={() => setPreviewLcsc(null)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1rem' }}>
        Podgląd EasyEDA
        <Typography component="span" variant="caption" color="text.secondary">— {previewLcsc}</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={() => setPreviewLcsc(null)}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {previewLcsc && renderLcscPreview?.(previewLcsc)}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPreviewLcsc(null)}>Zamknij</Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
