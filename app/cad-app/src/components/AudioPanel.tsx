import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, IconButton, Slider, Button, ToggleButton, ToggleButtonGroup,
  Tooltip, CircularProgress, Chip, Alert, Snackbar,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import FastForwardIcon from '@mui/icons-material/FastForward';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import DownloadIcon from '@mui/icons-material/Download';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import SaveIcon from '@mui/icons-material/Save';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import { Howl } from 'howler';
import { Mp3Encoder } from 'lamejs';
import { ServerFileBrowser } from './ServerFileBrowser';
import { vfsReadFileBin, vfsWriteFileBin } from '../vfs/cadProjectApi';

// ── WAV encoder ───────────────────────────────────────────────────────────────

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const s4 = (off: number, t: string) => { for (let i = 0; i < 4; i++) v.setUint8(off + i, t.charCodeAt(i)); };
  s4(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true);
  s4(8, 'WAVE'); s4(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s4(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Uint8Array(buf);
}

// ── MP3 encoder ───────────────────────────────────────────────────────────────

function encodeMp3(samples: Float32Array, sampleRate: number): Uint8Array {
  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const int16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const CHUNK = 1152;
  const parts: Int8Array[] = [];
  for (let i = 0; i < int16.length; i += CHUNK) {
    const buf = encoder.encodeBuffer(int16.subarray(i, i + CHUNK));
    if (buf.length > 0) parts.push(new Int8Array(buf));
  }
  const end = encoder.flush();
  if (end.length > 0) parts.push(new Int8Array(end));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(new Uint8Array(p.buffer, p.byteOffset, p.length), off); off += p.length; }
  return out;
}

// ── AudioWorklet source (runs in worker thread) ───────────────────────────────

const WORKLET_SRC = `
class PcmProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (ch) this.port.postMessage({ samples: ch.slice() });
    return true;
  }
}
registerProcessor('pcm-processor', PcmProcessor);
`;

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── component ─────────────────────────────────────────────────────────────────

type AudioFmt = 'wav' | 'mp3';

export function AudioPanel() {
  // ── player state ──────────────────────────────────────────────────────────
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [seek, setSeek] = useState(0);
  const [seekDragging, setSeekDragging] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const howlRef = useRef<Howl | null>(null);
  const playerBlobRef = useRef<string | null>(null);

  // ── recorder state ────────────────────────────────────────────────────────
  const [recFmt, setRecFmt] = useState<AudioFmt>('wav');
  const [recording, setRecording] = useState(false);
  const [encoding, setEncoding] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [recResult, setRecResult] = useState<{ bytes: Uint8Array; url: string; name: string; fmt: AudioFmt } | null>(null);
  const [recPlaying, setRecPlaying] = useState(false);
  const recHowlRef = useRef<Howl | null>(null);
  const recBlobUrlRef = useRef<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(44100);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recTimerRef = useRef<number | null>(null);

  // ── server browser ────────────────────────────────────────────────────────
  const [browserMode, setBrowserMode] = useState<'player-open' | 'rec-save' | null>(null);
  const [browserFmt, setBrowserFmt] = useState<AudioFmt>('wav');

  // ── toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      howlRef.current?.unload();
      recHowlRef.current?.unload();
      if (playerBlobRef.current) URL.revokeObjectURL(playerBlobRef.current);
      if (recBlobUrlRef.current) URL.revokeObjectURL(recBlobUrlRef.current);
      audioCtxRef.current?.close();
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (recTimerRef.current != null) window.clearInterval(recTimerRef.current);
    };
  }, []);

  // ── seek polling while playing ────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      if (!seekDragging && howlRef.current) {
        const s = howlRef.current.seek();
        if (typeof s === 'number') setSeek(s);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [playing, seekDragging]);

  // ── player helpers ────────────────────────────────────────────────────────
  const loadHowl = useCallback((url: string, name: string, fmt: AudioFmt, _vol = volume) => {
    howlRef.current?.unload();
    setPlaying(false); setSeek(0); setDuration(0);
    setPlayerName(name);
    const h = new Howl({
      src: [url],
      format: [fmt],
      volume: _vol,
      onload: () => setDuration(h.duration()),
      onend: () => { setPlaying(false); setSeek(0); },
      onloaderror: () => setToast('Failed to load audio file'),
    });
    howlRef.current = h;
  }, [volume]);

  const handleLocalFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (playerBlobRef.current) URL.revokeObjectURL(playerBlobRef.current);
    const url = URL.createObjectURL(file);
    playerBlobRef.current = url;
    const fmt: AudioFmt = file.name.toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
    loadHowl(url, file.name, fmt);
  }, [loadHowl]);

  const handleServerOpen = useCallback(async (dir: string, name: string) => {
    const ext = `.${browserFmt}`;
    try {
      const bytes = await vfsReadFileBin(`${dir}/${name}${ext}`);
      if (playerBlobRef.current) URL.revokeObjectURL(playerBlobRef.current);
      const blob = new Blob([bytes], { type: `audio/${browserFmt}` });
      const url = URL.createObjectURL(blob);
      playerBlobRef.current = url;
      loadHowl(url, `${name}${ext}`, browserFmt);
    } catch (err) {
      setToast(`Failed to load file: ${String(err)}`);
    }
  }, [browserFmt, loadHowl]);

  const handlePlay = useCallback(() => {
    const h = howlRef.current;
    if (!h) return;
    if (h.playing()) { h.pause(); setPlaying(false); }
    else { h.play(); setPlaying(true); }
  }, []);

  const handleStop = useCallback(() => {
    howlRef.current?.stop();
    setPlaying(false); setSeek(0);
  }, []);

  const handleRewind = useCallback(() => { howlRef.current?.seek(Math.max(0, (howlRef.current.seek() as number) - 10)); }, []);
  const handleForward = useCallback(() => {
    const h = howlRef.current;
    if (!h) return;
    h.seek(Math.min(h.duration(), (h.seek() as number) + 10));
  }, []);

  const handleSeekCommit = useCallback((_: React.SyntheticEvent | Event, val: number | number[]) => {
    setSeekDragging(false);
    const v = Array.isArray(val) ? val[0] : val;
    setSeek(v);
    howlRef.current?.seek(v);
  }, []);

  const handleVolumeChange = useCallback((_: Event, val: number | number[]) => {
    const v = Array.isArray(val) ? val[0] : val;
    setVolume(v);
    howlRef.current?.volume(v);
  }, []);

  // ── recorder helpers ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      sampleRateRef.current = ctx.sampleRate;
      samplesRef.current = [];

      const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
      const modUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(modUrl);
      URL.revokeObjectURL(modUrl);

      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'pcm-processor');
      workletNodeRef.current = node;
      node.port.onmessage = (e) => samplesRef.current.push((e.data as { samples: Float32Array }).samples);
      src.connect(node);
      // NOT connected to destination — no echo

      setRecSeconds(0); setRecording(true);
      recTimerRef.current = window.setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch (err) {
      setToast(`Microphone error: ${String(err)}`);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (recTimerRef.current != null) { window.clearInterval(recTimerRef.current); recTimerRef.current = null; }
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    const ctx = audioCtxRef.current;
    const sr = sampleRateRef.current;
    await ctx?.close();
    audioCtxRef.current = null;

    const chunks = samplesRef.current;
    samplesRef.current = [];
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const samples = new Float32Array(totalLen);
    let off = 0;
    for (const c of chunks) { samples.set(c, off); off += c.length; }

    setRecording(false);
    if (totalLen === 0) return;

    setEncoding(true);
    try {
      const bytes = recFmt === 'mp3' ? encodeMp3(samples, sr) : encodeWav(samples, sr);
      if (recBlobUrlRef.current) URL.revokeObjectURL(recBlobUrlRef.current);
      recHowlRef.current?.unload();
      setRecPlaying(false);
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: `audio/${recFmt}` });
      const url = URL.createObjectURL(blob);
      recBlobUrlRef.current = url;
      const name = `recording_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${recFmt}`;
      setRecResult({ bytes, url, name, fmt: recFmt });
      const rh = new Howl({ src: [url], format: [recFmt], volume, onend: () => setRecPlaying(false) });
      recHowlRef.current = rh;
    } catch (err) {
      setToast(`Encoding error: ${String(err)}`);
    } finally {
      setEncoding(false);
    }
  }, [recFmt, volume]);

  const handleRecPlay = useCallback(() => {
    const h = recHowlRef.current;
    if (!h) return;
    if (h.playing()) { h.pause(); setRecPlaying(false); }
    else { h.play(); setRecPlaying(true); }
  }, []);

  const handleDownload = useCallback(() => {
    if (!recResult) return;
    const a = document.createElement('a');
    a.href = recResult.url;
    a.download = recResult.name;
    a.click();
  }, [recResult]);

  const handleServerSave = useCallback(async (dir: string, name: string) => {
    if (!recResult) throw new Error('No recording to save');
    await vfsWriteFileBin(`${dir}/${name}.${recResult.fmt}`, recResult.bytes);
  }, [recResult]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI ────────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
      <input ref={fileInputRef} type="file" accept=".wav,.mp3" style={{ display: 'none' }} onChange={handleLocalFile} />

      {/* ── PLAYER ─────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <MusicNoteIcon sx={{ fontSize: 16, color: 'primary.main' }} />
          <Typography variant="overline" sx={{ lineHeight: 1, flex: 1 }}>Player</Typography>
          <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => fileInputRef.current?.click()}>
            Open local
          </Button>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={browserFmt}
            onChange={(_, v) => v && setBrowserFmt(v)}
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 11 } }}
          >
            <ToggleButton value="wav">WAV</ToggleButton>
            <ToggleButton value="mp3">MP3</ToggleButton>
          </ToggleButtonGroup>
          <Button
            size="small"
            startIcon={<FolderOpenIcon />}
            onClick={() => setBrowserMode('player-open')}
          >
            From server
          </Button>
        </Box>

        {playerName ? (
          <Chip
            icon={<MusicNoteIcon />}
            label={playerName}
            size="small"
            sx={{ mb: 1.5, maxWidth: '100%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          />
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ mb: 1.5 }}>
            No file loaded — open a local WAV/MP3 or load from server
          </Typography>
        )}

        {/* Seek bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ minWidth: 36, color: 'text.secondary' }}>{fmtTime(seek)}</Typography>
          <Slider
            size="small"
            value={seek}
            min={0}
            max={duration || 1}
            step={0.1}
            disabled={!playerName}
            onChange={(_, v) => { setSeekDragging(true); setSeek(Array.isArray(v) ? v[0] : v); }}
            onChangeCommitted={handleSeekCommit}
            sx={{ flex: 1, color: 'primary.main' }}
          />
          <Typography variant="caption" sx={{ minWidth: 36, textAlign: 'right', color: 'text.secondary' }}>{fmtTime(duration)}</Typography>
        </Box>

        {/* Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <Tooltip title="Restart">
            <span><IconButton size="small" disabled={!playerName} onClick={() => { howlRef.current?.seek(0); setSeek(0); }}><SkipPreviousIcon /></IconButton></span>
          </Tooltip>
          <Tooltip title="−10s">
            <span><IconButton size="small" disabled={!playerName} onClick={handleRewind}><FastRewindIcon /></IconButton></span>
          </Tooltip>
          <Tooltip title={playing ? 'Pause' : 'Play'}>
            <span>
              <IconButton size="small" disabled={!playerName} onClick={handlePlay} sx={{ bgcolor: 'primary.main', color: '#000', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground' } }}>
                {playing ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="+10s">
            <span><IconButton size="small" disabled={!playerName} onClick={handleForward}><FastForwardIcon /></IconButton></span>
          </Tooltip>
          <Tooltip title="Stop">
            <span><IconButton size="small" disabled={!playerName} onClick={handleStop}><StopIcon /></IconButton></span>
          </Tooltip>
          <Box sx={{ flex: 1 }} />
          <VolumeUpIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Slider
            size="small"
            value={volume}
            min={0} max={1} step={0.01}
            onChange={handleVolumeChange}
            sx={{ width: 80, color: 'text.secondary' }}
          />
          <Typography variant="caption" sx={{ minWidth: 32, color: 'text.secondary' }}>{Math.round(volume * 100)}%</Typography>
        </Box>
      </Paper>

      {/* ── RECORDER ───────────────────────────────────────────────── */}
      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <FiberManualRecordIcon sx={{ fontSize: 16, color: recording ? 'error.main' : 'text.secondary' }} />
          <Typography variant="overline" sx={{ lineHeight: 1, flex: 1 }}>Recorder</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', mr: 0.5 }}>Format:</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={recFmt}
            onChange={(_, v) => v && !recording && setRecFmt(v)}
            sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 11 } }}
          >
            <ToggleButton value="wav">WAV</ToggleButton>
            <ToggleButton value="mp3">MP3</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {!recording ? (
            <Button
              variant="contained"
              color="error"
              startIcon={<FiberManualRecordIcon />}
              onClick={startRecording}
              disabled={encoding}
              size="small"
            >
              Record
            </Button>
          ) : (
            <Button
              variant="contained"
              startIcon={<StopIcon />}
              onClick={stopRecording}
              size="small"
            >
              Stop
            </Button>
          )}

          {recording && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FiberManualRecordIcon sx={{ fontSize: 12, color: 'error.main', animation: 'pulse 1s infinite' }} />
              <Typography variant="body2" color="error.main" sx={{ fontFamily: 'monospace' }}>
                REC {fmtTime(recSeconds)}
              </Typography>
            </Box>
          )}

          {encoding && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">Encoding {recFmt.toUpperCase()}…</Typography>
            </Box>
          )}
        </Box>

        {/* Recording result */}
        {recResult && !recording && !encoding && (
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ mb: 1, fontFamily: 'monospace', fontSize: 11 }}>
              ✓ {recResult.name} &nbsp;·&nbsp; {fmtSize(recResult.bytes.length)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                startIcon={recPlaying ? <PauseIcon /> : <PlayArrowIcon />}
                onClick={handleRecPlay}
                variant="outlined"
              >
                {recPlaying ? 'Pause' : 'Preview'}
              </Button>
              <Button size="small" startIcon={<DownloadIcon />} onClick={handleDownload} variant="outlined">
                Download
              </Button>
              <Button
                size="small"
                startIcon={<SaveIcon />}
                onClick={() => setBrowserMode('rec-save')}
                variant="outlined"
              >
                Save to server
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      {/* ── Server browsers ────────────────────────────────────────── */}
      {browserMode === 'player-open' && (
        <ServerFileBrowser
          open
          mode="open"
          title={`Open ${browserFmt.toUpperCase()} from Server`}
          extension={`.${browserFmt}`}
          storageKey="cad.audioBrowser.dir"
          onClose={() => setBrowserMode(null)}
          onOpen={handleServerOpen}
          onDone={name => { setBrowserMode(null); setToast(`Loaded: ${name}`); }}
        />
      )}

      {browserMode === 'rec-save' && recResult && (
        <ServerFileBrowser
          open
          mode="save"
          title={`Save Recording to Server`}
          extension={`.${recResult.fmt}`}
          storageKey="cad.audioBrowser.dir"
          onClose={() => setBrowserMode(null)}
          onSave={handleServerSave}
          onDone={name => { setBrowserMode(null); setToast(`Saved: ${name}`); }}
        />
      )}

      <Snackbar open={Boolean(toast)} autoHideDuration={3500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert> : undefined}
      </Snackbar>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </Box>
  );
}
