import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Slider,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Build,
  Close,
  Memory,
  PlayArrow,
  Refresh,
  Send,
  Stop,
  Terminal,
} from '@mui/icons-material';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PinState {
  mode: 0 | 1 | 2;  // INPUT / OUTPUT / INPUT_PULLUP
  digital: 0 | 1;
  analog: number;    // 0–1023
}

interface EmscriptenModule {
  ccall(
    name: string,
    returnType: string | null,
    argTypes: string[],
    args: unknown[],
    opts?: { async?: boolean },
  ): unknown;
  _arduino_serial_push(ptr: number, len: number): void;
  _arduino_serial_available(): number;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAP8: Int8Array;
}

export interface CppWasmRuntimeProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title — e.g. "WASM Simulator — MySketch" */
  title: string;
  /**
   * Full SSE URL for build.
   * Backend streams `event: output\ndata: {"chunk":"..."}` and
   * `event: done\ndata: {"success":true}` events.
   */
  buildSseUrl: string;
  /**
   * URL to the compiled `sketch.js` (Emscripten MODULARIZE=1 output).
   * `sketch.wasm` is expected at the same path with `.js` replaced by `.wasm`.
   */
  wasmJsUrl: string;
  /** Bearer token for authenticated fetch calls. */
  token?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIN_COUNT    = 14;  // D0–D13
const ANALOG_COUNT = 6;   // A0–A5
const PIN_MODE_LABELS = ['INPUT', 'OUTPUT', 'PULLUP'] as const;
const PIN_MODE_COLORS = ['#607d8b', '#4caf50', '#ff9800'] as const;
const MAX_SERIAL_LINES = 500;

// ── PinRow sub-component ─────────────────────────────────────────────────────

function PinRow({ label, mode, digital, analog, isAnalog, onAnalogChange }: {
  label: string;
  mode: 0 | 1 | 2;
  digital: 0 | 1;
  analog: number;
  isAnalog: boolean;
  onAnalogChange?: (v: number) => void;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, minHeight: 36 }}>
      <Typography
        variant="caption"
        sx={{ width: 32, flexShrink: 0, fontFamily: 'monospace', color: 'text.secondary' }}
      >
        {label}
      </Typography>
      <Chip
        label={PIN_MODE_LABELS[mode]}
        size="small"
        sx={{ fontSize: 9, height: 18, bgcolor: PIN_MODE_COLORS[mode], color: '#fff', minWidth: 52 }}
      />
      {isAnalog ? (
        <>
          <Slider
            size="small"
            value={analog}
            min={0} max={1023} step={1}
            onChange={(_, v) => onAnalogChange?.(v as number)}
            sx={{ mx: 1, flex: 1 }}
          />
          <Typography variant="caption" sx={{ width: 32, textAlign: 'right', fontFamily: 'monospace' }}>
            {analog}
          </Typography>
        </>
      ) : (
        <>
          <Box
            sx={{
              width: 18, height: 18, borderRadius: '50%', border: '2px solid',
              borderColor: digital ? '#4caf50' : '#555',
              bgcolor: digital ? '#4caf50' : 'transparent',
              flexShrink: 0,
              cursor: mode === 0 || mode === 2 ? 'pointer' : 'default',
            }}
            onClick={() => {
              if ((mode === 0 || mode === 2) && onAnalogChange) {
                onAnalogChange(digital ? 0 : 1);
              }
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: digital ? '#4caf50' : 'text.secondary', fontFamily: 'monospace' }}
          >
            {digital ? 'HIGH' : 'LOW'}
          </Typography>
        </>
      )}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CppWasmRuntime({
  open, onClose, title, buildSseUrl, wasmJsUrl, token,
}: CppWasmRuntimeProps) {
  // Build state
  const [building, setBuilding]         = useState(false);
  const [buildOutput, setBuildOutput]   = useState('');
  const [buildSuccess, setBuildSuccess] = useState<boolean | null>(null);
  const [showBuildLog, setShowBuildLog] = useState(false);

  // Runtime state
  const [running, setRunning]         = useState(false);
  const [loading, setLoading]         = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const moduleRef   = useRef<EmscriptenModule | null>(null);
  const runningRef  = useRef(false);
  const loopRef     = useRef<Promise<void> | null>(null);

  // Pin state
  const [digitalPins, setDigitalPins] = useState<PinState[]>(() =>
    Array.from({ length: PIN_COUNT }, () => ({ mode: 0, digital: 0, analog: 0 } as PinState)),
  );
  const [analogPins, setAnalogPins] = useState<PinState[]>(() =>
    Array.from({ length: ANALOG_COUNT }, () => ({ mode: 0, digital: 0, analog: 0 } as PinState)),
  );
  const digitalPinsRef = useRef(digitalPins);
  const analogPinsRef  = useRef(analogPins);
  useEffect(() => { digitalPinsRef.current = digitalPins; }, [digitalPins]);
  useEffect(() => { analogPinsRef.current  = analogPins;  }, [analogPins]);

  // Serial monitor
  const [serialLines, setSerialLines] = useState<string[]>([]);
  const [serialInput, setSerialInput] = useState('');
  const serialEndRef    = useRef<HTMLDivElement>(null);
  const serialBufferRef = useRef('');

  const startTimeRef = useRef(0);

  // ── Serial output ────────────────────────────────────────────────────────
  const appendSerial = useCallback((text: string) => {
    serialBufferRef.current += text;
    const parts = serialBufferRef.current.split('\n');
    serialBufferRef.current = parts.pop() ?? '';
    if (parts.length) {
      setSerialLines(prev => {
        const next = [...prev, ...parts];
        return next.length > MAX_SERIAL_LINES ? next.slice(next.length - MAX_SERIAL_LINES) : next;
      });
    }
  }, []);

  useEffect(() => {
    serialEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLines]);

  // ── Load WASM module ─────────────────────────────────────────────────────
  const loadModule = useCallback(async (): Promise<EmscriptenModule | null> => {
    setLoading(true);
    setRuntimeError(null);

    try {
      const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const jsText = await fetch(wasmJsUrl, { headers: authHeader }).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch sketch.js: HTTP ${r.status}`);
        return r.text();
      });

      // Emscripten MODULARIZE=1 — eval to extract the factory function.
      // eslint-disable-next-line no-new-func
      const factory = new Function(`${jsText}; return createArduinoModule;`)() as
        (opts: Record<string, unknown>) => Promise<EmscriptenModule>;

      const wasmUrl = wasmJsUrl.replace(/sketch\.js(\?.*)?$/, 'sketch.wasm');

      startTimeRef.current = performance.now();

      const mod = await factory({
        locateFile: (f: string) => f === 'sketch.wasm' ? wasmUrl : f,

        print: (text: string) => appendSerial(text + '\n'),
        printErr: (text: string) => appendSerial('[ERR] ' + text + '\n'),

        onSerialOutput: (text: string) => appendSerial(text),

        onPinMode: (pin: number, mode: number) => {
          if (pin < PIN_COUNT) {
            setDigitalPins(prev => {
              const next = [...prev];
              next[pin] = { ...next[pin], mode: (mode as 0 | 1 | 2) };
              return next;
            });
          }
        },

        onDigitalWrite: (pin: number, val: number) => {
          if (pin < PIN_COUNT) {
            setDigitalPins(prev => {
              const next = [...prev];
              next[pin] = { ...next[pin], digital: val ? 1 : 0 };
              return next;
            });
          }
        },

        onDigitalRead: (pin: number): number =>
          pin < PIN_COUNT ? digitalPinsRef.current[pin].digital : 0,

        onAnalogWrite: (pin: number, val: number) => {
          if (pin < PIN_COUNT) {
            setDigitalPins(prev => {
              const next = [...prev];
              next[pin] = { ...next[pin], analog: val };
              return next;
            });
          }
        },

        onAnalogRead: (pin: number): number =>
          pin < ANALOG_COUNT ? analogPinsRef.current[pin].analog : 0,
      });

      return mod;
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setLoading(false);
    }
  }, [wasmJsUrl, token, appendSerial]);

  // ── Serial input → WASM ──────────────────────────────────────────────────
  const pushSerialInput = useCallback((text: string) => {
    const mod = moduleRef.current;
    if (!mod) return;
    const encoded = new TextEncoder().encode(text);
    const ptr = mod._malloc(encoded.length);
    mod.HEAP8.set(encoded, ptr);
    mod._arduino_serial_push(ptr, encoded.length);
    mod._free(ptr);
  }, []);

  // ── Run loop ─────────────────────────────────────────────────────────────
  const runSketch = useCallback(async (mod: EmscriptenModule) => {
    runningRef.current = true;
    setRunning(true);
    try {
      await mod.ccall('setup', null, [], [], { async: true });
      while (runningRef.current) {
        await mod.ccall('loop', null, [], [], { async: true });
        await new Promise<void>(r => setTimeout(r, 0));
      }
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : 'Runtime error');
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (runningRef.current) return;
    setSerialLines([]);
    serialBufferRef.current = '';
    setRuntimeError(null);
    setShowBuildLog(false);
    const mod = await loadModule();
    if (!mod) return;
    moduleRef.current = mod;
    loopRef.current = runSketch(mod);
  }, [loadModule, runSketch]);

  // ── Stop ─────────────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    runningRef.current = false;
  }, []);

  // ── Reset ────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    runningRef.current = false;
    await loopRef.current;
    moduleRef.current = null;
    setDigitalPins(Array.from({ length: PIN_COUNT }, () => ({ mode: 0, digital: 0, analog: 0 } as PinState)));
    setAnalogPins(Array.from({ length: ANALOG_COUNT }, () => ({ mode: 0, digital: 0, analog: 0 } as PinState)));
    setSerialLines([]);
    serialBufferRef.current = '';
    setRuntimeError(null);
  }, []);

  // ── Build WASM ───────────────────────────────────────────────────────────
  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setBuildOutput('');
    setBuildSuccess(null);
    setShowBuildLog(true);
    await handleReset();

    const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const resp = await fetch(buildSseUrl, {
        headers: { Accept: 'text/event-stream', ...authHeader },
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        setBuildOutput(text || `HTTP ${resp.status}`);
        setBuildSuccess(false);
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let success = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';

        for (const part of parts) {
          const m = part.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!m) continue;
          const [, evType, rawData] = m;
          try {
            const data = JSON.parse(rawData) as Record<string, unknown>;
            if (evType === 'output') setBuildOutput(p => p + (data.chunk as string));
            else if (evType === 'done') {
              success = data.success as boolean;
              setBuildSuccess(success);
            }
          } catch { /* malformed event */ }
        }
      }
    } catch (err) {
      setBuildOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setBuildSuccess(false);
    } finally {
      setBuilding(false);
    }
  }, [buildSseUrl, token, handleReset]);

  // Stop runtime when dialog closes
  useEffect(() => {
    if (!open) runningRef.current = false;
  }, [open]);

  const handleSendSerial = useCallback(() => {
    if (!serialInput) return;
    pushSerialInput(serialInput + '\n');
    setSerialInput('');
  }, [serialInput, pushSerialInput]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '90vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5 }}>
        <Memory fontSize="small" />
        <Typography variant="subtitle1" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>

        <Button
          size="small"
          variant="outlined"
          onClick={handleBuild}
          disabled={building || running}
          startIcon={building ? <CircularProgress size={14} /> : undefined}
        >
          {building ? 'Building…' : 'Build WASM'}
        </Button>

        <ButtonGroup size="small" variant="contained" sx={{ ml: 1 }}>
          <Tooltip title="Start (calls setup() + loop())">
            <span>
              <Button
                onClick={handleStart}
                disabled={running || loading || buildSuccess !== true}
                color="success"
                startIcon={loading ? <CircularProgress size={14} /> : <PlayArrow />}
              >
                Run
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Stop loop">
            <span>
              <Button onClick={handleStop} disabled={!running} color="warning">
                <Stop />
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Stop + reset all state">
            <span>
              <Button onClick={handleReset} color="error">
                <Refresh />
              </Button>
            </span>
          </Tooltip>
        </ButtonGroup>

        <IconButton size="small" onClick={onClose} sx={{ ml: 1 }}>
          <Close />
        </IconButton>
      </DialogTitle>

      {running && <LinearProgress sx={{ mx: 0 }} />}

      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flexGrow: 1 }}>
        {/* Left: pin state ─────────────────────────────────────────────────── */}
        <Box sx={{
          width: 260, flexShrink: 0, borderRight: 1,
          borderColor: 'divider', overflowY: 'auto', p: 1.5,
        }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
            DIGITAL PINS
          </Typography>
          {digitalPins.map((p, i) => (
            <PinRow
              key={`D${i}`}
              label={`D${i}`}
              mode={p.mode}
              digital={p.digital}
              analog={p.analog}
              isAnalog={false}
              onAnalogChange={val => {
                setDigitalPins(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], digital: val ? 1 : 0 };
                  return next;
                });
              }}
            />
          ))}

          <Divider sx={{ my: 1 }} />

          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
            ANALOG PINS
          </Typography>
          {analogPins.map((p, i) => (
            <PinRow
              key={`A${i}`}
              label={`A${i}`}
              mode={p.mode}
              digital={p.digital}
              analog={p.analog}
              isAnalog={true}
              onAnalogChange={val => {
                setAnalogPins(prev => {
                  const next = [...prev];
                  next[i] = { ...next[i], analog: val as number };
                  return next;
                });
              }}
            />
          ))}
        </Box>

        {/* Right: Serial Monitor / Build Log ──────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{
            px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider',
            display: 'flex', alignItems: 'center', gap: 1,
          }}>
            {/* Panel toggle */}
            <ButtonGroup size="small" variant="outlined" sx={{ mr: 1 }}>
              <Tooltip title="Serial Monitor">
                <Button
                  onClick={() => setShowBuildLog(false)}
                  variant={showBuildLog ? 'outlined' : 'contained'}
                  sx={{ px: 1, minWidth: 0 }}
                >
                  <Terminal fontSize="inherit" sx={{ fontSize: 14 }} />
                </Button>
              </Tooltip>
              <Tooltip title="Build Log">
                <Button
                  onClick={() => setShowBuildLog(true)}
                  variant={showBuildLog ? 'contained' : 'outlined'}
                  color={buildSuccess === false ? 'error' : buildSuccess === true ? 'success' : 'primary'}
                  sx={{ px: 1, minWidth: 0 }}
                >
                  <Build fontSize="inherit" sx={{ fontSize: 14 }} />
                </Button>
              </Tooltip>
            </ButtonGroup>

            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1, flexGrow: 1 }}>
              {showBuildLog ? 'BUILD LOG' : 'SERIAL MONITOR'}
            </Typography>

            {!showBuildLog && (
              <>
                <Chip
                  label={running ? 'RUNNING' : 'STOPPED'}
                  size="small"
                  color={running ? 'success' : 'default'}
                  sx={{ fontSize: 10, height: 18 }}
                />
                <Button size="small" variant="text" sx={{ fontSize: 11 }} onClick={() => setSerialLines([])}>
                  Clear
                </Button>
              </>
            )}

            {showBuildLog && buildSuccess !== null && (
              <Chip
                label={buildSuccess ? 'OK' : 'FAILED'}
                size="small"
                color={buildSuccess ? 'success' : 'error'}
                sx={{ fontSize: 10, height: 18 }}
              />
            )}
            {showBuildLog && building && <CircularProgress size={14} />}
          </Box>

          {/* Build Log view */}
          {showBuildLog && (
            <Box sx={{
              flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
              bgcolor: '#0d0d0d',
              color: buildSuccess === false ? '#ef9a9a' : '#c8e6c9',
              p: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {buildOutput
                ? buildOutput
                : <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                    No build output yet. Click <strong>Build WASM</strong> to compile.
                  </Typography>
              }
            </Box>
          )}

          {/* Serial Monitor view */}
          {!showBuildLog && (
            <>
              {runtimeError && (
                <Alert severity="error" sx={{ m: 1, py: 0 }}>{runtimeError}</Alert>
              )}

              {buildSuccess === null && !running && (
                <Box sx={{ p: 2 }}>
                  <Alert severity="info">
                    Click <strong>Build WASM</strong> to compile the sketch, then <strong>Run</strong> to simulate it in the browser.
                  </Alert>
                </Box>
              )}

              <Box sx={{
                flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12,
                bgcolor: '#0d0d0d', color: '#c8e6c9', p: 1.5,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {serialLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                {serialBufferRef.current && <span>{serialBufferRef.current}</span>}
                <div ref={serialEndRef} />
              </Box>
            </>
          )}

          {/* Serial input — always visible */}
          <Box sx={{ p: 1, borderTop: 1, borderColor: 'divider' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Type to send to Serial (press Enter or Send)"
              value={serialInput}
              onChange={e => setSerialInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSendSerial(); }}
              disabled={!running}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={handleSendSerial}
                      disabled={!running || !serialInput}
                    >
                      <Send fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { fontFamily: 'monospace', fontSize: 13 },
              }}
            />
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
