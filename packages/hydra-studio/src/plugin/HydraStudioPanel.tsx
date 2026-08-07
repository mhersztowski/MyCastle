/**
 * Interfejs edytora pliku .hydra.
 *
 * Zawartość formularzy pochodzi ze schematu (`fields.ts`), a nie z ręcznie
 * spisanej listy pól — dodanie ustawienia do formatu pojawia się tutaj samo.
 * Zmiana wartości nie przepisuje pliku: idzie przedziałem tekstu do modelu
 * Monaco, więc komentarze, kolejność i wyrównanie zostają nietknięte, a cofanie
 * działa jednym krokiem na zmianę.
 */

import { useCallback, useMemo, useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
    entriesOf, formFor,
    HydraDocument, buildPlan, configFormFor, packForComponent, unsupportedFields, validate,
    type ConfigSchema, type Diagnostic, type FormField, type FormSection,
    type PackManifest, type PathSegment,
} from '../model';



export interface HydraStudioPanelProps {
    /** Bieżąca treść pliku .hydra. */
    source: string;
    /** Paczki projektu — z nich biorą się formularze konfiguracji układów. */
    packs?: readonly PackManifest[];
    /** Schematy konfiguracji, wczytane z plików wskazanych przez paczki. */
    configSchemas?: Readonly<Record<string, ConfigSchema>>;
    /**
     * Zapis zmiany. Zwraca `false`, gdy nie udało się jej nanieść — na przykład
     * dlatego, że treść w edytorze zmieniła się w międzyczasie.
     */
    onEdit(path: PathSegment[], value: string | number | boolean): boolean;
    /** Nazwa pliku — do nagłówka. */
    fileName?: string | undefined;
}

export function HydraStudioPanel({ source, onEdit, fileName, packs = [], configSchemas = {} }: HydraStudioPanelProps) {
    const [selection, setSelection] = useState<PathSegment[]>(['project']);

    const { model, diagnostics, plan } = useMemo(() => {
        const doc = HydraDocument.parse(source);
        const parsed = doc.toJS();
        return {
            model: parsed,
            diagnostics: validate(doc),
            // Plan pokazuje, co naprawdę wyjdzie z tego pliku — a nie to, co
            // w nim napisano. Różnica bywa istotna: moduł wyłączony dla celu
            // znika, możliwości niepodane biorą się z profilu układu.
            plan: buildPlan(parsed),
        };
    }, [source]);

    const form = useMemo(() => formFor(model, selection, diagnostics), [model, selection, diagnostics]);

    const targets = useMemo(() => entriesOf(model, ['targets']), [model]);
    const modules = useMemo(() => entriesOf(model, ['modules']), [model]);
    const components = useMemo(() => entriesOf(model, ['hardware', 'components']), [model]);

    /**
     * Formularz konfiguracji układu pochodzi z paczki, a nie ze schematu Hydry:
     * to autor sterownika wie, jakie ma nadpróbkowanie i filtr. Bez paczki
     * zostają surowe pola z sekcji `hardware`.
     */
    const componentForm = useMemo(() => {
        if (selection[0] !== 'hardware' || selection[1] !== 'components' || selection.length < 3) {
            return undefined;
        }
        const name = String(selection[2]);
        const component = valueAtPath(model, selection);
        const manifest = packForComponent(component, packs);
        const schema = manifest ? configSchemas[manifest.pack] : undefined;
        if (!schema) return undefined;

        return {
            manifest: manifest!,
            section: configFormFor(schema, selection, component, diagnostics),
            unsupported: unsupportedFields(schema),
            name,
        };
    }, [model, selection, packs, configSchemas, diagnostics]);

    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity === 'warning');

    return (
        <Box sx={{ display: 'flex', height: '100%', minHeight: 0, fontSize: 13 }}>
            <Box sx={{ width: 210, borderRight: 1, borderColor: 'divider', overflowY: 'auto' }}>
                <Nav title="Projekt"
                     items={[{ key: 'project', path: ['project'] }]}
                     selection={selection} onSelect={setSelection} />
                <Nav title="Cele sprzętowe"
                     items={targets.map((name) => ({ key: name, path: ['targets', name] }))}
                     selection={selection} onSelect={setSelection} />
                <Nav title="Moduły"
                     items={modules.map((name) => ({ key: name, path: ['modules', name] }))}
                     selection={selection} onSelect={setSelection} />
                <Nav title="Sprzęt"
                     items={[{ key: 'magistrale', path: ['hardware'] }]}
                     selection={selection} onSelect={setSelection} />
                <Nav title="Układy"
                     items={components.map((name) => ({
                         key: name, path: ['hardware', 'components', name] }))}
                     selection={selection} onSelect={setSelection} />
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle2">{fileName ?? 'projekt'}</Typography>
                        <Chip size="small" label={`${plan.projectName} ${plan.projectVersion}`} />
                        {plan.defaultTarget && (
                            <Chip size="small" variant="outlined" label={`domyślnie: ${plan.defaultTarget}`} />
                        )}
                        <Box sx={{ flex: 1 }} />
                        {errors.length > 0 && <Chip size="small" color="error" label={`błędy: ${errors.length}`} />}
                        {warnings.length > 0 && (
                            <Chip size="small" color="warning" label={`ostrzeżenia: ${warnings.length}`} />
                        )}
                    </Stack>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                    {componentForm ? (
                        <>
                            <Stack direction="row" spacing={1} sx={{ mb: 1.5, alignItems: 'center' }}>
                                <Typography variant="subtitle2">{componentForm.name}</Typography>
                                <Chip size="small" label={`${componentForm.manifest.pack} ${componentForm.manifest.version}`} />
                            </Stack>
                            <SectionForm section={componentForm.section} onEdit={onEdit} depth={0} />
                            {componentForm.unsupported.length > 0 && (
                                <Alert severity="info" variant="outlined" sx={{ mt: 1 }}>
                                    <Typography variant="caption">
                                        Pola do edycji w zakładce tekstowej: {componentForm.unsupported.join(', ')}
                                        {' '}— schemat paczki używa konstrukcji, których formularz nie rysuje.
                                    </Typography>
                                </Alert>
                            )}
                        </>
                    ) : form
                        ? <SectionForm section={form} onEdit={onEdit} depth={0} />
                        : <Typography color="text.secondary">Wybierz sekcję po lewej.</Typography>}
                </Box>

                {diagnostics.length > 0 && (
                    <Box sx={{ maxHeight: 160, overflowY: 'auto', borderTop: 1, borderColor: 'divider', p: 1 }}>
                        {diagnostics.map((d, index) => (
                            <DiagnosticRow key={index} diagnostic={d} onGo={setSelection} />
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

function Nav({ title, items, selection, onSelect }: {
    title: string;
    items: { key: string; path: PathSegment[] }[];
    selection: PathSegment[];
    onSelect(path: PathSegment[]): void;
}) {
    if (items.length === 0) return null;
    const current = selection.join('.');
    return (
        <>
            <Typography variant="caption" sx={{ px: 1.5, pt: 1.5, display: 'block', opacity: 0.7 }}>
                {title}
            </Typography>
            <List dense disablePadding>
                {items.map((item) => (
                    <ListItemButton key={item.key} selected={item.path.join('.') === current}
                                    onClick={() => onSelect(item.path)} sx={{ py: 0.25 }}>
                        <ListItemText primaryTypographyProps={{ fontSize: 13 }} primary={item.key} />
                    </ListItemButton>
                ))}
            </List>
        </>
    );
}

function SectionForm({ section, onEdit, depth }: {
    section: FormSection;
    onEdit: HydraStudioPanelProps['onEdit'];
    depth: number;
}) {
    return (
        <Box sx={{ mb: 2 }}>
            {depth > 0 && (
                <>
                    <Divider sx={{ my: 1.5 }} />
                    <Tooltip title={section.doc} placement="right">
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{section.title}</Typography>
                    </Tooltip>
                </>
            )}
            <Stack spacing={1.25}>
                {section.fields.map((field) => (
                    <Field key={field.path.join('.')} field={field} onEdit={onEdit} />
                ))}
            </Stack>
            {section.sections.map((child) => (
                <SectionForm key={child.path.join('.')} section={child} onEdit={onEdit} depth={depth + 1} />
            ))}
        </Box>
    );
}

function Field({ field, onEdit }: { field: FormField; onEdit: HydraStudioPanelProps['onEdit'] }) {
    const [rejected, setRejected] = useState(false);

    const commit = useCallback((value: string | number | boolean) => {
        // Odmowa zapisu nie jest wyjątkiem — plik mógł się zmienić w zakładce
        // tekstowej. Trzeba to pokazać, bo inaczej użytkownik uzna, że zapisał.
        setRejected(!onEdit(field.path, value));
    }, [field.path, onEdit]);

    const error = field.diagnostics.find((d) => d.severity === 'error');
    const hint = error?.hint ?? field.doc;

    if (field.kind === 'toggle') {
        return (
            <FormControlLabel
                control={<Switch size="small" checked={field.value === true}
                                 onChange={(e) => commit(e.target.checked)} />}
                label={<Tooltip title={field.doc}><span>{field.key}</span></Tooltip>}
            />
        );
    }

    const common = {
        size: 'small' as const,
        label: field.required ? `${field.key} *` : field.key,
        helperText: rejected ? 'nie zapisano — plik zmienił się w edytorze' : hint,
        error: rejected || error !== undefined,
        fullWidth: true,
    };

    if (field.kind === 'choice') {
        return (
            <TextField {...common} select value={field.value ?? ''}
                       onChange={(e) => commit(e.target.value)}>
                {field.choices?.map((choice) => (
                    <MenuItem key={choice} value={choice}>{choice}</MenuItem>
                ))}
            </TextField>
        );
    }

    if (field.kind === 'number') {
        return (
            <TextField {...common} type="number"
                       label={field.unit ? `${common.label} [${field.unit}]` : common.label}
                       value={field.value ?? ''}
                       inputProps={{ min: field.min, max: field.max, step: field.integer ? 1 : 'any' }}
                       onBlur={(e) => {
                           const parsed = Number(e.target.value);
                           if (e.target.value !== '' && !Number.isNaN(parsed)) commit(parsed);
                       }} />
        );
    }

    if (field.kind === 'list' || field.kind === 'free') {
        // Listy i pola o dowolnej treści zostają przy edycji tekstowej —
        // formularz zgadywałby ich budowę, a plik jest tekstem i da się go
        // poprawić w zakładce obok.
        return (
            <TextField {...common} disabled
                       value={Array.isArray(field.value) ? field.value.join(', ') : String(field.value ?? '')}
                       helperText={`${hint} — edycja w zakładce tekstowej`} />
        );
    }

    return (
        <TextField {...common} defaultValue={field.value ?? ''}
                   onBlur={(e) => { if (e.target.value !== String(field.value ?? '')) commit(e.target.value); }} />
    );
}

function DiagnosticRow({ diagnostic, onGo }: {
    diagnostic: Diagnostic;
    onGo(path: PathSegment[]): void;
}) {
    const severity = diagnostic.severity === 'error' ? 'error'
                   : diagnostic.severity === 'warning' ? 'warning' : 'info';
    // Kliknięcie przenosi do sekcji, której dotyczy zgłoszenie — bez tego
    // panel byłby listą pretensji bez drogi do naprawy.
    const target = diagnostic.path.split('.').slice(0, 2);

    return (
        <Alert severity={severity} variant="outlined" sx={{ py: 0, mb: 0.5, cursor: 'pointer' }}
               onClick={() => target.length > 0 && onGo(target)}>
            <Typography variant="caption" component="div">
                <strong>{diagnostic.path}</strong> — {diagnostic.message}
            </Typography>
            {diagnostic.hint && (
                <Typography variant="caption" component="div" sx={{ opacity: 0.75 }}>
                    → {diagnostic.hint}
                </Typography>
            )}
        </Alert>
    );
}

/** Wartość pod ścieżką w modelu — do wyciągnięcia konfiguracji układu. */
function valueAtPath(model: unknown, path: readonly PathSegment[]): unknown {
    let current: unknown = model;
    for (const segment of path) {
        if (typeof current !== 'object' || current === null) return undefined;
        current = (current as Record<string, unknown>)[String(segment)];
    }
    return current;
}
