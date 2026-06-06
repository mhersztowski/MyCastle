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

## Powiązane

- `app/mycastle-web/src/components/mdeditor/extensions/PluginScriptExtension.tsx` — implementacja TipTap node + node view
- `app/mycastle-web/src/modules/script-runtime/` — runtime (`buildScriptContext`, `executeScript`, `OutputRenderer`)
- `app/mycastle-web/src/modules/web-plugins/` — system pluginów + `registerTemplate`
- `app/mycastle-web/src/components/mdeditor/utils/markdownConverter.ts` — escape/restore w Markdownie
- [`automate.md`](./automate.md) — wykonywalne bloki w grafie Automate (różny runtime, ale podobne `display.*`)
