# Automate - System API

## Przegląd

Moduł Automate udostępnia graficzny język programowania wzorowany na NodeRed. Skrypty JavaScript wykonywane w nodach typu `js_execute` mają dostęp do System API przez zmienną `api`.

## Zmienne dostępne w skryptach

| Zmienna | Opis |
|---------|------|
| `api` | System API - dostęp do plików, danych, zmiennych, logowania |
| `input` | Dane wejściowe z poprzedniego noda |
| `variables` | Zmienne flow (bezpośredni dostęp do obiektu) |

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

Logowanie wiadomości (widoczne w panelu execution log).

```javascript
api.log.info('Przetwarzanie rozpoczęte');
api.log.warn('Brak danych wejściowych');
api.log.error('Nie udało się zapisać pliku');
api.log.debug('Zmienna counter = ' + variables.counter);
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

## Typy nodów

### Triggery
- **Start** - Punkt startowy flow
- **Manual Trigger** - Ręczne uruchomienie

### Akcje
- **Execute JS** - Wykonanie kodu JavaScript z dostępem do System API
- **System API** - Wywołanie metody API systemu

### Logika
- **If/Else** - Warunkowe rozgałęzienie (warunek to wyrażenie JS)
- **Switch** - Wielokierunkowe rozgałęzienie
- **For Loop** - Pętla iteracyjna (count, indexVariable)
- **While Loop** - Pętla warunkowa (condition, maxIterations)

### Dane
- **Read Variable** - Odczytaj zmienną flow
- **Write Variable** - Zapisz zmienną flow

### Wyjście
- **Log** - Loguj wiadomość do konsoli
- **Notification** - Pokaż powiadomienie UI

### AI
- **LLM Call** - Wywołaj model AI (prompt statyczny lub dynamiczny ze skryptu)
- **Text to Speech** - Odczytaj tekst na głos (tekst statyczny lub dynamiczny ze skryptu)
- **Speech to Text** - Zamień mowę na tekst (wymaga interakcji użytkownika)

### Narzędzia
- **Comment** - Komentarz (nie wykonywany)

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
