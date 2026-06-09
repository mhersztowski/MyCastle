# Plugin Script — wykonywalny blok w edytorze Markdown

## Przegląd

**Plugin Script** to interaktywny blok kodu JavaScript osadzony w pliku
Markdown. Renderuje się jako fioletowa karta w edytorze, można go uruchomić
przyciskiem ▶ lub `Ctrl+Enter`, a wynik pojawia się od razu pod kodem.

W przeciwieństwie do zwykłego bloku ` ``` ` (który tylko podświetla
składnię), Plugin Script:

- ma dostęp do całego API aplikacji (`auth`, `http`, namespace'y pluginów),
- może zwrócić wartość, która zostanie sformatowana (Markdown / tabela / live
  view / React element),
- może też wypychać wyjście imperatywnie przez `display.*`,
- przeżywa zapis/odczyt pliku — kod, etykieta i tryb auto/manual są zapisane
  w bloku ` ```pscript ` w Markdownie.

Wstawiasz go przez `/` w edytorze i pozycję **Plugin Script**.

## Anatomia bloku

```
┌─────────────────────────────────────────────────────────────────┐
│ 🧩 Script           [LIVE]  Auto □   ▶  ⛶  ✎  🗑  ⌃             │  ← header
├─────────────────────────────────────────────────────────────────┤
│ // editor — textarea z Tabem i Ctrl+Enter                       │
│ return md`# Hello ${auth.currentUser}`;                          │  ← code
├─────────────────────────────────────────────────────────────────┤
│ # Hello mhersztowski                                            │  ← output
└─────────────────────────────────────────────────────────────────┘
```

Kontrolki w nagłówku:

| Ikona | Działanie |
|-------|-----------|
| 🧩 | Ikona bloku (informacyjna) |
| label (kliknij) | Inline edycja etykiety — domyślnie "Script" |
| `LIVE` (zielona kropka) | Pokazuje się gdy blok zwrócił `ReactiveValue` i nasłuchuje na żywo |
| Switch `Auto` | Tryb wykonywania — `manual` lub `auto` (uruchom przy załadowaniu pliku) |
| ▶ | Uruchom (`Ctrl+Enter` w textareie też uruchamia) |
| ⛶ (OpenInFull) | Otwórz w pełnoekranowym edytorze Monaco (z autouzupełnianiem JS) |
| ✎ | Edytuj etykietę |
| 🗑 | Wyczyść wyjście |
| ⌃/⌄ | Zwiń/rozwiń sam kod (nagłówek i wynik zostają) |

## Tryby `auto` vs `manual`

- **`manual`** (domyślny) — uruchamiasz przyciskiem ▶ lub `Ctrl+Enter`.
- **`auto`** — uruchamia się raz przy montowaniu noda i ponownie gdy załadują
  się pluginy webowe (`pluginsVersion` rośnie). Dzięki temu blok, który
  korzysta z namespace'u pluginu, sam się przeładuje gdy plugin wreszcie
  dojedzie z VFS-a.

Tryb przełączasz toggle'em w nagłówku — zostaje zapisany w pliku.

## API dostępne w skrypcie

Każdy skrypt jest opakowany w `async function` i otrzymuje *zdestrukturowany*
kontekst — wszystkie poniższe zmienne są dostępne bez prefiksu:

| Zmienna | Typ | Opis |
|---------|-----|------|
| `auth` | `{ currentUser, token, isAdmin }` | Bieżący użytkownik (`name` lub `null`), JWT, flaga admina |
| `http` | `{ get, post, put }` | Wygodny fetch z auto-`Authorization: Bearer` |
| `md` | tag-template | Markdownowy output (`` md`# ...` ``) |
| `table` | funkcja | Tabela (`table(rows, columns?)`) |
| `reactive` | funkcja | Subskrypcja live (`reactive({...})`) |
| `display` | `{ text, table, list, json }` | Wyjście imperatywne (jak `console.log`) |
| `...plugin namespaces` | dowolne | Zarejestrowane przez wczytane web-pluginy |

Top-level `await` jest dozwolony — wnętrze jest `AsyncFunction`. Jeśli zwrócisz wartość, zostanie wyświetlona przez `OutputRenderer`.

### `auth`

```js
return md`Zalogowany jako **${auth.currentUser}** ${auth.isAdmin ? '(admin)' : ''}`;
```

Token jest tym samym JWT, którego używa frontend (`Bearer`), więc każdy
wewnętrzny endpoint `/api/...` jest dostępny.

### `http`

Cienka nakładka na `fetch` — automatycznie dodaje nagłówek
`Authorization: Bearer ${token}`, ustawia `Content-Type: application/json`
przy POST/PUT i rzuca błąd przy `!response.ok`. Zwraca już zparsowany JSON.

```js
const stats = await http.get('/api/admin/stats');
return table([
  { metryka: 'Użytkownicy', wartość: stats.users },
  { metryka: 'Urządzenia', wartość: stats.devices },
]);
```

```js
const result = await http.post('/api/some/endpoint', { foo: 'bar' });
return md`Status: \`${result.status}\``;
```

### `display.*` — wyjście imperatywne

Działa jak `console.log`, ale renderuje w bloku. Można wołać wielokrotnie —
elementy gromadzą się i są wyświetlane jeden pod drugim.

```js
display.text('Pierwsza linia');
display.text('Druga linia');
display.list(['jabłko', 'banan', 'mango']);
display.json({ user: auth.currentUser, isAdmin: auth.isAdmin });
display.table([
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Linus' },
]);
```

`display.*` i `return ...` mogą być używane razem — najpierw renderuje się
wynik zwrócony, potem `display.*`.

## Wartości zwracane

Wartość z `return` przechodzi przez `OutputRenderer`, który rozpoznaje:

| Typ | Render |
|-----|--------|
| `string` (wygląda jak Markdown) | ReactMarkdown + GFM |
| `string` (zwykły) | `<pre>` monospace |
| `MarkdownOutput` (z `md\`...\``) | ReactMarkdown + GFM |
| `TableOutput` (z `table(...)`) | MUI Table |
| `ReactiveValue` (z `reactive(...)`) | live block z badge'em `LIVE` |
| `React.ReactElement` | renderuje JSX |
| `null` / `undefined` | nic |
| pozostałe obiekty | dump JSON w `<pre>` |

### `md` — Markdown

```js
return md`
# Raport miesięczny

- użytkownik: **${auth.currentUser}**
- czas: \`${new Date().toLocaleString()}\`

| Plik | Linie |
|------|------:|
| App.tsx | 245 |
| main.ts | 87 |
`;
```

Tag-template literal `md` — z interpolacją (`${...}`). GFM włączony, więc
tabele, listy zadań, fenced code, autolinki działają.

### `table` — tabela

Dwa formaty wejścia:

**Lista obiektów** — klucze stają się kolumnami:

```js
return table([
  { user: 'ada',  tasks: 12, done: 9 },
  { user: 'gus',  tasks: 5,  done: 5 },
  { user: 'lin',  tasks: 21, done: 14 },
]);
```

**Lista list** — pierwszy element musi być row danych (kolumny generowane
indeksami 0,1,2…), albo podaj `columns?` ręcznie:

```js
return table(
  [['Ada', 12], ['Gus', 5], ['Lin', 21]],
  ['Imię', 'Zadania'],
);
```

### `reactive` — wartość na żywo

Blok pozostaje zamontowany i przerendera się przy każdym zdarzeniu z `subscribe`.
Idealne do telemetrii, statusów MQTT, czasu rzeczywistego itp.

```js
return reactive({
  initial: () => http.get('/api/iot/devices/sensor-1/latest'),
  subscribe: (cb) => {
    const es = new EventSource('/api/iot/devices/sensor-1/stream');
    es.onmessage = (e) => cb(JSON.parse(e.data));
    return () => es.close();   // cleanup gdy blok znika
  },
  render: (v) => md`🌡 **${v.temperature}°C** · 💧 ${v.humidity}%`,
});
```

Pola `ReactiveConfig`:

- `initial?` — wczesna wartość pokazywana przed pierwszym `subscribe`
- `subscribe(callback)` — zwraca funkcję cleanup (wywoływana przy unmount)
- `render(value)` — może zwrócić string (Markdown auto-detect), React node lub MUI element

Podczas oczekiwania na pierwsze dane widać "Waiting for data...".

### React element

Możesz też zwrócić bezpośredni element JSX (przez `React.createElement` —
nie ma transformacji JSX w skrypcie):

```js
const React = await import('react');
return React.createElement('div',
  { style: { padding: 8, background: '#fef3c7', borderRadius: 4 } },
  '⚠️ Uwaga!',
);
```

## Przykłady

### 1. Statyczna karta z danymi użytkownika

```js
return md`
## Profil

- **Nazwa:** ${auth.currentUser}
- **Admin:** ${auth.isAdmin ? 'tak' : 'nie'}
- **Wygenerowano:** ${new Date().toLocaleString('pl-PL')}
`;
```

### 2. Pobranie listy urządzeń IoT i tabela

```js
const devices = await http.get(`/api/users/${auth.currentUser}/devices`);

return table(devices.map(d => ({
  name: d.name,
  status: d.online ? '🟢 online' : '⚫ offline',
  lastSeen: d.lastSeen ? new Date(d.lastSeen).toLocaleString('pl-PL') : '—',
})));
```

### 3. Telemetria na żywo z MQTT (przez SSE proxy)

```js
return reactive({
  subscribe: (cb) => {
    const es = new EventSource(`/api/iot/devices/temp-sensor-1/stream`);
    es.onmessage = (e) => {
      try { cb(JSON.parse(e.data)); } catch { /* ignore */ }
    };
    return () => es.close();
  },
  render: (data) => md`
**Temperatura:** ${data.temperature}°C
**Wilgotność:** ${data.humidity}%
*odczyt: ${new Date(data.ts).toLocaleTimeString('pl-PL')}*
  `,
});
```

Po zwróceniu `reactive(...)` blok dostaje zielony badge **LIVE** w nagłówku.

### 4. Akcja — wyślij komendę i pokaż wynik

```js
const result = await http.post(`/api/users/${auth.currentUser}/devices/lamp-1/command`, {
  action: 'toggle',
});
display.json(result);
return md`✅ Komenda wysłana — \`${result.commandId}\``;
```

### 5. Wielokrotne `display.*` zamiast return

Przydatne gdy nie wiesz z góry ile elementów wypiszesz:

```js
const projects = await http.get(`/api/users/${auth.currentUser}/projects`);

display.text(`Projektów: ${projects.length}`);
for (const p of projects) {
  display.text(`• ${p.name} (${p.platform})`);
}
display.json(projects[0]);  // pełny pierwszy projekt na koniec
```

### 6. Auto-run jako dashboard

Włącz toggle `Auto` w nagłówku — blok uruchomi się przy każdym otwarciu pliku:

```js
// mode: 'auto'
const today = await http.get(`/api/users/${auth.currentUser}/tasks/today`);
return table(today.map(t => ({
  zadanie: t.name,
  projekt: t.projectName,
  termin: t.dueAt ? new Date(t.dueAt).toLocaleTimeString('pl-PL') : '—',
})));
```

### 7. Korzystanie z namespace'u pluginu

Każdy załadowany web-plugin może zarejestrować swój namespace przez
`api.scripts.register('moja_funkcja', fn)`. Funkcje stają się dostępne pod
ich nazwami (klucze `ns.method` rozwijane są w zagnieżdżony obiekt namespace):

```js
// Plugin "iot" zarejestrował "iot.deviceStatus"
const s = await iot.deviceStatus('lamp-1');
return md`Lampa: **${s.online ? 'włączona' : 'wyłączona'}**`;
```

Lista dostępnych namespace'ów zależy od pluginów wczytanych dla bieżącego
użytkownika.

## Persystencja w Markdownie

Blok zapisuje się jako code fence z prefiksem `pscript`:

````
```pscript:{blockId}:{mode}:{encodedLabel}
return md`Hello`;
```
````

- `blockId` — UUID, używany przez menu akcji blokowych po lewej stronie
- `mode` — `auto` lub `manual`
- `encodedLabel` — etykieta URL-enkodowana (żeby zniosła znaki specjalne)

Konwerter Markdown ↔ HTML (`markdownConverter.ts`) podmienia te fence'y na
`<div data-type="plugin-script-block">` w obie strony, więc edycja w
TipTapie i edycja jako tekst Markdown nie ścierają sobie nawzajem stanu.

Aby utworzyć blok ręcznie w pliku tekstowym, wklej:

````
```pscript:my-block-id:manual:My%20Script
return md`Hello`;
```
````

## Skróty klawiaturowe (w textareie)

| Skrót | Działanie |
|-------|-----------|
| `Ctrl+Enter` / `Cmd+Enter` | Uruchom |
| `Tab` | Wstaw 2 spacje (zamiast utraty focusa) |

Pozostałe skróty są propagowane "w górę" (`stopPropagation` tylko gdy
przejmujemy klucz) — Ctrl+S nadal zapisuje plik, slash command nadal działa
poza blokiem.

## Edytor Monaco (pełnoekranowy)

Przycisk ⛶ w nagłówku otwiera blok w pełnoekranowym Monaco z:

- automatic layout, scroll beyond last line off
- word wrap
- minimap
- `vs-dark` theme
- `Anuluj` / `Save` (zapis dopiero po `Save` — `Anuluj` odrzuca zmiany)

Wbudowane typy nie obejmują jeszcze kontekstu skryptu (TODO), ale syntax
highlighting i parser JS działają.

## Pluginy webowe — kontrybucja szablonów

Plugin webowy może dodać własne szablony, które pojawią się jako pozycje
`Plugin Script: {label}` w menu `/`. Robi się to w `activate()`:

```ts
// src/index.tsx pluginu
import type { PluginScriptTemplate } from '@mhersztowski/web-client';
import { templates } from './templates';

export function activate(api: IWebPluginAPI) {
  // Możesz zarejestrować funkcje do użycia w skryptach
  api.scripts.register('iot.deviceStatus', async (deviceName: string) => {
    return await api.http.get(`/api/users/${api.auth.currentUser}/devices/${deviceName}/status`);
  });

  // I/lub przykładowe snippet'y
  for (const t of templates) {
    api.scripts.registerTemplate(t);
  }
}
```

Gdzie `templates.ts`:

```ts
import type { PluginScriptTemplate } from '@mhersztowski/web-client';

export const templates: PluginScriptTemplate[] = [
  {
    id: 'iot-online-list',
    label: 'Online devices',
    description: 'Tabela wszystkich urządzeń online',
    mode: 'auto',
    code: `
const devs = await http.get(\`/api/users/\${auth.currentUser}/devices\`);
return table(devs.filter(d => d.online).map(d => ({
  name: d.name, last: new Date(d.lastSeen).toLocaleTimeString(),
})));
    `.trim(),
  },
];
```

W `/` w edytorze pojawi się wtedy pozycja **Plugin Script: Online devices**
z opisem `MyPlugin — Tabela wszystkich urządzeń online`.

Wybór wstawia blok z `template.code` i `template.mode` ustawionym
zgodnie z definicją.

## Bezpieczeństwo

- Skrypt działa **w tym samym kontekście co strona** — żadnego sandboxu.
  Ma pełen dostęp do JWT użytkownika, jego API i `localStorage`.
- Otwieraj **tylko zaufane pliki Markdown** — blok auto-run uruchomi się
  bez interakcji.
- Pliki współdzielone (`/viewer/md/...`) renderują skrypty w trybie
  read-only, ale **wciąż je wykonują** (np. dla widgetów na żywo). Nie
  udostępniaj plików z kodem od nieznajomych.

## Najczęstsze problemy

**„Blok auto nie uruchamia się przy pierwszym otwarciu"** — to celowy fix
race condition: jeśli skrypt używa namespace'u pluginu, czeka aż pluginy
się załadują (`pluginsVersion`). Sprawdź konsolę — gdy pluginy są wczytane,
blok auto-uruchomi się powtórnie.

**„`http.get` zwraca 401"** — wygasł token. Przeładuj stronę / zaloguj się
ponownie. `auth.token` to żywy JWT, ale token może wygasnąć (TTL 7 dni).

**„Mój `return` pokazuje JSON dump zamiast tabeli"** — `OutputRenderer`
sprawdza instanceof — musisz użyć `table(...)` albo `md\`...\``,
samo zwrócenie array nie wystarczy.

**„`reactive` nie aktualizuje widoku"** — sprawdź czy `subscribe` faktycznie
wywołuje `callback` z nową wartością. Pamiętaj o zwróceniu cleanup function.

**„`Tab` w textareie wybija mnie z bloku zamiast wstawić wcięcie"** — to
działa tylko gdy textarea ma focus. Kliknij wewnątrz kodu najpierw.

---

# Automate Script — drugi blok skryptowy w edytorze MD

Obok Plugin Script edytor Markdown ma **drugi rodzaj** wykonywalnego bloku:
**Automate Script** (zielona karta z ikoną 🤖). Te dwa bloki różnią się tylko
runtimem; UI (header, ▶, ⛶, dokumentacja) jest identyczne.

| | Plugin Script | Automate Script |
|---|---|---|
| Insert przez `/` | "Plugin Script" | "Automate Script" |
| API | `auth`, `http`, `md`, `table`, `reactive`, `display` + plugin namespace'y | `api`, `input`, `variables`, `display` |
| Runtime | `script-runtime/ScriptRuntime.ts` (top-level await) | `AutomateSandbox.execute` (async IIFE) |
| Persystencja w markdownie | ` ```pscript:blockId:mode:label ` | ` ```automate:blockId:autorun:html ` |

Plugin Script jest bliżej **frontendu** — bezpośrednie API HTTP do backendu,
ReactMarkdown/MUI rendering, namespace'y z webowych pluginów.

Automate Script jest bliżej **systemu** — pełny `api.*` z dostępem do plików,
danych (osoby/zadania/projekty), zmiennych flow, AI, mowy, powiadomień.
Idealne do skryptów typu "zrób backup", "wyślij raport", "przeskanuj paragon".

Pełna dokumentacja Automate API: [`automate.md`](./automate.md). Poniżej
**najpotężniejszy** i najczęściej używany podsystem — operacje na plikach.

## `api.file` — operacje na plikach

Wszystkie ścieżki są **relatywne do root directory** systemu i obowiązują
dla użytkownika z aktywnej sesji MQTT.

### Read / write

```js
// Odczyt pliku tekstowego
const content = await api.file.read('data/persons.json');

// Zapis (tworzy parent dirs jeśli trzeba)
await api.file.write('data/output.json', JSON.stringify({ result: 'ok' }));
```

### Listing

```js
// Same nazwy (mieszanka plików i katalogów)
const names = await api.file.list('data/');
// → ['persons.json', 'tasks.json', 'subdir', ...]

// Z informacją o typie
const entries = await api.file.listDetailed('data/');
for (const e of entries) {
  api.log.info(`${e.isDirectory ? '📁' : '📄'} ${e.name}`);
}
// FileEntry: { name, path, isFile, isDirectory }

// Rekurencyjny walk po drzewie — callback dla każdego pliku i katalogu
await api.file.walk('data/', (entry) => {
  if (entry.isFile && entry.name.endsWith('.json')) {
    api.log.info(`JSON: ${entry.path}`);
  }
});

// Glob (`*` = w obrębie segmentu, `**` = przez segmenty)
const jsons   = await api.file.glob('data/', '**/*.json');
const reports = await api.file.glob('data/reports/', 'report-*.csv');
```

### Info / metadata

```js
// Pełne metadane
const s = await api.file.stat('data/cache.json');
// FileStat: { path, name, size, modified: Date, isFile, isDirectory }
api.log.info(`${s.name}: ${s.size} B, zmieniono ${s.modified.toISOString()}`);

// Czy istnieje (nie rzuca, zwraca boolean)
if (!(await api.file.exists('data/cache.json'))) {
  await api.file.write('data/cache.json', '{}');
}

await api.file.isFile('data/x.txt');       // true/false
await api.file.isDirectory('data/sub');    // true/false

// Skróty do stat
const bytes = await api.file.size('data/log.txt');
const when  = await api.file.modified('data/log.txt');
```

### Manipulation — delete / copy / rename / move

```js
// Usuń plik (dla katalogu użyj rmdir)
await api.file.delete('data/old.json');

// Skopiuj
await api.file.copy('data/template.json', 'data/instance-1.json');

// Zmień nazwę / przenieś. Pod spodem to copy + delete — NIE atomic.
// Worst-case: copy OK + delete FAIL → dwa pliki zamiast utraty.
await api.file.rename('data/draft.md', 'data/published.md');
await api.file.move('data/x.txt', 'archive/x.txt');   // alias do rename
```

### Katalogi — mkdir / rmdir

```js
// Utwórz katalog (i rodzicielskie). Idempotent.
// Wewnątrz wstawia ukryty `.keep` żeby pusty dir był widoczny w `list`.
await api.file.mkdir('data/2026/06/07');

// Usuń katalog (domyślnie tylko pusty)
await api.file.rmdir('data/empty-folder');

// Rekurencyjnie (jak rm -rf)
await api.file.rmdir('data/old-backups', true);
```

### Pełna sygnatura

```ts
// Read / write
read(path)                                   → string
write(path, content)                         → void

// Listing
list(path)                                   → string[]
listDetailed(path)                           → FileEntry[]
walk(path, callback(entry))                  → void
glob(rootPath, pattern)                      → string[]

// Info
stat(path)                                   → FileStat (throws)
exists(path)                                 → boolean (safe)
isFile(path)                                 → boolean
isDirectory(path)                            → boolean
size(path)                                   → number
modified(path)                               → Date

// Manipulation
delete(path)                                 → void
copy(from, to)                               → void
rename(from, to)                             → void   // copy + delete
move(from, to)                               → void   // alias do rename

// Directories
mkdir(path)                                  → void   // idempotent
rmdir(path, recursive?)                      → void

// Typy
interface FileStat {
  path: string;
  name: string;
  size: number;        // 0 dla katalogu
  modified: Date;
  isFile: boolean;
  isDirectory: boolean;
}
interface FileEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
}
```

### Wzorce użycia

**Przyrostowy backup** — co N minut zrzucaj snapshot:

```js
const now = api.utils.dayjs().format('YYYY-MM-DDTHH-mm');
const dir = `data/backups/${now.slice(0, 10)}`;
await api.file.mkdir(dir);
const data = api.data.getTasks();
await api.file.write(`${dir}/tasks-${now}.json`, JSON.stringify(data, null, 2));
api.notify(`Backup: ${data.length} zadań`, 'success');
```

**Rotacja starych plików** — usuń wszystko starsze niż 30 dni:

```js
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
let removed = 0;
const files = await api.file.glob('data/logs/', '**/*.log');
for (const path of files) {
  const m = await api.file.modified(path);
  if (m.getTime() < cutoff) {
    await api.file.delete(path);
    removed++;
  }
}
api.log.info(`Usunięto ${removed} starych logów`);
```

**Drzewo statystyk** — rozmiar i liczba plików per katalog:

```js
const stats = new Map();
await api.file.walk('data/', async (e) => {
  if (!e.isFile) return;
  const dir = e.path.split('/').slice(0, -1).join('/') || '/';
  const cur = stats.get(dir) ?? { files: 0, bytes: 0 };
  cur.files++;
  cur.bytes += await api.file.size(e.path);
  stats.set(dir, cur);
});
for (const [dir, s] of stats) {
  api.log.info(`${dir}: ${s.files} plików, ${(s.bytes/1024).toFixed(1)} KB`);
}
```

### Gotowe przykłady

`drive/mdscript/file-ops/` — pliki do wstawienia przez 📎 picker:

| Plik | Co pokazuje |
|------|-------------|
| `01-info.js` | `stat`, `exists`, `isFile`/`isDirectory`, `size`, `modified` |
| `02-listing.js` | `list` vs `listDetailed` vs `walk` vs `glob` |
| `03-manipulation.js` | `copy`, `rename`, `move`, `delete` z prostym workflow |
| `04-directories.js` | `mkdir`, `rmdir` (pusty + recursive) |
| `05-backup-rotator.js` | rzeczywisty use case: rotuje stare backupy w katalogu data/ |

## `api.scripts` — orkiestracja skryptów osadzonych w drive

`api.scripts.*` pozwala znajdować i uruchamiać **inne** skrypty automatyzacji
osadzone w plikach `.md` w drive użytkownika — adresowane przez **tagi**
(ustawiane w Ustawieniach skryptu → "Tagi skryptu"). Trzy warianty
scope'u skanowania, w zależności od położenia bieżącego pliku `.md`:

| Scope | Metody | Co skanuje |
|-------|--------|------------|
| Pełny drive | `findByTag` / `runByTag` | Cały `data/` (lub `options.root`) — rekursywnie |
| Katalogi **nadrzędne** | `findInParentsByTag` / `runInParentsByTag` | Tylko katalogi-przodkowie hosta (idąc od bieżącego w górę aż do `root`); per-katalog **non-recursive** |
| Katalog **podrzędny** | `findInChildsByTag` / `runInChildsByTag` | Katalog hostujący skrypt + jego podkatalogi (rekursywnie) |

We wszystkich trzech wariantach **plik hostujący** skrypt wywołujący jest
automatycznie wykluczony — żeby self-tag nie wywołał nieskończonej
rekurencji. Match po tagu jest **case-sensitive, exact**.

### Jak działa skanowanie

- `findByTag` / `runByTag` używają `api.file.walk(root)` rekursywnie.
- `findInParentsByTag` / `runInParentsByTag` wspinają się po ścieżce
  hosta: dla pliku `data/projects/A/notes/today.md` widzą kolejno
  `data/projects/A/notes/`, `data/projects/A/`, `data/projects/`, `data/`.
  W każdym katalogu listują pliki bezpośrednio w nim, bez schodzenia
  w głąb sąsiednich gałęzi.
- `findInChildsByTag` / `runInChildsByTag` używają `walk` startując od
  katalogu hosta — czyli widzą bieżący katalog i wszystko niżej.

`runInParentsByTag` / `runInChildsByTag` wymagają, żeby host editor
przekazał ścieżkę bieżącego pliku — MdEditor to robi. Wywołanie spoza
MdEditora (flow designer itp.) rzuci błąd; w takich miejscach używaj
`runByTag` z explicit `options.root`.

### Wyszukiwanie (read-only)

```ts
findByTag(tag, options?: { root?: string }): Promise<DiscoveredScript[]>;
findInParentsByTag(tag, options?: { root?: string }): Promise<DiscoveredScript[]>;
findInChildsByTag(tag): Promise<DiscoveredScript[]>;
```

Każdy zwrócony `DiscoveredScript` zawiera:

| Pole | Typ | Opis |
|------|-----|------|
| `path` | `string` | Ścieżka VFS do pliku `.md` |
| `blockId` | `string` | TipTap block id (może być pusty) |
| `code` | `string` | Treść skryptu — dokładnie taka jak w fence |
| `tags` | `string[]` | Pełna lista tagów bloku |
| `autorun` | `boolean` | Czy blok ma włączony autorun (informacyjnie) |
| `viewMode` | `'code' \| 'html'` | Zapamiętany widok |
| `windowHeight` | `number \| null` | Zapamiętana wysokość (null = auto) |

Przykład — sprawdź co byłoby uruchomione, nim odpalisz batch:

````markdown
```automate:abc:t=ops
const candidates = await api.scripts.findByTag('daily');
display.table(candidates.map(s => ({
  plik:  s.path.replace(/^.*\//, ''),
  bytes: s.code.length,
  tagi:  s.tags.join(', '),
  auto:  s.autorun ? '✓' : '',
})));
```
````

### Uruchamianie

```ts
runByTag(tag, options?: { root?: string; stopOnError?: boolean }): Promise<ScriptRunResult[]>;
runInParentsByTag(tag, options?: { root?: string; stopOnError?: boolean }): Promise<ScriptRunResult[]>;
runInChildsByTag(tag, options?: { stopOnError?: boolean }): Promise<ScriptRunResult[]>;
```

Wszystkie trzy mają **identyczne** semantyki wykonania (sekwencyjnie, wspólny
`api`, `display.*` no-op w dzieciach, fail-fast przez `stopOnError`) —
różnią się tylko scope'em wyszukiwania (patrz tabelka wyżej).

Każdy znaleziony skrypt jest uruchamiany **sekwencyjnie** w świeżej
`AsyncFunction` z **tym samym** obiektem `api` co skrypt wywołujący —
zapisy do filesystemu, zmiennych i powiadomień są wspólne. `display.*` w
skryptach-dzieciach jest stubowane na no-op (batch nie ma surface UI).

Zwraca tablicę wyników, jeden wpis per skrypt, w kolejności wykonania:

| Pole | Typ | Opis |
|------|-----|------|
| `path`, `blockId`, `tags` | jak wyżej | |
| `ok` | `boolean` | True gdy skrypt nie rzucił wyjątku |
| `result` | `unknown` | Wartość zwrócona przez skrypt (gdy `ok`) |
| `error` | `string` | Treść błędu (gdy `!ok`) |
| `durationMs` | `number` | Czas wykonania (zaokrąglony do ms) |

`stopOnError: true` przerywa batch na pierwszym błędzie zamiast lecieć
dalej.

#### Pełny przykład — daily runner

Plik `data/Calendar/2026/06/07.md`:

````markdown
```automate:morning:t=daily
// Sprzątanie cache'u
await api.file.rmdir('data/cache', true);
api.notify('Cache wyczyszczony', 'info');
```
````

Plik `data/Reports/weekly-stats.md`:

````markdown
```automate:stats:t=daily
const tasks = api.data.getTasks();
const open = tasks.filter(t => !t.completed);
await api.file.write(
  `data/Reports/snapshot-${Date.now()}.json`,
  JSON.stringify({ open: open.length, at: new Date().toISOString() }, null, 2),
);
```
````

Plik `data/Inbox/today.md` (dispatcher):

````markdown
```automate:dispatcher
const results = await api.scripts.runByTag('daily');
const failed  = results.filter(r => !r.ok);
const ok      = results.filter(r => r.ok);

display.text(`Uruchomiono ${results.length} skryptów z tagiem "daily"`);
display.table(results.map(r => ({
  plik:    r.path.replace(/^.*\//, ''),
  status:  r.ok ? '✓' : '✗',
  ms:      r.durationMs,
  szczegoly: r.error ?? (typeof r.result === 'string' ? r.result : JSON.stringify(r.result)),
})));

if (failed.length) {
  api.notify(`Daily: ${failed.length}/${results.length} skryptów się wywaliło`, 'warning');
} else {
  api.notify(`Daily OK — ${ok.length} skryptów (${ok.reduce((s, r) => s + r.durationMs, 0)} ms total)`, 'success');
}
```
````

### Przykład — `InParents` (konfiguracja dziedziczona z góry)

Plik `data/Projects/A/config.md`:

````markdown
```automate:proj-a-cfg:t=config
api.variables.set('projectName', 'Project A');
api.variables.set('budget', 50000);
```
````

Plik `data/Projects/A/Q3/report.md`:

````markdown
```automate:report-runner
// Najpierw odpal wszystkie "config" w katalogach nadrzędnych — w tym
// data/Projects/A/config.md, data/Projects/config.md (jeśli istnieje), …
await api.scripts.runInParentsByTag('config');

const name   = api.variables.get('projectName');
const budget = api.variables.get('budget');
display.text(`Raport dla ${name} — budżet ${budget} zł`);
```
````

Bieżący skrypt-dispatcher mieszka w `data/Projects/A/Q3/report.md`. Walker
sprawdzi po kolei: `data/Projects/A/Q3/`, `data/Projects/A/`,
`data/Projects/`, `data/`. Pliki z innymi tagami lub bez tagu są pomijane.

### Przykład — `InChilds` (subtaski projektu)

Plik `data/Projects/A/index.md`:

````markdown
```automate:project-summary
const results = await api.scripts.runInChildsByTag('task');
const done   = results.filter(r => r.ok && r.result === 'done').length;
const todo   = results.filter(r => r.ok && r.result === 'todo').length;
display.text(`✓ ${done} ukończonych · ☐ ${todo} do zrobienia`);
```
````

Plik `data/Projects/A/Q3/feature-x.md` (i podobne pod całym A/):

````markdown
```automate:fx:t=task
return new Date() > new Date('2026-07-01') ? 'done' : 'todo';
```
````

Dispatcher z `data/Projects/A/index.md` widzi wszystkie pliki
pod `data/Projects/A/` (Q3/, ale i inne podkatalogi). Plik `index.md` sam
siebie nie obejmuje.

### Ważne uwagi

- **Tagi i tylko tagi** — nazwy plików, ścieżki, blockId nie są dopasowywane.
  Tag jest single source of truth dla "co należy do tej grupy".
- **Sekwencyjnie, nie równolegle** — gdyby skrypty pisały do tego samego pliku
  równolegle, last-write-wins zjadłoby dane. Sekwencja matchuje "klikam Run w
  każdym bloku po kolei".
- **Self-reference** — `find*` / `run*` automatycznie pomijają **plik
  hostujący** dispatcher. Inne skrypty w innych plikach z tym samym tagiem
  oczywiście wpadną do batcha — jeśli też wywołują `runByTag` rekurencja
  dalej możliwa. Dobra praktyka: dyspozytor i workery używają **różnych** tagów.
- **`InParents` / `InChilds` znają tylko `.md` z MdEditora** — wywołanie z
  flow designera rzuci `requires knowing the calling script's location`.
  Tam użyj `runByTag` z explicit `root`.
- **Brak `display.*` w dzieciach** — child skrypty nie mają UI, ale dalej mają
  `api.notify(...)`, `api.log.*`, dostęp do filesystem i danych. Wynik (zwrot
  z funkcji) wraca w `ScriptRunResult.result`.
- **Błędy odczytu per plik są tłumione** — uszkodzony plik `.md` nie
  zatrzymuje skanowania, jest po cichu pominięty.

## Powiązane

- `app/mycastle-web/src/components/mdeditor/extensions/PluginScriptExtension.tsx` — implementacja TipTap node + node view
- `app/mycastle-web/src/modules/script-runtime/` — runtime (`buildScriptContext`, `executeScript`, `OutputRenderer`)
- `app/mycastle-web/src/modules/web-plugins/` — system pluginów + `registerTemplate`
- `app/mycastle-web/src/components/mdeditor/utils/markdownConverter.ts` — escape/restore w Markdownie
- `app/mycastle-web/src/modules/automate/engine/AutomateSystemApi.ts` — implementacja `api.*` (Automate Script)
- [`automate.md`](./automate.md) — pełna dokumentacja Automate Script (`api.data`, `api.ai`, `api.speech`, …)
