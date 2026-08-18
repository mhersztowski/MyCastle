/**
 * Wgranie aplikacji na urządzenie — skryptu Lua albo modułu WebAssembly.
 *
 * Druga strona `hydra::script::ScriptDelivery`. Cała mechanika transferu
 * (fragmentowanie, `begin`/`chunk`/`commit`, sprzątanie po nieudanej próbie)
 * siedzi po stronie serwera, bo rozmiar bufora wiadomości jest własnością
 * urządzenia, a nie przeglądarki. Ten panel wysyła obraz raz.
 *
 * ## Co panel musi powiedzieć, zanim cokolwiek pójdzie
 *
 * Dwie rzeczy, i obie pochodzą z urządzenia, nie z założeń:
 *
 * 1. **Jaki silnik.** Moduł `.wasm` na urządzeniu z Lua nie zadziała i nie ma
 *    sensu go wysyłać — urządzenie odrzuci go kodem `variant`, ale dopiero po
 *    otwarciu transferu. Lepiej powiedzieć to od razu, przy wyborze pliku.
 * 2. **Ile się mieści.** Slot ma zwykle kilkanaście kilobajtów. Obraz większy
 *    dostaje odmowę `too_large`, więc rozmiar pokazujemy obok pojemności.
 *
 * ## Okres próbny nie jest szczegółem technicznym
 *
 * Po wgraniu urządzenie obserwuje nową wersję i samo wraca do poprzedniej,
 * jeśli ta się wywali. W tym czasie kolejny transfer dostaje odmowę `busy` —
 * i to jest zachowanie, o którym użytkownik musi wiedzieć zawczasu, bo inaczej
 * odczyta je jako awarię.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, IconButton, LinearProgress,
    Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close, Refresh, UploadFile } from '@mui/icons-material';

import {
    ScriptUploadError, fetchScriptStatus, uploadScriptModule,
    type DeviceScriptStatus,
} from '../../../../services/scriptUpload';

interface Props {
    open: boolean;
    onClose(): void;
    userName: string;
    deviceName: string;
}

/** Postać obrazu wynikająca z rozszerzenia pliku. */
type Variant = 'wasm' | 'src';

interface Chosen {
    name: string;
    bytes: Uint8Array;
    variant: Variant;
    /** Podgląd dla źródeł tekstowych; `null` dla modułów binarnych. */
    text: string | null;
}

/**
 * Silniki i to, co przyjmują.
 *
 * `src` to tekst źródłowy Lua, `wasm` to moduł WebAssembly — a więc również
 * wszystko, co da się do niego skompilować, w tym C++.
 */
const ENGINE_ACCEPTS: Record<string, Variant> = {
    lua: 'src',
    wasm3: 'wasm',
    wamr: 'wasm',
};

function variantOf(fileName: string): Variant | null {
    if (fileName.endsWith('.wasm')) return 'wasm';
    if (fileName.endsWith('.lua')) return 'src';
    return null;
}

function formatBytes(n: number): string {
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function ScriptUploadDialog({ open, onClose, userName, deviceName }: Props) {
    const [status, setStatus] = useState<DeviceScriptStatus | null>(null);
    const [statusError, setStatusError] = useState<string | null>(null);
    const [loadingStatus, setLoadingStatus] = useState(false);

    const [chosen, setChosen] = useState<Chosen | null>(null);
    const [hmacKey, setHmacKey] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

    const fileInput = useRef<HTMLInputElement | null>(null);

    const refresh = useCallback(async () => {
        setLoadingStatus(true);
        setStatusError(null);
        try {
            const next = await fetchScriptStatus(userName, deviceName);
            if (next === null) {
                // Rozszerzenie bywa aktywne w `hello`, a urządzenie już nie
                // odpowiada. Rozróżnienie ma znaczenie: pierwsze to „spróbuj
                // później", drugie to „tu nie ma czego wgrywać".
                setStatusError('Urządzenie nie odpowiedziało na pytanie o stan skryptu.');
            }
            setStatus(next);
        } catch (e) {
            setStatusError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoadingStatus(false);
        }
    }, [userName, deviceName]);

    useEffect(() => {
        if (!open) return;
        setResult(null);
        void refresh();
    }, [open, refresh]);

    const pick = useCallback(async (file: File) => {
        const variant = variantOf(file.name);
        if (variant === null) {
            setResult({ ok: false, message: 'Obsługiwane są pliki .wasm i .lua.' });
            return;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        setResult(null);
        setChosen({
            name: file.name,
            bytes,
            variant,
            // Źródło pokazujemy, bo literówkę w skrypcie widać gołym okiem
            // szybciej niż po komunikacie z urządzenia.
            text: variant === 'src' ? new TextDecoder().decode(bytes) : null,
        });
    }, []);

    const send = useCallback(async () => {
        if (!chosen) return;
        setBusy(true);
        setResult(null);
        try {
            await uploadScriptModule(userName, deviceName, chosen.bytes, {
                variant: chosen.variant,
                name: `=${chosen.name}`,
                ...(hmacKey.trim() ? { hmacKey: hmacKey.trim() } : {}),
            });
            setResult({
                ok: true,
                message: 'Obraz wgrany. Urządzenie obserwuje nową wersję — jeśli się wywali, '
                    + 'wróci samo do poprzedniej.',
            });
            await refresh();
        } catch (e) {
            const message = e instanceof ScriptUploadError
                ? e.message
                : e instanceof Error ? e.message : String(e);
            setResult({ ok: false, message });
        } finally {
            setBusy(false);
        }
    }, [chosen, userName, deviceName, hmacKey, refresh]);

    const engine = status?.engine;
    const accepts = engine ? ENGINE_ACCEPTS[engine] : undefined;
    const capacity = status?.capacity;

    /* Powody, dla których wysyłka nie ma sensu — każdy z osobna, bo każdy
     * naprawia się czym innym. */
    const mismatch = chosen && accepts !== undefined && chosen.variant !== accepts;
    const tooLarge = chosen && capacity !== undefined && chosen.bytes.byteLength > capacity;
    const inTrial = status?.trial === true;

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Aplikacja urządzenia
                <IconButton onClick={onClose} disabled={busy} size="small"><Close /></IconButton>
            </DialogTitle>

            <DialogContent dividers>
                {/* ── Stan urządzenia ─────────────────────────────────── */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="subtitle2">Stan urządzenia</Typography>
                    <Tooltip title="Odśwież">
                        <span>
                            <IconButton size="small" onClick={() => void refresh()} disabled={loadingStatus || busy}>
                                <Refresh fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>
                    {loadingStatus && <CircularProgress size={16} />}
                </Box>

                {statusError && <Alert severity="warning" sx={{ mb: 2 }}>{statusError}</Alert>}

                {status && (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                        <Chip size="small" label={`silnik: ${engine ?? 'nieznany'}`} />
                        {accepts && <Chip size="small" label={`przyjmuje: ${accepts === 'wasm' ? '.wasm' : '.lua'}`} />}
                        {capacity !== undefined && <Chip size="small" label={`slot: ${formatBytes(capacity)}`} />}
                        {inTrial && <Chip size="small" color="warning" label="okres próbny" />}
                        {status.canRollback && <Chip size="small" variant="outlined" label="jest wersja zapasowa" />}
                    </Stack>
                )}

                {inTrial && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                        Urządzenie obserwuje jeszcze poprzednio wgraną wersję. Do końca okresu
                        próbnego kolejny transfer zostanie odrzucony — inaczej nowa wersja
                        wyparłaby tę jedyną, o której wiadomo, że wstaje.
                    </Alert>
                )}

                <Divider sx={{ my: 2 }} />

                {/* ── Wybór obrazu ────────────────────────────────────── */}
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Obraz</Typography>

                <input
                    ref={fileInput}
                    type="file"
                    accept=".wasm,.lua"
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void pick(file);
                        e.target.value = '';
                    }}
                />
                <Button
                    startIcon={<UploadFile />}
                    variant="outlined"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                >
                    Wybierz plik (.wasm albo .lua)
                </Button>

                {chosen && (
                    <Box sx={{ mt: 2 }}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip size="small" label={chosen.name} />
                            <Chip size="small" label={formatBytes(chosen.bytes.byteLength)}
                                  color={tooLarge ? 'error' : 'default'} />
                            <Chip size="small" label={chosen.variant === 'wasm' ? 'WebAssembly' : 'źródło Lua'}
                                  color={mismatch ? 'error' : 'default'} />
                        </Stack>

                        {chosen.text !== null && (
                            <TextField
                                value={chosen.text}
                                multiline
                                minRows={4}
                                maxRows={10}
                                fullWidth
                                size="small"
                                sx={{ mt: 2, '& textarea': { fontFamily: 'monospace', fontSize: 12 } }}
                                InputProps={{ readOnly: true }}
                            />
                        )}
                    </Box>
                )}

                {mismatch && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        Silnik <b>{engine}</b> nie wykona obrazu w tej postaci. Wybierz plik
                        {accepts === 'wasm' ? ' .wasm' : ' .lua'} albo zbuduj urządzenie z innym celem.
                    </Alert>
                )}
                {tooLarge && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        Obraz nie mieści się w slocie ({formatBytes(capacity!)}). Podnieś
                        <code> modules.script.delivery.slot_bytes </code> w pliku projektu
                        i wgraj wsad od nowa.
                    </Alert>
                )}

                <Divider sx={{ my: 2 }} />

                {/* ── Podpis ──────────────────────────────────────────── */}
                <TextField
                    label="Klucz podpisu (HMAC)"
                    value={hmacKey}
                    onChange={(e) => setHmacKey(e.target.value)}
                    type="password"
                    size="small"
                    fullWidth
                    disabled={busy}
                    helperText={
                        'Wymagany, gdy urządzenie ma ustawiony klucz. Sam skrót mówi tylko, '
                        + 'że obraz nie uszkodził się w drodze — policzy go równie dobrze napastnik.'
                    }
                />

                {busy && <LinearProgress sx={{ mt: 2 }} />}
                {result && (
                    <Alert severity={result.ok ? 'success' : 'error'} sx={{ mt: 2 }}>
                        {result.message}
                    </Alert>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={busy}>Zamknij</Button>
                <Button
                    variant="contained"
                    onClick={() => void send()}
                    disabled={busy || !chosen || !!mismatch || !!tooLarge}
                >
                    Wgraj
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ScriptUploadDialog;
