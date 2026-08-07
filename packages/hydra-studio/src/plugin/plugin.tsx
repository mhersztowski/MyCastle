/**
 * Hydra Studio jako wtyczka edytora.
 *
 * Otwarcie pliku `.hydra` uruchamia zakładkę z interfejsem obok zwykłego
 * edytora tekstu — obok, a nie zamiast: plik pozostaje tekstem, który da się
 * poprawić ręcznie, obejrzeć w recenzji zmian i scalić. Formularz i tekst
 * patrzą na ten sam model Monaco, więc zmiana z jednej strony jest natychmiast
 * widoczna z drugiej.
 *
 * Uwaga o menu: mockup pokazuje pasek „Plik / Edycja / Projekt / Symulacja",
 * ale edytor nie ma punktu rozszerzenia dla paska menu — udostępnia pasek
 * narzędzi, paletę poleceń i pasek stanu. Polecenia trafiają więc tam, pod
 * wspólną kategorią „Hydra". Nazwy zostają takie jak w mockupie, żeby dało się
 * je znaleźć po tym, czego się szuka.
 */

import { Suspense, lazy, useEffect, useState } from 'react';

import {
    HydraDocument, LineSplitter, RingBuffer, SimulationClock, applyInsert, buildPlan,
    formatDiagnostics, hasErrors, parseBuildOutput, parseEvent, parseLogLine, planInsert,
    signalsForBuses, timestepOf, validate, writeVcd,
} from '../model';
import type {
    BuildSummary, BusEvent, ComponentDefinition, LogLine, PackManifest, PathSegment,
    Schematic, TargetPlan, VcdChange,
} from '../model';

/**
 * Panele ładowane leniwie.
 *
 * Dwa powody. Pierwszy: edytor nie płaci za interfejs Studia, dopóki nikt nie
 * otworzy pliku `.hydra` — a większość seansów w edytorze skryptów go nie
 * otwiera. Drugi wyszedł dopiero przy integracji: MUI w wersji 6, którą
 * dostarcza edytor, nie udostępnia podmodułów przez pole `exports`, więc Node
 * nie potrafi wczytać `@mui/material/Box` bezpośrednio. Bundler potrafi —
 * i dlatego aplikacja się buduje — ale testy działają w Node i samo wczytanie
 * wtyczki je wywracało.
 */
const ComponentLibraryLazy = lazy(async () => ({
    default: (await import('./ComponentLibrary')).ComponentLibrary,
}));
const BottomPanelLazy = lazy(async () => ({
    default: (await import('./BottomPanel')).BottomPanel,
}));
const SchematicCanvasLazy = lazy(async () => ({
    default: (await import('./SchematicCanvas')).SchematicCanvas,
}));
const HydraStudioPanelLazy = lazy(async () => ({
    default: (await import('./HydraStudioPanel')).HydraStudioPanel,
}));

/** Zastępka na czas wczytywania panelu. */
function Loading() {
    return <div style={{ padding: 16, fontSize: 13, opacity: 0.7 }}>Wczytywanie…</div>;
}

import { applyToModel, type EditableModel } from './monacoBridge';
import type { HostApi, HostPlugin, IDisposable } from './host';

/*
 * Panele wystawia osobne wejście `@mhersztowski/hydra-studio/panels`.
 *
 * Ponowny eksport stąd byłby niecierpliwy i wciągałby MUI przy samym
 * wczytaniu wtyczki — czyli dokładnie to, czemu zapobiega leniwe ładowanie
 * niżej. Kto chce panel wprost, sięga po niego jawnie.
 */
export { applyToModel, toMonacoEdits } from './monacoBridge';
export type * from './host';

/** Rozszerzenie pliku, które ta wtyczka obsługuje. */
export const HYDRA_EXTENSION = '.hydra';

/**
 * Dostęp do modeli tekstowych edytora.
 *
 * Wstrzykiwany, a nie importowany z `monaco-editor`: dzięki temu wtyczka
 * kompiluje się i testuje bez Monaco, a w testach można podstawić atrapę.
 */
export interface ModelAccess {
    /** Model dla podanego identyfikatora zasobu albo `undefined`, gdy zamknięty. */
    getModel(uri: string): EditableModel | undefined;
}

export interface StudioPluginOptions {
    models: ModelAccess;
    /**
     * Paczki dostępne dla projektu. Wtyczka nie czyta ich z dysku sama —
     * w przeglądarce żadnego nie ma, a w edytorze dostęp do plików idzie przez
     * jego własną warstwę.
     */
    loadPacks?(projectFile: string): Promise<readonly PackManifest[]>;
    /**
     * Uruchomienie polecenia budowania. Wtyczka nie woła PlatformIO ani Dockera
     * sama — to zadanie środowiska budowania, które ma już własne wejście.
     */
    runBuild?(request: { file: string; target?: string; upload: boolean }): Promise<string | void>;
    /** Schemat i definicje układów — wczytuje je host, tak jak paczki. */
    loadSchematic?(projectFile: string): Promise<{
        schematic: Schematic | undefined;
        definitions: Readonly<Record<string, ComponentDefinition>>;
    }>;
    /** Zapis nowego położenia symbolu po przeciągnięciu na płótnie. */
    onSchematicMove?(reference: string, x: number, y: number): boolean;
    /** Podłączenie do portu urządzenia; wywołuje `onData` dla każdej porcji. */
    openSerial?(onData: (chunk: string) => void): { close(): void } | undefined;
    /** Wysłanie polecenia do urządzenia — tą samą drogą co polecenia shella. */
    sendToDevice?(command: string): void;
    /** Zapis pliku przebiegów; Studio nie ma dostępu do dysku. */
    onSaveVcd?(content: string): void;
    /** Zlecenie przebiegu na farmie — wykonuje go runner, nie przeglądarka. */
    runHilSuite?(suite: string): void;
}

export function createHydraStudioPlugin(options: StudioPluginOptions): HostPlugin {
    const disposables: IDisposable[] = [];
    let activeFile: string | undefined;
    let activeSource = '';

    /** Podsłuch zmian treści — panel odświeża się z każdą literą w tekście. */
    const listeners = new Set<(source: string) => void>();

    let packs: readonly PackManifest[] = [];
    let definitions: Readonly<Record<string, ComponentDefinition>> = {};
    let schematic: Schematic | undefined;

    // Bufor cykliczny: urządzenie mówi szybciej, niż człowiek czyta, a lista
    // bez ograniczenia zatrzymuje przeglądarkę po kilku minutach pracy.
    const logs = new RingBuffer<LogLine>(2000);
    const events = new RingBuffer<BusEvent>(2000);
    const splitter = new LineSplitter();
    const monitorListeners = new Set<() => void>();

    let buildOutput: string | undefined;
    let buildSummary: BuildSummary | undefined;

    // Zegar symulacji powstaje przy otwarciu projektu, bo krok czasu jest
    // w pliku. Do tego czasu domyślna milisekunda wystarczy.
    let clock = new SimulationClock(1000);
    let animation: ReturnType<typeof setInterval> | undefined;
    const recorded: VcdChange[] = [];

    function notifyMonitor(): void {
        for (const listener of monitorListeners) listener();
    }

    /**
     * Pętla symulacji. Odmierzamy czas rzeczywisty i oddajemy go zegarowi —
     * to on decyduje, ile kroków z tego wynika. Dzięki temu przebieg nie
     * zależy od obciążenia przeglądarki.
     */
    function tick(): void {
        const now = Date.now();
        const elapsed = now - lastTick;
        lastTick = now;
        if (clock.advance(elapsed).length > 0) notifyMonitor();
    }
    let lastTick = Date.now();

    /**
     * Licznik chodzi wyłącznie wtedy, gdy symulacja jest uruchomiona.
     *
     * Wcześniej startował przy otwarciu projektu i tykał trzydzieści razy na
     * sekundę do końca sesji, licząc kroki, których nikt nie oglądał. W testach
     * objawiło się to zawieszeniem: niezatrzymany licznik trzyma proces przy
     * życiu, więc `node --test` nigdy nie kończył pracy.
     */
    function syncAnimation(): void {
        const shouldRun = clock.state.running;
        if (shouldRun && animation === undefined) {
            lastTick = Date.now();
            animation = setInterval(tick, 33);
        } else if (!shouldRun && animation !== undefined) {
            clearInterval(animation);
            animation = undefined;
        }
    }

    function publish(source: string): void {
        activeSource = source;
        for (const listener of listeners) listener(source);
    }

    function StudioTab() {
        const [source, setSource] = useState(activeSource);

        useEffect(() => {
            listeners.add(setSource);
            setSource(activeSource);
            return () => { listeners.delete(setSource); };
        }, []);

        return (
            <Suspense fallback={<Loading />}>
            <HydraStudioPanelLazy
                source={source}
                fileName={activeFile?.split('/').pop() ?? undefined}
                onEdit={(path: PathSegment[], value) => {
                    if (!activeFile) return false;
                    const model = options.models.getModel(activeFile);
                    if (!model) return false;

                    const doc = HydraDocument.parse(source);
                    // Pole, którego jeszcze nie ma w pliku, trzeba dopisać —
                    // podmiana wartości działa tylko na tym, co już istnieje.
                    const ok = doc.setScalar(path, value)
                        || doc.insertKey(path.slice(0, -1), String(path[path.length - 1]), value);
                    if (!ok) return false;

                    return applyToModel(model, source, doc.pendingEdits());
                }}
            />
            </Suspense>
        );
    }

    /** Wstawienie komponentu z biblioteki — wspólne dla panelu i poleceń. */
    function insertComponent(manifest: PackManifest): boolean {
        if (!activeFile) return false;
        const model = options.models.getModel(activeFile);
        if (!model) return false;

        const doc = HydraDocument.parse(activeSource);
        const parsed = doc.toJS();
        const plan = planInsert(parsed, { manifest });
        if (!applyInsert(doc, parsed, manifest, plan)) return false;

        return applyToModel(model, activeSource, doc.pendingEdits());
    }

    function LibraryPanel() {
        const [source, setSource] = useState(activeSource);
        useEffect(() => {
            listeners.add(setSource);
            setSource(activeSource);
            return () => { listeners.delete(setSource); };
        }, []);

        const parsed = HydraDocument.parse(source).toJS();
        const plan = buildPlan(parsed);
        const target: TargetPlan | undefined =
            plan.targets.find((t) => t.name === plan.defaultTarget) ?? plan.targets[0];
        const used = Object.keys(
            (parsed as { dependencies?: Record<string, unknown> } | null)?.dependencies ?? {});

        return (
            <Suspense fallback={<Loading />}>
                <ComponentLibraryLazy packs={packs} model={parsed} target={target} used={used}
                                      onInsert={insertComponent} />
            </Suspense>
        );
    }

    function SchematicTab() {
        const [, force] = useState(0);
        useEffect(() => {
            // Przerysowanie po każdej zmianie pliku — schemat i tekst opisują
            // to samo urządzenie i mają się zgadzać w obie strony.
            const listener = (): void => force((n) => n + 1);
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        }, []);

        if (!schematic) {
            return <div style={{ padding: 16, fontSize: 13 }}>
                Projekt nie wskazuje schematu (pole <code>hardware.schematic</code>).
            </div>;
        }
        return (
            <Suspense fallback={<Loading />}>
            <SchematicCanvasLazy
                schematic={schematic}
                definitions={definitions}
                externalPullups={externalPullupsOf(HydraDocument.parse(activeSource).toJS())}
                onMove={(reference: string, x: number, y: number) =>
                    options.onSchematicMove?.(reference, x, y) ?? false}
            />
            </Suspense>
        );
    }

    function BottomTab() {
        const [, force] = useState(0);
        useEffect(() => {
            const listener = (): void => force((n) => n + 1);
            monitorListeners.add(listener);
            return () => { monitorListeners.delete(listener); };
        }, []);

        const doc = HydraDocument.parse(activeSource);
        const state = clock.state;

        return (
            <Suspense fallback={<Loading />}>
            <BottomPanelLazy
                lines={logs.toArray()}
                events={events.toArray()}
                droppedLines={logs.droppedCount}
                model={doc.toJS()}
                diagnostics={validate(doc)}
                buildOutput={buildOutput}
                buildSummary={buildSummary}
                simulation={{ ...state, skipped: clock.skippedSteps }}
                onSimulation={(action, speed) => {
                    if (speed !== undefined) clock.setSpeed(speed);
                    if (action === 'start') clock.start();
                    if (action === 'stop') clock.stop();
                    if (action === 'reset') { clock.reset(); recorded.length = 0; }
                    if (action === 'record') options.onSaveVcd?.(buildVcd());
                    syncAnimation();
                    notifyMonitor();
                }}
                onCommand={(text) => options.sendToDevice?.(text)}
                onRunSuite={(suite) => options.runHilSuite?.(suite)}
            />
            </Suspense>
        );
    }

    /** Składa plik przebiegów z magistral wskazanych w projekcie. */
    function buildVcd(): string {
        const model = HydraDocument.parse(activeSource).toJS() as
            { simulation?: { record?: { vcd?: string[] } } };
        const buses = model.simulation?.record?.vcd ?? [];
        return writeVcd(signalsForBuses(buses), recorded, { comment: 'Hydra Studio' });
    }

    return {
        manifest: {
            id: 'hydra-studio',
            name: 'Hydra Studio',
            version: '0.1.0',
            description: 'Edytor projektów frameworka Hydra — pliki .hydra',
            contributes: ['toolbar', 'statusbar', 'commandpalette', 'sidebar'],
        },

        activate(api: HostApi) {
            const openStudio = () => {
                if (!activeFile) {
                    api.logger.warn('Hydra Studio: brak otwartego pliku .hydra');
                    return;
                }
                api.openEditorTab({
                    uri: `hydra-studio://${activeFile}`,
                    title: `Hydra: ${activeFile.split('/').pop()}`,
                    component: StudioTab,
                    toSide: true,
                });
            };

            disposables.push(
                api.editor.onDidOpenDocument((uri, text) => {
                    if (!uri.endsWith(HYDRA_EXTENSION)) return;
                    activeFile = uri;
                    publish(text);

                    // Krok czasu jest w pliku, więc zegar powstaje razem z nim.
                    // Licznik ruszy dopiero po uruchomieniu symulacji.
                    clock = new SimulationClock(timestepOf(HydraDocument.parse(text).toJS()));

                    // Paczki wczytujemy po otwarciu projektu, nie przy starcie
                    // edytora: zależą od pliku, a nie od sesji.
                    void options.loadSchematic?.(uri).then((loaded) => {
                        schematic = loaded.schematic;
                        definitions = loaded.definitions;
                        publish(activeSource);
                    }).catch(() => { /* brak schematu nie blokuje reszty */ });

                    void options.loadPacks?.(uri).then((loaded) => {
                        packs = loaded;
                        publish(activeSource);
                    }).catch((error: unknown) => {
                        api.logger.warn(`Hydra Studio: nie udało się wczytać paczek: ${String(error)}`);
                    });

                    // Otwarcie pliku projektu od razu pokazuje interfejs —
                    // po to jest to rozszerzenie.
                    openStudio();
                }),

                // Panel ma nadążać za pisaniem w zakładce tekstowej, inaczej
                // formularz pokazywałby stan sprzed chwili i zapisywał na jego
                // podstawie, cofając cudze zmiany.
                api.editor.onDidChangeContent((text) => {
                    if (activeFile) publish(text);
                }),
            );

            disposables.push(
                api.commands.register('open', openStudio),

                api.commands.register('check', () => {
                    if (!activeFile) return;
                    const diagnostics = validate(HydraDocument.parse(activeSource));
                    const text = diagnostics.length === 0
                        ? `${activeFile}: bez zastrzeżeń`
                        : formatDiagnostics(diagnostics, activeFile);
                    if (hasErrors(diagnostics)) api.logger.error(text);
                    else api.logger.info(text);
                }),

                api.commands.register('build', async (target?: unknown) => {
                    if (!activeFile || !options.runBuild) return;
                    const output = await options.runBuild({
                        file: activeFile,
                        ...(typeof target === 'string' ? { target } : {}),
                        upload: false,
                    });
                    if (typeof output === 'string') {
                        buildOutput = output;
                        buildSummary = parseBuildOutput(output);
                        notifyMonitor();
                    }
                }),

                api.commands.register('upload', async (target?: unknown) => {
                    if (!activeFile || !options.runBuild) return;
                    await options.runBuild({
                        file: activeFile,
                        ...(typeof target === 'string' ? { target } : {}),
                        upload: true,
                    });
                }),
            );

            const command = (id: string) => `${api.pluginId}.${id}`;

            disposables.push(
                api.ui.commandpalette.register({ command: command('open'), title: 'Otwórz edytor projektu', category: 'Hydra' }),
                api.ui.commandpalette.register({ command: command('check'), title: 'Sprawdź plik projektu', category: 'Hydra' }),
                api.ui.commandpalette.register({ command: command('build'), title: 'Buduj', category: 'Hydra' }),
                api.ui.commandpalette.register({ command: command('upload'), title: 'Wgraj na urządzenie', category: 'Hydra' }),
                api.ui.commandpalette.register({ command: command('schematic'), title: 'Otwórz schemat', category: 'Hydra' }),
                api.ui.commandpalette.register({ command: command('monitor'), title: 'Monitor portu szeregowego', category: 'Hydra' }),

                api.ui.toolbar.register({
                    id: 'hydra-build', label: 'Buduj wsad', icon: '⚙', command: command('build'),
                    group: 'hydra', order: 10,
                }),
                api.ui.toolbar.register({
                    id: 'hydra-upload', label: 'Wgraj na urządzenie', icon: '↑', command: command('upload'),
                    group: 'hydra', order: 20,
                }),
            );

            // Pasek stanu pokazuje liczbę zgłoszeń — to samo, co panel na dole
            // interfejsu, ale widoczne także z zakładki tekstowej.
            // Monitor podłączamy dopiero na żądanie: otwarcie portu blokuje go
            // dla innych narzędzi, a nie każdy seans wymaga podglądu.
            let serial: { close(): void } | undefined;
            disposables.push(api.commands.register('monitor', () => {
                if (serial) { serial.close(); serial = undefined; return; }
                serial = options.openSerial?.((chunk) => {
                    for (const line of splitter.push(chunk)) {
                        const at = Date.now();
                        // Zdarzenia idą do własnego strumienia, a nie do monitora:
                        // panel zdarzeń pokazujący śmieci z portu byłby gorszy
                        // od pustego.
                        const event = parseEvent(line, at);
                        if (event) events.push(event);
                        else logs.push(parseLogLine(line, at));
                    }
                    notifyMonitor();
                });
                api.openEditorTab({
                    uri: 'hydra-studio://panel', title: 'Panel', component: BottomTab,
                });
            }));

            disposables.push(api.commands.register('schematic', () => {
                api.openEditorTab({
                    uri: `hydra-studio://schematic/${activeFile ?? ''}`,
                    title: 'Schemat', component: SchematicTab, toSide: true,
                });
            }));

            disposables.push(api.ui.sidebar.register({
                id: 'hydra-components', title: 'Komponenty', icon: '⬡',
                component: LibraryPanel, order: 20,
            }));

            const status = api.ui.statusbar.register({
                id: 'hydra-status', text: 'Hydra', alignment: 'left', priority: 50,
                command: command('open'),
            });
            disposables.push(status);

            listeners.add((source) => {
                const diagnostics = validate(HydraDocument.parse(source));
                const errors = diagnostics.filter((d) => d.severity === 'error').length;
                const warnings = diagnostics.length - errors;
                status.update({
                    text: errors > 0 ? `Hydra: ${errors} ✗` : warnings > 0 ? `Hydra: ${warnings} ⚠` : 'Hydra ✓',
                    tooltip: errors > 0 ? 'plik projektu zawiera błędy' : 'plik projektu jest poprawny',
                });
            });
        },

        deactivate() {
            if (animation) { clearInterval(animation); animation = undefined; }
            for (const disposable of disposables) disposable.dispose();
            disposables.length = 0;
            listeners.clear();
        },
    };
}

/** Magistrale z podciągnięciem zadeklarowanym poza schematem. */
function externalPullupsOf(model: unknown): string[] {
    const hardware = (model as { hardware?: { buses?: Record<string, { pullups?: string }> } })?.hardware;
    return Object.entries(hardware?.buses ?? {})
        .filter(([, bus]) => bus?.pullups === 'internal' || bus?.pullups === 'external')
        .map(([name]) => name);
}
