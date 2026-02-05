# Conversation - Moduł konwersacji z tool calling

## Przegląd

Moduł Conversation rozszerza Castle Agent o tryb agentowy z pętlą tool calling. Umożliwia definiowanie scenariuszy konwersacyjnych (persona, dostępne akcje, kontekst), wykonywanie akcji w systemie przez AI oraz persystencję historii konwersacji. Działa zarówno z tekstem jak i głosem (TTS/STT).

## Architektura

```
┌──────────────────────────────────────────────────────────────┐
│                    CONVERSATION MODULE                        │
│  src/client/src/modules/conversation/                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  models/                        actions/                     │
│  └─ ConversationModels.ts       ├─ ActionRegistry.ts         │
│     - ConversationAction        ├─ taskActions.ts            │
│     - ConversationMessage       ├─ calendarActions.ts        │
│     - ConversationConfig        ├─ fileActions.ts            │
│     - ConversationScenario      ├─ personActions.ts          │
│     - ContextInjector           ├─ projectActions.ts         │
│                                 ├─ navigationActions.ts      │
│                                 ├─ automateActions.ts        │
│                                 └─ initActions.ts            │
│                                                              │
│  engine/                        services/                    │
│  └─ ConversationEngine.ts       ├─ ConversationService.ts    │
│     - tool calling loop         └─ ConversationHistoryService│
│     - context injectors                                      │
│     - confirmation flow                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Tryby pracy Castle Agent

### Chat (domyślny)
Prosty tryb czatu bez tool calling. AI odpowiada na pytania bez dostępu do systemu.

### Agent
Tryb agentowy z pętlą tool calling. AI ma dostęp do akcji systemowych (CRUD tasków, kalendarz, pliki, nawigacja itd.). Aktywowany przełącznikiem w UI.

## Scenariusze

Scenariusze definiują kontekst konwersacji: system prompt (persona), dostępne kategorie akcji, automatyczne injektory kontekstu.

### Wbudowane scenariusze

| ID | Nazwa | Kategorie akcji | Context Injectors |
|----|-------|------------------|-------------------|
| `general` | Asystent ogólny | wszystkie | - |
| `task_manager` | Menedżer tasków | tasks, projects | tasks_summary |
| `day_planner` | Planista dnia | calendar, tasks | events_today, tasks_summary |
| `file_explorer` | Eksplorator plików | files, navigation | - |

### Context Injectors

Automatycznie wstrzykują dane systemu do system prompt:

| Typ | Opis |
|-----|------|
| `tasks_summary` | Lista tasków z id, name, description, projectId |
| `events_today` | Dzisiejsze wydarzenia z name, startTime, endTime |
| `projects_summary` | Lista projektów z id, name, description |
| `custom` | Własny tekst (pole `customPrompt`) |

## Akcje (Actions)

Akcje to narzędzia (tools) udostępniane AI w trybie agentowym. Zarejestrowane w `ActionRegistry` i przekazywane do API AI jako tool definitions. Akcje oznaczone `confirmation: true` wymagają potwierdzenia użytkownika przed wykonaniem.

### Kategoria: tasks

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `list_tasks` | Lista wszystkich tasków | `query?: string` (filtr po nazwie) | - |
| `get_task` | Szczegóły taska | `id: string` | - |
| `create_task` | Utwórz nowy task | `name: string`, `description?: string`, `projectId?: string` | tak |
| `update_task` | Zaktualizuj task | `id: string`, `name?: string`, `description?: string` | tak |
| `delete_task` | Usuń task | `id: string` | tak |
| `search_tasks` | Wyszukaj taski po frazie | `query: string` | - |

### Kategoria: calendar

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `list_events_today` | Dzisiejsze wydarzenia | - | - |
| `list_events_date` | Wydarzenia na datę | `date: string` (YYYY-MM-DD) | - |
| `search_events` | Wyszukaj wydarzenia | `query: string` | - |

### Kategoria: files

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `read_file` | Odczytaj plik | `path: string` | - |
| `write_file` | Zapisz plik | `path: string`, `content: string` | tak |
| `list_directory` | Lista katalogu | `path: string` | - |

### Kategoria: persons

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `list_persons` | Lista osób | `query?: string` (filtr) | - |
| `get_person` | Szczegóły osoby | `id: string` | - |

### Kategoria: projects

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `list_projects` | Lista projektów | `query?: string` (filtr) | - |
| `get_project` | Szczegóły projektu | `id: string` | - |

### Kategoria: navigation

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `navigate_to` | Nawiguj do strony | `path: string` | - |
| `get_available_pages` | Lista dostępnych stron | - | - |

Dostępne ścieżki: `/agent`, `/todolist`, `/calendar`, `/person`, `/project`, `/filesystem/list`, `/automate`, `/objectviewer`, `/settings/ai`, `/settings/speech`, `/editor/simple/{path}`, `/viewer/md/{path}`, `/designer/ui/{id}`, `/designer/automate/{id}`

### Kategoria: automate

| Akcja | Opis | Parametry | Potwierdzenie |
|-------|------|-----------|:---:|
| `list_flows` | Lista flow automatyzacji | - | - |
| `run_flow` | Uruchom flow | `id: string` | tak |

## ConversationEngine - pętla tool calling

Silnik konwersacji realizuje pętlę tool calling:

```
1. User message → dodaj do historii
2. Zbuduj system prompt (scenario.systemPrompt + context injections)
3. Zbuduj messages z historii (z limitem historyLimit)
4. Pobierz tools z ActionRegistry (filtrowane po scenario.enabledCategories)
5. Wyślij do AI
6. PĘTLA (max maxToolCallsPerTurn iteracji):
   a. AI zwraca tool_calls →
      - Dla każdego tool call:
        - Sprawdź confirmation (action.confirmation || config.requireConfirmation)
        - Jeśli wymagane → dialog potwierdzenia → czekaj na odpowiedź użytkownika
        - Jeśli potwierdzone → actionRegistry.execute()
        - Dodaj wynik do historii
      - Wyślij ponownie do AI (z wynikami)
   b. AI zwraca tekst (bez tool_calls) →
      - Dodaj do historii
      - Zakończ pętlę
7. Trim historii (do historyLimit * 2)
```

## Konfiguracja

Plik: `data/conversation_config.json`

```json
{
  "type": "conversation_config",
  "agentMode": false,
  "activeScenarioId": "general",
  "scenarios": [...],
  "maxToolCallsPerTurn": 10,
  "requireConfirmation": true,
  "historyLimit": 50
}
```

| Pole | Typ | Domyślnie | Opis |
|------|-----|-----------|------|
| `agentMode` | boolean | false | Czy tryb agentowy jest aktywny |
| `activeScenarioId` | string | "general" | ID aktywnego scenariusza |
| `scenarios` | ConversationScenario[] | 4 wbudowane | Lista scenariuszy |
| `maxToolCallsPerTurn` | number | 10 | Limit wywołań narzędzi w jednej turze |
| `requireConfirmation` | boolean | true | Globalne wymaganie potwierdzenia dla write ops |
| `historyLimit` | number | 50 | Limit wiadomości w historii |

## Persystencja historii

Plik: `data/conversation_history.json`

```json
{
  "type": "conversation_history",
  "scenarioId": "general",
  "messages": [...],
  "updatedAt": 1706000000000
}
```

Historia jest automatycznie zapisywana z 2-sekundowym debounce po każdej zmianie. Przy ponownym otwarciu strony Agent historia jest wczytywana dla aktywnego scenariusza.

## UI w Castle Agent

### Przełącznik trybu
Switch "Chat" / "Agent" w nagłówku strony.

### Selektor scenariusza
Dropdown z dostępnymi scenariuszami (widoczny tylko w trybie Agent).

### Wyświetlanie tool calls
Wywołania narzędzi wyświetlane jako zwijane Accordion:

```
┌─ 🔧 list_tasks ──────────────────┐
│ Znaleziono 5 tasków               │
│ ▼ Szczegóły (JSON)                │
└────────────────────────────────────┘
```

### Dialog potwierdzenia
Dla akcji z `confirmation: true` wyświetlany jest dialog:

```
Agent chce wykonać: create_task
─────────────────────────────────
name: "Zakupy na weekend"
description: "Mleko, chleb, masło"
─────────────────────────────────
[Potwierdź]  [Odrzuć]
```

## Przykłady użycia

### Zarządzanie taskami (tekst)
```
User: "Jakie mam taski?"
→ AI wywołuje list_tasks → wyświetla wynik
→ AI: "Masz 5 tasków: ..."

User: "Utwórz task Zakupy na weekend"
→ AI wywołuje create_task(name: "Zakupy na weekend")
→ Dialog potwierdzenia → OK
→ AI: "Task został utworzony."
```

### Planowanie dnia (głos)
```
User (voice): "Co mam na dziś?"
→ STT → AI z kontekstem events_today + tasks_summary
→ AI wywołuje list_events_today → analizuje
→ AI (TTS): "Na dziś masz 3 wydarzenia: ..."
```

### Multi-tool (tekst)
```
User: "Pokaż taski i nawiguj do kalendarza"
→ AI wywołuje list_tasks → wyświetla
→ AI wywołuje navigate_to(path: "/calendar")
→ AI: "Oto Twoje taski. Nawigowałem do kalendarza."
```

## Rozszerzanie - rejestracja własnych akcji

```typescript
import { actionRegistry } from '../modules/conversation';

actionRegistry.register({
  name: 'my_custom_action',
  description: 'Opis dla AI co robi ta akcja',
  category: 'system',
  confirmation: false,
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Opis parametru' },
    },
    required: ['param1'],
  },
  handler: async (params) => {
    // logika akcji
    return { success: true, result: '...' };
  },
});
```

## Tool Calling - wsparcie providerów AI

Moduł AI został rozszerzony o tool calling dla wszystkich providerów:

| Provider | Format | Uwagi |
|----------|--------|-------|
| OpenAI | natywny `tools` + `tool_calls` | pełne wsparcie |
| Anthropic | `tool_use` / `tool_result` content blocks | translacja formatów |
| Ollama | OpenAI-compatible | zależne od modelu |
| Custom | OpenAI-compatible | zależne od endpointu |
