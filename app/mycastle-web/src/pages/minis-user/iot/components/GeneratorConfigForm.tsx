import { Box, TextField, MenuItem, Checkbox, FormControlLabel, IconButton, Typography } from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import type { ValueGenerator, ValueGeneratorType } from '@modules/iot-emulator';

const GENERATOR_TYPES: { value: ValueGeneratorType; label: string }[] = [
  { value: 'constant', label: 'Constant' },
  { value: 'random', label: 'Random' },
  { value: 'sine', label: 'Sine Wave' },
  { value: 'linear', label: 'Linear Ramp' },
  { value: 'step', label: 'Step' },
];

function createDefaultGenerator(type: ValueGeneratorType): ValueGenerator {
  switch (type) {
    case 'constant': return { type: 'constant', value: 0 };
    case 'random': return { type: 'random', min: 0, max: 100, decimals: 1 };
    case 'sine': return { type: 'sine', min: 0, max: 100, periodSec: 60, phaseDeg: 0 };
    case 'linear': return { type: 'linear', startValue: 0, endValue: 100, durationSec: 60, repeat: false };
    case 'step': return { type: 'step', values: [0, 50, 100], stepIntervalSec: 10 };
  }
}

interface GeneratorConfigFormProps {
  generator: ValueGenerator;
  onChange: (generator: ValueGenerator) => void;
}

function GeneratorConfigForm({ generator, onChange }: GeneratorConfigFormProps) {
  const handleTypeChange = (type: ValueGeneratorType) => {
    onChange(createDefaultGenerator(type));
  };

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <TextField
        select
        label="Pattern"
        value={generator.type}
        onChange={(e) => handleTypeChange(e.target.value as ValueGeneratorType)}
        size="small"
        sx={{ width: 130 }}
      >
        {GENERATOR_TYPES.map((gt) => (
          <MenuItem key={gt.value} value={gt.value}>{gt.label}</MenuItem>
        ))}
      </TextField>

      {generator.type === 'constant' && (
        <TextField
          label="Value"
          type="number"
          value={generator.value}
          onChange={(e) => onChange({ ...generator, value: parseFloat(e.target.value) || 0 })}
          size="small"
          sx={{ width: 100 }}
        />
      )}

      {generator.type === 'random' && (
        <>
          <TextField
            label="Min"
            type="number"
            value={generator.min}
            onChange={(e) => onChange({ ...generator, min: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Max"
            type="number"
            value={generator.max}
            onChange={(e) => onChange({ ...generator, max: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Decimals"
            type="number"
            value={generator.decimals}
            onChange={(e) => onChange({ ...generator, decimals: parseInt(e.target.value, 10) || 0 })}
            size="small"
            sx={{ width: 80 }}
            inputProps={{ min: 0, max: 6 }}
          />
        </>
      )}

      {generator.type === 'sine' && (
        <>
          <TextField
            label="Min"
            type="number"
            value={generator.min}
            onChange={(e) => onChange({ ...generator, min: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Max"
            type="number"
            value={generator.max}
            onChange={(e) => onChange({ ...generator, max: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Period (s)"
            type="number"
            value={generator.periodSec}
            onChange={(e) => onChange({ ...generator, periodSec: parseFloat(e.target.value) || 1 })}
            size="small"
            sx={{ width: 100 }}
            inputProps={{ min: 1 }}
          />
          <TextField
            label="Phase (°)"
            type="number"
            value={generator.phaseDeg}
            onChange={(e) => onChange({ ...generator, phaseDeg: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 90 }}
          />
        </>
      )}

      {generator.type === 'linear' && (
        <>
          <TextField
            label="Start"
            type="number"
            value={generator.startValue}
            onChange={(e) => onChange({ ...generator, startValue: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="End"
            type="number"
            value={generator.endValue}
            onChange={(e) => onChange({ ...generator, endValue: parseFloat(e.target.value) || 0 })}
            size="small"
            sx={{ width: 80 }}
          />
          <TextField
            label="Duration (s)"
            type="number"
            value={generator.durationSec}
            onChange={(e) => onChange({ ...generator, durationSec: parseFloat(e.target.value) || 1 })}
            size="small"
            sx={{ width: 110 }}
            inputProps={{ min: 1 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={generator.repeat}
                onChange={(e) => onChange({ ...generator, repeat: e.target.checked })}
                size="small"
              />
            }
            label="Repeat"
          />
        </>
      )}

      {generator.type === 'step' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              label="Interval (s)"
              type="number"
              value={generator.stepIntervalSec}
              onChange={(e) => onChange({ ...generator, stepIntervalSec: parseFloat(e.target.value) || 1 })}
              size="small"
              sx={{ width: 110 }}
              inputProps={{ min: 1 }}
            />
            <IconButton
              size="small"
              onClick={() => onChange({ ...generator, values: [...generator.values, 0] })}
            >
              <Add fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary">Values:</Typography>
            {generator.values.map((val, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center' }}>
                <TextField
                  type="number"
                  value={val}
                  onChange={(e) => {
                    const newValues = [...generator.values];
                    newValues[i] = parseFloat(e.target.value) || 0;
                    onChange({ ...generator, values: newValues });
                  }}
                  size="small"
                  sx={{ width: 70 }}
                />
                {generator.values.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={() => {
                      const newValues = generator.values.filter((_, idx) => idx !== i);
                      onChange({ ...generator, values: newValues });
                    }}
                  >
                    <Remove fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default GeneratorConfigForm;
