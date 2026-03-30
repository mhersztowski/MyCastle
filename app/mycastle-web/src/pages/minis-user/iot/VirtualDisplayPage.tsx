import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box, Typography, Paper, Chip, CircularProgress, Alert,
  Stack, Button, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import { ZoomIn, ZoomOut } from '@mui/icons-material';
import { useParams } from 'react-router-dom';
import { useMqtt } from '../../../modules/mqttclient';

// ── Pixel format decoders ──────────────────────────────────────────────────────

function decodeRgb565(buf: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const hi = buf[i * 2];
    const lo = buf[i * 2 + 1];
    const px = (hi << 8) | lo;
    img.data[i * 4]     = ((px >> 11) & 0x1f) << 3;
    img.data[i * 4 + 1] = ((px >> 5)  & 0x3f) << 2;
    img.data[i * 4 + 2] = (px & 0x1f) << 3;
    img.data[i * 4 + 3] = 255;
  }
  return img;
}

function decodeMonoVlsb(buf: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  const pages = Math.ceil(h / 8);
  for (let page = 0; page < pages; page++) {
    for (let col = 0; col < w; col++) {
      const byte = buf[page * w + col];
      for (let bit = 0; bit < 8; bit++) {
        const row = page * 8 + bit;
        if (row >= h) break;
        const on = (byte >> bit) & 1;
        const idx = (row * w + col) * 4;
        const v = on ? 255 : 0;
        img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v;
        img.data[idx + 3] = 255;
      }
    }
  }
  return img;
}

function decodeMonoHlsb(buf: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  const stride = Math.ceil(w / 8);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const byte = buf[row * stride + Math.floor(col / 8)];
      const on = (byte >> (7 - (col % 8))) & 1;
      const idx = (row * w + col) * 4;
      const v = on ? 255 : 0;
      img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v;
      img.data[idx + 3] = 255;
    }
  }
  return img;
}

function decodeGs4Hmsb(buf: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const nibble = i % 2 === 0 ? (buf[i >> 1] >> 4) & 0xf : buf[i >> 1] & 0xf;
    const v = (nibble << 4) | nibble;
    const idx = i * 4;
    img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v;
    img.data[idx + 3] = 255;
  }
  return img;
}

function decodeGs8(buf: Uint8Array, w: number, h: number): ImageData {
  const img = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = buf[i];
    const idx = i * 4;
    img.data[idx] = v; img.data[idx + 1] = v; img.data[idx + 2] = v;
    img.data[idx + 3] = 255;
  }
  return img;
}

function decodeFrame(data: string, fmt: string, w: number, h: number): ImageData | null {
  try {
    const raw = atob(data);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);

    switch (fmt) {
      case 'RGB565':    return decodeRgb565(buf, w, h);
      case 'MONO_VLSB': return decodeMonoVlsb(buf, w, h);
      case 'MONO_HLSB': return decodeMonoHlsb(buf, w, h);
      case 'GS4_HMSB': return decodeGs4Hmsb(buf, w, h);
      case 'GS8':       return decodeGs8(buf, w, h);
      default: return null;
    }
  } catch {
    return null;
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FrameMeta {
  n: number;
  w: number;
  h: number;
  fmt: string;
  receivedAt: number;
}

function VirtualDisplayPage() {
  const { userName, deviceName } = useParams<{ userName: string; deviceName: string }>();
  const { rawSubscribe, isConnected } = useMqtt();

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [meta, setMeta]       = useState<FrameMeta | null>(null);
  const [fps, setFps]         = useState(0);
  const [zoom, setZoom]       = useState(2);
  const [bgColor, setBgColor] = useState<'black' | 'white' | 'green'>('black');
  const [error, setError]     = useState<string | null>(null);

  const fpsCounterRef = useRef({ count: 0, ts: Date.now() });

  const handleFrame = useCallback((payload: string) => {
    let frame: any;
    try {
      frame = JSON.parse(payload);
    } catch {
      return;
    }
    if (frame.op !== 'frame') return;

    const img = decodeFrame(frame.data, frame.fmt, frame.w, frame.h);
    if (!img) {
      setError('Cannot decode format: ' + frame.fmt);
      return;
    }
    setError(null);

    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== frame.w || canvas.height !== frame.h) {
        canvas.width  = frame.w;
        canvas.height = frame.h;
      }
      canvas.getContext('2d')?.putImageData(img, 0, 0);
    }

    setMeta({ n: frame.n, w: frame.w, h: frame.h, fmt: frame.fmt, receivedAt: Date.now() });

    const fc = fpsCounterRef.current;
    fc.count++;
    const elapsed = (Date.now() - fc.ts) / 1000;
    if (elapsed >= 1) {
      setFps(Math.round(fc.count / elapsed));
      fc.count = 0;
      fc.ts = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !userName || !deviceName) return;
    const topic = `minis/${userName}/${deviceName}/ext/display/res`;
    return rawSubscribe(topic, handleFrame);
  }, [isConnected, userName, deviceName, rawSubscribe, handleFrame]);

  const bgColors = { black: '#000', white: '#fff', green: '#004d00' };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Virtual Display — {deviceName}</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {meta && (
            <>
              <Chip label={`${meta.w}×${meta.h}`} size="small" />
              <Chip label={meta.fmt} size="small" variant="outlined" />
              <Chip label={`${fps} fps`} size="small" color={fps > 0 ? 'success' : 'default'} />
            </>
          )}
          <Button size="small" startIcon={<ZoomOut />} onClick={() => setZoom(z => Math.max(1, z - 1))} disabled={zoom <= 1}>-</Button>
          <Typography variant="body2">{zoom}×</Typography>
          <Button size="small" startIcon={<ZoomIn />} onClick={() => setZoom(z => Math.min(8, z + 1))}>+</Button>
          <FormControl size="small" sx={{ minWidth: 90 }}>
            <InputLabel>BG</InputLabel>
            <Select value={bgColor} label="BG" onChange={e => setBgColor(e.target.value as any)}>
              <MenuItem value="black">Black</MenuItem>
              <MenuItem value="white">White</MenuItem>
              <MenuItem value="green">Green</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>MQTT not connected — waiting for connection…</Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper
        sx={{
          display: 'inline-block',
          p: 2,
          background: bgColors[bgColor],
          imageRendering: 'pixelated',
        }}
      >
        {!meta && isConnected && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#888' }}>
            <CircularProgress size={16} />
            <Typography variant="body2">Waiting for frame from device…</Typography>
          </Box>
        )}
        <canvas
          ref={canvasRef}
          style={{
            display: meta ? 'block' : 'none',
            width:  meta ? meta.w * zoom : 0,
            height: meta ? meta.h * zoom : 0,
            imageRendering: 'pixelated',
          }}
        />
      </Paper>

      {meta && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Frame #{meta.n} · last received {new Date(meta.receivedAt).toLocaleTimeString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default VirtualDisplayPage;
