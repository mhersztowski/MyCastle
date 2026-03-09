import { Box, TextField, IconButton, Typography, Paper } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import type { EmulatedMetricConfig } from '@modules/iot-emulator';
import GeneratorConfigForm from './GeneratorConfigForm';

interface MetricConfigEditorProps {
  metrics: EmulatedMetricConfig[];
  onChange: (metrics: EmulatedMetricConfig[]) => void;
}

function MetricConfigEditor({ metrics, onChange }: MetricConfigEditorProps) {
  const handleAdd = () => {
    onChange([
      ...metrics,
      { key: '', unit: '', generator: { type: 'constant', value: 0 } },
    ]);
  };

  const handleRemove = (index: number) => {
    onChange(metrics.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, updates: Partial<EmulatedMetricConfig>) => {
    onChange(metrics.map((m, i) => (i === index ? { ...m, ...updates } : m)));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">Metrics</Typography>
        <IconButton size="small" onClick={handleAdd}>
          <Add fontSize="small" />
        </IconButton>
      </Box>
      {metrics.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
          No metrics configured. Click + to add one.
        </Typography>
      )}
      {metrics.map((metric, index) => (
        <Paper key={index} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Key"
              value={metric.key}
              onChange={(e) => handleChange(index, { key: e.target.value })}
              size="small"
              sx={{ width: 140 }}
              placeholder="temperature"
            />
            <TextField
              label="Unit"
              value={metric.unit}
              onChange={(e) => handleChange(index, { unit: e.target.value })}
              size="small"
              sx={{ width: 80 }}
              placeholder="°C"
            />
            <Box sx={{ flexGrow: 1 }}>
              <GeneratorConfigForm
                generator={metric.generator}
                onChange={(generator) => handleChange(index, { generator })}
              />
            </Box>
            <IconButton size="small" onClick={() => handleRemove(index)} sx={{ mt: 0.5 }}>
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

export default MetricConfigEditor;
