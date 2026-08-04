/**
 * UiSection.tsx — warstwa interfejsu w inspektorze.
 *
 * Osobny plik, bo inspektor ma już 1600 wierszy, a to jest zamknięty temat:
 * wszystko, co ta sekcja pokazuje, wynika z `node.ui` i wraca jedną ścieżką
 * `onChange('ui.…', wartość)`.
 *
 * Pola położenia są **tekstowe**, nie liczbowe. To nie niedbałość: wolno w nich
 * napisać `parent.w / 2 - 40` albo `naglowek.y + naglowek.h + 8`. Pole liczbowe
 * odcinałoby połowę tego, po co ta warstwa powstała, a osobne pole „albo
 * wyrażenie" wymagałoby rozstrzygania, które z dwóch jest prawdziwe.
 *
 * Które pola widać, zależy od **trybu warstwy**: kotwice nie znaczą nic
 * w przepływie, a `grow` nie znaczy nic przy kotwicach. Pokazywanie wszystkiego
 * naraz uczyłoby, że te ustawienia działają jednocześnie — a nie działają.
 */
import { useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, IconButton,
  MenuItem, Select, Slider, TextField, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import type { SelectedNodeUi, SelectedNodeUiConstraint } from '@mhersztowski/ui-core';

const accordionSx = {
  '&:before': { display: 'none' },
  boxShadow: 'none',
  bgcolor: 'transparent',
  '&.Mui-expanded': { m: 0 },
};

const summarySx = {
  minHeight: 28,
  '&.Mui-expanded': { minHeight: 28 },
  '& .MuiAccordionSummary-content': { m: 0 },
  '& .MuiAccordionSummary-content.Mui-expanded': { m: 0 },
  px: 1.5,
  bgcolor: 'action.hover',
};

const sectionTitleSx = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const fieldSx = {
  flex: 1,
  '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
  '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
};

const selectSx = {
  flex: 1,
  fontSize: '0.7rem',
  height: 22,
  '& .MuiSelect-select': { py: 0, px: 0.5, fontSize: '0.7rem' },
};

const TRYBY: Array<{ v: SelectedNodeUi['mode']; label: string }> = [
  { v: 'static', label: 'Static — wprost z wartości' },
  { v: 'anchor', label: 'Anchor — kotwice rodzica' },
  { v: 'flow', label: 'Flow — jak flex' },
  { v: 'constraint', label: 'Constraint — więzy' },
];

const RODZAJE_WIEZOW = [
  { typ: 'fixed', nazwa: 'przypnij', jeden: true, wartosc: false },
  { typ: 'alignLeft', nazwa: 'równo do lewej', wartosc: false },
  { typ: 'alignTop', nazwa: 'równo do góry', wartosc: false },
  { typ: 'alignCenterX', nazwa: 'środki w pionie', wartosc: false },
  { typ: 'alignCenterY', nazwa: 'środki w poziomie', wartosc: false },
  { typ: 'sameWidth', nazwa: 'równa szerokość', wartosc: false },
  { typ: 'sameHeight', nazwa: 'równa wysokość', wartosc: false },
  { typ: 'distanceX', nazwa: 'odstęp w poziomie', wartosc: true },
  { typ: 'distanceY', nazwa: 'odstęp w pionie', wartosc: true },
];

function Wiersz({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', minWidth: 50, flexShrink: 0 }}>
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export interface UiSectionProps {
  ui: SelectedNodeUi;
  onChange: (property: string, value: unknown) => void;
}

export function UiSection({ ui, onChange }: UiSectionProps) {
  return ui.role === 'root' ? <SekcjaWarstwy ui={ui} onChange={onChange} /> : <SekcjaWidzetu ui={ui} onChange={onChange} />;
}

function SekcjaWarstwy({ ui, onChange }: UiSectionProps) {
  const [nowyParametr, setNowyParametr] = useState('');
  const [nowyTyp, setNowyTyp] = useState('alignLeft');
  const [a, setA] = useState('');
  const [b, setB] = useState('');

  const widgets = ui.widgets ?? [];
  const rodzaj = RODZAJE_WIEZOW.find((r) => r.typ === nowyTyp)!;

  const dodajParametr = () => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nowyParametr)) return;
    onChange('ui.vars', { ...(ui.vars ?? {}), [nowyParametr]: 50 });
    setNowyParametr('');
  };

  const dodajWiez = () => {
    const pierwszy = a || widgets[0]?.id;
    const drugi = b || widgets.find((w) => w.id !== pierwszy)?.id;
    if (!pierwszy || (!rodzaj.jeden && !drugi)) return;
    const lista = ui.constraints ?? [];
    onChange('ui.constraints', [...lista, {
      id: `w${lista.length + 1}-${nowyTyp}`,
      type: nowyTyp,
      refs: rodzaj.jeden ? [pierwszy] : [pierwszy, drugi!],
      ...(rodzaj.wartosc ? { value: '120' } : {}),
    } satisfies SelectedNodeUiConstraint]);
  };

  const zmienWiez = (id: string, zmiana: Partial<SelectedNodeUiConstraint>) => {
    onChange('ui.constraints', (ui.constraints ?? []).map((c) => (c.id === id ? { ...c, ...zmiana } : c)));
  };

  return (
    <>
      <Accordion defaultExpanded disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
          <Typography sx={sectionTitleSx}>UI Layer</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
          <Wiersz label="Layout">
            <Select size="small" value={ui.mode} sx={selectSx} onChange={(e) => onChange('ui.mode', e.target.value)}>
              {TRYBY.map((t) => <MenuItem key={t.v} value={t.v} sx={{ fontSize: '0.7rem' }}>{t.label}</MenuItem>)}
            </Select>
          </Wiersz>

          {ui.dof !== undefined && (
            <Chip
              size="small"
              color={ui.dof === 0 ? 'success' : 'default'}
              label={ui.dof === 0 ? 'w pełni określony' : `${ui.dof} stopni swobody`}
              sx={{ height: 18, fontSize: '0.6rem', mb: 0.5 }}
            />
          )}

          {(ui.issues ?? []).map((u) => (
            <Typography key={u} variant="caption" sx={{ display: 'block', color: 'warning.main', fontSize: '0.62rem', mb: 0.25 }}>
              {u}
            </Typography>
          ))}
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
          <Typography sx={sectionTitleSx}>Parameters</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
          {Object.entries(ui.vars ?? {}).map(([nazwa, wartosc]) => (
            <Box key={nazwa} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', minWidth: 62 }}>{nazwa}</Typography>
              <Slider
                size="small" min={0} max={400} value={wartosc} valueLabelDisplay="auto"
                onChange={(_: Event, v: number | number[]) => onChange('ui.vars', { ...(ui.vars ?? {}), [nazwa]: v as number })}
              />
              <Typography variant="caption" sx={{ fontSize: '0.62rem', width: 26, textAlign: 'right' }}>
                {Math.round(wartosc)}
              </Typography>
              <IconButton
                size="small"
                onClick={() => {
                  const kopia = { ...(ui.vars ?? {}) };
                  delete kopia[nazwa];
                  onChange('ui.vars', kopia);
                }}
              >
                <DeleteIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <TextField
              size="small" placeholder="nazwa parametru" value={nowyParametr} sx={fieldSx}
              onChange={(e) => setNowyParametr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') dodajParametr(); }}
            />
            <IconButton size="small" onClick={dodajParametr}><AddIcon sx={{ fontSize: 14 }} /></IconButton>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>
            Nazwa parametru jest widoczna w polach położenia każdego widżetu tej warstwy.
          </Typography>
        </AccordionDetails>
      </Accordion>

      {ui.mode === 'constraint' && (
        <Accordion defaultExpanded disableGutters sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
            <Typography sx={sectionTitleSx}>Constraints</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
            {(ui.constraints ?? []).map((c) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Typography variant="caption" sx={{ fontSize: '0.63rem', flex: 1 }}>
                  {RODZAJE_WIEZOW.find((r) => r.typ === c.type)?.nazwa ?? c.type}
                  {': '}
                  {c.refs.map((r) => widgets.find((w) => w.id === r)?.name ?? r).join(' ↔ ')}
                </Typography>
                {c.value !== undefined && (
                  <TextField
                    size="small" variant="standard" value={c.value} sx={{ width: 64 }}
                    onChange={(e) => zmienWiez(c.id, { value: e.target.value })}
                  />
                )}
                <IconButton
                  size="small"
                  onClick={() => onChange('ui.constraints', (ui.constraints ?? []).filter((x) => x.id !== c.id))}
                >
                  <DeleteIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Box>
            ))}

            <Wiersz label="Typ">
              <Select size="small" value={nowyTyp} sx={selectSx} onChange={(e) => setNowyTyp(String(e.target.value))}>
                {RODZAJE_WIEZOW.map((r) => <MenuItem key={r.typ} value={r.typ} sx={{ fontSize: '0.7rem' }}>{r.nazwa}</MenuItem>)}
              </Select>
            </Wiersz>
            <Wiersz label="A">
              <Select size="small" value={a || widgets[0]?.id || ''} sx={selectSx} onChange={(e) => setA(String(e.target.value))}>
                {widgets.map((w) => <MenuItem key={w.id} value={w.id} sx={{ fontSize: '0.7rem' }}>{w.name}</MenuItem>)}
              </Select>
            </Wiersz>
            {!rodzaj.jeden && (
              <Wiersz label="B">
                <Select size="small" value={b || widgets.find((w) => w.id !== (a || widgets[0]?.id))?.id || ''} sx={selectSx}
                  onChange={(e) => setB(String(e.target.value))}>
                  {widgets.map((w) => <MenuItem key={w.id} value={w.id} sx={{ fontSize: '0.7rem' }}>{w.name}</MenuItem>)}
                </Select>
              </Wiersz>
            )}
            <Button size="small" fullWidth variant="outlined" sx={{ fontSize: '0.65rem', mt: 0.5 }} onClick={dodajWiez}>
              Dodaj więz
            </Button>
          </AccordionDetails>
        </Accordion>
      )}
    </>
  );
}

function SekcjaWidzetu({ ui, onChange }: UiSectionProps) {
  const anchor = ui.anchor;

  return (
    <>
      <Accordion defaultExpanded disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
          <Typography sx={sectionTitleSx}>Widget</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
          <Wiersz label="Kind">
            <Select size="small" value={ui.kind ?? 'panel'} sx={selectSx} onChange={(e) => onChange('ui.kind', e.target.value)}>
              {['panel', 'button', 'label', 'bar'].map((k) => (
                <MenuItem key={k} value={k} sx={{ fontSize: '0.7rem' }}>{k}</MenuItem>
              ))}
            </Select>
          </Wiersz>
          {ui.kind !== 'panel' && (
            <Wiersz label="Text">
              <TextField size="small" value={ui.text ?? ''} sx={fieldSx} onChange={(e) => onChange('ui.text', e.target.value)} />
            </Wiersz>
          )}
          <Wiersz label="Color">
            <TextField size="small" value={ui.color ?? ''} placeholder="#2f6fb0" sx={fieldSx}
              onChange={(e) => onChange('ui.color', e.target.value)} />
          </Wiersz>
          {ui.kind === 'bar' && (
            <Wiersz label="Value">
              <Slider size="small" min={0} max={1} step={0.01} value={ui.value ?? 0} valueLabelDisplay="auto"
                onChange={(_: Event, v: number | number[]) => onChange('ui.value', v as number)} />
            </Wiersz>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion defaultExpanded disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
          <Typography sx={sectionTitleSx}>Layout ({ui.mode})</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
          {ui.mode === 'anchor' && anchor ? (
            <>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
                Ułamek wymiaru rodzica (0–1) plus odstęp w pikselach. Równe min i max = stały rozmiar.
              </Typography>
              {(['minX', 'maxX', 'minY', 'maxY'] as const).map((pole) => (
                <Box key={pole} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.63rem', minWidth: 34 }}>{pole}</Typography>
                  <Slider size="small" min={0} max={1} step={0.5} value={anchor[pole]}
                    onChange={(_: Event, v: number | number[]) => onChange(`ui.anchor.${pole}`, v as number)} />
                  <Typography variant="caption" sx={{ fontSize: '0.62rem', width: 20 }}>{anchor[pole]}</Typography>
                </Box>
              ))}
              {([['offsetLeft', 'left'], ['offsetTop', 'top'], ['offsetRight', 'right'], ['offsetBottom', 'bottom']] as const).map(
                ([pole, label]) => (
                  <Wiersz key={pole} label={label}>
                    <TextField size="small" type="number" value={Math.round(anchor[pole])} sx={fieldSx}
                      onChange={(e) => onChange(`ui.anchor.${pole}`, parseFloat(e.target.value) || 0)} />
                  </Wiersz>
                ),
              )}
            </>
          ) : ui.mode === 'anchor' ? (
            <Button
              size="small" fullWidth variant="outlined" sx={{ fontSize: '0.65rem' }}
              onClick={() => {
                const r = ui.rect ?? { x: 0, y: 0, w: 140, h: 40 };
                onChange('ui.anchor', {
                  minX: 0, maxX: 0, minY: 0, maxY: 0,
                  offsetLeft: r.x, offsetTop: r.y, offsetRight: r.x + r.w, offsetBottom: r.y + r.h,
                });
              }}
            >
              Zakotwicz w obecnym miejscu
            </Button>
          ) : null}

          {ui.mode === 'flow' && (
            <>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
                Pozycję wyznacza rodzeństwo. „Grow" dzieli nadwyżkę miejsca, „basis" to rozmiar przed podziałem.
              </Typography>
              <Wiersz label="Grow">
                <TextField size="small" type="number" value={ui.flow?.grow ?? 0} sx={fieldSx}
                  onChange={(e) => onChange('ui.flow.grow', parseFloat(e.target.value) || 0)} />
              </Wiersz>
              <Wiersz label="Basis">
                <TextField size="small" type="number" value={ui.flow?.basis ?? ''} placeholder="rozmiar własny" sx={fieldSx}
                  onChange={(e) => onChange('ui.flow.basis', e.target.value === '' ? undefined : parseFloat(e.target.value) || 0)} />
              </Wiersz>
            </>
          )}

          {(ui.mode === 'static' || ui.mode === 'constraint' || !anchor) && (
            <>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
                Liczba albo wyrażenie: <code>parent.w / 2 - 40</code>, <code>naglowek.y + naglowek.h + 8</code>.
              </Typography>
              {(['x', 'y', 'w', 'h'] as const).map((pole) => (
                <Wiersz key={pole} label={pole}>
                  <TextField size="small" value={ui[pole] ?? ''} sx={fieldSx}
                    onChange={(e) => onChange(`ui.${pole}`, e.target.value)} />
                </Wiersz>
              ))}
            </>
          )}

          {ui.rect && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mt: 0.5 }}>
              Wyliczone: {Math.round(ui.rect.x)}, {Math.round(ui.rect.y)} — {Math.round(ui.rect.w)} × {Math.round(ui.rect.h)} px
            </Typography>
          )}
        </AccordionDetails>
      </Accordion>

      <Accordion disableGutters sx={accordionSx}>
        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />} sx={summarySx}>
          <Typography sx={sectionTitleSx}>Container</Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 1.5, py: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem', display: 'block', mb: 0.5 }}>
            Włącz, gdy ten widżet ma **układać swoje dzieci** przepływem. Działa w trybie Flow.
          </Typography>
          {ui.container ? (
            <>
              <Wiersz label="Kierunek">
                <Select size="small" value={ui.container.direction} sx={selectSx}
                  onChange={(e) => onChange('ui.container.direction', e.target.value)}>
                  <MenuItem value="row" sx={{ fontSize: '0.7rem' }}>row</MenuItem>
                  <MenuItem value="column" sx={{ fontSize: '0.7rem' }}>column</MenuItem>
                </Select>
              </Wiersz>
              <Wiersz label="Gap">
                <TextField size="small" type="number" value={ui.container.gap ?? 0} sx={fieldSx}
                  onChange={(e) => onChange('ui.container.gap', parseFloat(e.target.value) || 0)} />
              </Wiersz>
              <Wiersz label="Padding">
                <TextField size="small" type="number" value={ui.container.padding ?? 0} sx={fieldSx}
                  onChange={(e) => onChange('ui.container.padding', parseFloat(e.target.value) || 0)} />
              </Wiersz>
              <Wiersz label="Align">
                <Select size="small" value={ui.container.align ?? 'start'} sx={selectSx}
                  onChange={(e) => onChange('ui.container.align', e.target.value)}>
                  {['start', 'center', 'end', 'stretch'].map((a) => (
                    <MenuItem key={a} value={a} sx={{ fontSize: '0.7rem' }}>{a}</MenuItem>
                  ))}
                </Select>
              </Wiersz>
              <Button size="small" fullWidth sx={{ fontSize: '0.65rem' }} onClick={() => onChange('ui.container', null)}>
                Wyłącz kontener
              </Button>
            </>
          ) : (
            <Button size="small" fullWidth variant="outlined" sx={{ fontSize: '0.65rem' }}
              onClick={() => onChange('ui.container', { direction: 'row', gap: 8, padding: 8, align: 'stretch' })}>
              Zrób z tego kontener
            </Button>
          )}
        </AccordionDetails>
      </Accordion>
    </>
  );
}
