/**
 * Biblioteka komponentów — boczny panel Studia.
 *
 * Pokazuje paczki dostępne w projekcie, pogrupowane po tym, czym są dla
 * frameworka. Komponent niepasujący do wybranego celu zostaje na liście,
 * wyszarzony, z powodem w dymku — ukrycie zostawiałoby użytkownika
 * z pytaniem, czemu nie widzi czujnika, który na pewno istnieje.
 *
 * Kliknięcie wstawia układ do pliku projektu: dopisuje paczkę do zależności
 * i sam układ do sprzętu, z dobraną nazwą, magistralą i wolnym adresem.
 * Wszystko, co da się rozstrzygnąć bez pytania, jest rozstrzygane — formularz
 * z czterema polami przy każdym czujniku byłby wolniejszy od wpisania tego
 * ręcznie.
 */

import { useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
    buildCatalog, filterCatalog, planInsert,
    type CatalogEntry, type PackManifest, type TargetPlan,
} from '../model';

export interface ComponentLibraryProps {
    packs: readonly PackManifest[];
    /** Model pliku projektu — potrzebny, żeby wyliczyć nazwę i wolny adres. */
    model: unknown;
    /** Cel, względem którego oceniamy zgodność. */
    target?: TargetPlan | undefined;
    /** Nazwy paczek już wymienionych w projekcie. */
    used?: readonly string[];
    /** Wstawienie komponentu; `false` oznacza, że zapis się nie udał. */
    onInsert(manifest: PackManifest): boolean;
}

export function ComponentLibrary({ packs, model, target, used, onInsert }: ComponentLibraryProps) {
    const [query, setQuery] = useState('');

    const groups = useMemo(
        () => filterCatalog(buildCatalog(packs, { target, ...(used ? { used } : {}) }), query),
        [packs, target, used, query]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 13 }}>
            <Box sx={{ p: 1 }}>
                <Paper variant="outlined" sx={{ px: 1, py: 0.25 }}>
                    <InputBase fullWidth placeholder="Szukaj komponentu…" value={query}
                               onChange={(e) => setQuery(e.target.value)}
                               sx={{ fontSize: 13 }} />
                </Paper>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pb: 1 }}>
                {groups.length === 0 && (
                    <Typography variant="caption" sx={{ opacity: 0.7, px: 0.5 }}>
                        {packs.length === 0
                            ? 'Projekt nie ma jeszcze żadnych paczek.'
                            : 'Nic nie pasuje do wyszukiwania.'}
                    </Typography>
                )}

                {groups.map((group) => (
                    <Box key={group.id} sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ opacity: 0.7, px: 0.5 }}>
                            {group.title}
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                            {group.entries.map((entry) => (
                                <ComponentTile key={entry.manifest.pack} entry={entry}
                                               model={model} onInsert={onInsert} />
                            ))}
                        </Stack>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function ComponentTile({ entry, model, onInsert }: {
    entry: CatalogEntry;
    model: unknown;
    onInsert(manifest: PackManifest): boolean;
}) {
    const [failed, setFailed] = useState(false);

    // Podgląd tego, co się stanie — nazwa i adres widoczne przed kliknięciem,
    // a nie dopiero po nim.
    const plan = useMemo(() => planInsert(model, { manifest: entry.manifest }),
                         [model, entry.manifest]);

    const blocked = !entry.compatible || plan.problems.length > 0;
    const why = entry.reason ?? plan.problems[0];

    const tile = (
        <Paper
            variant="outlined"
            onClick={() => { if (!blocked) setFailed(!onInsert(entry.manifest)); }}
            sx={{
                px: 1, py: 0.75,
                cursor: blocked ? 'not-allowed' : 'pointer',
                opacity: blocked ? 0.45 : 1,
                borderColor: failed ? 'error.main' : undefined,
                '&:hover': blocked ? {} : { borderColor: 'primary.main' },
            }}
        >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                {entry.bus && <Chip size="small" label={entry.bus.toUpperCase()} sx={{ height: 18 }} />}
                <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                    {entry.manifest.pack}
                </Typography>
                {entry.used && <Chip size="small" color="success" label="w projekcie" sx={{ height: 18 }} />}
            </Stack>
            <Typography variant="caption" sx={{ opacity: 0.75, display: 'block' }}>
                {failed ? 'nie udało się wstawić — sprawdź plik projektu'
                        : why ?? entry.manifest.description ?? `wersja ${entry.manifest.version}`}
            </Typography>
            {!blocked && (
                <Typography variant="caption" sx={{ opacity: 0.55, display: 'block' }}>
                    wstawi: {plan.name} — {plan.part}
                </Typography>
            )}
        </Paper>
    );

    // Powód niezgodności trafia też do dymka, bo na kafelku bywa ucięty.
    return why ? <Tooltip title={why} placement="right">{tile}</Tooltip> : tile;
}
