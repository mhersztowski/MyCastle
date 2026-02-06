# Automate - System API

## Przegląd

Moduł Automate udostępnia graficzny język programowania wzorowany na NodeRed. Skrypty JavaScript wykonywane w nodach typu `js_execute` mają dostęp do System API przez zmienną `api`.

## Zmienne dostępne w skryptach

| Zmienna | Opis |
|---------|------|
| `api` | System API - dostęp do plików, danych, zmiennych, logowania |
| `input` (`inp`) | Dane wejściowe — obiekt kontekstu z wynikiem poprzedniego noda |
| `variables` (`vars`) | Zmienne flow (bezpośredni dostęp do obiektu) |

> **Skróty:** Zamiast `input` i `variables` można używać krótszych aliasów `inp` i `vars`. Obie formy działają identycznie.

### Przepływ danych między nodami (`input` / `inp`)

`input` (alias `inp`) to obiekt kontekstu przekazywany z poprzedniego noda. Wynik poprzedniego noda jest dostępny w polu `_result`:

```javascript
// Odczytaj wynik poprzedniego noda
const prev = inp._result;
api.log.info(prev);
```

Prefiks `_` oznacza, że pole jest zarządzane wewnętrznie przez silnik — nie należy go nadpisywać ręcznie.

**Przykład przepływu:**

```
Start → JS "return 11" → JS "return inp._result * 2" → JS "api.log.info(inp._result)"
```

| Node | `inp` | `inp._result` | Wynik (`return`) |
|------|-------|---------------|------------------|
| JS 1 | `{}` | `undefined` | `11` |
| JS 2 | `{ _result: 11 }` | `11` | `22` |
| JS 3 | `{ _result: 22 }` | `22` | — |

Log wyświetli: `22`

**Częsty błąd:** `return inp` zwraca cały obiekt kontekstu (np. `{ _result: 11 }`), nie samą wartość. Następny node otrzyma wtedy `{ _result: { _result: 11 } }` — zagnieżdżony obiekt. Aby przekazać samą wartość, użyj `return inp._result`.

Dodatkowe pola w `input` (zależnie od typu noda):

| Pole | Kiedy dostępne | Opis |
|------|----------------|------|
| `inp._result` | Zawsze (po pierwszym nodzie) | Wynik poprzedniego noda |
| `inp.index` | Wewnątrz `for_loop` body | Aktualny indeks iteracji |
| `inp.iteration` | Wewnątrz `while_loop` body | Numer iteracji |
| `inp.item` | Wewnątrz `foreach` loop | Aktualny element tablicy |
| `inp.index` | Wewnątrz `foreach` loop | Indeks elementu (0, 1, 2...) |

## API Reference

### api.file

Operacje na plikach w filesystem.

```javascript
// Odczyt pliku
const content = await api.file.read('data/persons.json');

// Zapis pliku
await api.file.write('data/output.json', JSON.stringify({ result: 'ok' }));

// Lista plików w katalogu
const files = await api.file.list('data/');
// Zwraca: ['persons.json', 'tasks.json', ...]
```

### api.data

Dostęp do danych systemu (read-only).

```javascript
// Osoby
const persons = api.data.getPersons();
const person = api.data.getPersonById('person-id');

// Zadania
const tasks = api.data.getTasks();
const task = api.data.getTaskById('task-id');

// Projekty
const projects = api.data.getProjects();
const project = api.data.getProjectById('project-id');

// Listy zakupów
const shoppingLists = api.data.getShoppingLists();
const list = api.data.getShoppingListById('list-id');
```

### api.variables

Zarządzanie zmiennymi flow.

```javascript
// Odczyt zmiennej
const value = api.variables.get('counter');

// Zapis zmiennej
api.variables.set('counter', 42);

// Wszystkie zmienne
const allVars = api.variables.getAll();
```

### api.log

Logowanie wiadomości (widoczne w panelu execution log). Akceptuje string lub dowolny obiekt — obiekty są automatycznie konwertowane przez `JSON.stringify`.

```javascript
api.log.info('Przetwarzanie rozpoczęte');
api.log.warn('Brak danych wejściowych');
api.log.error('Nie udało się zapisać pliku');
api.log.debug('Zmienna counter = ' + variables.counter);

// Logowanie obiektów
api.log.info(inp._result);        // np. "42" lub '{"name":"Jan"}'
api.log.info({ a: 1, b: 'test' }); // '{"a":1,"b":"test"}'
```

### api.notify

Powiadomienia UI (Snackbar).

```javascript
api.notify('Operacja zakończona', 'success');
api.notify('Uwaga: brak danych', 'warning');
// severity: 'success' | 'info' | 'warning' | 'error'
```

### api.utils

Narzędzia pomocnicze.

```javascript
// Generowanie UUID
const id = api.utils.uuid();

// Operacje na datach (dayjs)
const now = api.utils.dayjs();
const formatted = api.utils.dayjs('2024-01-15').format('DD.MM.YYYY');

// Opóźnienie (ms)
await api.utils.sleep(1000);
```

### api.ai

Interakcja z modelami AI. Wymaga skonfigurowania providera w Settings > AI Settings.
Obsługuje: OpenAI, Anthropic (Claude), Ollama (local), Custom (OpenAI-compatible).

```javascript
// Prosty prompt - zwraca string
const answer = await api.ai.chat('Opisz w 2 zdaniach czym jest TypeScript');
api.log.info(answer);

// Z opcjami
const summary = await api.ai.chat('Podsumuj dane', {
  systemPrompt: 'Jesteś analitykiem danych',
  temperature: 0.3,
  maxTokens: 500,
  model: 'gpt-4o', // opcjonalnie nadpisz model
});

// Pełna konwersacja (tablica wiadomości)
const response = await api.ai.chatMessages([
  { role: 'system', content: 'Odpowiadaj krótko po polsku' },
  { role: 'user', content: 'Co to jest MQTT?' },
]);
api.log.info(`Model: ${response.model}`);
api.log.info(`Odpowiedź: ${response.content}`);
api.log.info(`Tokeny: ${response.usage?.totalTokens}`);

// Sprawdź czy AI jest skonfigurowane
if (!api.ai.isConfigured()) {
  api.log.error('Skonfiguruj AI w Settings > AI Settings');
}

// Analiza obrazu (vision) - wymaga modelu z obsługą obrazów (GPT-4o, Claude)
const imageBase64 = 'data:image/jpeg;base64,...'; // base64 data URL
const description = await api.ai.chatVision('Opisz co widzisz na tym obrazie', imageBase64);
api.log.info(description);

// Z opcjami
const analysis = await api.ai.chatVision('Przeanalizuj ten diagram', imageBase64, {
  systemPrompt: 'Jesteś ekspertem od analizy diagramów',
  temperature: 0.3,
  maxTokens: 1000,
});
```

### api.speech

Synteza i rozpoznawanie mowy. Wymaga skonfigurowania providera w Settings > Speech Settings.
Obsługuje: OpenAI TTS/Whisper, Browser Web Speech API.

```javascript
// Odczytaj tekst na głos (TTS)
await api.speech.say('Witaj, jak mogę pomóc?');

// Z opcjami
await api.speech.say('Hello world', {
  voice: 'nova',    // dla OpenAI: alloy, echo, fable, onyx, nova, shimmer
  speed: 1.2,       // 0.25 - 4.0
});

// Zatrzymaj mówienie
api.speech.stop();

// Sprawdź konfigurację
if (!api.speech.isTtsConfigured()) {
  api.log.error('Skonfiguruj TTS w Settings > Speech Settings');
}
if (!api.speech.isSttConfigured()) {
  api.log.error('Skonfiguruj STT w Settings > Speech Settings');
}
```

### api.shopping

Zarządzanie listami zakupów. Operacje zapisu (tworzenie, modyfikacja, usuwanie).

```javascript
// Utwórz nową listę zakupów
const list = await api.shopping.createList('Zakupy tygodniowe', {
  store: 'Biedronka',  // opcjonalnie
  budget: 200,          // opcjonalnie, w PLN
});
api.log.info(`Utworzono listę: ${list.id}`);

// Dodaj produkt do listy
const item = await api.shopping.addItem(list.id, 'Mleko', {
  quantity: 2,           // opcjonalnie
  unit: 'l',             // opcjonalnie: szt, kg, g, l, ml, opak
  category: 'nabiał',   // opcjonalnie: nabiał, pieczywo, mięso, warzywa, owoce, napoje, chemia, higiena, inne
  estimatedPrice: 8.00,  // opcjonalnie, w PLN
});

// Oznacz produkt jako kupiony
await api.shopping.checkItem(list.id, item.id);
// Z rzeczywistą ceną
await api.shopping.checkItem(list.id, item.id, 7.50);

// Odznacz produkt
await api.shopping.uncheckItem(list.id, item.id);

// Usuń produkt z listy
await api.shopping.removeItem(list.id, item.id);

// Zakończ zakupy (zmień status listy na completed)
await api.shopping.completeList(list.id);

// Skanowanie paragonu — używa wybranego silnika (Settings > Receipt Settings)
// Silniki: ai_vision (AI z obrazem), local_ocr (Tesseract.js na backendzie), hybrid (OCR + AI tekst)
const imageBase64 = 'data:image/jpeg;base64,...'; // base64 data URL zdjęcia paragonu
const receiptData = await api.shopping.scanReceipt(imageBase64);
// receiptData: { storeName, date, items: [{name, quantity, unit, price, originalPrice, discount, category}], total }
api.log.info(`Sklep: ${receiptData.storeName}, produktów: ${receiptData.items.length}`);

// Skanowanie długiego paragonu — wiele zdjęć (fragmenty tego samego paragonu)
const images = ['data:image/jpeg;base64,...', 'data:image/jpeg;base64,...'];
const receiptData2 = await api.shopping.scanReceipt(images);
api.log.info(`Produktów z wielu zdjęć: ${receiptData2.items.length}`);
```

## Runtime — środowisko wykonania

Flow może mieć ustawiony `runtime` określający gdzie jest wykonywany:

| Runtime | Opis |
|---------|------|
| `client` | Wykonywany w przeglądarce (dostęp do TTS, STT, Notification) |
| `backend` | Wykonywany na serwerze (bezpośredni dostęp do FileSystem, DataSource) |
| `universal` | Wykonywany na serwerze (jak backend, ale używa tylko uniwersalnych nodów) |

Flow z `runtime: 'backend'` lub `runtime: 'universal'` jest wysyłany do backendu przez MQTT. Flow z `runtime: 'client'` lub bez ustawionego runtime jest wykonywany lokalnie w przeglądarce.

## Typy nodów

| Typ noda | Kategoria | Runtime | Opis |
|----------|-----------|---------|------|
| Start | Triggery | universal | Punkt startowy flow |
| Manual Trigger | Triggery | universal | Ręczne uruchomienie |
| Webhook Trigger | Triggery | **backend** | Uruchomienie przez HTTP webhook |
| Schedule Trigger | Triggery | **backend** | Automatyczne uruchomienie wg harmonogramu (cron) |
| Execute JS | Akcje | universal | Wykonanie kodu JavaScript z dostępem do System API |
| System API | Akcje | universal | Wywołanie metody API systemu |
| If/Else | Logika | universal | Warunkowe rozgałęzienie (warunek to wyrażenie JS) |
| Switch | Logika | universal | Wielokierunkowe rozgałęzienie |
| For Loop | Logika | universal | Pętla iteracyjna (count, indexVariable) |
| While Loop | Logika | universal | Pętla warunkowa (condition, maxIterations) |
| Read Variable | Dane | universal | Odczytaj zmienną flow |
| Write Variable | Dane | universal | Zapisz zmienną flow |
| Log | Wyjście | universal | Loguj wiadomość do konsoli |
| Notification | Wyjście | **client** | Pokaż powiadomienie UI (niedostępny na backendzie) |
| LLM Call | AI | universal | Wywołaj model AI (prompt statyczny lub dynamiczny ze skryptu) |
| Text to Speech | AI | **client** | Odczytaj tekst na głos (niedostępny na backendzie) |
| Speech to Text | AI | **client** | Zamień mowę na tekst (niedostępny na backendzie) |
| Comment | Narzędzia | universal | Komentarz (nie wykonywany) |
| Call Flow | Logika | universal | Wywołaj inny flow jako subflow |
| Rate Limit | Logika | universal | Delay, throttle lub debounce |
| For Each | Logika | universal | Iteracja po tablicy/kolekcji |
| Merge | Logika | universal | Łączy wyniki z równoległych gałęzi |

Flow z `runtime: 'backend'` lub `'universal'` nie może zawierać nodów client-only (Notification, TTS, STT).

## Subflows — wywoływanie innych flow

Node `Call Flow` umożliwia wywoływanie innych flow jako subflows. Pozwala na:
- **Ponowne wykorzystanie logiki** - ten sam flow może być wywołany z wielu miejsc
- **Organizację złożonych automatyzacji** - rozbijanie dużych flow na mniejsze, czytelne części
- **Izolację zmiennych** - subflow ma własny scope zmiennych

### Konfiguracja

1. Dodaj node "Call Flow" do flow
2. W panelu właściwości wybierz flow do wywołania (nie można wybrać bieżącego flow)
3. Opcjonalnie wyłącz przekazywanie inputu

### Przepływ danych

```
Parent Flow                          Subflow
┌─────────────┐                     ┌─────────────┐
│ Execute JS  │──inp._result───────▶│ Start       │
│ return 42   │                     │             │
│             │                     │ (dostępne   │
│ Call Flow   │◀──vars (output)────│  jako vars._│
│             │                     │  parentInput│
└─────────────┘                     │             │
                                    │ ... nodes   │
                                    └─────────────┘
```

| Kierunek | Mechanizm |
|----------|-----------|
| Parent → Subflow | `vars._parentInput` = `inp._result` z parent flow |
| Subflow → Parent | `inp._result` = wszystkie zmienne subflow po zakończeniu |

### Przykład

**Subflow "Data Logger" (id: data-logger-flow):**
```
Start → Execute JS → Log
```

Skrypt:
```javascript
const data = vars._parentInput || {};
api.log.info(`Logging data: ${JSON.stringify(data)}`);
api.variables.set('logged', true);
api.variables.set('timestamp', Date.now());
return data;
```

**Parent Flow:**
```
Start → Execute JS → Call Flow (data-logger-flow) → Execute JS → Log
```

Pierwszy Execute JS:
```javascript
return { name: 'test', value: 42 };
```

Drugi Execute JS (po subflow):
```javascript
api.log.info(`Subflow logged: ${inp._result.logged}`);
api.log.info(`Timestamp: ${inp._result.timestamp}`);
```

### Zabezpieczenia

| Mechanizm | Limit | Opis |
|-----------|-------|------|
| Max głębokość | 10 poziomów | Zapobiega zbyt głębokim zagnieżdżeniom |
| Rekurencja bezpośrednia | Blokowana | Flow nie może wywoływać samego siebie |
| Rekurencja pośrednia | Wykrywana | A→B→A jest wykrywane i blokowane |

### Kompatybilność runtime

Subflow musi mieć kompatybilny runtime z parent flow:

| Parent Runtime | Dozwolony Subflow Runtime |
|----------------|---------------------------|
| `client` | `client`, `universal`, brak |
| `backend` | `backend`, `universal`, brak |
| `universal` | `backend`, `universal`, brak |

Subflow z nodami client-only (Notification, TTS, STT) nie może być wywołany z flow backendowego.

### Uwagi

- Subflow ma własny scope zmiennych - zmiany w `variables` subflow nie wpływają na parent
- Logi i notyfikacje z subflow są mergowane z parent flow
- Timeout subflow jest częścią timeout parent flow (nie kumuluje się)
- Błąd w subflow propaguje do parent (można obsłużyć przez Error port)

## Rate Limit — kontrola częstotliwości

Node `Rate Limit` pozwala kontrolować częstotliwość wykonywania flow. Typowe zastosowania w automatyzacjach domowych: "wykonaj, ale nie częściej niż raz na minutę".

### Tryby

| Tryb | Działanie | Port wyjściowy |
|------|-----------|----------------|
| **Delay** | Czeka określony czas przed kontynuacją | `Out` |
| **Throttle** | Przepuszcza max raz na X ms. Kolejne wywołania w oknie czasowym są blokowane | `Out` lub `Skipped` |
| **Debounce** | Czeka na "ciszę" - opóźnia wykonanie o X ms | `Out` |

### Konfiguracja

1. Dodaj node "Rate Limit" do flow
2. Wybierz tryb (Delay / Throttle / Debounce)
3. Ustaw czas w milisekundach

### Porty wyjściowe

- **Out** - wykonanie przeszło (delay zakończony, throttle przepuścił, debounce zakończony)
- **Skipped** - wykonanie zablokowane przez throttle (tylko w trybie throttle)

### Przykłady

**Delay - opóźnienie przed wykonaniem:**
```
Webhook → Rate Limit (delay, 5000ms) → Send Email
```
Webhook czeka 5 sekund przed wysłaniem emaila.

**Throttle - ograniczenie częstotliwości:**
```
Motion Sensor → Rate Limit (throttle, 60000ms) → Turn On Light
                        ↓ (skipped)
                   Log "Ignored"
```
Czujnik ruchu włącza światło max raz na minutę. Kolejne wykrycia są ignorowane.

**Debounce - poczekaj na stabilizację:**
```
Temperature Change → Rate Limit (debounce, 10000ms) → Adjust AC
```
Klimatyzacja dostosowuje się dopiero gdy temperatura ustabilizuje się na 10 sekund.

### Stan throttle

Stan throttle (ostatni czas wykonania) jest przechowywany globalnie per node ID. Oznacza to, że:
- Stan przetrwa między kolejnymi uruchomieniami flow
- Stan resetuje się przy restarcie serwera/przeglądarki
- Każdy node ma osobny licznik

## For Each — iteracja po kolekcji

Node `For Each` umożliwia iterację po tablicy/kolekcji. W przeciwieństwie do `For Loop` (który iteruje po zakresie liczb), `For Each` przetwarza każdy element tablicy indywidualnie — analogicznie do `forEach` w JavaScript lub "Split in Batches" w n8n.

### Konfiguracja

1. Dodaj node "For Each" do flow
2. Skonfiguruj:
   - **Źródło** - wyrażenie JS zwracające tablicę (domyślnie `inp._result`)
   - **Zmienna elementu** - nazwa zmiennej dla aktualnego elementu (domyślnie `item`)
   - **Zmienna indeksu** - nazwa zmiennej dla indeksu (domyślnie `index`)

### Porty wyjściowe

- **Loop** - wykonywany dla każdego elementu tablicy
- **Done** - wykonywany po zakończeniu wszystkich iteracji

### Dane dostępne w iteracji

W każdej iteracji (port Loop) dostępne są:

| Zmienna | Opis |
|---------|------|
| `inp._result` | Aktualny element tablicy |
| `vars.item` | Aktualny element (lub nazwa z konfiguracji) |
| `vars.index` | Indeks elementu (0, 1, 2...) |

### Przykłady

#### Iteracja po taskach

```
Start → Execute JS → For Each → [Loop] Execute JS → Log
                             → [Done] Notification
```

Pierwszy Execute JS:
```javascript
const tasks = api.data.getTasks();
return tasks.filter(t => !t.done); // zwróć tablicę tasków
```

Drugi Execute JS (w pętli):
```javascript
api.log.info(`Processing task: ${vars.item.name} (index ${vars.index})`);
// inp._result to też aktualny task
return vars.item.name;
```

#### Przetwarzanie API response

```
Webhook → For Each → [Loop] Execute JS
                   → [Done] Log
```

Konfiguracja For Each:
- Źródło: `inp._result.payload.items`
- Zmienna elementu: `item`

Execute JS:
```javascript
const item = vars.item;
api.log.info(`Item: ${item.name}, price: ${item.price}`);
await api.file.write(`data/items/${item.id}.json`, JSON.stringify(item));
```

#### Wysyłanie powiadomień do listy osób

```
Start → Execute JS → For Each → [Loop] LLM Call → Log
                             → [Done] Notification
```

Execute JS:
```javascript
const persons = api.data.getPersons();
return persons.filter(p => p.tags?.includes('vip'));
```

LLM Call (useScript):
```javascript
const person = vars.item;
return `Napisz krótkie powitanie dla ${person.name} (${person.email})`;
```

### Różnice: For Loop vs For Each

| Cecha | For Loop | For Each |
|-------|----------|----------|
| Źródło | Liczba iteracji (`count`) | Tablica (`sourceExpression`) |
| Dostępne dane | `vars.i` (indeks) | `vars.item`, `vars.index`, `inp._result` |
| Użycie | Powtórz X razy | Dla każdego elementu zrób Y |

### Zagnieżdżanie

For Each może być zagnieżdżany. Wewnętrzna pętla ma dostęp tylko do swojego scope — użyj zmiennych aby przekazać dane z zewnętrznej pętli:

```javascript
// Zewnętrzna pętla (For Each z projects)
api.variables.set('currentProject', vars.item);

// Wewnętrzna pętla (For Each z tasks)
const project = vars.currentProject; // z zewnętrznej pętli
const task = vars.item;              // z wewnętrznej pętli
```

## Merge — łączenie równoległych gałęzi

Node `Merge` umożliwia łączenie wyników z kilku równoległych gałęzi flow w jedną. Pozwala na równoległe przetwarzanie i synchronizację wyników.

### Jak działa

1. Flow rozgałęzia się na kilka równoległych ścieżek
2. Każda ścieżka kończy się połączeniem do innego portu wejściowego noda Merge
3. Merge czeka aż wszystkie podłączone porty otrzymają dane
4. Po zebraniu wszystkich wyników, agreguje je i kontynuuje wykonanie

### Diagram

```
         ┌─────────┐
         │  Start  │
         └────┬────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
┌─────────┐       ┌─────────┐
│ JS Exec │       │ JS Exec │
│ (task1) │       │ (task2) │
└────┬────┘       └────┬────┘
     │   in_1    in_2  │
     └────►┌─────┐◄────┘
           │Merge│
           └──┬──┘
              │ out
              ▼
         ┌─────────┐
         │   Log   │
         └─────────┘
```

### Konfiguracja

1. Dodaj node "Merge" do flow
2. Skonfiguruj:
   - **Tryb agregacji** - `object` (obiekt z kluczami portId) lub `array` (tablica wartości)
3. Opcjonalnie dodaj więcej portów wejściowych (przycisk "+ Dodaj port")

### Porty

- **Wejściowe** (domyślnie 2, można dodawać więcej):
  - `in_1`, `in_2`, `in_3`, ... — porty do podłączenia równoległych gałęzi
- **Wyjściowe**:
  - `out` — zagregowany wynik

### Wynik agregacji

**Tryb object** (domyślny):
```json
{
  "in_1": "wynik z pierwszej gałęzi",
  "in_2": { "data": "wynik z drugiej gałęzi" },
  "in_3": 42
}
```

**Tryb array**:
```json
["wynik z pierwszej gałęzi", { "data": "wynik z drugiej gałęzi" }, 42]
```

### Przykłady

#### Równoległe pobieranie danych

```
Start → [rozgałęzienie] → Execute JS (pobierz osoby) ──► Merge (in_1)
                        → Execute JS (pobierz taski)  ──► Merge (in_2)
                        → Execute JS (pobierz projekty)──► Merge (in_3)
                                                               │
                                                          Execute JS
                                                          (przetwórz wszystko)
```

Skrypt po Merge:
```javascript
const results = inp._result;
api.log.info(`Osoby: ${results.in_1.length}`);
api.log.info(`Taski: ${results.in_2.length}`);
api.log.info(`Projekty: ${results.in_3.length}`);

// Lub jeśli tryb 'array':
// const [persons, tasks, projects] = inp._result;
```

#### Równoległe zapytania AI

```
Start → Execute JS (przygotuj dane) → [rozgałęzienie] → LLM Call (analiza) ──► Merge
                                                       → LLM Call (summary) ──► Merge
                                                                                   │
                                                                              Execute JS
                                                                              (połącz odpowiedzi)
```

Skrypt końcowy:
```javascript
const { in_1: analysis, in_2: summary } = inp._result;
api.log.info(`Analiza: ${analysis}`);
api.log.info(`Podsumowanie: ${summary}`);
return { analysis, summary };
```

### Uwagi

- Merge czeka tylko na **podłączone** porty — niepodłączone porty są ignorowane
- Jeśli jedna gałąź nie dotrze (np. przez błąd), Merge będzie czekać w nieskończoność
- Użyj Error port na nodach przed Merge, aby obsłużyć błędy
- Minimum 2 porty wejściowe (nie można usunąć poniżej tego limitu)
- Stan Merge resetuje się po każdym pomyślnym wykonaniu

### Różnice: Merge vs inne nody

| Cecha | Merge | For Each | Switch |
|-------|-------|----------|--------|
| Kierunek | Zbiera (N→1) | Rozprasza (1→N) | Rozgałęzia (1→1 z N) |
| Porty | Wiele wejść | 1 wejście, 2 wyjścia | 1 wejście, wiele wyjść |
| Użycie | Synchronizacja | Iteracja | Warunek |

## Error Handling — obsługa błędów

Nody mogą mieć opcjonalny port `Error`, który pozwala na przechwytywanie błędów zamiast przerywania całego flow. Analogicznie do Node-RED (catch node) i n8n (error branch).

### Włączanie portu Error

1. Wybierz node w designerze
2. W panelu właściwości włącz toggle "Włącz port błędu"
3. Port Error pojawi się na nodzie z czerwonym oznaczeniem
4. Połącz port Error z następnym nodem

Nody które mogą mieć port Error: js_execute, system_api, if_else, switch, for_loop, while_loop, read_variable, write_variable, log, notification, llm_call, tts, stt.

Nody bez możliwości error port: start, manual_trigger, comment.

### Dane błędu

Przez port Error przekazywane są dane w formacie `AutomateErrorData`:

| Pole | Typ | Opis |
|------|-----|------|
| `message` | string | Treść błędu |
| `stack` | string? | Stack trace (jeśli dostępny) |
| `nodeId` | string | ID noda który rzucił błąd |
| `nodeName` | string | Nazwa noda |
| `nodeType` | string | Typ noda |
| `timestamp` | number | Czas błędu (ms) |
| `input` | unknown | Dane wejściowe noda |

Dane są dostępne w następnym nodzie jako `inp._result` i `inp._error`.

### Przykład

```
Start → js_execute (enableErrorPort) → [Out] Log ("Sukces")
                                      → [Error] Log ("Błąd: " + inp._error.message)
```

Skrypt w js_execute:
```javascript
if (Math.random() > 0.5) {
  throw new Error('Losowy błąd');
}
return 'OK';
```

Jeśli błąd zostanie rzucony, flow kontynuuje przez port Error zamiast przerywać wykonanie.

### Zachowanie domyślne

- Jeśli port Error **jest połączony**: błąd zostaje obsłużony, flow kontynuuje przez port Error
- Jeśli port Error **nie jest połączony** (nawet jeśli włączony): błąd propaguje normalnie i przerywa flow

### Błędy w pętlach

Błąd wewnątrz pętli (for_loop/while_loop) przerywa całą pętlę i przechodzi przez port Error pętli (jeśli włączony i połączony).

## Webhook Trigger — wyzwalanie przez HTTP

Node `Webhook Trigger` umożliwia uruchamianie flow przez zewnętrzne requesty HTTP. Działa wyłącznie na backendzie (`runtime: 'backend'`).

### Konfiguracja

1. Dodaj node "Webhook Trigger" do flow
2. W panelu właściwości zobaczysz:
   - **URL Webhooka** - gotowy URL do kopiowania
   - **Secret Token** - opcjonalny token uwierzytelniający (przycisk generowania)
   - **Dozwolone metody HTTP** - POST, GET, PUT, DELETE

### Format URL

```
POST http://localhost:3001/webhook/{flowId}/{nodeId}?token={secret}
```

Token może być przekazany jako:
- Query parameter: `?token=secret123`
- Header: `X-Webhook-Token: secret123`

### Dane dostępne w flow

Webhook przekazuje dane jako wynik (`inp._result`) w formacie:

| Pole | Opis |
|------|------|
| `inp._result.payload` | Body requestu (JSON lub string) |
| `inp._result.method` | Metoda HTTP (POST, GET, PUT, DELETE) |
| `inp._result.headers` | Nagłówki requestu (obiekt) |
| `inp._result.query` | Query string parametry (obiekt bez token) |

Aliasy bezpośrednie:
- `inp._webhookPayload` - body
- `inp._webhookMethod` - metoda
- `inp._webhookHeaders` - nagłówki
- `inp._webhookQuery` - query params

### Przykład użycia

```
Webhook Trigger → Execute JS → Log
```

Skrypt w Execute JS:
```javascript
const data = inp._result;
api.log.info(`Webhook ${data.method} z payloadem:`);
api.log.info(data.payload);

// Przykład: obsługa GitHub webhook
if (data.payload?.action === 'opened' && data.payload?.pull_request) {
  api.log.info(`Nowy PR: ${data.payload.pull_request.title}`);
}
return data.payload;
```

### Testowanie z curl

```bash
# Prosty POST
curl -X POST "http://localhost:3001/webhook/{flowId}/{nodeId}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from webhook"}'

# Z tokenem uwierzytelniającym
curl -X POST "http://localhost:3001/webhook/{flowId}/{nodeId}?token=secret123" \
  -H "Content-Type: application/json" \
  -d '{"action": "test"}'

# Przez header
curl -X POST "http://localhost:3001/webhook/{flowId}/{nodeId}" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: secret123" \
  -d '{"action": "test"}'
```

### Odpowiedź

Endpoint zwraca JSON z wynikiem wykonania flow:

```json
{
  "success": true,
  "flowId": "xxx",
  "nodeId": "yyy",
  "executionTime": 234,
  "result": {
    "success": true,
    "executionLog": [...],
    "logs": [...],
    "variables": {...}
  },
  "error": null
}
```

### Kody błędów

| Kod | Opis |
|-----|------|
| 400 | Nieprawidłowy URL (brak flowId/nodeId) |
| 401 | Nieprawidłowy lub brakujący token |
| 404 | Flow lub node nie znaleziony |
| 405 | Metoda HTTP niedozwolona |
| 413 | Request body za duży (max 5MB) |
| 500 | Błąd wykonania flow |
| 503 | Automate service niedostępny |

### Integracje zewnętrzne

Webhook Trigger idealnie nadaje się do integracji z:
- **GitHub** - webhooks dla push, PR, issues
- **IFTTT** - automatyzacje If This Then That
- **Zapier** - połączenie z 5000+ aplikacji
- **Slack** - slash commands, event subscriptions
- **Własne systemy** - dowolne HTTP requesty

## Schedule Trigger — wyzwalanie czasowe (cron)

Node `Schedule Trigger` umożliwia automatyczne uruchamianie flow według harmonogramu czasowego (cron). Działa wyłącznie na backendzie (`runtime: 'backend'`).

### Konfiguracja

1. Dodaj node "Schedule Trigger" do flow
2. W panelu właściwości skonfiguruj:
   - **Harmonogram aktywny** - włącz/wyłącz harmonogram
   - **Częstotliwość** - preset lub własny cron
   - **Strefa czasowa** - timezone (domyślnie UTC)

### Presety częstotliwości

| Preset | Cron Expression | Opis |
|--------|----------------|------|
| Co minutę | `* * * * *` | Wykonaj co minutę |
| Co 5 minut | `*/5 * * * *` | Wykonaj co 5 minut |
| Co 15 minut | `*/15 * * * *` | Wykonaj co 15 minut |
| Co godzinę | `0 * * * *` | Wykonaj na początku każdej godziny |
| Codziennie o 8:00 | `0 8 * * *` | Wykonaj codziennie o 8:00 |
| Codziennie o północy | `0 0 * * *` | Wykonaj codziennie o 00:00 |
| Co poniedziałek o 9:00 | `0 9 * * 1` | Wykonaj w każdy poniedziałek o 9:00 |
| Pierwszy dzień miesiąca | `0 0 1 * *` | Wykonaj 1-go dnia każdego miesiąca o 00:00 |

### Format cron expression

```
┌───────────── minuta (0-59)
│ ┌───────────── godzina (0-23)
│ │ ┌───────────── dzień miesiąca (1-31)
│ │ │ ┌───────────── miesiąc (1-12)
│ │ │ │ ┌───────────── dzień tygodnia (0-6, 0=niedziela)
│ │ │ │ │
* * * * *
```

Specjalne znaki:
- `*` - każda wartość
- `*/n` - co n wartości (np. `*/5` = co 5)
- `n-m` - zakres (np. `9-17` = godziny 9-17)
- `n,m` - konkretne wartości (np. `1,15` = 1-go i 15-go)

### Strefy czasowe

Domyślnie UTC. Obsługiwane formaty:
- `UTC` - czas uniwersalny
- `Europe/Warsaw` - polska strefa czasowa
- `America/New_York` - wschodni czas USA
- `Asia/Tokyo` - Tokio

### Dane dostępne w flow

Schedule Trigger przekazuje dane jako wynik (`inp._result`) w formacie:

| Pole | Opis |
|------|------|
| `inp._result.scheduledTime` | Timestamp uruchomienia (ms) |
| `inp._result.cronExpression` | Wyrażenie cron |
| `inp._result.timezone` | Strefa czasowa |
| `inp._result.scheduleNodeId` | ID noda schedule_trigger |

Aliasy bezpośrednie:
- `inp._scheduledTime` - timestamp
- `inp._cronExpression` - wyrażenie cron
- `inp._timezone` - strefa czasowa
- `inp._scheduleNodeId` - ID noda

### Przykłady użycia

#### Codzienny raport o 8:00

```
Schedule Trigger (0 8 * * *) → Execute JS → Notification
```

Skrypt w Execute JS:
```javascript
const tasks = api.data.getTasks();
const overdue = tasks.filter(t => !t.done && new Date(t.dueDate) < new Date());
api.log.info(`Raport dzienny: ${overdue.length} zaległych zadań`);
return { overdueCount: overdue.length, time: api.utils.dayjs().format('HH:mm') };
```

#### Backup co godzinę

```
Schedule Trigger (0 * * * *) → Execute JS → Log
```

Skrypt w Execute JS:
```javascript
const timestamp = api.utils.dayjs().format('YYYY-MM-DD_HH-mm');
const persons = api.data.getPersons();
const tasks = api.data.getTasks();
const backup = { timestamp, persons, tasks };
await api.file.write(`data/backups/backup_${timestamp}.json`, JSON.stringify(backup, null, 2));
api.log.info(`Backup utworzony: backup_${timestamp}.json`);
return backup;
```

#### Poranny briefing (poniedziałek-piątek o 7:30)

```
Schedule Trigger (30 7 * * 1-5) → LLM Call → TTS
```

Konfiguracja Schedule Trigger:
- Preset: Własny cron...
- Cron Expression: `30 7 * * 1-5`
- Timezone: `Europe/Warsaw`

### Zarządzanie harmonogramami

Backend automatycznie:
- Skanuje wszystkie flow przy starcie serwera
- Rejestruje cron jobs dla schedule_trigger nodów
- Przeładowuje harmonogramy gdy flow są modyfikowane
- Loguje wykonania do konsoli

Konsola backendu:
```
SchedulerService initialized: 3 active schedules
SchedulerService: Registered schedule "Dzienny backup" (0 8 * * *) for flow "Automatyczny backup"
SchedulerService: Executing scheduled flow "Automatyczny backup" (trigger: Dzienny backup)
SchedulerService: Flow "Automatyczny backup" completed successfully (234ms)
```

### Uwagi

- Flow musi mieć `runtime: 'backend'` lub `'universal'`
- Flow nie może zawierać nodów client-only (Notification, TTS, STT)
- Harmonogram jest aktywny tylko gdy backend jest uruchomiony
- Wyłączenie noda (`disabled: true`) lub harmonogramu (`enabled: false`) zatrzymuje cron job

## Przykłady

### Prosty flow z logowaniem

```
Start → Execute JS → Log → Notification
```

Skrypt w Execute JS:
```javascript
const persons = api.data.getPersons();
api.variables.set('count', persons.length);
api.log.info(`Znaleziono ${persons.length} osób`);
return persons.length;
```

### Flow z warunkiem

```
Start → Execute JS → If/Else → [True] Log ("Jest dużo")
                              → [False] Log ("Jest mało")
```

Warunek w If/Else:
```javascript
variables.count > 10
```

### Flow z pętlą

```
Start → For Loop → [Body] Execute JS → Log
                 → [Done] Notification
```

Skrypt w Execute JS (body):
```javascript
api.log.info(`Iteracja ${variables.i}`);
```

### Flow z LLM Call

```
Start → LLM Call → Log
```

Konfiguracja LLM Call:
- Prompt: `Wymień 3 ciekawe fakty o programowaniu`
- System Prompt: `Odpowiadaj krótko po polsku`
- Temperature: 0.7

Wynik LLM jest przekazywany do następnego noda jako `input._result`.

### Flow z dynamicznym promptem LLM

```
Start → Execute JS → LLM Call (useScript) → Log
```

Skrypt w LLM Call (tryb useScript):
```javascript
const tasks = api.data.getTasks();
const taskNames = tasks.map(t => t.name).join(', ');
return `Zaplanuj kolejność wykonania tych zadań: ${taskNames}`;
```

### Flow z TTS

```
Start → Execute JS → TTS
```

Skrypt w Execute JS:
```javascript
const tasks = api.data.getTasks();
const count = tasks.length;
api.variables.set('summary', `Masz ${count} zadań do zrobienia`);
return `Masz ${count} zadań do zrobienia`;
```

Konfiguracja TTS:
- Tekst: dynamiczny (ze skryptu) - `return input._result;`
- Voice: `nova` (opcjonalnie)
- Speed: 1.0

### Flow z AI + TTS (głosowy asystent)

```
Start → LLM Call → TTS
```

Konfiguracja LLM Call:
- Prompt: `Podsumuj moje zadania na dziś w 2 zdaniach`
- System Prompt: `Odpowiadaj naturalnie, jakbyś mówił do kogoś`

Konfiguracja TTS (useScript):
```javascript
return input._result; // odczytaj odpowiedź AI na głos
```

### Flow z listami zakupów

```
Start → Execute JS → Log
```

Skrypt w Execute JS:
```javascript
// Podsumowanie aktywnych list zakupów
const lists = api.data.getShoppingLists();
const active = lists.filter(l => l.status === 'active');
for (const list of active) {
  const unchecked = list.items.filter(i => !i.checked);
  api.log.info(`${list.name} (${list.store || 'brak sklepu'}): ${unchecked.length} produktów do kupienia`);
}
return active.length;
```

### Flow tworzący listę zakupów

```
Start → Execute JS → Notification
```

Skrypt w Execute JS:
```javascript
// Utwórz listę z produktami
const list = await api.shopping.createList('Zakupy weekendowe', { store: 'Lidl', budget: 150 });
await api.shopping.addItem(list.id, 'Chleb', { quantity: 1, unit: 'szt', category: 'pieczywo' });
await api.shopping.addItem(list.id, 'Masło', { quantity: 1, unit: 'szt', category: 'nabiał', estimatedPrice: 7 });
await api.shopping.addItem(list.id, 'Jabłka', { quantity: 1, unit: 'kg', category: 'owoce', estimatedPrice: 5 });
api.log.info(`Utworzono listę "${list.name}" z ${list.items.length + 3} produktami`);
return list;
```

## Osadzanie w Markdown

Skrypty Automate mogą być osadzane wewnątrz dokumentów Markdown w edytorze MdEditor. Dostępne są dwa tryby:

### Referencja do flow (`@[automate:flow-id]`)

Osadza kartę istniejącego flow automatyzacji z możliwością uruchomienia go bezpośrednio z dokumentu.

```markdown
Poniżej raport dzienny:

@[automate:daily-report-flow]
```

- Wyświetla kartę z nazwą flow, opisem i liczbą nodów
- Przycisk "Uruchom" wykonuje flow i pokazuje logi/wyniki inline
- Link "Edytuj w designerze" otwiera `/designer/automate/:id`
- Wstawianie: komenda `/Automate Flow` lub ręcznie `@[automate:id]`

### Blok skryptowy (code fence `automate`)

Osadza wykonywalny blok kodu JavaScript z dostępem do System API. Działa jak komórka w Jupyter Notebook.

````markdown
```automate
const tasks = api.data.getTasks();
const open = tasks.filter(t => !t.done);
display.text(`Otwartych zadań: ${open.length}`);
display.table(open.map(t => ({ nazwa: t.name, priorytet: t.priority })));
```
````

- Ctrl+Enter uruchamia skrypt
- Wstawianie: komenda `/Script`
- BlockId opcjonalny: ` ```automate:moj-blok `

### Zmienne dostępne w blokach skryptowych

| Zmienna | Opis |
|---------|------|
| `api` | System API (identyczne jak w flow) |
| `variables` | Współdzielone zmienne dokumentu (persystentne między blokami) |
| `display` | API wyświetlania wyników w panelu output |

### display API

Funkcje do renderowania wyników bezpośrednio pod blokiem skryptowym.

```javascript
// Tekst
display.text('Wynik: 42');

// Tabela (tablica obiektów lub tablica tablic)
display.table([
  { imie: 'Jan', wiek: 30 },
  { imie: 'Anna', wiek: 25 },
]);

// Lista
display.list(['Element 1', 'Element 2', 'Element 3']);

// Sformatowany JSON
display.json({ klucz: 'wartość', nested: { a: 1 } });
```

### Współdzielony kontekst dokumentu

Bloki skryptowe w jednym dokumencie współdzielą zmienne. Zmienne ustawione w jednym bloku są dostępne w kolejnych.

````markdown
```automate
// Blok 1 - załaduj dane
const persons = api.data.getPersons();
variables.persons = persons;
variables.count = persons.length;
display.text(`Załadowano ${persons.length} osób`);
```

Tekst pomiędzy blokami...

```automate
// Blok 2 - użyj danych z bloku 1
display.text(`Liczba osób: ${variables.count}`);
display.table(variables.persons.map(p => ({ imie: p.name })));
```
````

Zmienne resetują się przy przeładowaniu strony. Wyniki (output) nie są persystowane w markdown - przeliczane są po uruchomieniu.
