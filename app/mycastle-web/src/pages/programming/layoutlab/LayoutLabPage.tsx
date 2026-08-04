/**
 * LayoutLabPage — piaskownica czterech solverów układu.
 *
 * Strona istnieje po to, żeby dało się **porównać**, a nie tylko przeczytać.
 * Ten sam dokument przełącza się między trybami jednym kliknięciem, więc różnice
 * widać na własnych danych: co się dzieje przy zmianie rozmiaru obszaru, co da
 * się przeciągnąć myszą, a co jest wyliczone i ruchu nie przyjmie.
 *
 * Wszystko, co strona robi z modelem, siedzi w `@mhersztowski/layout` — łącznie
 * z tym, co ruch myszą znaczy w danym trybie (`applyDrag`). Tutaj zostaje
 * wyłącznie rysowanie i obsługa wskaźnika — inaczej
 * piaskownica stałaby się drugą implementacją layoutu.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, IconButton, MenuItem, Paper, Select, Slider, Stack,
  TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import {
  applyDrag, lit, expr, previewDrag, snapToGrid, solveLayout,
  type Constraint, type ConstraintType, type LayoutDoc, type LayoutMode, type ParamValue, type Rect,
} from '@mhersztowski/layout';
import { PRZYKLADY, kopia } from './przyklady';

const TRYBY: { tryb: LayoutMode; nazwa: string; opis: string }[] = [
  { tryb: 'static', nazwa: 'Statyczny', opis: 'Pozycja wprost z wartości i wyrażeń. Jeden kierunek liczenia.' },
  { tryb: 'anchor', nazwa: 'Kotwice', opis: 'Jak w Godocie: ułamek wymiaru rodzica plus stały odstęp.' },
  { tryb: 'flow', nazwa: 'Przepływ', opis: 'Jak flex: pozycja wynika z rodzeństwa, nadwyżka dzieli się przez „grow".' },
  { tryb: 'constraint', nazwa: 'Więzy', opis: 'Jak w szkicu CAD: układ równań bez ustalonego kierunku.' },
];

const RODZAJE_WIEZOW: { typ: ConstraintType; nazwa: string; zWartoscia: boolean; jednoargumentowy?: boolean }[] = [
  { typ: 'fixed', nazwa: 'przypnij', zWartoscia: false, jednoargumentowy: true },
  { typ: 'alignLeft', nazwa: 'równo do lewej', zWartoscia: false },
  { typ: 'alignTop', nazwa: 'równo do góry', zWartoscia: false },
  { typ: 'alignCenterX', nazwa: 'środki w pionie', zWartoscia: false },
  { typ: 'alignCenterY', nazwa: 'środki w poziomie', zWartoscia: false },
  { typ: 'sameWidth', nazwa: 'równa szerokość', zWartoscia: false },
  { typ: 'sameHeight', nazwa: 'równa wysokość', zWartoscia: false },
  { typ: 'distanceX', nazwa: 'odstęp w poziomie', zWartoscia: true },
  { typ: 'distanceY', nazwa: 'odstęp w pionie', zWartoscia: true },
];

/** Zapis wartości do pola tekstowego i z powrotem. */
const naTekst = (v: ParamValue): string =>
  (v.src === 'literal' ? String(Math.round(v.value * 100) / 100) : v.src === 'ref' ? v.name : v.code);

const zTekstu = (s: string): ParamValue => {
  const t = s.trim();
  const liczba = Number(t);
  return t !== '' && Number.isFinite(liczba) ? lit(liczba) : expr(t || '0');
};

const BARWY = ['#4f83cc', '#6aa84f', '#c9752c', '#8e5ec2', '#3f9c9c', '#b5495b'];

export default function LayoutLabPage() {
  const [doc, setDoc] = useState<LayoutDoc>(() => kopia(PRZYKLADY[0].doc));
  const [przyklad, setPrzyklad] = useState(0);
  const [wybrany, setWybrany] = useState<string | null>(null);
  const [skok, setSkok] = useState(0);
  const [komunikat, setKomunikat] = useState<string | null>(null);
  const [ruch, setRuch] = useState<{ id: string; chwyt: { x: number; y: number }; rects: Record<string, Rect> } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const wynik = useMemo(() => solveLayout(doc), [doc]);
  const rects = ruch?.rects ?? wynik.rects;
  const shape = doc.shapes.find((s) => s.id === wybrany);

  const zmien = (f: (d: LayoutDoc) => void) => {
    setDoc((poprzedni) => {
      const nowy = kopia(poprzedni);
      f(nowy);
      return nowy;
    });
  };

  /** Punkt wskaźnika w układzie dokumentu — SVG bywa przeskalowany. */
  const punkt = (e: React.PointerEvent): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const w = p.matrixTransform(m.inverse());
    return { x: w.x, y: w.y };
  };

  const start = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setWybrany(id);
    setKomunikat(null);
    const p = punkt(e);
    const r = rects[id];
    (e.target as Element).setPointerCapture(e.pointerId);
    setRuch({ id, chwyt: { x: p.x - r.x, y: p.y - r.y }, rects });
  };

  const ruszaj = (e: React.PointerEvent) => {
    if (!ruch) return;
    const p = punkt(e);
    const cel = snapToGrid({ x: p.x - ruch.chwyt.x, y: p.y - ruch.chwyt.y }, skok);
    setRuch({ ...ruch, rects: previewDrag(doc, ruch.id, cel, wynik.rects) });
  };

  const koniec = (e: React.PointerEvent) => {
    if (!ruch) return;
    const p = punkt(e);
    const cel = snapToGrid({ x: p.x - ruch.chwyt.x, y: p.y - ruch.chwyt.y }, skok);
    const skutek = applyDrag(doc, ruch.id, cel, wynik.rects);
    setKomunikat(skutek.odmowa ?? null);
    if (!skutek.odmowa) setDoc(skutek.doc);
    setRuch(null);
  };

  const wczytaj = (i: number) => {
    setPrzyklad(i);
    setDoc(kopia(PRZYKLADY[i].doc));
    setWybrany(null);
    setKomunikat(null);
  };

  const dodajWiez = (typ: ConstraintType) => {
    const rodzaj = RODZAJE_WIEZOW.find((r) => r.typ === typ)!;
    const a = wybrany ?? doc.shapes[0]?.id;
    const b = doc.shapes.find((s) => s.id !== a)?.id;
    if (!a || (!rodzaj.jednoargumentowy && !b)) return;
    zmien((d) => {
      d.constraints = [...(d.constraints ?? []), {
        id: `w${(d.constraints?.length ?? 0) + 1}-${typ}`,
        type: typ,
        refs: rodzaj.jednoargumentowy ? [a] : [a, b!],
        ...(rodzaj.zWartoscia ? { value: lit(100) } : {}),
      } as Constraint];
    });
  };

  const trybOpis = TRYBY.find((t) => t.tryb === doc.mode)!;

  return (
    <Box sx={{ display: 'flex', gap: 2, p: 2, height: '100%', minHeight: 0 }}>
      {/* ── Lewa kolumna: kształty i ich wartości ─────────────────────────── */}
      <Paper sx={{ width: 300, p: 1.5, overflow: 'auto', flexShrink: 0 }}>
        <Typography variant="subtitle2" gutterBottom>Kształty</Typography>
        <Stack spacing={0.5}>
          {doc.shapes.map((s, i) => (
            <Box
              key={s.id}
              onClick={() => setWybrany(s.id)}
              sx={{
                px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 1,
                bgcolor: s.id === wybrany ? 'action.selected' : undefined,
                pl: s.parent ? 3 : 1,
              }}
            >
              <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: BARWY[i % BARWY.length] }} />
              {s.label ?? s.id}
              {s.container && <Chip size="small" label="kontener" sx={{ height: 18, fontSize: 10 }} />}
            </Box>
          ))}
        </Stack>

        {shape && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" gutterBottom>{shape.label ?? shape.id}</Typography>
            <Typography variant="caption" color="text.secondary">
              Wpisz liczbę albo wyrażenie, np. <code>parent.w / 2 - 40</code> lub <code>a.x + a.w + margines</code>.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {(['x', 'y'] as const).map((pole) => (
                <TextField
                  key={pole} label={pole} size="small" fullWidth
                  value={naTekst(shape[pole])}
                  onChange={(e) => zmien((d) => { d.shapes.find((s) => s.id === shape.id)![pole] = zTekstu(e.target.value); })}
                />
              ))}
            </Stack>
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              {(['w', 'h'] as const).map((pole) => (
                <TextField
                  key={pole} label={pole} size="small" fullWidth
                  value={naTekst(shape[pole])}
                  onChange={(e) => zmien((d) => { d.shapes.find((s) => s.id === shape.id)![pole] = zTekstu(e.target.value); })}
                />
              ))}
            </Stack>

            {doc.mode === 'anchor' && (
              <Box sx={{ mt: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Kotwica: ułamki wymiaru rodzica (0–1) i odstępy w pikselach.
                </Typography>
                {shape.anchor ? (
                  <>
                    {(['minX', 'maxX', 'minY', 'maxY'] as const).map((pole) => (
                      <Box key={pole} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="caption" sx={{ width: 42 }}>{pole}</Typography>
                        <Slider
                          size="small" min={0} max={1} step={0.5} value={shape.anchor![pole]}
                          onChange={(_, v) => zmien((d) => {
                            d.shapes.find((s) => s.id === shape.id)!.anchor![pole] = v as number;
                          })}
                        />
                        <Typography variant="caption" sx={{ width: 26 }}>{shape.anchor![pole]}</Typography>
                      </Box>
                    ))}
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {(['offsetLeft', 'offsetRight'] as const).map((pole) => (
                        <TextField
                          key={pole} label={pole === 'offsetLeft' ? 'lewy' : 'prawy'} size="small" fullWidth
                          value={String(Math.round(shape.anchor![pole]))}
                          onChange={(e) => zmien((d) => {
                            d.shapes.find((s) => s.id === shape.id)!.anchor![pole] = Number(e.target.value) || 0;
                          })}
                        />
                      ))}
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      {(['offsetTop', 'offsetBottom'] as const).map((pole) => (
                        <TextField
                          key={pole} label={pole === 'offsetTop' ? 'górny' : 'dolny'} size="small" fullWidth
                          value={String(Math.round(shape.anchor![pole]))}
                          onChange={(e) => zmien((d) => {
                            d.shapes.find((s) => s.id === shape.id)!.anchor![pole] = Number(e.target.value) || 0;
                          })}
                        />
                      ))}
                    </Stack>
                  </>
                ) : (
                  <Button
                    size="small" sx={{ mt: 1 }}
                    onClick={() => zmien((d) => {
                      const r = rects[shape.id];
                      d.shapes.find((s) => s.id === shape.id)!.anchor = {
                        minX: 0, maxX: 0, minY: 0, maxY: 0,
                        offsetLeft: r.x, offsetTop: r.y, offsetRight: r.x + r.w, offsetBottom: r.y + r.h,
                      };
                    })}
                  >
                    Dodaj kotwicę w obecnym miejscu
                  </Button>
                )}
              </Box>
            )}

            {doc.mode === 'flow' && (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                <TextField
                  label="grow" size="small" fullWidth value={String(shape.flow?.grow ?? 0)}
                  onChange={(e) => zmien((d) => {
                    d.shapes.find((s) => s.id === shape.id)!.flow = { ...shape.flow, grow: Number(e.target.value) || 0 };
                  })}
                />
                <TextField
                  label="basis" size="small" fullWidth
                  value={shape.flow?.basis === undefined ? '' : String(shape.flow.basis)}
                  onChange={(e) => zmien((d) => {
                    const v = e.target.value.trim();
                    d.shapes.find((s) => s.id === shape.id)!.flow = {
                      ...shape.flow, basis: v === '' ? undefined : Number(v) || 0,
                    };
                  })}
                />
              </Stack>
            )}
          </>
        )}
      </Paper>

      {/* ── Środek: obszar rysunku ────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Paper sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
            <Select size="small" value={przyklad} onChange={(e) => wczytaj(Number(e.target.value))} sx={{ minWidth: 240 }}>
              {PRZYKLADY.map((p, i) => <MenuItem key={p.nazwa} value={i}>{p.nazwa}</MenuItem>)}
            </Select>

            <ToggleButtonGroup
              size="small" exclusive value={doc.mode}
              onChange={(_, v) => v && zmien((d) => { d.mode = v as LayoutMode; })}
            >
              {TRYBY.map((t) => (
                <Tooltip key={t.tryb} title={t.opis}>
                  <ToggleButton value={t.tryb}>{t.nazwa}</ToggleButton>
                </Tooltip>
              ))}
            </ToggleButtonGroup>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption">siatka</Typography>
              <Slider
                size="small" min={0} max={40} step={5} value={skok} valueLabelDisplay="auto"
                onChange={(_, v) => setSkok(v as number)} sx={{ width: 90 }}
              />
            </Box>

            {wynik.dof !== undefined && (
              <Chip
                size="small"
                color={wynik.dof === 0 ? 'success' : 'default'}
                label={wynik.dof === 0 ? 'w pełni określony' : `${wynik.dof} stopni swobody`}
              />
            )}
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ width: 60 }}>obszar</Typography>
            <Slider
              size="small" min={240} max={1200} value={doc.viewport.width} valueLabelDisplay="auto"
              onChange={(_, v) => zmien((d) => { d.viewport.width = v as number; })}
            />
            <Slider
              size="small" min={200} max={800} value={doc.viewport.height} valueLabelDisplay="auto"
              onChange={(_, v) => zmien((d) => { d.viewport.height = v as number; })}
            />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {PRZYKLADY[przyklad].wskazowka}
          </Typography>
        </Paper>

        <Paper sx={{ flex: 1, minHeight: 0, p: 1, display: 'flex', overflow: 'auto' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${doc.viewport.width} ${doc.viewport.height}`}
            style={{ width: '100%', height: '100%', maxHeight: '100%', touchAction: 'none', background: 'rgba(255,255,255,0.03)' }}
            onPointerMove={ruszaj}
            onPointerUp={koniec}
            onPointerCancel={koniec}
            onPointerDown={() => setWybrany(null)}
          >
            {skok > 0 && (
              <g stroke="rgba(255,255,255,0.10)" strokeWidth={0.5}>
                {Array.from({ length: Math.floor(doc.viewport.width / skok) + 1 }, (_, i) => (
                  <line key={`v${i}`} x1={i * skok} y1={0} x2={i * skok} y2={doc.viewport.height} />
                ))}
                {Array.from({ length: Math.floor(doc.viewport.height / skok) + 1 }, (_, i) => (
                  <line key={`h${i}`} x1={0} y1={i * skok} x2={doc.viewport.width} y2={i * skok} />
                ))}
              </g>
            )}

            <rect
              x={0.5} y={0.5} width={doc.viewport.width - 1} height={doc.viewport.height - 1}
              fill="none" stroke="rgba(255,255,255,0.35)" strokeDasharray="6 4"
            />

            {doc.shapes.map((s, i) => {
              const r = rects[s.id];
              if (!r) return null;
              const barwa = BARWY[i % BARWY.length];
              const zaznaczony = s.id === wybrany;
              return (
                <g key={s.id} onPointerDown={(e) => start(e, s.id)} style={{ cursor: 'move' }}>
                  <rect
                    x={r.x} y={r.y} width={Math.max(0, r.w)} height={Math.max(0, r.h)}
                    fill={barwa} fillOpacity={s.container ? 0.12 : 0.45}
                    stroke={zaznaczony ? '#fff' : barwa}
                    strokeWidth={zaznaczony ? 2 : 1}
                    rx={3}
                  />
                  <text
                    x={r.x + 6} y={r.y + 16} fill="#fff" fontSize={12}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {s.label ?? s.id}
                  </text>
                </g>
              );
            })}
          </svg>
        </Paper>

        {komunikat && <Alert severity="info" onClose={() => setKomunikat(null)}>{komunikat}</Alert>}
        {wynik.issues.map((u) => <Alert key={u} severity="warning">{u}</Alert>)}
      </Box>

      {/* ── Prawa kolumna: parametry i więzy ──────────────────────────────── */}
      <Paper sx={{ width: 320, p: 1.5, overflow: 'auto', flexShrink: 0 }}>
        <Typography variant="subtitle2">Tryb: {trybOpis.nazwa}</Typography>
        <Typography variant="caption" color="text.secondary">{trybOpis.opis}</Typography>

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="subtitle2" gutterBottom>Parametry</Typography>
        {Object.keys(doc.vars).length === 0 && (
          <Typography variant="caption" color="text.secondary">
            Brak. Dodaj parametr i odwołaj się do niego w polu wartości.
          </Typography>
        )}
        {Object.entries(doc.vars).map(([nazwa, wartosc]) => (
          <Box key={nazwa} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ width: 70 }}>{nazwa}</Typography>
            <Slider
              size="small" min={0} max={400} value={wartosc} valueLabelDisplay="auto"
              onChange={(_, v) => zmien((d) => { d.vars[nazwa] = v as number; })}
            />
            <Typography variant="caption" sx={{ width: 30 }}>{Math.round(wartosc)}</Typography>
            <IconButton size="small" onClick={() => zmien((d) => { delete d.vars[nazwa]; })}>
              <DeleteIcon fontSize="inherit" />
            </IconButton>
          </Box>
        ))}
        <NowyParametr onDodaj={(nazwa) => zmien((d) => { d.vars[nazwa] = 50; })} />

        {doc.mode === 'constraint' && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" gutterBottom>Więzy</Typography>
            <Stack spacing={0.5}>
              {(doc.constraints ?? []).map((w) => {
                const rodzaj = RODZAJE_WIEZOW.find((r) => r.typ === w.type);
                return (
                  <Box key={w.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12 }}>
                    <Box sx={{ flex: 1 }}>
                      {rodzaj?.nazwa ?? w.type}: {w.refs.join(' ↔ ')}
                    </Box>
                    {w.value !== undefined && (
                      <TextField
                        size="small" variant="standard" sx={{ width: 80 }}
                        value={naTekst(w.value)}
                        onChange={(e) => zmien((d) => {
                          d.constraints!.find((c) => c.id === w.id)!.value = zTekstu(e.target.value);
                        })}
                      />
                    )}
                    <IconButton
                      size="small"
                      onClick={() => zmien((d) => { d.constraints = d.constraints!.filter((c) => c.id !== w.id); })}
                    >
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </Box>
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Nowy więz łączy zaznaczony kształt z pierwszym innym.
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
              {RODZAJE_WIEZOW.map((r) => (
                <Button key={r.typ} size="small" variant="outlined" onClick={() => dodajWiez(r.typ)}>
                  {r.nazwa}
                </Button>
              ))}
            </Box>
          </>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Typography variant="caption" color="text.secondary" component="div">
          Ten sam dokument liczy się w każdym trybie inaczej — przełącz tryb bez wczytywania
          nowego przykładu, żeby zobaczyć, co dany silnik z nim robi, a czego nie potrafi.
        </Typography>
      </Paper>
    </Box>
  );
}

function NowyParametr({ onDodaj }: { onDodaj: (nazwa: string) => void }) {
  const [nazwa, setNazwa] = useState('');
  const poprawna = /^[A-Za-z_][A-Za-z0-9_]*$/.test(nazwa);
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
      <TextField
        size="small" placeholder="nazwa" value={nazwa} fullWidth
        onChange={(e) => setNazwa(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && poprawna) { onDodaj(nazwa); setNazwa(''); } }}
      />
      <IconButton size="small" disabled={!poprawna} onClick={() => { onDodaj(nazwa); setNazwa(''); }}>
        <AddIcon fontSize="inherit" />
      </IconButton>
    </Stack>
  );
}
