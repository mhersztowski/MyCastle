/**
 * UvProjectionControls — nadanie siatce współrzędnych tekstury liczonych z jej
 * kształtu.
 *
 * Potrzebne przy modelach z generatorów. Przychodzą one z **automatycznym
 * rozwinięciem**: siatka jest rozcięta na setki wysepek ciasno upakowanych
 * w kwadracie 0–1, pod teksturę wypalaną do tego właśnie układu. Nałożenie na
 * to zwykłego obrazka daje sieczkę i nie ma ustawienia materiału, które by to
 * naprawiło — obraz i wysepki to dwa niezwiązane układy.
 *
 * Rzut kładzie obraz na modelu tak, jak model leży w przestrzeni. Operacja jest
 * **niszcząca** (nadpisuje współrzędne z pliku), więc mówimy o tym wprost,
 * zamiast zostawiać użytkownika z pytaniem, co się właśnie stało.
 */
import { useState } from 'react';
import { Box, Button, MenuItem, Select, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import type { UvProjectionOptions } from '@mhersztowski/ui-core';
import { PropertyRow } from './PropertyRow';

export interface UvProjectionControlsProps {
  hasUv?: boolean;
  onApply: (opcje: UvProjectionOptions) => void;
}

const POLE_SX = {
  flex: 1,
  '& .MuiInputBase-root': { height: 22, fontSize: '0.7rem' },
  '& .MuiInputBase-input': { py: 0.25, px: 0.5 },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
};

export function UvProjectionControls({ hasUv, onApply }: UvProjectionControlsProps) {
  const [otwarte, setOtwarte] = useState(false);
  const [tryb, setTryb] = useState<'planar' | 'box'>('planar');
  const [os, setOs] = useState<'x' | 'y' | 'z'>('y');
  const [skala, setSkala] = useState(1);
  const [obrot, setObrot] = useState(0);

  if (!otwarte) {
    return (
      <PropertyRow label="UV">
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: hasUv ? 'text.disabled' : 'warning.main' }}>
            {hasUv ? 'z pliku' : 'brak'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" sx={{ fontSize: '0.65rem', py: 0, minWidth: 0 }} onClick={() => setOtwarte(true)}>
            Generuj…
          </Button>
        </Box>
      </PropertyRow>
    );
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0.5, p: 0.75, mt: 0.5 }}>
      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>
        Generuj UV z kształtu
      </Typography>

      <PropertyRow label="Tryb">
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tryb}
          onChange={(_, v) => v && setTryb(v as 'planar' | 'box')}
          sx={{ flex: 1, '& .MuiToggleButton-root': { py: 0, fontSize: '0.65rem', flex: 1 } }}
        >
          <Tooltip title="Obraz kładzie się na modelu z jednego kierunku, jak kalkomania.">
            <ToggleButton value="planar">płaski</ToggleButton>
          </Tooltip>
          <Tooltip title="Każda ściana dostaje rzut z osi, do której jest najbardziej zwrócona. Rozdziela wierzchołki.">
            <ToggleButton value="box">sześcienny</ToggleButton>
          </Tooltip>
        </ToggleButtonGroup>
      </PropertyRow>

      {tryb === 'planar' && (
        <PropertyRow label="Oś">
          <Select
            size="small"
            value={os}
            onChange={(e) => setOs(e.target.value as 'x' | 'y' | 'z')}
            sx={{ ...POLE_SX, '& .MuiSelect-select': { py: 0.25, px: 0.5, fontSize: '0.7rem' } }}
          >
            <MenuItem value="y" sx={{ fontSize: '0.7rem' }}>Y — z góry</MenuItem>
            <MenuItem value="x" sx={{ fontSize: '0.7rem' }}>X — z boku</MenuItem>
            <MenuItem value="z" sx={{ fontSize: '0.7rem' }}>Z — z przodu</MenuItem>
          </Select>
        </PropertyRow>
      )}

      <PropertyRow label="Skala">
        <TextField
          size="small"
          type="number"
          value={skala}
          onChange={(e) => setSkala(parseFloat(e.target.value) || 1)}
          slotProps={{ htmlInput: { step: 0.1, min: 0.01 } }}
          sx={POLE_SX}
        />
      </PropertyRow>

      <PropertyRow label="Obrót">
        <TextField
          size="small"
          type="number"
          value={obrot}
          onChange={(e) => setObrot(parseFloat(e.target.value) || 0)}
          slotProps={{ htmlInput: { step: 15 } }}
          sx={POLE_SX}
        />
      </PropertyRow>

      <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', display: 'block', mt: 0.5 }}>
        Nadpisuje współrzędne z pliku. Skala powyżej 1 wymaga tekstury z powtarzaniem.
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
        <Button
          size="small"
          variant="contained"
          sx={{ fontSize: '0.65rem', py: 0, flex: 1 }}
          onClick={() => onApply({ tryb, ...(tryb === 'planar' ? { os } : {}), skala, obrot })}
        >
          Zastosuj
        </Button>
        <Button size="small" sx={{ fontSize: '0.65rem', py: 0 }} onClick={() => setOtwarte(false)}>
          Zamknij
        </Button>
      </Box>
    </Box>
  );
}
