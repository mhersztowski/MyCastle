/**
 * Wgranie modułu WebAssembly z panelu Hydra Studio na urządzenie.
 *
 * Wybór urządzenia jest tutaj, a nie w panelu, z tego samego powodu, dla
 * którego panel przyjmuje samo `deviceLabel`: to gospodarz wie, jakie
 * urządzenia ma użytkownik i które z nich w ogóle przyjmuje skrypty. Studio
 * pozostaje niezależne od tego, czy stoi w MyCastle, czy w samodzielnym
 * edytorze.
 *
 * Czytanie źródeł siedzi w `wasmSources.ts` — patrz tam po powód rozdzielenia.
 */

import { useCallback, useRef, useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle,
    List, ListItemButton, ListItemText, Typography,
} from '@mui/material';

import { minisApi } from '../../services/MinisApiService';
import { uploadScriptModule } from '../../services/scriptUpload';

export { loadWasmSources } from './wasmSources';

/** Urządzenia, które faktycznie przyjmują skrypty — reszta nie ma czego zrobić z modułem. */
async function devicesWithScript(userName: string): Promise<string[]> {
    const devices = await minisApi.getUserDevices(userName);
    const checked = await Promise.all(devices.map(async (device) => {
        const extensions = await minisApi.getIotExtensions(userName, device.name);
        return extensions.some((e) => e.type === 'script') ? device.name : null;
    }));
    return checked.filter((name): name is string => name !== null);
}

interface PendingUpload {
    wasm: Uint8Array;
    resolve: () => void;
    reject: (error: Error) => void;
}

export function useWasmUpload(userName: string) {
    const [device, setDevice] = useState<string | null>(null);
    const [choices, setChoices] = useState<string[] | null>(null);
    /*
     * Wgranie czeka na wybór urządzenia, a wybór jest zdarzeniem interfejsu.
     * Panel pokazuje stan „wysyłam" do rozwiązania tej obietnicy, więc nie
     * możemy jej porzucić — stąd uchwyt na zawieszone żądanie zamiast
     * zwykłego `return`.
     */
    const pending = useRef<PendingUpload | null>(null);

    const send = useCallback(async (deviceName: string, wasm: Uint8Array) => {
        await uploadScriptModule(userName, deviceName, wasm, { variant: 'wasm' });
    }, [userName]);

    const uploadWasm = useCallback(async (wasm: Uint8Array): Promise<void> => {
        if (device) {
            await send(device, wasm);
            return;
        }

        const available = await devicesWithScript(userName);
        if (available.length === 0) {
            throw new Error(
                'Żadne urządzenie nie ma włączonego rozszerzenia „script". '
                + 'Włącz je w Electronics → Devices i spróbuj ponownie.',
            );
        }
        if (available.length === 1) {
            setDevice(available[0]);
            await send(available[0], wasm);
            return;
        }

        setChoices(available);
        return new Promise<void>((resolve, reject) => {
            pending.current = { wasm, resolve, reject };
        });
    }, [device, send, userName]);

    const choose = useCallback((deviceName: string) => {
        setDevice(deviceName);
        setChoices(null);
        const waiting = pending.current;
        pending.current = null;
        if (!waiting) return;
        send(deviceName, waiting.wasm).then(waiting.resolve).catch(waiting.reject);
    }, [send]);

    const cancel = useCallback(() => {
        setChoices(null);
        const waiting = pending.current;
        pending.current = null;
        // Odrzucenie, a nie ciche zamknięcie: panel czeka na rozstrzygnięcie
        // i bez tego zostałby na zawsze w stanie „wysyłam".
        waiting?.reject(new Error('Anulowano — nie wybrano urządzenia.'));
    }, []);

    const dialog = (
        <Dialog open={choices !== null} onClose={cancel} maxWidth="xs" fullWidth>
            <DialogTitle>Na które urządzenie wgrać moduł?</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" sx={{ mb: 1, opacity: 0.75 }}>
                    Wybór zostaje zapamiętany do końca sesji.
                </Typography>
                <List dense>
                    {(choices ?? []).map((name) => (
                        <ListItemButton key={name} onClick={() => choose(name)}>
                            <ListItemText primary={name} />
                        </ListItemButton>
                    ))}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={cancel}>Anuluj</Button>
            </DialogActions>
        </Dialog>
    );

    return { uploadWasm, deviceLabel: device ?? undefined, dialog };
}
