/**
 * AutomateQObjectPanel — boczny panel inspektora QObject dla edytora skryptu
 * automatyzacji. Pokazuje drzewo obiektów wczytanej SCENY (plik JSON wybrany w
 * ustawieniach skryptu) i pozwala ją edytować:
 *  - drzewko hierarchii (rodzic → dzieci),
 *  - edytowalna tabela właściwości zaznaczonego obiektu (objectName + properties),
 *  - menu kontekstowe: New (PODMENU z listą klas dziedziczących po QObject,
 *    sparsowanych ze źródła), Wytnij, Kopiuj, Wklej, Kopiuj link.
 *
 * Zmiany sceny lecą przez `onSceneChange` — host trzyma scenę w stanie, wczytuje
 * ją z pliku przy otwarciu edytora i zapisuje przy „Zapisz".
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Divider, IconButton, ListSubheader, Menu, MenuItem, Table, TableBody,
  TableCell, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircleIcon from '@mui/icons-material/Circle';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  type QObjectScene, type QObjectSceneNode,
  newNode, addNode, removeNode, updateNode, findNode, cloneNodeFresh,
} from './qobjectScene';

export interface AutomateQObjectPanelProps {
  /** Aktualna scena (wczytana z pliku JSON). */
  scene: QObjectScene;
  /** Zwraca zmodyfikowaną scenę. */
  onSceneChange: (scene: QObjectScene) => void;
  /** Klasy dziedziczące po QObject (z parsowania źródła) — do podmenu New. */
  classes: string[];
  /** Zadeklarowane właściwości (static properties) per klasa — fallback gdy
   *  introspekcja runtime (window.QObject.metaProperties) niedostępna. */
  classProperties?: Record<string, string[]>;
  onClose: () => void;
}

/** Zadeklarowane nazwy właściwości dla klasy: najpierw introspekcja runtime
 *  (window.QObject.metaProperties — używa property-supportu z wczytanych modułów
 *  qt/qobject), w przeciwności do parsowania źródła. */
function declaredPropertyNames(className: string, classProperties?: Record<string, string[]>): string[] {
  try {
    const g = window as unknown as { QObject?: { metaProperties?: (c: unknown) => Record<string, unknown> }; [k: string]: unknown };
    const cls = g[className];
    if (g.QObject && typeof g.QObject.metaProperties === 'function' && typeof cls === 'function') {
      const meta = g.QObject.metaProperties(cls);
      const keys = Object.keys(meta || {});
      if (keys.length) return keys;
    }
  } catch { /* runtime introspection unavailable */ }
  return classProperties?.[className] ?? (className ? ['objectName'] : []);
}

const AutomateQObjectPanel: React.FC<AutomateQObjectPanelProps> = ({ scene, onSceneChange, classes, classProperties, onClose }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [clip, setClip] = useState<QObjectSceneNode | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [newAnchor, setNewAnchor] = useState<HTMLElement | null>(null);

  const selected = useMemo(() => (selectedId ? findNode(scene, selectedId) : null), [scene, selectedId]);
  // Lista klas do utworzenia: QObject + sparsowane podklasy (bez duplikatów).
  const createable = useMemo(() => ['QObject', ...classes.filter((c) => c !== 'QObject')], [classes]);

  const closeMenu = () => { setMenu(null); setNewAnchor(null); };

  // ── Operacje ────────────────────────────────────────────────────────────────
  const handleNew = (className: string) => {
    const node = newNode(className);
    onSceneChange(addNode(scene, menu?.nodeId ?? null, node));
    setSelectedId(node.id);
    closeMenu();
  };
  const handleCopy = (id: string) => {
    const n = findNode(scene, id);
    if (n) setClip(cloneNodeFresh(n));
    closeMenu();
  };
  const handleCut = (id: string) => {
    const n = findNode(scene, id);
    if (n) setClip(cloneNodeFresh(n));
    const { scene: next } = removeNode(scene, id);
    onSceneChange(next);
    if (selectedId === id) setSelectedId(null);
    closeMenu();
  };
  const handlePaste = () => {
    if (!clip) { closeMenu(); return; }
    const copy = cloneNodeFresh(clip);
    onSceneChange(addNode(scene, menu?.nodeId ?? null, copy));
    setSelectedId(copy.id);
    closeMenu();
  };
  const handleCopyLink = (id: string) => {
    const n = findNode(scene, id);
    try { void navigator.clipboard?.writeText(n?.objectName || id); } catch { /* ignore */ }
    closeMenu();
  };

  const onContext = (e: React.MouseEvent, nodeId: string | null) => {
    e.preventDefault(); e.stopPropagation();
    if (nodeId) setSelectedId(nodeId);
    setMenu({ x: e.clientX, y: e.clientY, nodeId });
  };

  const toggle = (id: string) =>
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Edycja właściwości zaznaczonego węzła ────────────────────────────────────
  const setObjectName = (v: string) => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.objectName = v || undefined; }));
  const setClassName = (v: string) => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.className = v; }));
  const setPropKey = (i: number, v: string) => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.properties[i].key = v; }));
  const setPropVal = (i: number, v: string) => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.properties[i].value = v; }));
  const addProp = () => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.properties.push({ key: 'prop', value: '' }); }));
  const delProp = (i: number) => selected && onSceneChange(updateNode(scene, selected.id, (n) => { n.properties.splice(i, 1); }));
  // Zadeklarowana właściwość: zapis przez upsert (po nazwie) do node.properties.
  const upsertProp = (key: string, value: string) => selected && onSceneChange(updateNode(scene, selected.id, (n) => {
    const idx = n.properties.findIndex((p) => p.key === key);
    if (idx >= 0) n.properties[idx].value = value; else n.properties.push({ key, value });
  }));
  const propValue = (key: string) => selected?.properties.find((p) => p.key === key)?.value ?? '';
  // Nazwy zadeklarowanych właściwości klasy (bez objectName — ma osobne pole).
  const declared = selected ? declaredPropertyNames(selected.className, classProperties).filter((k) => k !== 'objectName') : [];
  const declaredSet = new Set(declared);

  // ── Render drzewka ────────────────────────────────────────────────────────────
  const renderNode = (node: QObjectSceneNode, depth: number): React.ReactNode => {
    const hasKids = node.children.length > 0;
    const isOpen = !collapsed.has(node.id);
    const isSel = selectedId === node.id;
    return (
      <React.Fragment key={node.id}>
        <Box
          onClick={() => setSelectedId(node.id)}
          onContextMenu={(e) => onContext(e, node.id)}
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            pl: 0.5 + depth * 1.25, pr: 0.5, py: 0.4, cursor: 'pointer', userSelect: 'none',
            borderRadius: 0.5,
            bgcolor: isSel ? 'rgba(76,175,80,0.18)' : 'transparent',
            '&:hover': { bgcolor: isSel ? 'rgba(76,175,80,0.24)' : 'action.hover' },
          }}
        >
          {hasKids ? (
            <IconButton size="small" sx={{ p: 0 }} onClick={(e) => { e.stopPropagation(); toggle(node.id); }}>
              {isOpen ? <ExpandMoreIcon fontSize="inherit" /> : <ChevronRightIcon fontSize="inherit" />}
            </IconButton>
          ) : (
            <CircleIcon sx={{ fontSize: 7, color: 'text.disabled', mx: 0.4 }} />
          )}
          <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem', fontWeight: isSel ? 600 : 400 }}>
            {node.objectName ? `${node.objectName} ` : ''}
            <Box component="span" sx={{ color: '#4caf50' }}>{node.objectName ? `: ${node.className}` : node.className}</Box>
          </Typography>
        </Box>
        {hasKids && isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <Box sx={{ width: 320, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}>
        <AccountTreeIcon fontSize="small" sx={{ color: '#4caf50' }} />
        <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>Scena QObject</Typography>
        <Tooltip title="Ukryj panel"><IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton></Tooltip>
      </Box>

      {/* Drzewko */}
      <Box onContextMenu={(e) => onContext(e, null)} sx={{ flex: 1, minHeight: 80, overflow: 'auto', py: 0.5 }}>
        {scene.roots.length === 0 ? (
          <Typography variant="caption" sx={{ display: 'block', px: 1.5, py: 1, color: 'text.disabled' }}>
            Pusta scena. Kliknij prawym, aby dodać obiekt (New). Wybierz plik sceny w ustawieniach skryptu (⚙).
          </Typography>
        ) : (
          scene.roots.map((n) => renderNode(n, 0))
        )}
      </Box>

      {/* Properties (edytowalne) */}
      <Divider />
      <Box sx={{ flex: 1, minHeight: 100, overflow: 'auto', px: 1, py: 0.5 }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mb: 0.5 }}>
          Właściwości{selected ? ` — ${selected.objectName || selected.className}` : ''}
        </Typography>
        {!selected ? (
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>Zaznacz obiekt w drzewku.</Typography>
        ) : (
          <Box>
            <Stack2>
              <TextField label="objectName" size="small" fullWidth value={selected.objectName ?? ''}
                onChange={(e) => setObjectName(e.target.value)} sx={{ mb: 1 }} />
              <TextField label="class" size="small" fullWidth value={selected.className}
                onChange={(e) => setClassName(e.target.value)} sx={{ mb: 1 }} />
            </Stack2>

            {/* Zadeklarowane właściwości klasy (static properties / metaProperties). */}
            {declared.length > 0 && (
              <>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mt: 0.5 }}>
                  Właściwości klasy {selected.className}
                </Typography>
                <Table size="small" sx={{ '& td': { px: 0.5, py: 0.3, borderColor: 'divider' } }}>
                  <TableBody>
                    {declared.map((key) => (
                      <TableRow key={`decl-${key}`}>
                        <TableCell sx={{ width: '42%', color: 'text.secondary', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{key}</TableCell>
                        <TableCell>
                          <TextField variant="standard" size="small" fullWidth value={propValue(key)}
                            placeholder="(domyślna)"
                            onChange={(e) => upsertProp(key, e.target.value)}
                            InputProps={{ sx: { fontSize: '0.75rem', fontFamily: 'monospace' } }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}

            {/* Pozostałe (wolne) właściwości — nie zadeklarowane w klasie. */}
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: 'text.secondary', mt: 1 }}>
              Dodatkowe właściwości
            </Typography>
            <Table size="small" sx={{ '& td': { px: 0.5, py: 0.3, borderColor: 'divider' } }}>
              <TableBody>
                {selected.properties.map((p, i) => ({ p, i })).filter(({ p }) => !declaredSet.has(p.key)).map(({ p, i }) => (
                  <TableRow key={i}>
                    <TableCell sx={{ width: '40%' }}>
                      <TextField variant="standard" size="small" fullWidth value={p.key}
                        onChange={(e) => setPropKey(i, e.target.value)}
                        InputProps={{ disableUnderline: false, sx: { fontSize: '0.75rem' } }} />
                    </TableCell>
                    <TableCell>
                      <TextField variant="standard" size="small" fullWidth value={p.value}
                        onChange={(e) => setPropVal(i, e.target.value)}
                        InputProps={{ sx: { fontSize: '0.75rem', fontFamily: 'monospace' } }} />
                    </TableCell>
                    <TableCell sx={{ width: 28 }}>
                      <IconButton size="small" onClick={() => delProp(i)}><DeleteOutlineIcon sx={{ fontSize: 15 }} /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Box sx={{ mt: 0.5 }}>
              <IconButton size="small" onClick={addProp}><AddIcon sx={{ fontSize: 16 }} /></IconButton>
              <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>Dodaj właściwość</Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Menu kontekstowe */}
      <Menu open={menu !== null} onClose={closeMenu} anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}>
        {/* New → otwiera PODMENU z listą klas */}
        <MenuItem dense onClick={(e) => setNewAnchor(e.currentTarget)}>
          <AddIcon fontSize="small" sx={{ mr: 1 }} /> New
          <ChevronRightIcon fontSize="small" sx={{ ml: 'auto' }} />
        </MenuItem>
        <Divider />
        <MenuItem dense disabled={!menu?.nodeId} onClick={() => menu?.nodeId && handleCut(menu.nodeId)}>Wytnij</MenuItem>
        <MenuItem dense disabled={!menu?.nodeId} onClick={() => menu?.nodeId && handleCopy(menu.nodeId)}>Kopiuj</MenuItem>
        <MenuItem dense disabled={!clip} onClick={handlePaste}>Wklej{clip ? ` (${clip.className})` : ''}</MenuItem>
        <MenuItem dense disabled={!menu?.nodeId} onClick={() => menu?.nodeId && handleCopyLink(menu.nodeId)}>Kopiuj link</MenuItem>
      </Menu>

      {/* Podmenu New: lista klas do utworzenia */}
      <Menu open={newAnchor !== null} anchorEl={newAnchor} onClose={() => setNewAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
        <ListSubheader sx={{ lineHeight: '28px', bgcolor: 'transparent' }}>
          {menu?.nodeId ? 'Nowy w zaznaczonym' : 'Nowy (korzeń)'}
        </ListSubheader>
        {createable.map((cls) => (
          <MenuItem key={cls} dense onClick={() => handleNew(cls)}>{cls}</MenuItem>
        ))}
      </Menu>
    </Box>
  );
};

// Lekki wrapper, żeby nie importować Stack tylko dla 2 pól (zachowuje spójność).
const Stack2: React.FC<{ children: React.ReactNode }> = ({ children }) => <Box>{children}</Box>;

export default AutomateQObjectPanel;
