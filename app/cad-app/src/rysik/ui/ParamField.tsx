/**
 * Pojedyncze pole panelu, wygenerowane z jednej pozycji manifestu.
 *
 * Każde pole ma przełącznik trybu (wartość / zmienna / wyrażenie) — to on
 * robi z parametru sceny i suwaka w tekście tę samą rzecz, wiązaną klikiem,
 * a nie pisaniem kodu.
 */

import { useMemo, useState } from 'react';
import {
  Box, IconButton, InputAdornment, ListItemIcon, ListItemText, Menu, MenuItem,
  Select, Slider, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import FunctionsIcon from '@mui/icons-material/Functions';
import LinkIcon from '@mui/icons-material/Link';
import NumbersIcon from '@mui/icons-material/Numbers';
import { isValidExpr } from '../expr';
import { coerceValue, expr, literal, ref, specDefault, validateParam } from '../props';
import type { DocVar, ParamSource, ParamValue, Primitive, PropSpec } from '../types';

export type EditPhase = 'begin' | 'change' | 'end' | 'single';

interface Props {
  fieldKey: string;
  spec: PropSpec;
  value: ParamValue;
  /** Wartość po rozwiązaniu wiązań — pokazywana, gdy pole jest w trybie ref/expr. */
  resolved: Primitive;
  vars: DocVar[];
  onEdit: (value: ParamValue, phase: EditPhase) => void;
}

const SOURCE_META: Record<ParamSource, { label: string; icon: JSX.Element }> = {
  literal: { label: 'Wartość', icon: <NumbersIcon fontSize="small" /> },
  ref: { label: 'Zmienna dokumentu', icon: <LinkIcon fontSize="small" /> },
  expr: { label: 'Wyrażenie', icon: <FunctionsIcon fontSize="small" /> },
};

export function ParamField({ fieldKey, spec, value, resolved, vars, onEdit }: Props) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const allowed = spec.sources ?? (['literal', 'ref', 'expr'] as ParamSource[]);
  const issue = useMemo(() => validateParam(fieldKey, spec, value), [fieldKey, spec, value]);

  const switchSource = (src: ParamSource): void => {
    setMenuAnchor(null);
    if (src === value.src) return;
    if (src === 'literal') onEdit(literal(resolved), 'single');
    else if (src === 'ref') onEdit(ref(vars[0]?.name ?? ''), 'single');
    else onEdit(expr(String(resolved)), 'single');
  };

  return (
    <Box sx={{ mb: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', flex: 1 }}>
          {spec.label}
          {'unit' in spec && spec.unit ? ` [${spec.unit}]` : ''}
        </Typography>
        {value.src !== 'literal' && (
          <Typography sx={{ fontSize: 10, color: 'primary.main', fontFamily: 'monospace' }}>
            = {String(resolved)}
          </Typography>
        )}
        {allowed.length > 1 && (
          <Tooltip title={SOURCE_META[value.src].label}>
            <IconButton
              size="small"
              onClick={e => setMenuAnchor(e.currentTarget)}
              sx={{ p: 0.25, color: value.src === 'literal' ? 'text.disabled' : 'primary.main' }}
            >
              {SOURCE_META[value.src].icon}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        {allowed.map(src => (
          <MenuItem key={src} selected={src === value.src} onClick={() => switchSource(src)} dense>
            <ListItemIcon sx={{ minWidth: 30 }}>{SOURCE_META[src].icon}</ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 12 }}>{SOURCE_META[src].label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>

      {value.src === 'ref' && (
        <Select
          size="small"
          fullWidth
          value={vars.some(v => v.name === value.name) ? value.name : ''}
          displayEmpty
          onChange={e => onEdit(ref(String(e.target.value)), 'single')}
          sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="" disabled sx={{ fontSize: 12 }}>— wybierz zmienną —</MenuItem>
          {vars.map(v => (
            <MenuItem key={v.name} value={v.name} sx={{ fontSize: 12 }}>
              {v.label ? `${v.label} (${v.name})` : v.name}
            </MenuItem>
          ))}
        </Select>
      )}

      {value.src === 'expr' && (
        <TextField
          size="small"
          fullWidth
          value={value.code}
          error={!isValidExpr(value.code)}
          helperText={isValidExpr(value.code) ? `zależy od: ${value.deps.join(', ') || '—'}` : 'błąd składni'}
          onChange={e => onEdit(expr(e.target.value), 'single')}
          InputProps={{ sx: { fontSize: 12, fontFamily: 'monospace' } }}
          FormHelperTextProps={{ sx: { fontSize: 10, mx: 0 } }}
        />
      )}

      {value.src === 'literal' && <LiteralWidget spec={spec} value={value.value} onEdit={onEdit} />}

      {issue && value.src === 'literal' && (
        <Typography sx={{ fontSize: 10, color: 'error.main' }}>{issue.message}</Typography>
      )}
    </Box>
  );
}

function LiteralWidget({
  spec,
  value,
  onEdit,
}: {
  spec: PropSpec;
  value: Primitive;
  onEdit: (value: ParamValue, phase: EditPhase) => void;
}) {
  const set = (raw: unknown, phase: EditPhase): void => onEdit(literal(coerceValue(spec, raw)), phase);

  switch (spec.kind) {
    case 'number':
    case 'quantity': {
      const n = typeof value === 'number' ? value : Number(specDefault(spec));
      const [lo, hi] = spec.range ?? [0, 100];
      if (spec.widget === 'dial') {
        return <Dial value={n} min={lo} max={hi} onEdit={set} />;
      }
      if (spec.widget === 'spin') {
        return (
          <TextField
            size="small"
            fullWidth
            type="number"
            value={n}
            onChange={e => set(Number(e.target.value), 'single')}
            inputProps={{ step: spec.step ?? 1, min: lo, max: hi, style: { fontSize: 12, padding: '4px 8px' } }}
          />
        );
      }
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Slider
            size="small"
            value={n}
            min={lo}
            max={hi}
            step={spec.step ?? (hi - lo) / 100}
            // Przeciąganie to jedna transakcja: begin przy pierwszym ruchu,
            // commit dopiero przy puszczeniu — inaczej undo ma 200 kroków.
            onChange={(_, v) => set(v as number, 'change')}
            onChangeCommitted={(_, v) => set(v as number, 'end')}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            value={n}
            onChange={e => set(Number(e.target.value), 'single')}
            sx={{ width: 64 }}
            inputProps={{ style: { fontSize: 11, padding: '3px 6px', textAlign: 'right' } }}
          />
        </Box>
      );
    }

    case 'enum': {
      const current = String(value);
      if (spec.widget === 'radio') {
        return (
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={current}
            onChange={(_, v) => v && set(v, 'single')}
            sx={{ '& .MuiToggleButton-root': { fontSize: 11, py: 0.25 } }}
          >
            {spec.options.map(opt => (
              <ToggleButton key={opt} value={opt}>{opt}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        );
      }
      return (
        <Select
          size="small"
          fullWidth
          value={current}
          onChange={e => set(e.target.value, 'single')}
          sx={{ fontSize: 12, '& .MuiSelect-select': { py: 0.5 } }}
        >
          {spec.options.map(opt => (
            <MenuItem key={opt} value={opt} sx={{ fontSize: 12 }}>{opt}</MenuItem>
          ))}
        </Select>
      );
    }

    case 'bool':
      return (
        <Switch
          size="small"
          checked={Boolean(value)}
          onChange={e => set(e.target.checked, 'single')}
        />
      );

    case 'color':
      return (
        <TextField
          size="small"
          fullWidth
          value={String(value)}
          onChange={e => set(e.target.value, 'single')}
          InputProps={{
            sx: { fontSize: 12 },
            startAdornment: (
              <InputAdornment position="start">
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(String(value)) ? String(value) : '#000000'}
                  onChange={e => set(e.target.value, 'single')}
                  style={{ width: 22, height: 22, border: 'none', background: 'none', padding: 0 }}
                />
              </InputAdornment>
            ),
          }}
        />
      );

    case 'resource':
      return (
        <TextField
          size="small"
          fullWidth
          value={String(value)}
          placeholder={spec.accept?.join(', ') ?? 'ścieżka względna'}
          onChange={e => set(e.target.value, 'single')}
          InputProps={{ sx: { fontSize: 12, fontFamily: 'monospace' } }}
        />
      );

    default:
      return (
        <TextField
          size="small"
          fullWidth
          multiline={spec.widget === 'textarea'}
          value={String(value)}
          onChange={e => set(e.target.value, 'single')}
          InputProps={{ sx: { fontSize: 12 } }}
        />
      );
  }
}

/** Pokrętło dla wielkości kątowych — zawijanie jest tu naturalne. */
function Dial({
  value,
  min,
  max,
  onEdit,
}: {
  value: number;
  min: number;
  max: number;
  onEdit: (raw: unknown, phase: EditPhase) => void;
}) {
  const R = 26;
  const angle = ((value - min) / (max - min || 1)) * Math.PI * 2 - Math.PI / 2;
  const hx = R + Math.cos(angle) * (R - 6);
  const hy = R + Math.sin(angle) * (R - 6);

  const fromPointer = (e: React.PointerEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - R;
    const dy = e.clientY - rect.top - R;
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    const t = ((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    return min + t * (max - min);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <svg
        width={R * 2}
        height={R * 2}
        style={{ touchAction: 'none', cursor: 'grab' }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onEdit(fromPointer(e), 'change');
        }}
        onPointerMove={e => {
          if (e.buttons === 1) onEdit(fromPointer(e), 'change');
        }}
        onPointerUp={e => onEdit(fromPointer(e), 'end')}
      >
        <circle cx={R} cy={R} r={R - 2} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" />
        <line x1={R} y1={R} x2={hx} y2={hy} stroke="#4a90d9" strokeWidth={2} />
        <circle cx={hx} cy={hy} r={3} fill="#4a90d9" />
      </svg>
      <TextField
        size="small"
        value={value}
        onChange={e => onEdit(Number(e.target.value), 'single')}
        sx={{ width: 70 }}
        inputProps={{ style: { fontSize: 11, padding: '3px 6px', textAlign: 'right' } }}
      />
    </Box>
  );
}
