/**
 * Panel modułu WebAssembly: kompilacja AssemblyScriptu i wgranie na urządzenie.
 *
 * Wartość jest w tym, czego tu **nie ma**: instalacji toolchaina. Wsad na
 * płytkę wymaga kontenera z PlatformIO ważącego 13,8 GB, a moduł WebAssembly
 * kompiluje się w tej samej przeglądarce, w której powstaje. Napisz, kliknij,
 * wgraj.
 *
 * Panel pokazuje trzy rzeczy, bo tyle trzeba wiedzieć przed wgraniem:
 * czy się zbudowało, ile waży i jaki ma skrót. Rozmiar, bo pula na urządzeniu
 * jest ustalona przy linkowaniu; skrót, bo to on jedzie w `begin` i po nim
 * urządzenie pozna, że dostało to samo, co wysłano.
 */

import { useCallback, useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { ENTRY_FILE, sha256Hex, type CompileDiagnostic } from '../wasm/compileAssemblyScript';
import { useAssemblyScript } from '../wasm/useAssemblyScript';

export interface WasmModulePanelProps {
    /** Źródła modułu: ścieżka → treść. Zwykle prosto z modeli edytora. */
    sources: Record<string, string>;
    /**
     * Wgranie na urządzenie. Brak oznacza, że gospodarz nie podłączył kanału —
     * panel wtedy kompiluje i pozwala pobrać moduł, ale nie udaje, że umie
     * więcej.
     */
    onUpload?(wasm: Uint8Array, sha256: string): Promise<void> | void;
    /** Nazwa urządzenia w przycisku wgrywania. */
    deviceLabel?: string;
}

const SEVERITY_COLOR: Record<CompileDiagnostic['severity'], string> = {
    error: '#f87171',
    warning: '#fbbf24',
    info: '#94a3b8',
};

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    return `${(n / 1024).toFixed(1)} kB`;
}

export function WasmModulePanel({ sources, onUpload, deviceLabel }: WasmModulePanelProps) {
    const { compile, busy, result } = useAssemblyScript();
    const [mode, setMode] = useState<'debug' | 'release'>('release');
    const [sha, setSha] = useState<string | null>(null);
    const [uploadState, setUploadState] = useState<'idle' | 'sending' | 'done' | 'failed'>('idle');
    const [uploadError, setUploadError] = useState<string | null>(null);

    const hasEntry = Boolean(sources[ENTRY_FILE]);

    const errors = useMemo(
        () => (result?.diagnostics ?? []).filter(d => d.severity === 'error'),
        [result],
    );
    const warnings = useMemo(
        () => (result?.diagnostics ?? []).filter(d => d.severity === 'warning'),
        [result],
    );

    const onCompile = useCallback(() => {
        setSha(null);
        setUploadState('idle');
        setUploadError(null);
        compile({ sources, mode });
    }, [compile, sources, mode]);

    const onUploadClick = useCallback(async () => {
        if (!result?.ok || !onUpload) return;

        setUploadState('sending');
        setUploadError(null);
        try {
            // Skrót liczymy tuż przed wysłaniem, nad tymi bajtami, które
            // wychodzą — a nie nad wynikiem wcześniejszej kompilacji.
            const digest = await sha256Hex(result.wasm);
            setSha(digest);
            await onUpload(result.wasm, digest);
            setUploadState('done');
        } catch (e) {
            setUploadState('failed');
            setUploadError(e instanceof Error ? e.message : String(e));
        }
    }, [result, onUpload]);

    const download = useCallback(() => {
        if (!result?.ok) return;
        const blob = new Blob([result.wasm as unknown as BlobPart], { type: 'application/wasm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'module.wasm';
        a.click();
        URL.revokeObjectURL(url);
    }, [result]);

    return (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button
                    variant="contained"
                    size="small"
                    onClick={onCompile}
                    disabled={busy || !hasEntry}
                    startIcon={busy ? <CircularProgress size={14} color="inherit" /> : undefined}
                >
                    {busy ? 'Kompiluję…' : 'Kompiluj'}
                </Button>

                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={mode}
                    onChange={(_, v) => v && setMode(v)}
                    aria-label="tryb kompilacji"
                >
                    <ToggleButton value="release">Wydanie</ToggleButton>
                    <ToggleButton value="debug">Debug</ToggleButton>
                </ToggleButtonGroup>

                {result?.ok && (
                    <>
                        <Chip size="small" label={formatBytes(result.wasm.byteLength)} />
                        <Chip size="small" variant="outlined" label={`${result.elapsedMs} ms`} />
                    </>
                )}
            </Stack>

            {!hasEntry && (
                <Alert severity="info" variant="outlined">
                    Brak pliku <code>{ENTRY_FILE}</code>. Moduł WebAssembly zaczyna się od niego.
                </Alert>
            )}

            {result?.ok && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" onClick={download}>
                        Pobierz .wasm
                    </Button>
                    {onUpload && (
                        <Button
                            size="small"
                            variant="contained"
                            color="secondary"
                            onClick={onUploadClick}
                            disabled={uploadState === 'sending'}
                            startIcon={uploadState === 'sending'
                                ? <CircularProgress size={14} color="inherit" /> : undefined}
                        >
                            {uploadState === 'sending'
                                ? 'Wgrywam…'
                                : `Wgraj${deviceLabel ? ` na ${deviceLabel}` : ''}`}
                        </Button>
                    )}
                </Stack>
            )}

            {uploadState === 'done' && (
                <Alert severity="success" variant="outlined">
                    Moduł wgrany. Urządzenie obserwuje go teraz przez okres próbny — jeśli
                    się wywróci, wróci samo do poprzedniej wersji.
                </Alert>
            )}
            {uploadState === 'failed' && (
                <Alert severity="error" variant="outlined">
                    Wgrywanie nieudane: {uploadError}
                </Alert>
            )}

            {sha && (
                <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.7, wordBreak: 'break-all' }}>
                    sha256: {sha}
                </Typography>
            )}

            {(errors.length > 0 || warnings.length > 0) && <Divider />}

            <Stack spacing={0.75}>
                {[...errors, ...warnings].map((d, i) => (
                    <Box
                        key={i}
                        sx={{
                            borderLeft: `3px solid ${SEVERITY_COLOR[d.severity]}`,
                            pl: 1.25,
                            py: 0.25,
                            fontFamily: 'monospace',
                            fontSize: 12,
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {d.text}
                    </Box>
                ))}
            </Stack>

            {result && !result.ok && errors.length === 0 && (
                <Box sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
                    {result.output || 'Kompilacja nie powiodła się bez komunikatu.'}
                </Box>
            )}
        </Box>
    );
}
