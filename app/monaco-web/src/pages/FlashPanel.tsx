/**
 * Wgrywanie wsadu na płytkę — z przeglądarki, przez Web Serial.
 *
 * Świadomie mniejszy od `FlashDialog` z MyCastle. Tamten obsługuje trzy źródła
 * wsadu (wynik budowy, własny plik, gotowe obrazy z serwera) i przy okazji
 * dopisuje urządzenie do rejestru użytkownika. Edytor nie ma ani rejestru, ani
 * użytkownika — wgrywa wyłącznie to, co przed chwilą powstało z budowy.
 *
 * Wspólny jest rdzeń: `EspFlashService` z `@mhersztowski/web-serial`, ten sam,
 * którego używają projekty Arduino. Protokół siedzi w jednym miejscu i ma
 * pozostać w jednym.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
    EspFlashService,
    type FlashFileEntry,
    type FlashState,
} from '@mhersztowski/web-serial';

import { RECOMMEND_ERASE } from './hydraFlash';

export interface FlashPanelProps {
    open: boolean;
    onClose(): void;
    /** Pliki wsadu z katalogu budowy; `undefined` zanim je zbierzemy. */
    files?: FlashFileEntry[] | undefined;
    /** Opis celu do nagłówka, np. „rover / esp32s3". */
    label?: string | undefined;
    /**
     * Błąd zebrania wsadu — powstaje **przed** otwarciem połączenia.
     *
     * Osobno od błędów wgrywania, bo mówi o czymś innym: nie o płytce, tylko
     * o tym, że nie ma czego wgrać (zwykle „nie zbudowano tego celu").
     */
    error?: string | null | undefined;
}

export function FlashPanel({ open, onClose, files, label, error: collectError }: FlashPanelProps) {
    const serviceRef = useRef<EspFlashService | null>(null);
    const logRef = useRef<HTMLDivElement | null>(null);

    const [state, setState] = useState<FlashState>('idle');
    const [chip, setChip] = useState('');
    const [percent, setPercent] = useState(0);
    const [erase, setErase] = useState(RECOMMEND_ERASE);
    const [lines, setLines] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Serwis powstaje raz na otwarcie okna i jest sprzątany przy zamknięciu:
    // otwarty port trzymany po zamknięciu blokuje kolejne połączenie, a objaw
    // („nie widzę płytki") wskazuje na sprzęt zamiast na nas.
    useEffect(() => {
        if (!open) return undefined;

        const svc = new EspFlashService();
        svc.setOnLog((msg) => setLines((prev) => [...prev.slice(-400), msg]));
        svc.setOnProgress((p) => setPercent(p.percent));
        svc.setOnStateChange(setState);
        serviceRef.current = svc;

        return () => {
            void svc.disconnect().catch(() => {});
            serviceRef.current = null;
            setState('idle');
            setChip('');
            setPercent(0);
            setLines([]);
            setError(null);
        };
    }, [open]);

    useEffect(() => {
        logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    }, [lines]);

    const connect = useCallback(async () => {
        setError(null);
        try {
            await serviceRef.current?.connect();
            setChip(serviceRef.current?.chipName ?? '');
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, []);

    const flash = useCallback(async () => {
        if (!files || files.length === 0) return;
        setError(null);
        setPercent(0);
        try {
            await serviceRef.current?.flash(files, {
                baudRate: 921600,
                flashMode: 'keep',
                flashFreq: 'keep',
                flashSize: 'keep',
                eraseAll: erase,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [files, erase]);

    const busy = state === 'connecting' || state === 'flashing';
    const connected = state === 'connected' || state === 'done';

    return (
        <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                Wgraj wsad
                {label && (
                    <Typography variant="caption" sx={{ display: 'block', opacity: 0.7 }}>
                        {label}
                    </Typography>
                )}
            </DialogTitle>

            <DialogContent dividers>
                <Stack spacing={1.5}>
                    {!supportsWebSerial() && (
                        <Alert severity="error">
                            Ta przeglądarka nie ma Web Serial. Działa Chrome, Edge i Opera
                            na komputerze — Firefox i Safari nie obsługują tego API.
                        </Alert>
                    )}

                    {collectError && <Alert severity="error">{collectError}</Alert>}
                    {error && <Alert severity="error">{error}</Alert>}

                    {state === 'done' && !error && (
                        <Alert severity="success">
                            Wgrane. Naciśnij RESET na płytce, żeby uruchomić nowy wsad.
                        </Alert>
                    )}

                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Pliki</Typography>
                        {files && files.length > 0 ? (
                            files.map((f) => (
                                <Typography key={f.name} variant="body2" sx={{ fontFamily: 'monospace' }}>
                                    {f.name} @ 0x{f.address.toString(16).padStart(4, '0')}
                                    {'  '}({Math.round(f.data.length / 1024)} kB)
                                </Typography>
                            ))
                        ) : (
                            <Typography variant="body2" color="text.secondary">
                                Brak wsadu — zbuduj cel przed wgraniem.
                            </Typography>
                        )}
                    </Box>

                    <FormControlLabel
                        control={
                            <Checkbox size="small" checked={erase} disabled={busy}
                                      onChange={(e) => setErase(e.target.checked)} />
                        }
                        label={
                            <Typography variant="body2">
                                Wyczyść pamięć przed wgraniem
                            </Typography>
                        }
                    />
                    {/*
                      * Domyślnie włączone i to nie jest ostrożność na zapas.
                      * Bez wyczyszczenia płytka, na którą kiedyś poszła
                      * aktualizacja OTA, wystartuje ze starej partycji —
                      * a wygląda to jak „wgrało się, ale nic się nie zmieniło".
                      */}

                    {busy && (
                        <Box>
                            <LinearProgress variant={state === 'flashing' ? 'determinate' : 'indeterminate'}
                                            value={percent} />
                            <Typography variant="caption">
                                {state === 'connecting' ? 'Łączę…' : `${percent}%`}
                            </Typography>
                        </Box>
                    )}

                    <Box ref={logRef}
                         sx={{
                             bgcolor: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace',
                             fontSize: 11, p: 1, borderRadius: 1, height: 150,
                             overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                         }}>
                        {lines.length > 0 ? lines.join('\n') : 'Naciśnij „Połącz" i wybierz port płytki.'}
                    </Box>
                </Stack>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={busy}>Zamknij</Button>
                {!connected ? (
                    <Button variant="contained" onClick={() => void connect()}
                            disabled={busy || !supportsWebSerial()}>
                        Połącz
                    </Button>
                ) : (
                    <Button variant="contained" onClick={() => void flash()}
                            disabled={busy || !files || files.length === 0}>
                        Wgraj{chip ? ` (${chip})` : ''}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

/**
 * Web Serial jest w Chrome, Edge i Operze na komputerze — nigdzie indziej.
 *
 * Sprawdzamy to przed pokazaniem przycisku, bo komunikat przeglądarki
 * („navigator.serial is undefined") nie mówi użytkownikowi niczego.
 */
export function supportsWebSerial(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
}
