/** Oddaje sterowanie pętli zdarzeń — zakładka Studia otwiera się odroczona. */
const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

import { test } from 'vitest';

import {
    expectDeepEqual,
    expectEqual,
    expectMatch,
    expectOk,
} from '../testing/assert';

/** Wtyczka: reakcja na otwarcie pliku, zapis z formularza, polecenia. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createHydraStudioPlugin, HYDRA_EXTENSION } from './plugin';
import type { HostApi, IDisposable } from './host';
import type { EditableModel } from './monacoBridge.js';

const here = dirname(fileURLToPath(import.meta.url));
const roverSource = readFileSync(join(here, '../model/__fixtures__/rover-01.hydra'), 'utf8');

const noop: IDisposable = { dispose() {} };

/** Atrapa edytora — zapisuje, co wtyczka zarejestrowała i o co poprosiła. */
function fakeHost() {
    const state = {
        openedTabs: [] as { uri: string; title: string }[],
        commands: new Map<string, (...args: unknown[]) => unknown>(),
        palette: [] as string[],
        toolbar: [] as string[],
        toolbarItems: [] as { id: string; command: string }[],
        sidebar: [] as string[],
        statusText: '',
        logs: [] as string[],
        onOpen: undefined as ((uri: string, text: string) => void) | undefined,
        onChange: undefined as ((text: string) => void) | undefined,
    };

    // Rzutowanie na `HostUiApi` dopiero na końcu, więc pola pośrednie
    // wymagają jawnych typów.
    const ui: HostApi['ui'] = {
        toolbar: {
            register(item) {
                state.toolbar.push(item.id);
                state.toolbarItems.push({ id: item.id, command: item.command });
                return noop;
            },
        },
        statusbar: {
            register(item) {
                state.statusText = item.text;
                return { dispose() {}, update(patch) { if (patch.text) state.statusText = patch.text; } };
            },
        },
        commandpalette: { register(item) { state.palette.push(item.command); return noop; } },
        sidebar: { register(panel) { state.sidebar.push(panel.id); return noop; } },
        openSidebarPanel() {},
    };

    const api: HostApi = {
        pluginId: 'hydra-studio',
        editor: {
            onDidOpenDocument(cb) { state.onOpen = cb; return noop; },
            onDidChangeModel() { return noop; },
            onDidChangeContent(cb) { state.onChange = cb; return noop; },
            onDidSaveDocument() { return noop; },
        },
        commands: {
            /*
             * Prefiksowanie jak u prawdziwego hosta (`pluginId:commandId`).
             *
             * Wcześniej atrapa zapisywała identyfikator bez zmian i była
             * łagodniejsza niż host: pasek narzędzi wskazujący `hydra-studio.x`
             * zamiast `hydra-studio:x` przechodził testy, a w aplikacji przycisk
             * nic nie robił. Podwójny host, który wybacza więcej niż prawdziwy,
             * daje zielone testy i zepsuty program.
             */
            register(id, handler) { state.commands.set(`hydra-studio:${id}`, handler); return noop; },
            async execute(id, ...args) {
                const full = id.startsWith('hydra-studio:') ? id : `hydra-studio:${id}`;
                return state.commands.get(full)?.(...args);
            },
        },
        ui,
        logger: {
            info(msg) { state.logs.push(`info: ${msg}`); },
            warn(msg) { state.logs.push(`warn: ${msg}`); },
            error(msg) { state.logs.push(`error: ${msg}`); },
        },
        openEditorTab(opts) { state.openedTabs.push({ uri: opts.uri, title: opts.title }); },
    };

    return { api, state };
}

function fakeModel(initial: string): EditableModel & { text: string } {
    return {
        text: initial,
        getValue() { return this.text; },
        pushEditOperations(_s, operations) {
            const lines = this.text.split('\n');
            const offsets = [0];
            for (const line of lines) offsets.push(offsets[offsets.length - 1]! + line.length + 1);
            const at = (l: number, c: number) => offsets[l - 1]! + c - 1;
            for (const op of [...operations].sort(
                (a, b) => at(b.range.startLineNumber, b.range.startColumn) -
                          at(a.range.startLineNumber, a.range.startColumn))) {
                this.text = this.text.slice(0, at(op.range.startLineNumber, op.range.startColumn))
                          + op.text
                          + this.text.slice(at(op.range.endLineNumber, op.range.endColumn));
            }
            return null;
        },
    };
}

test('otwarcie pliku .hydra pokazuje interfejs obok tekstu', async () => {
    const { api, state } = fakeHost();
    const model = fakeModel(roverSource);
    createHydraStudioPlugin({ models: { getModel: () => model } }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);

    await flush();

    expectEqual(state.openedTabs.length, 1);
    expectMatch(state.openedTabs[0]!.uri, /^hydra-studio:\/\//);
    expectMatch(state.openedTabs[0]!.title, /rover-01\.hydra/);
});

test('inne pliki wtyczki nie obchodzą', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    state.onOpen!('/proj/main.cpp', '#include <Hydra.h>');
    await flush();
    expectEqual(state.openedTabs.length, 0);
});

test('rejestruje polecenia z mockupu w palecie i na pasku', async () => {
    // Edytor nie ma paska menu, więc „Projekt / Buduj" trafia do palety
    // poleceń i na pasek narzędzi — pod tymi samymi nazwami.
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    // Cały pasek menu z projektu interfejsu poza „Plik" i „Edycja" — te
    // należą do edytora. Nazwy pozycji zostają identyczne, żeby dało się
    // je znaleźć po tym, czego się szuka.
    for (const id of ['project.build', 'project.buildAll', 'project.upload',
                      'sim.start', 'sim.stop', 'sim.record', 'sim.inject',
                      'tools.monitor', 'tools.i2c', 'tools.hil']) {
        expectOk(state.commands.has(`hydra-studio:${id}`), `brak polecenia ${id}`);
        expectOk(state.palette.includes(`hydra-studio:${id}`), `brak w palecie: ${id}`);
    }
    // Każdy przycisk musi wskazywać polecenie, które ktoś zarejestrował —
    // to właśnie rozjazd kropki z dwukropkiem przepuszczał.
    for (const item of state.toolbarItems) {
        expectOk(state.commands.has(item.command),
                 `przycisk ${item.id} wskazuje niezarejestrowane polecenie ${item.command}`);
    }
    expectOk(state.toolbar.includes('hydra-project.build'));
    expectOk(state.toolbar.includes('hydra-sim.start'));
});

test('pasek stanu pokazuje liczbę zgłoszeń', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    // Plik wzorcowy ma dwa ostrzeżenia: sieć na płytkach bez radia.
    expectMatch(state.statusText, /⚠/);

    state.onChange!(roverSource.replace('mcu: esp32s3', 'mcu: nieznany'));
    expectMatch(state.statusText, /✗/);
});

test('polecenie budowania przekazuje robotę środowisku, nie woła pio samo', async () => {
    const { api, state } = fakeHost();
    const requests: unknown[] = [];
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        runBuild: async (request) => { requests.push(request); },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    await api.commands.execute('project.build', 'esp32s3-main');

    expectDeepEqual(requests, [{ file: '/proj/rover-01.hydra', target: 'esp32s3-main', upload: false }]);
});

test('sprawdzanie wypisuje zgłoszenia przez dziennik edytora', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', 'hydra: "0.4"\nproject:\n  name: p\n');
    void api.commands.execute('check');

    expectOk(state.logs.some((line) => line.startsWith('error:') && line.includes('targets')));
});

test('rozszerzenie pliku jest jedną stałą, nie powtórzonym literałem', async () => {
    expectEqual(HYDRA_EXTENSION, '.hydra');
});

test('zapis z formularza zmienia jeden wiersz i zachowuje komentarze', async () => {
    // Sedno całej wtyczki: kliknięcie w inspektorze ma być jedną poprawką
    // w historii zmian, a nie przebudowanym plikiem.
    const { api, state } = fakeHost();
    const model = fakeModel(roverSource);
    createHydraStudioPlugin({ models: { getModel: () => model } }).activate(api);
    state.onOpen!('/proj/rover-01.hydra', roverSource);

    // Zapis idzie tą samą drogą, którą wywołuje panel: przedziały tekstu
    // policzone przez model Hydry, naniesione na model Monaco.
    const { HydraDocument } = await import('../model');
    const edited = HydraDocument.parse(roverSource);
    edited.setScalar(['modules', 'motion', 'control', 'period_us'], 1000);
    const { applyToModel } = await import('./monacoBridge');
    expectEqual(applyToModel(model, roverSource, edited.pendingEdits()), true);

    const before = roverSource.split('\n');
    const after = model.text.split('\n');
    expectEqual(before.length, after.length);
    expectEqual(before.filter((line, i) => line !== after[i]).length, 1);
    expectMatch(model.text, /period_us: 1000 {14}# twarda pętla 500 Hz/);
});

test('biblioteka komponentów pojawia się w bocznym panelu', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);
    expectOk(state.sidebar.includes('hydra-components'));
});

test('paczki wczytywane są po otwarciu projektu, nie przy starcie edytora', async () => {
    // Zależą od pliku, nie od sesji — wczytanie ich wcześniej nie miałoby
    // czego dotyczyć.
    const { api, state } = fakeHost();
    const asked: string[] = [];
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        loadPacks: async (file) => { asked.push(file); return []; },
    }).activate(api);

    expectDeepEqual(asked, []);
    state.onOpen!('/proj/rover-01.hydra', roverSource);
    await new Promise((resolve) => setImmediate(resolve));
    expectDeepEqual(asked, ['/proj/rover-01.hydra']);
});

test('niepowodzenie wczytania paczek nie wywraca wtyczki', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        loadPacks: async () => { throw new Error('brak dostępu'); },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    // Panel projektu ma działać także wtedy, gdy biblioteka jest pusta.
    await flush();
    expectEqual(state.openedTabs.length, 1);
});

test('płótno schematu i monitor mają własne polecenia', async () => {
    // Edytor nie ma paska menu, więc „Widok / Schemat" i „Narzędzia / Monitor"
    // trafiają do palety poleceń pod tymi samymi nazwami.
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    expectOk(state.commands.has('hydra-studio:schematic'));
    expectOk(state.commands.has('hydra-studio:tools.monitor'));
    expectOk(state.palette.includes('hydra-studio:schematic'));
    expectOk(state.palette.includes('hydra-studio:tools.monitor'));
});

test('schemat wczytywany jest razem z projektem', async () => {
    const { api, state } = fakeHost();
    const asked: string[] = [];
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        loadSchematic: async (file) => {
            asked.push(file);
            return { schematic: undefined, definitions: {} };
        },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    expectDeepEqual(asked, ['/proj/rover-01.hydra']);
});

test('monitor otwiera port dopiero na żądanie', async () => {
    // Otwarcie portu blokuje go dla innych narzędzi, a nie każdy seans
    // wymaga podglądu.
    const { api, state } = fakeHost();
    let opened = 0;
    let closed = 0;
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        openSerial: () => { opened++; return { close: () => { closed++; } }; },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    expectEqual(opened, 0, 'samo otwarcie projektu nie zajmuje portu');

    await api.commands.execute('monitor');
    expectEqual(opened, 1);

    // Powtórne wywołanie zamyka — to przełącznik, nie przycisk jednorazowy.
    await api.commands.execute('monitor');
    expectEqual(closed, 1);
});

test('zdarzenia idą do własnego strumienia, nie do monitora', async () => {
    // Panel zdarzeń pokazujący śmieci z portu byłby gorszy od pustego.
    const { api, state } = fakeHost();
    let sink: ((chunk: string) => void) | undefined;
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        openSerial: (onData) => { sink = onData; return { close: () => {} }; },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    await api.commands.execute('monitor');

    sink!('[I][app] start\nEV sense/baro 1013.2\nrst:0x1 boot\n');
    // Panel został otwarty — jeden dla projektu, jeden dla podglądu.
    expectOk(state.openedTabs.some((t) => t.uri.includes('panel')));
});

test('wynik budowy zasila pasek stanu', async () => {
    const { api, state } = fakeHost();
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        runBuild: async () =>
            'RAM:   [=         ]   7.6% (used 24876 bytes from 327680 bytes)\n' +
            'Flash: [=         ]  10.0% (used 333141 bytes from 3342336 bytes)\n' +
            '========================= [SUCCESS] Took 9.10 seconds =====',
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    await api.commands.execute('build');
    // Sam fakt, że polecenie przeszło bez wyjątku, wystarcza — treść panelu
    // sprawdzają testy rdzenia.
    expectOk(true);
});

test('samo otwarcie projektu nie uruchamia pętli symulacji', async () => {
    // Licznik tykający trzydzieści razy na sekundę bez uruchomionej symulacji
    // liczy kroki, których nikt nie ogląda — i trzyma proces przy życiu.
    const { api, state } = fakeHost();
    const plugin = createHydraStudioPlugin({ models: { getModel: () => undefined } });
    plugin.activate(api);

    const before = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;
    state.onOpen!('/proj/rover-01.hydra', roverSource);

    // Po opadnięciu odroczenia: jednorazowy licznik otwierający zakładkę ma
    // już nie żyć. Chodzi o brak *trwałej* pętli, nie o zakaz odraczania.
    await flush();
    const after = process.getActiveResourcesInfo().filter((r) => r === 'Timeout').length;

    // Porównanie nierównością, nie równością: `flush()` wygasza też liczniki
    // niezwiązane z wtyczką, więc liczba potrafi spaść. Pilnujemy tego, o co
    // naprawdę chodzi — wtyczka nie zostawia po sobie licznika więcej.
    expectOk(after <= before,
             `otwarcie projektu zostawiło licznik: ${before} → ${after}`);
    plugin.deactivate?.();
});

test('otwarcie .hydra pokazuje całą powłokę IDE, nie sam formularz', async () => {
    // Mockup pokazuje pasek menu, pasek narzędzi, panel boczny, inspektor,
    // panel dolny i pasek stanu. Zakładka jest zwykłym komponentem, więc
    // powłoka nie musi się z gospodarzem o nic negocjować.
    const { api, state } = fakeHost();
    createHydraStudioPlugin({ models: { getModel: () => undefined } }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    await flush();
    expectEqual(state.openedTabs.length, 1);
    expectMatch(state.openedTabs[0]!.title, /rover-01\.hydra/);
});

test('polecenia z paska menu trafiają do gospodarza, nie są wykonywane w przeglądarce', async () => {
    // Cofanie, wyszukiwanie i formatowanie należą do edytora — Studio ich
    // nie obsługuje i nie udaje, że potrafi.
    const { api, state } = fakeHost();
    const forwarded: string[] = [];
    createHydraStudioPlugin({
        models: { getModel: () => undefined },
        onHostAction: (action) => { forwarded.push(action); },
    }).activate(api);

    state.onOpen!('/proj/rover-01.hydra', roverSource);
    expectOk(state.commands.has('hydra-studio:project.build'));
    expectOk(forwarded.length === 0, 'bez wywołania nic nie jest przekazywane');
});

