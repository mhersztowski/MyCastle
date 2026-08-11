/**
 * Wybór pliku Markdown z dysku użytkownika.
 *
 * Drzewo ładuje się **leniwie**, katalog po katalogu. Dysk potrafi mieć
 * tysiące plików, a okno wyboru, które przy otwarciu czyta całość, każe czekać
 * kilka sekund za każdym razem — także wtedy, gdy szukany plik leży w pierwszym
 * katalogu.
 *
 * Pokazujemy katalogi i pliki `.md`. Reszta jest odfiltrowana nie dla ozdoby:
 * zadanie da się powiązać wyłącznie z notatką, więc plik `.png` na liście byłby
 * zaproszeniem do kliknięcia, po którym nic się nie stanie.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import FolderIcon from '@mui/icons-material/Folder';
import ArticleIcon from '@mui/icons-material/Article';
import RefreshIcon from '@mui/icons-material/Refresh';
import { FileType, RemoteFS } from '@mhersztowski/core';

import { cu } from './clickup';

export interface MdFilePickerDialogProps {
    open: boolean;
    userName: string;
    token?: string | undefined;
    /** Ścieżka względna wobec katalogu `drive/`, np. `notatki/spec.md`. */
    initialPath?: string | undefined;
    onClose: () => void;
    onPick: (relativePath: string) => void;
}

interface Node {
    /** Ścieżka względna wobec `drive/`. Pusta dla korzenia. */
    path: string;
    name: string;
    kind: 'dir' | 'file';
}

const isMarkdown = (name: string) => /\.mdx?$/i.test(name);

export const MdFilePickerDialog: React.FC<MdFilePickerDialogProps> = ({
    open, userName, token, initialPath, onClose, onPick,
}) => {
    const fs = useMemo(
        () => new RemoteFS({
            baseUrl: `/api/users/${encodeURIComponent(userName)}/vfs`,
            token: token ?? undefined,
        }),
        [userName, token],
    );

    /** Korzeń dysku użytkownika po stronie serwera. */
    const root = `/data/Minis/Users/${userName}/drive`;

    /** Zawartość katalogów, których ktoś już zajrzał. Klucz = ścieżka względna. */
    const [children, setChildren] = useState<Record<string, Node[]>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [failed, setFailed] = useState<Record<string, string>>({});
    const [selected, setSelected] = useState<string>(initialPath ?? '');
    const [manual, setManual] = useState<string>(initialPath ?? '');

    const load = useCallback(async (relative: string) => {
        setLoading(prev => ({ ...prev, [relative]: true }));
        setFailed(prev => {
            const next = { ...prev };
            delete next[relative];
            return next;
        });
        try {
            const entries = await fs.readDirectory(relative ? `${root}/${relative}` : root);
            const mapped: Node[] = entries
                .filter(e => e.type === FileType.Directory || isMarkdown(e.name))
                .map((e): Node => ({
                    path: relative ? `${relative}/${e.name}` : e.name,
                    name: e.name,
                    kind: e.type === FileType.Directory ? 'dir' : 'file',
                }))
                // Katalogi przed plikami, potem alfabetycznie — tak samo jak
                // w Drive, żeby to samo drzewo nie układało się dwoma sposobami.
                .sort((a, b) => (a.kind === b.kind
                    ? a.name.localeCompare(b.name, 'pl')
                    : a.kind === 'dir' ? -1 : 1));
            setChildren(prev => ({ ...prev, [relative]: mapped }));
        } catch (e) {
            setFailed(prev => ({
                ...prev,
                [relative]: e instanceof Error ? e.message : String(e),
            }));
        } finally {
            setLoading(prev => ({ ...prev, [relative]: false }));
        }
    }, [fs, root]);

    useEffect(() => {
        if (!open) return;
        setSelected(initialPath ?? '');
        setManual(initialPath ?? '');
        void load('');
    }, [open, initialPath, load]);

    const renderNode = (node: Node): React.ReactNode => {
        if (node.kind === 'file') {
            return (
                <TreeItem
                    key={node.path}
                    itemId={node.path}
                    label={
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, py: 0.25 }}>
                            <ArticleIcon sx={{ fontSize: 15, color: cu.textMuted }} />
                            <Typography sx={{ fontSize: 13 }}>{node.name}</Typography>
                        </Stack>
                    }
                />
            );
        }

        const loaded = children[node.path];
        return (
            <TreeItem
                key={node.path}
                itemId={node.path}
                label={
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, py: 0.25 }}>
                        <FolderIcon sx={{ fontSize: 15, color: '#f0b429' }} />
                        <Typography sx={{ fontSize: 13 }}>{node.name}</Typography>
                        {loading[node.path] && <CircularProgress size={11} />}
                    </Stack>
                }
            >
                {/* Zaślepka, dopóki nikt nie rozwinął: bez niej gałąź nie ma
                    strzałki i katalogu nie da się otworzyć. */}
                {loaded ? loaded.map(renderNode) : <TreeItem itemId={`${node.path}/__placeholder`} label="…" />}
            </TreeItem>
        );
    };

    const rootNodes = children[''] ?? [];
    const chosen = manual.trim() || selected;
    const canPick = isMarkdown(chosen);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
                PaperProps={{ sx: { bgcolor: cu.bg, height: '70vh' } }}>
            <DialogTitle sx={{ fontSize: 15, display: 'flex', alignItems: 'center', gap: 1 }}>
                Wybierz notatkę
                <Box sx={{ flex: 1 }} />
                <Tooltip title="Odśwież">
                    <IconButton size="small" onClick={() => { setChildren({}); void load(''); }}>
                        <RefreshIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                </Tooltip>
            </DialogTitle>

            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {failed[''] ? (
                        <Typography sx={{ fontSize: 13, color: '#f87171' }}>
                            Nie udało się wczytać dysku: {failed['']}
                        </Typography>
                    ) : rootNodes.length === 0 && loading[''] ? (
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, p: 1 }}>
                            <CircularProgress size={14} />
                            <Typography sx={{ fontSize: 13, color: cu.textMuted }}>Wczytuję…</Typography>
                        </Stack>
                    ) : (
                        <SimpleTreeView
                            selectedItems={selected || null}
                            onSelectedItemsChange={(_, id) => {
                                if (typeof id === 'string' && isMarkdown(id)) {
                                    setSelected(id);
                                    setManual(id);
                                }
                            }}
                            onItemExpansionToggle={(_, id, expanded) => {
                                // Wczytujemy dopiero przy rozwinięciu i tylko raz.
                                if (expanded && !children[id] && !loading[id]) void load(id);
                            }}
                        >
                            {rootNodes.map(renderNode)}
                        </SimpleTreeView>
                    )}
                </Box>

                <TextField
                    size="small"
                    label="Ścieżka względem drive/"
                    placeholder="notatki/projekt/spec.md"
                    value={manual}
                    onChange={e => setManual(e.target.value)}
                    helperText="Można też wpisać ręcznie — przydatne, gdy plik jeszcze nie istnieje."
                    FormHelperTextProps={{ sx: { fontSize: 11 } }}
                    sx={{ '& input': { fontSize: 13 } }}
                />
            </DialogContent>

            <DialogActions>
                <Button size="small" onClick={onClose}>Anuluj</Button>
                <Button
                    size="small"
                    variant="contained"
                    disabled={!canPick}
                    onClick={() => { onPick(chosen); onClose(); }}
                >
                    Powiąż
                </Button>
            </DialogActions>
        </Dialog>
    );
};
