# Script API — pełna dokumentacja `api.*`

Obiekt `api` (zwany też **alli** — *all-in-one*) jest wstrzykiwany do każdego
skryptu wykonywanego przez MyCastle:

| Kontekst | Jak dostępne |
|---|---|
| **Automate Script** (blok `automate` w edytorze Markdown) | zmienna `api` w zakresie skryptu |
| **Dash Script** (węzeł Function Call w `*.dash.json`) | parametr `api` funkcji |
| **Plugin Script** (blok `pscript` w edytorze Markdown) | *osobny, lżejszy kontekst — patrz [sekcja Plugin Script](#plugin-script-context)* |

Wszystkie metody z prefiksem `async` zwracają `Promise` i wymagają `await`.

---

## `api.file` — operacje na plikach VFS

Pełna przestrzeń nazw operacji na wirtualnym systemie plików. Ścieżki są
zawsze ścieżkami VFS (np. `data/Notes/2025-01.md`).

### Odczyt i zapis

```ts
await api.file.read(path: string): Promise<string>
```
Wczytuje plik tekstowy. Rzuca błąd gdy plik nie istnieje.

```ts
await api.file.write(path: string, content: string): Promise<void>
```
Zapisuje plik. Nadpisuje jeśli istnieje, tworzy jeśli nie.

### Listowanie

```ts
await api.file.list(path: string): Promise<string[]>
```
Zwraca listę nazw (bez ścieżki) bezpośrednich dzieci katalogu.

```ts
await api.file.listDetailed(path: string): Promise<FileEntry[]>
```
Jak `list`, ale zwraca obiekty `{ name, path, isFile, isDirectory }`.

```ts
await api.file.walk(path: string, callback: (entry: FileEntry) => void | Promise<void>): Promise<void>
```
Rekurencyjny walk po drzewie. Callback dostaje każdy wpis (plik i katalog).
Może być async — walker czeka na zakończenie.

```ts
await api.file.glob(rootPath: string, pattern: string): Promise<string[]>
```
Filtruje rekurencyjnie po wzorcu glob. Zwraca pełne ścieżki plików.
Obsługuje `*` (segment bez `/`) i `**` (dowolna głębokość).

```js
// przykłady
const jsons = await api.file.glob('data/Projects', '*.json');
const allMd  = await api.file.glob('data', '**/*.md');
```

### Metadane

```ts
await api.file.stat(path: string): Promise<FileStat>
// → { path, name, size, modified: Date, isFile, isDirectory }
```
Rzuca błąd gdy ścieżka nie istnieje.

```ts
await api.file.exists(path: string): Promise<boolean>
await api.file.isFile(path: string): Promise<boolean>
await api.file.isDirectory(path: string): Promise<boolean>
await api.file.size(path: string): Promise<number>        // bajty, 0 dla katalogu
await api.file.modified(path: string): Promise<Date>
```

### Manipulacja

```ts
await api.file.delete(path: string): Promise<void>        // tylko pliki
await api.file.copy(from: string, to: string): Promise<void>
await api.file.rename(from: string, to: string): Promise<void>
await api.file.move(from: string, to: string): Promise<void>  // alias rename
await api.file.mkdir(path: string): Promise<void>         // tworzy rodzicielskie katalogi
await api.file.rmdir(path: string, recursive?: boolean): Promise<void>
```

### Przykłady

```js
// Wczytaj i zparsuj JSON
const raw  = await api.file.read('data/config.json');
const conf = JSON.parse(raw);

// Zapisz wynik raportu
await api.file.write('data/Reports/daily.md', `# Report\n${body}`);

// Przenieś przetworzone pliki do archiwum
const files = await api.file.glob('data/Inbox', '*.pdf');
for (const f of files) {
  await api.file.move(f, f.replace('/Inbox/', '/Archive/'));
}
```

---

## `api.http` — klient HTTP

Dostępny we **wszystkich** kontekstach skryptowych (`api.http` w Automate/Dash,
`http` w Plugin Script — ta sama implementacja). Automatycznie dodaje
`Authorization: Bearer <jwt>` i `Content-Type: application/json`.
Rzuca `Error` na statusach non-2xx.

```ts
interface ApiHttpOptions {
  headers?: Record<string, string>; // dodatkowe nagłówki (mergowane z domyślnymi)
  auth?: boolean;                   // false = pomiń JWT (external APIs). Default: true
}
```

```ts
await api.http.get<T>(url, options?)             // GET → JSON
await api.http.post<T>(url, body?, options?)     // POST JSON → JSON
await api.http.put<T>(url, body?, options?)      // PUT JSON → JSON
await api.http.patch<T>(url, body?, options?)    // PATCH JSON → JSON
await api.http.delete<T>(url, options?)          // DELETE → JSON (null dla 204)
await api.http.getText(url, options?)            // GET → string (CSV, Markdown, XML…)
await api.http.raw(url, init?)                   // czysty fetch(), brak auto-nagłówków → Response
```

```js
// Wewnętrzne API z auto-JWT
const devices = await api.http.get('/api/users/' + auth.currentUser + '/devices');
await api.http.post('/api/users/marcin/devices/lamp/command', { action: 'toggle' });

// Zewnętrzne API — wyłącz JWT
const weather = await api.http.get('https://api.open-meteo.com/v1/forecast?latitude=52&longitude=21&current=temperature_2m', { auth: false });

// Zewnętrzne API z własnym tokenem z secrets
const ghToken = await api.secrets.get('GitHub', 'token');
const repo = await api.http.get('https://api.github.com/repos/owner/myrepo', {
  auth: false,
  headers: { Authorization: 'Bearer ' + ghToken },
});

// Tekst zamiast JSON (CSV, HTML, plain text)
const csv = await api.http.getText('/api/export/tasks.csv');

// Pełna kontrola (binary, FormData, streaming)
const resp = await api.http.raw('https://example.com/upload', {
  method: 'POST',
  body: formData,
});
```

> **W Plugin Script** dostępne jako globalne `http` (bez prefiksu `api.`),
> np. `await http.get('/api/me')`.

---

## `api.data` — dane PIM (Personal Information Manager)

Synchroniczne API do odczytu modeli PIM załadowanych w pamięci.

```ts
api.data.getPersons(): PersonModel[]
api.data.getPersonById(id: string): PersonModel | undefined

api.data.getTasks(): TaskModel[]
api.data.getTaskById(id: string): TaskModel | undefined

api.data.getProjects(): ProjectModel[]
api.data.getProjectById(id: string): ProjectModel | undefined

api.data.getShoppingLists(): ShoppingListModel[]
api.data.getShoppingListById(id: string): ShoppingListModel | undefined
```

Dane są cache'owane z VFS — odzwierciedlają stan z chwili załadowania
dokumentu. Żeby zobaczyć świeższe dane przeładuj stronę lub edytuj plik.

```js
// Przykład: znajdź wszystkie zadania w projekcie
const proj = api.data.getProjects().find(p => p.name === 'MyCastle');
const tasks = api.data.getTasks().filter(t => t.projectId === proj?.id);
return table(tasks.map(t => ({ Title: t.title, Done: t.done })));
```

---

## `api.variables` — zmienne przepływu

Przestrzeń nazw do przechowywania wartości między węzłami w tym samym
wykonaniu grafu automatyzacji (dash.json lub sesja Automate).

```ts
api.variables.get(name: string): unknown
api.variables.set(name: string, value: unknown): void
api.variables.getAll(): Record<string, unknown>
```

```js
// Węzeł 1 — zapisz wynik
api.variables.set('count', items.length);

// Węzeł 2 — odczytaj
const n = api.variables.get('count');
api.log.info(`Przetworzono ${n} elementów`);
```

---

## `api.log` — logowanie

Wpisy trafiają do panelu **Console** w edytorze (zarówno w `dash.json` jak
i w Automate Script) i do wewnętrznej kolejki `api._logs`.

```ts
api.log.info(message: string): void
api.log.warn(message: string): void
api.log.error(message: string): void
api.log.debug(message: string): void
```

Możesz też używać standardowego `console.log/warn/error` — jest
przechwytywany przez host i pojawia się w tym samym panelu Console.

```js
api.log.info('Rozpoczynam synchronizację…');
try {
  await doWork();
  api.log.info('OK');
} catch (e) {
  api.log.error('Błąd: ' + e.message);
}
```

---

## `api.notify` — powiadomienia UI

Wyświetla snackbar w prawym dolnym rogu aplikacji.

```ts
api.notify(message: string, severity?: 'success' | 'info' | 'warning' | 'error'): void
```

```js
api.notify('Synchronizacja zakończona', 'success');
api.notify('Brak połączenia z serwerem', 'warning');
```

---

## `api.utils` — narzędzia ogólne

```ts
api.utils.uuid(): string
```
Generuje UUID v4.

```ts
api.utils.dayjs(date?: string): dayjs.Dayjs
```
Tworzy instancję `dayjs` (biblioteka do manipulacji datami). Bez argumentu
zwraca bieżący moment.

```ts
await api.utils.sleep(ms: number): Promise<void>
```
Pauzuje wykonanie na `ms` milisekund.

```js
// Przykłady
const id = api.utils.uuid();

const today = api.utils.dayjs().format('YYYY-MM-DD');
const week  = api.utils.dayjs().subtract(7, 'day').format('YYYY-MM-DD');

await api.utils.sleep(1000); // poczekaj 1s między requestami
```

---

## `api.ai` — AI (Anthropic / OpenAI / Ollama)

Używa skonfigurowanego provajdera AI z `Settings → AI`.

```ts
await api.ai.chat(
  prompt: string,
  options?: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string>
```
Prosty chat — zwraca odpowiedź jako string.

```ts
await api.ai.chatVision(
  prompt: string,
  imageBase64: string,
  options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }
): Promise<string>
```
Chat z obrazem zakodowanym w base64 (JPEG/PNG).

```ts
await api.ai.chatMessages(
  messages: AiChatMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<AiChatResponse>
```
Pełna konwersacja. `AiChatMessage = { role: 'user' | 'assistant', content: string }`.

```ts
api.ai.isConfigured(): boolean
```
Zwraca `true` gdy AI jest skonfigurowane (klucz API i model ustawione).

```js
// Podsumuj plik
const text = await api.file.read('data/Notes/meeting.md');
const summary = await api.ai.chat(`Streszcz w 3 punktach:\n\n${text}`);
return md`## Podsumowanie\n\n${summary}`;

// Klasyfikuj z systemowym promptem
const label = await api.ai.chat(task.title, {
  systemPrompt: 'Odpowiedz tylko: "praca", "dom" lub "zakupy".',
  temperature: 0,
});
```

---

## `api.speech` — synteza i rozpoznawanie mowy

```ts
await api.speech.say(text: string, options?: { voice?: string; speed?: number }): Promise<void>
```
Przeczyta tekst przez TTS (Web Speech API lub skonfigurowany silnik).
Czeka do zakończenia wymowy.

```ts
api.speech.stop(): void
```
Zatrzymuje bieżące TTS.

```ts
api.speech.isTtsConfigured(): boolean
api.speech.isSttConfigured(): boolean
```

```js
api.notify('Raport gotowy', 'success');
await api.speech.say('Synchronizacja zakończona pomyślnie.');
```

---

## `api.shopping` — listy zakupów

```ts
await api.shopping.createList(
  name: string,
  options?: { store?: string; budget?: number }
): Promise<ShoppingListModel>
```

```ts
await api.shopping.addItem(
  listId: string,
  name: string,
  options?: { quantity?: number; unit?: string; category?: string; estimatedPrice?: number }
): Promise<ShoppingItemModel>
```

```ts
await api.shopping.checkItem(listId: string, itemId: string, actualPrice?: number): Promise<void>
await api.shopping.uncheckItem(listId: string, itemId: string): Promise<void>
await api.shopping.removeItem(listId: string, itemId: string): Promise<void>
await api.shopping.completeList(listId: string): Promise<void>
```

```ts
await api.shopping.scanReceipt(imageBase64: string | string[]): Promise<ReceiptData>
```
OCR paragon (jeden obraz lub tablica stron), zwraca sparsowane pozycje.

```js
// Utwórz listę z zakupami tygodniowymi
const list = await api.shopping.createList('Tesco', { store: 'Tesco' });
await api.shopping.addItem(list.id, 'Chleb', { quantity: 2 });
await api.shopping.addItem(list.id, 'Mleko', { quantity: 1, unit: 'l' });
```

---

## `api.secrets` — zaszyfrowane credentiale

Dostęp do sekretów zapisanych przez użytkownika w `Settings → Sekrety`.
Klucze są szyfrowane na dysku. Identyczny interfejs dostępny jest w Plugin Script
jako globalna zmienna `secrets`.

```ts
// Lista własnych credentiali (metadane, bez wartości)
await api.secrets.list(): Promise<CredentialEntry[]>
// CredentialEntry = { key: string; type: string; name: string; global: boolean; updatedAt: number }

// Odczyt wartości
// type: 'password' | 'token' | 'other' (opcjonalny filtr)
// owner: opcjonalnie odczyt globalnego sekretu innego użytkownika
await api.secrets.get(name: string, type?: string, owner?: string): Promise<string | null>

// Zapis / aktualizacja
// global=true → sekret dostępny dla wszystkich użytkowników (do odczytu z owner=)
await api.secrets.set(name: string, value: string, type?: string, global?: boolean): Promise<void>

// Usunięcie własnego sekretu — zwraca true gdy coś usunięto
await api.secrets.delete(name: string, type?: string): Promise<boolean>
```

```js
// Odczyt własnego tokenu
const token = await api.secrets.get('GitHub', 'token');
if (!token) throw new Error('Dodaj token GitHub w Settings → Sekrety');

// Zewnętrzne API z tokenem z secrets
const repo = await fetch('https://api.github.com/user', {
  headers: { Authorization: `Bearer ${token}` },
}).then(r => r.json());

// Sekret globalny — np. wspólny klucz API dla wszystkich użytkowników
const sharedKey = await api.secrets.get('WeatherApiKey', 'token', 'admin');
```

---

## `api.scripts` — orkiestracja skryptów w drive

Umożliwia odkrywanie i uruchamianie innych bloków `automate` w plikach `.md`
przez system tagów.

### Znajdowanie

```ts
await api.scripts.findByTag(tag: string, options?: { root?: string }): Promise<DiscoveredScript[]>
```
Skanuje cały drive (od `options.root`, domyślnie `'data'`) w poszukiwaniu
bloków z danym tagiem.

```ts
await api.scripts.findInParentsByTag(tag: string, options?: { root?: string }): Promise<DiscoveredScript[]>
```
Skanuje katalogi nadrzędne bieżącego dokumentu `.md` (w górę hierarchii).

```ts
await api.scripts.findInChildsByTag(tag: string): Promise<DiscoveredScript[]>
```
Skanuje rekurencyjnie pod katalogiem bieżącego dokumentu `.md`.

Zwracany typ `DiscoveredScript`:
```ts
{
  path: string;       // ścieżka VFS do pliku .md
  blockId: string;    // TipTap id bloku
  code: string;       // kod skryptu
  tags: string[];
  autorun: boolean;
  viewMode: 'code' | 'html';
  windowHeight: number | null;
}
```

### Uruchamianie

```ts
await api.scripts.runByTag(tag: string, options?: {
  root?: string;
  stopOnError?: boolean;
}): Promise<ScriptRunResult[]>

await api.scripts.runInParentsByTag(tag: string, options?: {
  root?: string;
  stopOnError?: boolean;
}): Promise<ScriptRunResult[]>

await api.scripts.runInChildsByTag(tag: string, options?: {
  stopOnError?: boolean;
}): Promise<ScriptRunResult[]>
```

Zwracany typ `ScriptRunResult`:
```ts
{
  path: string;
  blockId: string;
  tags: string[];
  ok: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
}
```

### Obiekty sceny QObject

Gdy skrypt powiązany jest ze sceną QObject (ustawienie bloku `scenePath`):

```ts
api.scripts.getRoot(): unknown          // pierwszy żywy obiekt korzenia
api.scripts.getRoots(): unknown[]       // wszystkie korzenie
api.scripts.getSceneData(): unknown[]   // surowe dane JSON sceny
```

### Przykład: daily runner

```js
// Plik: data/Daily/2025-01-15.md
// Ten skrypt odpala wszystkie bloki otagowane "daily-task" w podkatalogach

const results = await api.scripts.runInChildsByTag('daily-task');
const ok  = results.filter(r => r.ok).length;
const err = results.filter(r => !r.ok).length;
api.notify(`Daily runner: ${ok} OK, ${err} błędów`, err ? 'warning' : 'success');
return table(results.map(r => ({
  File: r.path.split('/').pop(),
  Status: r.ok ? '✅' : '❌',
  Time: r.durationMs + 'ms',
  Error: r.error ?? '',
})));
```

---

## `api.doc` — dostęp do bieżącego dokumentu Markdown

Pozwala skryptowi introspekcjonować dokument `.md`, w którym jest osadzony:
listować wszystkie bloki, czytać ich kod, iterować komponenty.

> **Uwaga:** Metody `read()`, `blocks()` i `blockCode()` wymagają kontekstu
> dokumentu (blok automate osadzony w pliku `.md`). W kontekście `dash.json`
> (panel Drive) lub graficznym designerze przepływów `doc.path()` zwróci
> `undefined`, a pozostałe metody rzucą błąd.

### `api.doc.path()`

```ts
api.doc.path(): string | undefined
```
Ścieżka VFS bieżącego pliku `.md`. `undefined` gdy brak kontekstu dokumentu.

```js
const where = api.doc.path();
api.log.info(`Skrypt działa w: ${where ?? '(brak kontekstu dokumentu)'}`);
```

### `api.doc.read()`

```ts
await api.doc.read(): Promise<string>
```
Surowy kod Markdown bieżącego dokumentu (dokładnie tak jak jest zapisany
w VFS, włącznie z code-fensami i metadanymi bloków).

```js
const raw = await api.doc.read();
const lines = raw.split('\n').length;
api.log.info(`Dokument ma ${lines} linii`);
```

### `api.doc.blocks()`

```ts
await api.doc.blocks(filter?: {
  type?: 'automate' | 'pscript';
  tag?: string;     // tylko dla bloków automate
  label?: string;   // tylko dla bloków pscript
}): Promise<DocBlockRef[]>
```

Parsuje i zwraca wszystkie osadzone bloki skryptowe z dokumentu.

Zwracany typ `DocBlockRef`:
```ts
{
  id: string;               // TipTap node id
  type: 'automate' | 'pscript';
  label?: string;           // etykieta bloku (pscript)
  mode?: 'auto' | 'manual'; // tryb uruchomienia (pscript)
  tags?: string[];          // tagi (automate)
  code: string;             // kod skryptu
}
```

```js
// Wszystkie bloki
const all = await api.doc.blocks();
api.log.info(`Dokument zawiera ${all.length} bloków skryptowych`);

// Tylko bloki automate z tagiem "daily"
const daily = await api.doc.blocks({ type: 'automate', tag: 'daily' });

// Tylko Plugin Script bloki w trybie auto
const autos = (await api.doc.blocks({ type: 'pscript' }))
  .filter(b => b.mode === 'auto');
```

### `api.doc.blockCode()`

```ts
await api.doc.blockCode(blockId: string): Promise<string | undefined>
```
Zwraca kod źródłowy konkretnego bloku po jego ID.
`undefined` gdy blok o danym ID nie istnieje.

```js
// Przeczytaj kod innego bloku w tym samym dokumencie
const blocks = await api.doc.blocks({ type: 'pscript', label: 'Config' });
const configBlock = blocks[0];
if (configBlock) {
  const src = await api.doc.blockCode(configBlock.id);
  api.log.debug('Kod bloku Config:\n' + src);
}
```

### Przykład: raport struktury dokumentu

```js
// Wygeneruj spis bloków w bieżącym dokumencie
const path = api.doc.path();
const blocks = await api.doc.blocks();

const rows = blocks.map(b => ({
  ID:    b.id.slice(0, 8) + '…',
  Type:  b.type,
  Label: b.label ?? (b.tags?.join(', ') ?? '—'),
  Mode:  b.mode ?? '—',
  Lines: b.code.split('\n').length,
}));

return [
  md`## Bloki skryptowe w \`${path}\``,
  table(rows),
];
```

### Przykład: wykonaj inny blok w tym samym dokumencie

```js
// Znajdź blok automate z tagiem "helper" i wykonaj jego kod
const [helper] = await api.doc.blocks({ type: 'automate', tag: 'helper' });
if (!helper) throw new Error('Nie znaleziono bloku "helper"');

// Uruchom kod helper-a w bieżącym kontekście
const fn = new Function('api', `return (async () => { ${helper.code} })();`);
const result = await fn(api);
api.log.info('Wynik helper-a: ' + JSON.stringify(result));
```

---

## Plugin Script context

Bloki `pscript` (Plugin Script) w edytorze Markdown mają **inny, lżejszy
kontekst** — nie mają dostępu do `api.*`, ale za to mają:

### `auth`

```ts
auth.currentUser: string | null      // nazwa zalogowanego użytkownika
auth.token: string | null            // JWT token
auth.isAdmin: boolean
```

### `http`

Identyczna implementacja co [`api.http`](#apihttp--klient-http) — dostępna
tutaj jako globalna zmienna `http` (bez prefiksu `api.`).

```js
const devices = await http.get('/api/users/' + auth.currentUser + '/devices');
const rates   = await http.get('https://api.exchangerate.host/latest', { auth: false });
const csv     = await http.getText('/api/export/tasks.csv');
```

Pełna dokumentacja metod, opcji i przykładów → sekcja [`api.http`](#apihttp--klient-http).

### `secrets`

Ten sam `CredentialsApi` co `api.secrets` — pełna sygnatura:

```ts
await secrets.list(): Promise<CredentialEntry[]>
await secrets.get(name: string, type?: string, owner?: string): Promise<string | null>
await secrets.set(name: string, value: string, type?: string, global?: boolean): Promise<void>
await secrets.delete(name: string, type?: string): Promise<boolean>
```

```js
// Własny token
const gh = await secrets.get('GitHub', 'token');
// Globalny sekret innego użytkownika
const shared = await secrets.get('WeatherApiKey', 'token', 'admin');
```

### `display.*` — wyjście imperatywne

Alternatywa do `return` — pozwala wypychać kilka bloków wyjściowych:

```ts
display.text(content: string): void
display.table(rows: Record<string, unknown>[]): void
display.list(items: string[]): void
display.json(value: unknown): void
```

### Wartości zwracane przez `return`

Plugin Script renderuje to co zwróci:

```js
// Markdown
return md`# Tytuł\n\nTreść **pogrubiona**`;

// Tabela MUI
return table([{ Imię: 'Jan', Wiek: 30 }, { Imię: 'Anna', Wiek: 25 }]);

// Wartość na żywo (odświeżana przez EventSource / polling)
return reactive({
  initial: () => http.get('/api/rpc/getLatestTelemetry'),
  subscribe: (cb) => {
    const es = new EventSource('/api/iot/telemetry/stream');
    es.onmessage = (e) => cb(JSON.parse(e.data));
    return () => es.close();
  },
  render: (v) => table(v),
});

// React element (JSX nie jest dostępny — użyj React.createElement)
return React.createElement('b', null, 'Hello');
```

### Namespace'y pluginów webowych

Pluginy webowe mogą rejestrować własne namespace'y dostępne w Plugin Script.
Przykład (plugin IoT):

```js
// api rejestruje się jako `iot.getStatus(deviceName)`
const status = await iot.getStatus('esp32-kitchen');
return md`Temperatura: **${status.temperature}°C**`;
```

---

## Porównanie kontekstów

| Funkcja | Automate Script | Dash Script | Plugin Script |
|---|:---:|:---:|:---:|
| `api.file.*` | ✅ | ✅ | ❌ |
| `api.data.*` | ✅ | ✅ | ❌ |
| `api.variables.*` | ✅ | ✅ | ❌ |
| `api.log.*` | ✅ | ✅ | ❌ |
| `api.notify()` | ✅ | ✅ | ❌ |
| `api.utils.*` | ✅ | ✅ | ❌ |
| `api.ai.*` | ✅ | ✅ | ❌ |
| `api.speech.*` | ✅ | ✅ | ❌ |
| `api.shopping.*` | ✅ | ✅ | ❌ |
| `api.secrets.*` / `secrets` | ✅ | ✅ | ✅ (ta sama instancja) |
| `api.scripts.*` | ✅ | ✅ | ❌ |
| `api.doc.*` | ✅ | ⚠️¹ | ❌ |
| `api.http.*` / `http` | ✅ | ✅ | ✅ (ta sama implementacja) |
| `auth` | ❌ | ❌ | ✅ |
| `display.*` | ❌ | ❌ | ✅ |
| `return` value rendered | ❌ | ❌ | ✅ |
| Panel Console | ✅ | ✅ | ❌ |
| `console.log` przechwycony | ✅ | ✅ | ❌ |

¹ `api.doc.path()` zwraca `undefined`; pozostałe metody rzucają błąd.

---

## Powiązane

- [MDScript.md](MDScript.md) — szczegółowa dokumentacja Plugin Script z przykładami
- [automate.md](automate.md) — graficzny przepływ automatyzacji (NodeRed-like)
