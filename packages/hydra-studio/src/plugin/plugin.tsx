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
    HOST_PLATFORMS,
    decodeBase64, detectHostPlatform, detectHostPlatformSync, formatDiagnostics, hasErrors,
    hostPlatform, parseBuildOutput, parseEvent, parseLogLine, planInsert,
    signalsForBuses, timestepOf, validate, webglRendererProbe, writeVcd,
} from '../model';
import type {
    BuildArtifactInfo, BuildSummary, BusEvent, ComponentDefinition, DetectedHost, LogLine,
    PackManifest, PathSegment, Schematic, Speed, TargetPlan, VcdChange,
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
const HydraStudioIdeLazy = lazy(async () => ({
    default: (await import('./HydraStudioIde')).HydraStudioIde,
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

/**
 * Wynik budowy w postaci rozszerzonej.
 *
 * Gospodarz może dalej zwracać sam napis — tak działały wszystkie dotychczasowe
 * podłączenia i nie ma powodu ich psuć. Postać obiektowa jest potrzebna
 * dopiero dla celu natywnego, którego wynikiem jest plik do pobrania,
 * a nie wsad do wgrania.
 */
export interface BuildOutcome {
    /** Pełne wyjście budowy — to samo, co dotąd zwracał napis. */
    output: string;
    /** Gotowy program dla maszyny użytkownika. */
    artifact?: BuildArtifactInfo;
    /** Dlaczego artefaktu nie ma mimo udanej budowy. */
    artifactProblem?: string;
}

export interface StudioPluginOptions {
    /**
     * Wgranie wsadu **z przeglądarki** — przez Web Serial, a nie przez serwer.
     *
     * `project.upload` woła `pio run -t upload` po stronie serwera i działa
     * tylko wtedy, gdy płytka wisi w porcie serwera. Zwykle wisi w porcie
     * osoby przed przeglądarką, i do tego jest ta droga.
     *
     * Gospodarz dostaje cel i układ, bo od układu zależą adresy w pamięci.
     * Brak opcji chowa przycisk — lepiej go nie pokazać niż pokazać martwy.
     */
    flashFromBrowser?(request: {
        file: string;
        target: string;
        mcu: string;
    }): Promise<void> | void;

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
    runBuild?(
        request: {
            file: string; target?: string; upload: boolean;
            /**
             * Maszyna dla celu natywnego — identyfikator z HOST_PLATFORMS
             * (`win-arm64`, `mac-arm64`, …). Dla celów sprzętowych nieobecny:
             * wsad jest ten sam niezależnie od tego, na czym stoi przeglądarka.
             */
            hostPlatform?: string;
        },
        /**
         * Kolejne wiersze wyniku, w trakcie budowania.
         *
         * Budowanie wsadu trwa minuty. Bez strumienia panel stoi pusty do
         * samego końca i nie widać różnicy między „kompiluje" a „zawisło".
         */
        onLine: (line: string) => void,
    ): Promise<string | BuildOutcome | void>;
    /**
     * Co zrobić z gotowym plikiem celu natywnego.
     *
     * Domyślnie wtyczka pobiera go przez przeglądarkę. Gospodarz z dostępem
     * do dysku (wersja desktopowa) może chcieć zapisać go wprost albo od razu
     * uruchomić — stąd punkt zaczepienia.
     */
    downloadArtifact?(artifact: BuildArtifactInfo): void;
    /** Schematy konfiguracji paczek — z nich powstają formularze inspektora. */
    loadConfigSchemas?(projectFile: string): Promise<Readonly<Record<string, unknown>>>;
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
    /**
     * Polecenia należące do gospodarza: cofanie, wyszukiwanie, formatowanie,
     * paleta poleceń. Studio ich nie obsługuje, bo dotyczą edytora, a nie
     * projektu — przekazuje je dalej pod nazwą z paska menu.
     */
    onHostAction?(action: string): void;
    /**
     * Źródła modułu WebAssembly dla projektu: ścieżka → treść.
     *
     * Wtyczka nie czyta ich sama z tego samego powodu, co paczek: w przeglądarce
     * nie ma dysku, a dostęp do plików jest własnością edytora. Zwrócenie
     * `undefined` znaczy „ten projekt nie ma modułu" i zakładka się nie pojawia
     * — a nie „nie udało się wczytać".
     */
    loadWasmSources?(projectFile: string): Promise<Record<string, string> | undefined>;
    /**
     * Wgranie skompilowanego modułu na urządzenie. Brak — panel kompiluje
     * i pozwala pobrać wynik, ale nie udaje, że umie więcej.
     */
    uploadWasm?(wasm: Uint8Array, sha256: string): Promise<void>;
    /** Nazwa urządzenia w przycisku wgrywania; zna ją gospodarz, nie projekt. */
    wasmDeviceLabel?: string;
}

/**
 * Tymczasowa diagnostyka, włączana z konsoli:
 *
 *     localStorage.HYDRA_DEBUG = '1'   // i przeładuj stronę
 *
 * Bez tego cisza. Wtyczka działa w przeglądarce, do której nie mam dostępu,
 * więc bez śladu w konsoli każda hipoteza o tym, gdzie się urywa, jest
 * zgadywaniem — a to kosztowało już kilka nietrafionych poprawek.
 */
function debug(...args: unknown[]): void {
    try {
        if (globalThis.localStorage?.getItem('HYDRA_DEBUG') === '1') {
            console.log('[hydra]', ...args);
        }
    } catch { /* brak localStorage — trudno */ }
}

/**
 * Pobranie pliku przez przeglądarkę. Zwraca opis problemu albo `undefined`.
 *
 * Odnośnik musi trafić do dokumentu, zanim zostanie kliknięty — Firefox
 * ignoruje kliknięcie w element spoza drzewa. Adres obiektu zwalniamy
 * z opóźnieniem, bo unieważnienie go w tej samej klatce przerywa rozpoczęte
 * pobieranie w Safari.
 */
function downloadInBrowser(artifact: BuildArtifactInfo): string | undefined {
    try {
        const blob = new Blob([decodeBase64(artifact.base64) as unknown as BlobPart],
                              { type: artifact.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = artifact.name;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return undefined;
    } catch (err) {
        return String(err);
    }
}

export function createHydraStudioPlugin(options: StudioPluginOptions): HostPlugin {
    const disposables: IDisposable[] = [];
    let activeFile: string | undefined;
    let activeSource = '';

    /** Podsłuch zmian treści — panel odświeża się z każdą literą w tekście. */
    const listeners = new Set<(source: string) => void>();

    let packs: readonly PackManifest[] = [];
    let wasmSources: Record<string, string> | undefined;
    let configSchemas: Readonly<Record<string, unknown>> = {};

    /**
     * Cel wybrany przez użytkownika na pasku narzędzi gospodarza.
     * Brak oznacza „domyślny z pliku projektu".
     */
    let selectedTarget: string | undefined;

    /** Odroczone otwarcie zakładki — do anulowania przy wyłączeniu wtyczki. */
    let pendingTabTimer: ReturnType<typeof setTimeout> | undefined;

    /**
     * Maszyna, dla której budujemy cel natywny.
     *
     * `detected` wypełnia wykrywanie przy aktywacji, `override` — wybór
     * użytkownika. Wybór ma pierwszeństwo zawsze, bo wykrywanie architektury
     * z poziomu strony bywa niemożliwe (Safari na Apple Silicon podaje
     * „Intel", Windows on ARM podaje „x64") i użytkownik musi mieć jak
     * to poprawić.
     */
    let detectedHost: DetectedHost | undefined;
    let hostOverride: string | undefined;

    function hostPlatformId(): string | undefined {
        return hostOverride ?? detectedHost?.platform.id;
    }

    /** Gospodarz — zapamiętany przy aktywacji, bo `runAction` żyje poza nią. */
    let host: HostApi | undefined;
    let definitions: Readonly<Record<string, ComponentDefinition>> = {};
    let schematic: Schematic | undefined;

    // Bufor cykliczny: urządzenie mówi szybciej, niż człowiek czyta, a lista
    // bez ograniczenia zatrzymuje przeglądarkę po kilku minutach pracy.
    const logs = new RingBuffer<LogLine>(2000);
    const events = new RingBuffer<BusEvent>(2000);
    const splitter = new LineSplitter();
    const monitorListeners = new Set<() => void>();

    /**
     * Wiersze dla panelu dolnego zakładki.
     *
     * Wynik budowania ma pierwszeństwo nad monitorem: po naciśnięciu „Buduj"
     * człowiek patrzy na kompilację, a nie na to, co urządzenie mówiło minutę
     * wcześniej. Gdy budowania nie było, pokazujemy telemetrię z monitora.
     */
    /** Odświeża zakładkę i monitor — wynik budowania zmienia oba. */
    function republish(): void {
        notifyMonitor();
        publish(activeSource);
    }

    function bottomPanelLines(): readonly string[] {
        if (buildOutput !== undefined) return buildOutput.split('\n');
        return logs.toArray().map((l) =>
            l.module ? `[${l.module}] ${l.text}` : l.text);
    }

    let buildOutput: string | undefined;
    let buildSummary: BuildSummary | undefined;

    /**
     * Uchwyt gospodarza i połączenia z portem.
     *
     * Trzymane poza `activate`, bo sięgają po nie zarówno polecenia edytora,
     * jak i pozycje z paska menu powłoki — a to dwie różne drogi do tej samej
     * czynności.
     */
    let hostApi: HostApi | undefined;
    let serial: { close(): void } | undefined;
    let openSerialImpl: (() => { close(): void } | undefined) | undefined;

    /** Przełącznik monitora: otwarcie portu blokuje go dla innych narzędzi. */
    function toggleSerial(): void {
        if (serial) { serial.close(); serial = undefined; return; }
        serial = openSerialImpl?.();
    }

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

    /**
     * Numer wydania stanu wtyczki.
     *
     * Sama treść pliku nie wystarcza jako sygnał odświeżenia: wynik budowania,
     * wybrany cel czy wczytane paczki zmieniają to, co widać, nie ruszając ani
     * jednego znaku w projekcie. `setState` z identycznym napisem React pomija,
     * więc panel zostawał pusty mimo poprawnie wykonanej akcji.
     */
    let revision = 0;

    function publish(source: string): void {
        activeSource = source;
        revision += 1;
        for (const listener of listeners) listener(source);
    }

    function StudioTab() {
        // Obiekt, nie napis — nowa tożsamość przy każdym wydaniu wymusza
        // przerysowanie także wtedy, gdy treść pliku się nie zmieniła.
        const [state, setState] = useState(() => ({ source: activeSource, revision }));
        const source = state.source;

        useEffect(() => {
            const listener = (next: string): void => setState({ source: next, revision });
            listeners.add(listener);
            setState({ source: activeSource, revision });
            return () => { listeners.delete(listener); };
        }, []);

        return (
            <Suspense fallback={<Loading />}>
                <HydraStudioIdeLazy
                    source={source}
                    fileName={activeFile?.split('/').pop()}
                    packs={packs}
                    definitions={definitions}
                    schematic={schematic}
                    configSchemas={configSchemas}
                    target={selectedTarget}
                    onSelectTarget={(name) => { selectedTarget = name; publish(activeSource); }}
                    log={bottomPanelLines()}
                    onEdit={(path, value) => editField(source, path, value)}
                />
            </Suspense>
        );
    }

    /**
     * Czy wskazany cel jest natywny.
     *
     * Pytamy plan, a nie nazwę celu: nazwa jest dowolna („podglad", „okno"),
     * a decyzja ma zapadać w jednym miejscu — tym samym, z którego korzysta
     * wiersz poleceń. Drugie miejsce oznaczałoby, że kiedyś odpowiedzą różnie.
     */
    /** Cel i jego układ — offsety wsadu zależą od układu, nie od nazwy celu. */
    function targetMcu(name: string | undefined): { target: string; mcu: string } | undefined {
        if (!activeFile) return undefined;
        try {
            const plan = buildPlan(HydraDocument.parse(activeSource).toJS());
            const wanted = name ?? plan.defaultTarget;
            const found = plan.targets.find((target) => target.name === wanted);
            return found ? { target: found.name, mcu: found.mcu } : undefined;
        } catch {
            return undefined;
        }
    }

    function isNativeTarget(name: string | undefined): boolean {
        if (!activeFile) return false;
        try {
            const plan = buildPlan(HydraDocument.parse(activeSource).toJS());
            const wanted = name ?? plan.defaultTarget;
            return plan.targets.some((target) => target.name === wanted && target.isNative);
        } catch {
            // Plik w trakcie edycji bywa niepoprawny — to nie powód, żeby
            // przycisk „Buduj" przestał działać. Budowa i tak zgłosi błąd.
            return false;
        }
    }

    /**
     * Czy wskazany cel jest przeglądarkowy.
     *
     * Potrzebne wyłącznie do nazwania czynności: na tym celu „wgraj" znaczy
     * „otwórz stronę", a nie „wgraj wsad" — i pasek postępu ma mówić to samo,
     * co się dzieje.
     */
    /**
     * Pierwszy cel przeglądarkowy w projekcie, jeśli jakiś jest.
     *
     * Przycisk „Uruchom w karcie" nie może polegać na tym, który cel jest
     * akurat wybrany: użytkownik buduje wsad na płytkę, a potem chce zobaczyć
     * to samo urządzenie w przeglądarce. Zmuszanie go do przełączania celu
     * w rozwijanej liście byłoby krokiem, którego nikt nie odgadnie.
     */
    function browserTargetName(): string | undefined {
        if (!activeFile) return undefined;
        try {
            const plan = buildPlan(HydraDocument.parse(activeSource).toJS());
            return plan.targets.find((target) => target.isWasm)?.name;
        } catch {
            return undefined;
        }
    }

    function isWasmTarget(name: string | undefined): boolean {
        if (!activeFile) return false;
        try {
            const plan = buildPlan(HydraDocument.parse(activeSource).toJS());
            const wanted = name ?? plan.defaultTarget;
            return plan.targets.some((target) => target.name === wanted && target.isWasm);
        } catch {
            return false;
        }
    }

    /** Sprowadza obie postacie wyniku budowy do jednej. */
    function normalizeOutcome(result: string | BuildOutcome | void,
                              streamed: readonly string[], what: string): BuildOutcome {
        const fallback = streamed.length > 0
            ? streamed.join('\n')
            : `${what} zakończone bez wyniku.`;

        if (typeof result === 'string') return { output: result };
        if (result && typeof result === 'object') {
            return {
                output: result.output || fallback,
                ...(result.artifact ? { artifact: result.artifact } : {}),
                ...(result.artifactProblem ? { artifactProblem: result.artifactProblem } : {}),
            };
        }
        return { output: fallback };
    }

    /**
     * Oddaje gotowy plik użytkownikowi.
     *
     * Domyślnie przez pobranie w przeglądarce. Zapis do dysku jest poza
     * zasięgiem strony, więc jedyną drogą jest obiekt Blob i odnośnik
     * z atrybutem `download` — ta sama, którą Studio zapisuje pliki VCD.
     */
    function deliverArtifact(artifact: BuildArtifactInfo): void {
        if (options.downloadArtifact) {
            options.downloadArtifact(artifact);
            return;
        }
        const problem = downloadInBrowser(artifact);
        buildOutput = problem
            ? `${buildOutput ?? ''}\n\nnie udało się pobrać ${artifact.name}: ${problem}`
            : `${buildOutput ?? ''}\n\npobrano ${artifact.name} ` +
              `(${Math.round(artifact.sizeBytes / 1024)} kB)${runHint(artifact)}`;
    }

    /**
     * Co użytkownik ma zrobić z pobranym plikiem.
     *
     * Archiwum trzeba rozpakować, a plik z Uniksa dostaje po pobraniu prawa
     * bez bitu wykonywalności — przeglądarka go zdejmuje i nie da się tego
     * obejść. Bez tej podpowiedzi udana budowa kończy się plikiem, którego
     * dwukrotne kliknięcie nic nie robi.
     */
    function runHint(artifact: BuildArtifactInfo): string {
        if (artifact.packaged) return ' — rozpakuj i uruchom plik .exe';
        return `\nnadaj prawo uruchamiania:  chmod +x ${artifact.name} && ./${artifact.name}`;
    }

    /**
     * Zapis pola. Wydzielone z widoku, bo tę samą drogę wykorzystuje wstawianie
     * komponentu: policz przedziały tekstu na modelu Hydry, nanieś na model
     * Monaco. Formularz i zakładka tekstowa patrzą wtedy na to samo.
     */
    function editField(source: string, path: PathSegment[],
                       value: string | number | boolean): boolean {
        if (!activeFile) return false;
        const model = options.models.getModel(activeFile);
        if (!model) return false;

        const doc = HydraDocument.parse(source);
        // Pole, którego jeszcze nie ma w pliku, trzeba dopisać — podmiana
        // wartości działa tylko na tym, co już istnieje.
        const ok = doc.setScalar(path, value)
            || doc.insertKey(path.slice(0, -1), String(path[path.length - 1]), value);
        if (!ok) return false;

        return applyToModel(model, source, doc.pendingEdits());
    }

    /**
     * Wykonanie polecenia z paska menu albo narzędzi.
     *
     * Powłoka nie wie, jak zbudować wsad ani otworzyć port — to zadanie
     * gospodarza, który ma dostęp do systemu plików i do środowiska budowania.
     * Tutaj jest tylko rozdzielenie poleceń na te ścieżki.
     */
    async function runAction(action: string, argument?: unknown): Promise<void> {
        if (!activeFile) {
            // Cichy powrót zostawiał użytkownika z wrażeniem zepsutego przycisku.
            host?.logger.warn(`polecenie ${action}: brak otwartego pliku .hydra`);
            return;
        }
        debug('wykonuję:', action);

        switch (action) {
            case 'project.flashWeb': {
                if (!options.flashFromBrowser) {
                    host?.logger.warn('wgrywanie z przeglądarki nie jest podłączone');
                    return;
                }
                const chosen = targetMcu(typeof argument === 'string' ? argument : selectedTarget);
                if (!chosen) {
                    buildOutput = 'Nie udało się odczytać celu z pliku projektu.';
                    republish();
                    return;
                }
                await options.flashFromBrowser({ file: activeFile, ...chosen });
                return;
            }

            case 'project.build':
            case 'project.upload': {
                const uploading = action === 'project.upload';

                /*
                 * Brak zaplecza musi być widoczny.
                 *
                 * Wcześniej stało tu `options.runBuild?.(…)` — gdy gospodarz nie
                 * podłączył budowania, wywołanie po cichu nic nie robiło i panel
                 * zostawał pusty. Naciśnięcie „Buduj", po którym nie dzieje się
                 * nic i nie wiadomo dlaczego, jest gorsze niż komunikat błędu.
                 */
                if (!options.runBuild) {
                    buildOutput = [
                        `${uploading ? 'Wgrywanie' : 'Budowanie'} niedostępne: środowisko budowania nie jest podłączone.`,
                        '',
                        'Studio nie buduje samo — potrzebuje gospodarza, który uruchomi',
                        'PlatformIO (libs/Hydra/docker/hydra.sh) i zwróci wynik.',
                        'Podłącza się je przez opcję `runBuild` przy tworzeniu wtyczki.',
                    ].join('\n');
                    buildSummary = undefined;
                    republish();
                    return;
                }

                const chosenTarget = typeof argument === 'string' ? argument : selectedTarget;
                const native = isNativeTarget(chosenTarget);
                const machine = native ? hostPlatformId() : undefined;

                // Na celu przeglądarkowym urządzeniem jest przeglądarka:
                // „Wgrywanie" wprowadzałoby w błąd co do tego, co się stanie.
                const what = uploading
                    ? (isWasmTarget(chosenTarget) ? 'Otwieranie w przeglądarce' : 'Wgrywanie')
                    : 'Budowanie';

                buildOutput = native
                    ? `${what}: ${activeFile.split('/').pop()} → ${machine ?? 'nieznana maszyna'}…`
                    : `${what}: ${activeFile.split('/').pop()}…`;
                republish();

                try {
                    const streamed: string[] = [];
                    const result = await options.runBuild({
                        file: activeFile,
                        ...(chosenTarget !== undefined ? { target: chosenTarget } : {}),
                        upload: action === 'project.upload',
                        ...(machine !== undefined ? { hostPlatform: machine } : {}),
                    }, (line) => {
                        streamed.push(line);
                        buildOutput = streamed.join('\n');
                        republish();
                    });

                    const outcome = normalizeOutcome(result, streamed, what);
                    buildOutput = outcome.output;
                    buildSummary = outcome.output ? parseBuildOutput(outcome.output) : undefined;

                    // Wynik celu natywnego to plik dla tej maszyny — pobieramy
                    // go od razu. Budowa, po której trzeba jeszcze samemu
                    // znaleźć plik w katalogu build, nie jest skończona.
                    if (outcome.artifact) deliverArtifact(outcome.artifact);
                    else if (outcome.artifactProblem) {
                        buildOutput = `${buildOutput}\n\n${outcome.artifactProblem}`;
                    }
                } catch (err) {
                    buildOutput = `${what} nie powiodło się: ${String(err)}`;
                    buildSummary = undefined;
                }
                republish();
                return;
            }

            case 'project.buildAll': {
                // Każdy cel osobno, po kolei: równoległe budowanie zajęłoby
                // wszystkie rdzenie i tak, a wynik byłby nieczytelny.
                const targets = buildPlan(HydraDocument.parse(activeSource).toJS()).targets;
                for (const target of targets) {
                    await options.runBuild?.(
                        { file: activeFile, target: target.name, upload: false },
                        (line) => { buildOutput = `${buildOutput ?? ''}${line}\n`; republish(); },
                    );
                }
                return;
            }

            case 'sim.start':
                if (typeof argument === 'number') clock.setSpeed(argument as Speed);
                clock.start();
                syncAnimation();
                notifyMonitor();
                return;

            case 'sim.stop':
                clock.stop();
                syncAnimation();
                notifyMonitor();
                return;

            case 'sim.record':
                options.onSaveVcd?.(buildVcd());
                return;

            case 'sim.inject':
                if (typeof argument === 'string') options.sendToDevice?.(argument);
                return;

            case 'tools.monitor':
                toggleSerial();
                return;

            case 'tools.i2c':
                options.sendToDevice?.('i2c scan');
                return;

            case 'tools.hil':
                if (typeof argument === 'string') options.runHilSuite?.(argument);
                return;

            case 'file.save':
                void hostApi?.commands.execute('workbench.action.files.save').catch(() => {});
                return;

            default:
                // Polecenia bez własnej obsługi przekazujemy gospodarzowi —
                // cofanie, wyszukiwanie i formatowanie należą do edytora.
                options.onHostAction?.(action);
        }
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
                {...(wasmSources ? { wasmSources } : {})}
                {...(options.uploadWasm ? { onUploadWasm: options.uploadWasm } : {})}
                {...(options.wasmDeviceLabel ? { deviceLabel: options.wasmDeviceLabel } : {})}
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
            host = api;
          try {
            /*
             * Pliki, dla których zakładka Studia już powstała.
             *
             * Bez tego przełączenie się na zakładkę ze źródłem było niemożliwe.
             * `onDidOpenDocument` to w istocie „zmienił się aktywny model", więc
             * kliknięcie w zakładkę tekstową budziło wtyczkę, ta otwierała Studio
             * i natychmiast odbierała fokus. Zakładki były dwie, ale użytkownik
             * widział tylko jedną — i nie dało się z niej wyjść.
             *
             * Zbiór jest świadomie bez sprzątania przy zamknięciu zakładki:
             * hosta nie stać na zdarzenie „zamknięto zakładkę", a ponowne
             * otwarcie Studia jest jedno kliknięcie w „Hydra" na pasku stanu.
             * Cena pomyłki w tę stronę to jedno kliknięcie; w drugą — zablokowany
             * dostęp do własnego pliku.
             */
            const studioOpened = new Set<string>();

            const openStudio = () => {
                if (!activeFile) {
                    api.logger.warn('Hydra Studio: brak otwartego pliku .hydra');
                    return;
                }
                const target = activeFile;
                debug('otwieram zakładkę Studia dla:', target);

                /*
                 * Odroczenie o jedno przejście pętli zdarzeń nie jest ozdobnikiem.
                 *
                 * Podwójne kliknięcie w drive obsługuje funkcja asynchroniczna:
                 * wczytuje plik, budzi wtyczki (i wtedy trafiamy tutaj), a po
                 * powrocie z `await` ustawia aktywną zakładkę na plik tekstowy.
                 * Otwarcie Studia synchronicznie przegrywa ten wyścig — zakładka
                 * powstaje, po czym natychmiast traci fokus i użytkownik widzi
                 * goły YAML.
                 *
                 * W tej samej grupie co plik (`toSide: false`), bo Studio jest
                 * innym widokiem tego samego dokumentu, a nie materiałem
                 * do porównywania obok.
                 */
                pendingTabTimer = setTimeout(() => {
                    pendingTabTimer = undefined;
                    api.openEditorTab({
                        uri: `hydra-studio://${target}`,
                        title: `Hydra: ${target.split('/').pop()}`,
                        component: StudioTab,
                        toSide: false,
                    });
                }, 0);
            };

            disposables.push(
                api.editor.onDidOpenDocument((uri, text) => {
                    debug('otwarto dokument:', uri, '— czy .hydra:', uri.endsWith(HYDRA_EXTENSION));
                    if (!uri.endsWith(HYDRA_EXTENSION)) return;
                    activeFile = uri;
                    publish(text);

                    // Krok czasu jest w pliku, więc zegar powstaje razem z nim.
                    // Licznik ruszy dopiero po uruchomieniu symulacji.
                    clock = new SimulationClock(timestepOf(HydraDocument.parse(text).toJS()));

                    // Paczki wczytujemy po otwarciu projektu, nie przy starcie
                    // edytora: zależą od pliku, a nie od sesji.
                    void options.loadConfigSchemas?.(uri).then((loaded) => {
                        configSchemas = loaded;
                        publish(activeSource);
                    }).catch(() => { /* brak schematów nie blokuje reszty */ });

                    void options.loadSchematic?.(uri).then((loaded) => {
                        schematic = loaded.schematic;
                        definitions = loaded.definitions;
                        publish(activeSource);
                    }).catch(() => { /* brak schematu nie blokuje reszty */ });

                    void options.loadWasmSources?.(uri).then((loaded) => {
                        wasmSources = loaded;
                        publish(activeSource);
                    }).catch((error: unknown) => {
                        api.logger.warn(`Hydra Studio: nie udało się wczytać źródeł modułu: ${String(error)}`);
                    });

                    void options.loadPacks?.(uri).then((loaded) => {
                        packs = loaded;
                        publish(activeSource);
                    }).catch((error: unknown) => {
                        api.logger.warn(`Hydra Studio: nie udało się wczytać paczek: ${String(error)}`);
                    });

                    // Otwarcie pliku projektu od razu pokazuje interfejs — ale
                    // tylko za pierwszym razem. Każde kolejne przejście przez to
                    // miejsce to zwykłe przełączenie zakładki, a wtedy fokus
                    // należy do tego, kto go zażądał.
                    if (!studioOpened.has(uri)) {
                        studioOpened.add(uri);
                        openStudio();
                    }
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

                /*
                 * Uruchomienie w karcie przeglądarki.
                 *
                 * To nie jest wgrywanie i nie ma z nim nic wspólnego poza tym,
                 * że jedno i drugie kończy budowę czymś działającym. Osobne
                 * polecenie, bo „Wgraj przez serwer" na celu przeglądarkowym
                 * jest nazwą, po której nikt się nie domyśli, że dostanie
                 * kartę z aplikacją — a tak właśnie ta ścieżka działa.
                 */
                api.commands.register('runBrowser', () => {
                    const target = browserTargetName();
                    if (!target) {
                        api.logger.warn(
                            'Hydra: ten projekt nie ma celu przeglądarkowego. '
                            + 'Dodaj cel z `mcu: wasm`, żeby uruchomić urządzenie w karcie.',
                        );
                        return;
                    }
                    void runAction('project.upload', target);
                }),

            );

            /*
             * Dwukropek, nie kropka.
             *
             * Host rejestruje polecenia wtyczek jako `pluginId:commandId`.
             * Kropka dawała identyfikator, którego nikt nie zarejestrował,
             * więc przycisk istniał, dawał się kliknąć i nic nie robił —
             * bez błędu, bo wykonanie nieznanego polecenia niczego nie zgłasza.
             */
            const command = (id: string) => `${api.pluginId}:${id}`;

            /**
             * Pozycje menu z projektu interfejsu — bez „Plik" i „Edycja",
             * bo te należą do edytora i dotyczą pliku, nie projektu.
             *
             * Edytor nie ma punktu rozszerzenia dla paska menu, więc trafiają
             * do palety poleceń pod kategoriami odpowiadającymi nazwom menu.
             * Nazwy zostają identyczne, żeby dało się je znaleźć po tym,
             * czego się szuka.
             */
            const MENU: { id: string; title: string; category: string }[] = [
                { id: 'open',            title: 'Otwórz edytor projektu',        category: 'Hydra · Widok' },
                { id: 'schematic',       title: 'Schemat połączeń',              category: 'Hydra · Widok' },
                { id: 'check',           title: 'Sprawdź plik projektu',         category: 'Hydra · Projekt' },
                { id: 'project.build',   title: 'Buduj',                         category: 'Hydra · Projekt' },
                { id: 'project.buildAll',title: 'Buduj wszystkie środowiska',    category: 'Hydra · Projekt' },
                { id: 'project.upload',  title: 'Wgraj na urządzenie (serwer)',  category: 'Hydra · Projekt' },
                { id: 'runBrowser',      title: 'Uruchom w karcie przeglądarki',  category: 'Hydra · Projekt' },
                ...(options.flashFromBrowser
                    ? [{ id: 'project.flashWeb', title: 'Wgraj z przeglądarki (USB)', category: 'Hydra · Projekt' }]
                    : []),
                { id: 'sim.start',       title: 'Uruchom symulację',             category: 'Hydra · Symulacja' },
                { id: 'sim.stop',        title: 'Zatrzymaj symulację',           category: 'Hydra · Symulacja' },
                { id: 'sim.record',      title: 'Nagraj przebiegi (VCD)',        category: 'Hydra · Symulacja' },
                { id: 'sim.inject',      title: 'Wstrzyknij zdarzenie na EventBus', category: 'Hydra · Symulacja' },
                { id: 'tools.monitor',   title: 'Monitor portu szeregowego',     category: 'Hydra · Narzędzia' },
                { id: 'tools.i2c',       title: 'Skaner I²C',                    category: 'Hydra · Narzędzia' },
                { id: 'tools.hil',       title: 'Farma testowa (HIL)',           category: 'Hydra · Narzędzia' },
            ];

            for (const entry of MENU) {
                disposables.push(api.ui.commandpalette.register({
                    command: command(entry.id), title: entry.title, category: entry.category,
                }));
            }

            /*
             * Wybór maszyny dla celu natywnego — osobne polecenie na wariant.
             *
             * Paleta gospodarza rejestruje samą nazwę polecenia i nie przekazuje
             * argumentów, więc `host` z parametrem nadaje się tylko do wywołania
             * z kodu. Pozycja w palecie musi być poleceniem bezargumentowym,
             * inaczej klika się w coś, co nic nie robi.
             *
             * Istnieją dlatego, że wykrywania architektury z poziomu strony nie
             * da się zrobić pewnie — patrz emit/host.ts.
             */
            for (const machine of HOST_PLATFORMS) {
                const id = `host.${machine.id}`;
                disposables.push(api.commands.register(id, () => setHostPlatform(machine.id)));
                disposables.push(api.ui.commandpalette.register({
                    command: command(id),
                    title: `Buduj cel native dla: ${machine.label}`,
                    category: 'Hydra · Projekt',
                }));
            }

            // Pasek narzędzi edytora: to, po co sięga się najczęściej.
            const TOOLBAR: { id: string; label: string; icon: string; order: number }[] = [
                { id: 'project.build',  label: 'Buduj wsad',           icon: '⚙', order: 10 },
                { id: 'project.upload', label: 'Wgraj przez serwer',   icon: '↑', order: 20 },
                { id: 'runBrowser',     label: 'Uruchom w karcie',     icon: '🌐', order: 22 },
                ...(options.flashFromBrowser
                    ? [{ id: 'project.flashWeb', label: 'Wgraj przez USB', icon: '⚡', order: 25 }]
                    : []),
                { id: 'sim.start',      label: 'Uruchom symulację',    icon: '▶', order: 30 },
                { id: 'sim.stop',       label: 'Zatrzymaj symulację',  icon: '■', order: 40 },
                { id: 'tools.monitor',  label: 'Monitor portu',        icon: '☰', order: 50 },
            ];

            for (const entry of TOOLBAR) {
                disposables.push(api.ui.toolbar.register({
                    id: `hydra-${entry.id}`, label: entry.label, icon: entry.icon,
                    command: command(entry.id), group: 'hydra', order: entry.order,
                }));
            }

            debug('zarejestrowano: poleceń', MENU.length, 'przycisków', TOOLBAR.length);

            // Pasek stanu pokazuje liczbę zgłoszeń — to samo, co panel na dole
            // interfejsu, ale widoczne także z zakładki tekstowej.
            // Monitor podłączamy dopiero na żądanie: otwarcie portu blokuje go
            // dla innych narzędzi, a nie każdy seans wymaga podglądu.
            disposables.push(api.commands.register('monitor', () => {
                toggleSerial();
                api.openEditorTab({
                    uri: 'hydra-studio://panel', title: 'Panel', component: BottomTab,
                });
            }));

            hostApi = api;
            openSerialImpl = () => options.openSerial?.((chunk) => {
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

            // Pozycje z projektu interfejsu trafiają do slotów gospodarza:
            // pasek narzędzi, pasek stanu i paleta poleceń. Studio nie rysuje
            // drugiego kompletu obok tego, który edytor już ma.
            for (const id of ['project.build', 'project.buildAll', 'project.upload',
                              'sim.start', 'sim.stop', 'sim.record', 'sim.inject',
                              'tools.monitor', 'tools.i2c', 'tools.hil'] as const) {
                disposables.push(api.commands.register(id, (argument?: unknown) => {
                    debug('polecenie:', id, '— plik:', activeFile ?? '(brak)');
                    void runAction(id, argument);
                }));
            }

            disposables.push(api.commands.register('target', (name?: unknown) => {
                if (typeof name === 'string') { selectedTarget = name; publish(activeSource); }
            }));

            // Ręczne wskazanie maszyny dla celu natywnego. Musi istnieć, bo
            // wykrywanie bywa niemożliwe — Safari na Apple Silicon i Windows
            // on ARM podają architekturę x64 i nie da się tego rozstrzygnąć
            // z poziomu strony.
            disposables.push(api.commands.register('host', (id?: unknown) => {
                if (typeof id === 'string') setHostPlatform(id);
            }));

            function setHostPlatform(id: string): void {
                const machine = hostPlatform(id);
                if (!machine) {
                    api.logger.warn(`Hydra: nieznana maszyna „${id}"`);
                    return;
                }
                hostOverride = id;
                machineStatus.update({
                    text: `⬒ ${machine.label}`,
                    tooltip: 'maszyna wskazana ręcznie',
                    color: '',
                });
                publish(activeSource);
            }

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

            /*
             * Maszyna, dla której powstanie cel natywny.
             *
             * Widoczna na pasku stanu, bo to jedyna rzecz w całym budowaniu,
             * o której program zgaduje. Wsad na ESP32 jest ten sam niezależnie
             * od tego, na czym stoi przeglądarka; plik dla Windows on ARM
             * uruchomi się tylko tam. Ukryte zgadywanie kończyłoby się plikiem,
             * który nie startuje, i pytaniem „dlaczego" bez żadnego tropu.
             */
            const machineStatus = api.ui.statusbar.register({
                id: 'hydra-host', text: '⬒ …', alignment: 'right', priority: 40,
                tooltip: 'maszyna dla celu native',
            });
            disposables.push(machineStatus);

            // Pierwsze przybliżenie od razu, żeby pasek nie stał pusty;
            // Client Hints odpowiadają asynchronicznie i poprawiają wynik.
            detectedHost = detectHostPlatformSync(globalThis.navigator ?? {});
            showMachine();

            void detectHostPlatform(
                globalThis.navigator ?? {},
                typeof document !== 'undefined'
                    ? webglRendererProbe(() => document.createElement('canvas'))
                    : undefined,
            ).then((found) => {
                detectedHost = found;
                showMachine();
                debug('maszyna:', found.platform.id, found.confidence, found.source);
            }).catch(() => { /* zostaje przybliżenie */ });

            function showMachine(): void {
                if (!detectedHost) return;
                const sure = detectedHost.confidence === 'high';
                machineStatus.update({
                    text: `⬒ ${detectedHost.platform.label}${sure ? '' : ' ?'}`,
                    tooltip: sure
                        ? `maszyna dla celu native — ${detectedHost.source}`
                        : `maszyna zgadnięta (${detectedHost.source}). ` +
                          'Popraw poleceniem „Hydra: maszyna", jeśli to nie ta.',
                    ...(sure ? {} : { color: '#d97706' }),
                });
            }

            listeners.add((source) => {
                const diagnostics = validate(HydraDocument.parse(source));
                const errors = diagnostics.filter((d) => d.severity === 'error').length;
                const warnings = diagnostics.length - errors;
                status.update({
                    text: errors > 0 ? `Hydra: ${errors} ✗` : warnings > 0 ? `Hydra: ${warnings} ⚠` : 'Hydra ✓',
                    tooltip: errors > 0 ? 'plik projektu zawiera błędy' : 'plik projektu jest poprawny',
                });
            });
          } catch (err) {
            api.logger.error('rejestracja wtyczki przerwana', err);
            throw err;
          }

        },

        deactivate() {
            if (pendingTabTimer !== undefined) {
                clearTimeout(pendingTabTimer);
                pendingTabTimer = undefined;
            }

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
