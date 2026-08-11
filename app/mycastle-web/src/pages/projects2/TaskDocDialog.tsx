/**
 * Notatka zadania otwarta na cały ekran.
 *
 * Ten sam edytor, co w Drive — nie uproszczony podgląd. Notatka do zadania jest
 * zwykłym plikiem na dysku użytkownika i ma się edytować tak samo, niezależnie
 * od tego, skąd się do niej weszło.
 *
 * ## Wyjście
 *
 * Trzy drogi, bo okno na cały ekran bez widocznego wyjścia jest pułapką: krzyżyk
 * w prawym górnym rogu, klawisz Esc i przycisk „Zamknij" przy pasku. Zamknięcie
 * z niezapisanymi zmianami pyta — plik jest na dysku użytkownika, a nie
 * w schowku, i cicha utrata treści byłaby tu najgorszym możliwym zachowaniem.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert, AppBar, Box, Button, CircularProgress, Dialog, IconButton, Snackbar,
    Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import { RemoteFS } from '@mhersztowski/core';
import { MdEditor } from '@/components/mdeditor';

import { cu } from './clickup';

export interface TaskDocDialogProps {
    open: boolean;
    userName: string;
    token?: string | undefined;
    /** Ścieżka względna wobec `drive/`. */
    path: string;
    /** Nazwa zadania — na pasku, żeby było wiadomo, czyja to notatka. */
    taskName?: string | undefined;
    onClose: () => void;
}

export const TaskDocDialog: React.FC<TaskDocDialogProps> = ({
    open, userName, token, path, taskName, onClose,
}) => {
    const fs = useMemo(
        () => new RemoteFS({
            baseUrl: `/api/users/${encodeURIComponent(userName)}/vfs`,
            token: token ?? undefined,
        }),
        [userName, token],
    );
    const fullPath = `/data/Minis/Users/${userName}/drive/${path}`;

    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const latest = useRef<string>('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;

        setContent(null);
        setError(null);
        setDirty(false);

        void (async () => {
            try {
                const bytes = await fs.readFile(fullPath);
                if (cancelled) return;
                const text = new TextDecoder().decode(bytes);
                latest.current = text;
                setContent(text);
            } catch (e) {
                if (cancelled) return;
                // Brak pliku nie jest awarią: powiązanie wolno zrobić z notatką,
                // która dopiero powstanie. Otwieramy pusty dokument.
                const message = e instanceof Error ? e.message : String(e);
                if (/not found|ENOENT|404/i.test(message)) {
                    latest.current = '';
                    setContent('');
                } else {
                    setError(message);
                }
            }
        })();

        return () => { cancelled = true; };
    }, [open, fs, fullPath]);

    const save = useCallback(async () => {
        setSaving(true);
        try {
            await fs.writeFile(fullPath, new TextEncoder().encode(latest.current));
            setDirty(false);
            setSaved(true);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setSaving(false);
        }
    }, [fs, fullPath]);

    const requestClose = useCallback(() => {
        if (dirty && !window.confirm('Notatka ma niezapisane zmiany. Zamknąć mimo to?')) return;
        onClose();
    }, [dirty, onClose]);

    // Esc obsługujemy sami, żeby przejść przez to samo pytanie o niezapisane
    // zmiany, co krzyżyk. `Dialog` zamknąłby się bez pytania.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); requestClose(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, requestClose]);

    return (
        <Dialog
            open={open}
            fullScreen
            onClose={requestClose}
            disableEscapeKeyDown
            PaperProps={{ sx: { bgcolor: cu.bg } }}
        >
            <AppBar position="sticky" elevation={0}
                    sx={{ bgcolor: cu.bg, borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar variant="dense" sx={{ gap: 1 }}>
                    <Stack sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }} noWrap>
                            {taskName ?? 'Notatka'}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: cu.textMuted }} noWrap>
                            {path}{dirty ? ' • niezapisane' : ''}
                        </Typography>
                    </Stack>

                    <Box sx={{ flex: 1 }} />

                    <Button
                        size="small"
                        variant="contained"
                        startIcon={saving ? <CircularProgress size={13} color="inherit" /> : <SaveIcon sx={{ fontSize: 15 }} />}
                        disabled={!dirty || saving}
                        onClick={() => void save()}
                    >
                        Zapisz
                    </Button>
                    <Button size="small" onClick={requestClose}>Zamknij</Button>
                    <Tooltip title="Zamknij (Esc)">
                        <IconButton size="small" onClick={requestClose}>
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Toolbar>
            </AppBar>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {error && (
                    <Alert severity="error" sx={{ m: 2 }}>
                        Nie udało się otworzyć notatki: {error}
                    </Alert>
                )}

                {!error && content === null && (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, p: 3 }}>
                        <CircularProgress size={16} />
                        <Typography sx={{ fontSize: 13, color: cu.textMuted }}>Wczytuję notatkę…</Typography>
                    </Stack>
                )}

                {!error && content !== null && (
                    <MdEditor
                        key={fullPath}
                        initialContent={content}
                        filePath={fullPath}
                        fullWidth
                        // `onSave` woła edytor także z własnego zapisu cyklicznego,
                        // więc trzymamy tu najświeższą treść i pilnujemy znacznika
                        // niezapisanych zmian — pasek ma mówić prawdę.
                        onSave={(markdown) => {
                            latest.current = markdown;
                            setDirty(markdown !== content);
                        }}
                    />
                )}
            </Box>

            <Snackbar
                open={saved}
                autoHideDuration={2000}
                onClose={() => setSaved(false)}
                message="Notatka zapisana"
            />
        </Dialog>
    );
};
