/**
 * Monaco editor setup - type definitions for System API autocompletion
 * Rejestruje typy api, input, variables aby Monaco podpowiadał w edytorze js_execute
 */

import type { Monaco } from '@monaco-editor/react';

const AUTOMATE_API_TYPES = `
/**
 * Model osoby w systemie.
 * Źródło danych: \`data/data/persons\`
 */
interface PersonModel {
  /** Zawsze "person" */
  type: "person";
  /** Unikalny identyfikator osoby */
  id: string;
  /** Nick / pseudonim */
  nick: string;
  /** Imię */
  firstName?: string;
  /** Nazwisko */
  secondName?: string;
  /** Opis osoby */
  description?: string;
}

/** Komponent zadania (bazowy interfejs) */
interface TaskComponentModel {
  /** Typ komponentu, np. "task_test", "task_interval", "task_sequence" */
  type: string;
}

/**
 * Model zadania w systemie.
 * Źródło danych: \`data/data/tasks\`
 */
interface TaskModel {
  /** Zawsze "task" */
  type: "task";
  /** Unikalny identyfikator zadania */
  id: string;
  /** ID projektu, do którego należy zadanie */
  projectId?: string;
  /** Nazwa zadania */
  name: string;
  /** Opis zadania */
  description?: string;
  /** Czas trwania (minuty) */
  duration?: number;
  /** Koszt zadania */
  cost?: number;
  /** Lista komponentów zadania */
  components?: TaskComponentModel[];
}

/** Komponent projektu (bazowy interfejs) */
interface ProjectComponentModel {
  /** Typ komponentu, np. "project_test" */
  type: string;
}

/**
 * Model projektu w systemie.
 * Źródło danych: \`data/data/projects\`
 */
interface ProjectModel {
  /** Zawsze "project" */
  type: "project";
  /** Unikalny identyfikator projektu */
  id: string;
  /** Nazwa projektu */
  name: string;
  /** Opis projektu */
  description?: string;
  /** Koszt projektu */
  cost?: number;
  /** Zagnieżdżone podprojekty */
  projects?: ProjectModel[];
  /** Zadania w projekcie */
  tasks?: TaskModel[];
  /** Komponenty projektu */
  components?: ProjectComponentModel[];
}

/**
 * Obiekt dayjs - immutable wrapper na datę/czas.
 * @see https://day.js.org/docs/en/display/format
 */
interface Dayjs {
  /**
   * Formatuj datę do stringa.
   * @param template - Szablon formatu, np. \`"YYYY-MM-DD"\`, \`"DD.MM.YYYY HH:mm"\`. Domyślnie ISO 8601.
   * @returns Sformatowany string daty
   * @example api.utils.dayjs().format('DD.MM.YYYY') // "15.01.2025"
   */
  format(template?: string): string;

  /**
   * Dodaj czas.
   * @param value - Liczba jednostek do dodania
   * @param unit - Jednostka: "day", "week", "month", "year", "hour", "minute", "second"
   * @returns Nowy obiekt Dayjs
   * @example api.utils.dayjs().add(7, 'day')
   */
  add(value: number, unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'): Dayjs;

  /**
   * Odejmij czas.
   * @param value - Liczba jednostek do odjęcia
   * @param unit - Jednostka: "day", "week", "month", "year", "hour", "minute", "second"
   * @returns Nowy obiekt Dayjs
   * @example api.utils.dayjs().subtract(1, 'month')
   */
  subtract(value: number, unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'): Dayjs;

  /**
   * Początek jednostki czasu.
   * @param unit - Jednostka: "day", "week", "month", "year", "hour", "minute"
   * @returns Nowy obiekt Dayjs ustawiony na początek podanej jednostki
   * @example api.utils.dayjs().startOf('month') // 1-szy dzień miesiąca, 00:00
   */
  startOf(unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute'): Dayjs;

  /**
   * Koniec jednostki czasu.
   * @param unit - Jednostka: "day", "week", "month", "year", "hour", "minute"
   * @returns Nowy obiekt Dayjs ustawiony na koniec podanej jednostki
   * @example api.utils.dayjs().endOf('day') // 23:59:59.999
   */
  endOf(unit: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute'): Dayjs;

  /**
   * Czy data jest przed podaną?
   * @param date - Data do porównania
   * @returns true jeśli bieżąca data jest wcześniejsza
   */
  isBefore(date: Dayjs | string | Date): boolean;

  /**
   * Czy data jest po podanej?
   * @param date - Data do porównania
   * @returns true jeśli bieżąca data jest późniejsza
   */
  isAfter(date: Dayjs | string | Date): boolean;

  /**
   * Czy data jest taka sama?
   * @param date - Data do porównania
   * @param unit - Jednostka porównania (np. "day" porówna tylko dzień). Domyślnie porównuje do milisekundy.
   * @returns true jeśli daty są takie same w podanej jednostce
   * @example api.utils.dayjs().isSame('2025-01-15', 'day')
   */
  isSame(date: Dayjs | string | Date, unit?: 'day' | 'week' | 'month' | 'year' | 'hour' | 'minute' | 'second'): boolean;

  /**
   * Różnica między datami.
   * @param date - Data do porównania
   * @param unit - Jednostka wyniku: "day", "month", "year", "hour", "minute", "second", "millisecond". Domyślnie "millisecond".
   * @param float - Jeśli true, zwraca wartość zmiennoprzecinkową
   * @returns Różnica w podanej jednostce
   * @example api.utils.dayjs('2025-03-01').diff('2025-01-01', 'month') // 2
   */
  diff(date: Dayjs | string | Date, unit?: 'day' | 'month' | 'year' | 'hour' | 'minute' | 'second' | 'millisecond', float?: boolean): number;

  /**
   * Timestamp w milisekundach.
   * @returns Liczba milisekund od epoch (1970-01-01)
   */
  valueOf(): number;

  /**
   * Timestamp Unix w sekundach.
   * @returns Liczba sekund od epoch (1970-01-01)
   */
  unix(): number;

  /**
   * Konwertuj do natywnego obiektu Date.
   * @returns Obiekt Date
   */
  toDate(): Date;

  /** Konwertuj do JSON (ISO 8601) */
  toJSON(): string;
  /** Konwertuj do ISO 8601 string */
  toISOString(): string;
  /** Konwertuj do stringa */
  toString(): string;

  /** Pobierz rok (np. 2025) */
  year(): number;
  /** Pobierz miesiąc (0-11, styczeń = 0) */
  month(): number;
  /** Pobierz dzień miesiąca (1-31) */
  date(): number;
  /** Pobierz dzień tygodnia (0-6, niedziela = 0) */
  day(): number;
  /** Pobierz godzinę (0-23) */
  hour(): number;
  /** Pobierz minutę (0-59) */
  minute(): number;
  /** Pobierz sekundę (0-59) */
  second(): number;
  /** Pobierz milisekundę (0-999) */
  millisecond(): number;

  /**
   * Ustaw wartość jednostki czasu.
   * @param unit - Jednostka do ustawienia
   * @param value - Nowa wartość
   * @returns Nowy obiekt Dayjs
   */
  set(unit: 'year' | 'month' | 'date' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond', value: number): Dayjs;

  /**
   * Klonuj obiekt Dayjs.
   * @returns Nowy niezależny obiekt Dayjs
   */
  clone(): Dayjs;

  /**
   * Sprawdź czy data jest poprawna.
   * @returns true jeśli data jest prawidłowa
   */
  isValid(): boolean;

  /**
   * Zmień locale.
   * @param locale - Kod locale, np. "pl", "en"
   * @returns Nowy obiekt Dayjs z ustawionym locale
   */
  locale(locale: string): Dayjs;
}

/**
 * Operacje na plikach w filesystem.
 * Wszystkie ścieżki są relatywne do root directory systemu.
 */
interface FileApi {
  /**
   * Odczytaj zawartość pliku.
   * @param path - Ścieżka do pliku, np. \`"data/persons.json"\`
   * @returns Zawartość pliku jako string. Pusty string jeśli plik nie istnieje.
   * @example
   * const content = await api.file.read('data/persons.json');
   * const data = JSON.parse(content);
   */
  read(path: string): Promise<string>;

  /**
   * Zapisz zawartość do pliku. Tworzy plik jeśli nie istnieje, nadpisuje jeśli istnieje.
   * @param path - Ścieżka do pliku, np. \`"data/output.json"\`
   * @param content - Zawartość do zapisania
   * @example
   * await api.file.write('data/output.json', JSON.stringify({ result: 'ok' }));
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Lista plików i katalogów w podanym katalogu.
   * @param path - Ścieżka do katalogu, np. \`"data/"\`
   * @returns Tablica nazw plików i katalogów
   * @example
   * const files = await api.file.list('data/');
   * // ["persons.json", "tasks.json", ...]
   */
  list(path: string): Promise<string[]>;
}

/**
 * Dostęp do danych systemu (read-only).
 * Dane pobierane z DataSource (załadowane z plików persons, tasks, projects).
 */
interface DataApi {
  /**
   * Pobierz listę wszystkich osób.
   * @returns Tablica obiektów PersonModel
   * @example
   * const persons = api.data.getPersons();
   * api.log.info(\`Znaleziono \${persons.length} osób\`);
   */
  getPersons(): PersonModel[];

  /**
   * Pobierz osobę po ID.
   * @param id - Unikalny identyfikator osoby
   * @returns Obiekt PersonModel lub undefined jeśli nie znaleziono
   * @example
   * const person = api.data.getPersonById('abc-123');
   * if (person) api.log.info(\`Znaleziono: \${person.nick}\`);
   */
  getPersonById(id: string): PersonModel | undefined;

  /**
   * Pobierz listę wszystkich zadań.
   * @returns Tablica obiektów TaskModel
   */
  getTasks(): TaskModel[];

  /**
   * Pobierz zadanie po ID.
   * @param id - Unikalny identyfikator zadania
   * @returns Obiekt TaskModel lub undefined jeśli nie znaleziono
   */
  getTaskById(id: string): TaskModel | undefined;

  /**
   * Pobierz listę wszystkich projektów.
   * @returns Tablica obiektów ProjectModel
   */
  getProjects(): ProjectModel[];

  /**
   * Pobierz projekt po ID.
   * @param id - Unikalny identyfikator projektu
   * @returns Obiekt ProjectModel lub undefined jeśli nie znaleziono
   */
  getProjectById(id: string): ProjectModel | undefined;
}

/**
 * Zarządzanie zmiennymi flow.
 * Zmienne są współdzielone między nodami w trakcie wykonywania flow.
 */
interface VariablesApi {
  /**
   * Odczytaj wartość zmiennej flow.
   * @param name - Nazwa zmiennej
   * @returns Wartość zmiennej lub undefined jeśli nie istnieje
   * @example
   * const counter = api.variables.get('counter');
   */
  get(name: string): any;

  /**
   * Zapisz wartość zmiennej flow.
   * @param name - Nazwa zmiennej
   * @param value - Wartość do zapisania (dowolny typ)
   * @example
   * api.variables.set('counter', 42);
   * api.variables.set('results', [1, 2, 3]);
   */
  set(name: string, value: any): void;

  /**
   * Pobierz kopię wszystkich zmiennych flow.
   * @returns Obiekt z parami klucz-wartość wszystkich zmiennych
   * @example
   * const allVars = api.variables.getAll();
   * api.log.info(JSON.stringify(allVars));
   */
  getAll(): Record<string, any>;
}

/**
 * Logowanie wiadomości.
 * Wiadomości są widoczne w panelu execution log na dole designera.
 */
interface LogApi {
  /**
   * Loguj wiadomość informacyjną.
   * @param message - Treść wiadomości
   * @example api.log.info('Przetwarzanie rozpoczęte');
   */
  info(message: string): void;

  /**
   * Loguj ostrzeżenie.
   * @param message - Treść ostrzeżenia
   * @example api.log.warn('Brak danych wejściowych');
   */
  warn(message: string): void;

  /**
   * Loguj błąd.
   * @param message - Treść błędu
   * @example api.log.error('Nie udało się zapisać pliku');
   */
  error(message: string): void;

  /**
   * Loguj wiadomość debug (widoczna tylko w konsoli i execution log).
   * @param message - Treść wiadomości debug
   * @example api.log.debug('counter = ' + variables.counter);
   */
  debug(message: string): void;
}

/**
 * Narzędzia pomocnicze dostępne w skryptach.
 */
interface UtilsApi {
  /**
   * Generuj losowy UUID v4.
   * @returns String UUID, np. "550e8400-e29b-41d4-a716-446655440000"
   * @example
   * const id = api.utils.uuid();
   */
  uuid(): string;

  /**
   * Utwórz obiekt dayjs do operacji na datach.
   * Bez argumentu zwraca aktualną datę i czas.
   * @param date - Data wejściowa (string ISO, Date). Pominięcie = teraz.
   * @returns Obiekt Dayjs z metodami do formatowania, porównywania i manipulacji datami
   * @example
   * const now = api.utils.dayjs();
   * const formatted = api.utils.dayjs('2025-01-15').format('DD.MM.YYYY');
   * const nextWeek = api.utils.dayjs().add(7, 'day');
   */
  dayjs(date?: string | Date): Dayjs;

  /**
   * Zatrzymaj wykonywanie na podany czas (async).
   * @param ms - Czas opóźnienia w milisekundach
   * @returns Promise rozwiązywany po upływie czasu
   * @example
   * await api.utils.sleep(1000); // poczekaj 1 sekundę
   */
  sleep(ms: number): Promise<void>;
}

/**
 * Wiadomość czatu AI.
 */
interface AiChatMessage {
  /** Rola nadawcy: "system" (instrukcje), "user" (zapytanie), "assistant" (odpowiedź AI) */
  role: 'system' | 'user' | 'assistant';
  /** Treść wiadomości */
  content: string;
}

/**
 * Odpowiedź z API AI.
 */
interface AiChatResponse {
  /** Treść odpowiedzi AI */
  content: string;
  /** Nazwa modelu, który wygenerował odpowiedź */
  model: string;
  /** Zużycie tokenów (jeśli dostępne) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Powód zakończenia generowania */
  finishReason?: string;
}

/**
 * API do interakcji z modelami AI.
 * Wymaga skonfigurowania providera AI w Settings > AI Settings.
 * Obsługuje: OpenAI, Anthropic (Claude), Ollama (local), Custom (OpenAI-compatible).
 */
interface AiApi {
  /**
   * Wyślij prompt do AI i otrzymaj odpowiedź tekstową.
   * @param prompt - Treść zapytania
   * @param options - Opcjonalne parametry
   * @returns Odpowiedź AI jako string
   * @example
   * const answer = await api.ai.chat('Opisz w 2 zdaniach czym jest TypeScript');
   * api.log.info(answer);
   * @example
   * const summary = await api.ai.chat('Podsumuj dane', {
   *   systemPrompt: 'Jesteś analitykiem danych',
   *   temperature: 0.3,
   *   maxTokens: 500,
   * });
   */
  chat(prompt: string, options?: {
    /** Instrukcja systemowa dla AI */
    systemPrompt?: string;
    /** Nazwa modelu (nadpisuje domyślny z ustawień) */
    model?: string;
    /** Kreatywność odpowiedzi 0-2 (0=deterministyczna, 2=kreatywna) */
    temperature?: number;
    /** Maksymalna długość odpowiedzi w tokenach */
    maxTokens?: number;
  }): Promise<string>;

  /**
   * Wyślij pełną konwersację (tablicę wiadomości) do AI.
   * Daje pełną kontrolę nad historią konwersacji i zwraca pełny obiekt odpowiedzi.
   * @param messages - Tablica wiadomości konwersacji
   * @param options - Opcjonalne parametry
   * @returns Pełna odpowiedź AI z metadanymi
   * @example
   * const response = await api.ai.chatMessages([
   *   { role: 'system', content: 'Odpowiadaj krótko po polsku' },
   *   { role: 'user', content: 'Co to jest MQTT?' },
   * ]);
   * api.log.info(\`Model: \${response.model}, Odpowiedź: \${response.content}\`);
   */
  chatMessages(messages: AiChatMessage[], options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<AiChatResponse>;

  /**
   * Sprawdź czy provider AI jest skonfigurowany (klucz API / URL ustawiony).
   * @returns true jeśli AI jest gotowe do użycia
   * @example
   * if (!api.ai.isConfigured()) {
   *   api.log.error('Skonfiguruj AI w Settings > AI Settings');
   *   return;
   * }
   */
  isConfigured(): boolean;
}

/**
 * System API - główny obiekt dostępny w skryptach js_execute.
 *
 * Zapewnia dostęp do: plików, danych systemu, zmiennych flow,
 * logowania, powiadomień UI, narzędzi pomocniczych i AI.
 *
 * @example
 * // Odczyt danych i zapis wyniku
 * const persons = api.data.getPersons();
 * api.variables.set('count', persons.length);
 * api.log.info(\`Znaleziono \${persons.length} osób\`);
 * await api.file.write('data/report.json', JSON.stringify({ count: persons.length }));
 * api.notify('Raport wygenerowany', 'success');
 */
interface SystemApi {
  /** Operacje na plikach w filesystem */
  file: FileApi;
  /** Dostęp do danych systemu (read-only): osoby, zadania, projekty */
  data: DataApi;
  /** Zarządzanie zmiennymi flow (get, set, getAll) */
  variables: VariablesApi;
  /** Logowanie wiadomości do execution log (info, warn, error, debug) */
  log: LogApi;

  /**
   * Pokaż powiadomienie UI (Snackbar) użytkownikowi.
   * @param message - Treść powiadomienia
   * @param severity - Typ powiadomienia. Domyślnie "info".
   * @example
   * api.notify('Operacja zakończona', 'success');
   * api.notify('Uwaga: brak danych', 'warning');
   */
  notify(message: string, severity?: 'success' | 'info' | 'warning' | 'error'): void;

  /** Narzędzia pomocnicze: uuid, dayjs, sleep */
  utils: UtilsApi;

  /** API do interakcji z modelami AI (OpenAI, Anthropic, Ollama, Custom) */
  ai: AiApi;

  /** API do syntezy i rozpoznawania mowy (TTS/STT) */
  speech: SpeechApi;
}

/**
 * API do syntezy i rozpoznawania mowy.
 * Wymaga skonfigurowania providera w Settings > Speech Settings.
 * Obsługuje: OpenAI TTS/Whisper, Browser Web Speech API.
 */
interface SpeechApi {
  /**
   * Odczytaj tekst na głos (Text-to-Speech).
   * @param text - Tekst do odczytania
   * @param options - Opcjonalne parametry
   * @returns Promise rozwiązywany po zakończeniu mówienia
   * @example
   * await api.speech.say('Witaj, jak mogę pomóc?');
   * @example
   * await api.speech.say('Hello world', { voice: 'nova', speed: 1.2 });
   */
  say(text: string, options?: {
    /** Głos (dla OpenAI: alloy, echo, fable, onyx, nova, shimmer) */
    voice?: string;
    /** Prędkość mowy (0.25 - 4.0) */
    speed?: number;
  }): Promise<void>;

  /**
   * Zatrzymaj aktualnie odtwarzaną mowę.
   * @example api.speech.stop();
   */
  stop(): void;

  /**
   * Sprawdź czy TTS jest skonfigurowany.
   * @returns true jeśli TTS jest gotowy do użycia
   */
  isTtsConfigured(): boolean;

  /**
   * Sprawdź czy STT jest skonfigurowany.
   * @returns true jeśli STT jest gotowy do użycia
   */
  isSttConfigured(): boolean;
}

/**
 * System API - główny obiekt do interakcji z systemem.
 *
 * Dostępne pod-obiekty:
 * - \`api.file\` - odczyt/zapis plików
 * - \`api.data\` - dane systemu (osoby, zadania, projekty)
 * - \`api.variables\` - zmienne flow
 * - \`api.log\` - logowanie
 * - \`api.notify()\` - powiadomienia UI
 * - \`api.utils\` - uuid, dayjs, sleep
 * - \`api.ai\` - interakcja z modelami AI (chat, chatMessages, isConfigured)
 * - \`api.speech\` - synteza i rozpoznawanie mowy (say, stop, isTtsConfigured, isSttConfigured)
 */
declare const api: SystemApi;

/**
 * Dane wejściowe z poprzedniego noda.
 * Zawiera wynik zwrócony przez poprzedni node (wartość \`return\`).
 * @example
 * const previousResult = input.result;
 */
declare const input: Record<string, any>;

/**
 * Zmienne flow - bezpośredni dostęp do obiektu zmiennych.
 * Równoważne z \`api.variables.getAll()\`, ale z bezpośrednim dostępem.
 * @example
 * const counter = variables.counter;
 * variables.counter = (counter || 0) + 1;
 */
declare const variables: Record<string, any>;
`;

let registered = false;

/** Rejestruje typy API w Monaco (wywoływane raz w beforeMount) */
export function setupAutomateMonaco(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: false,
  });

  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    AUTOMATE_API_TYPES,
    'automate-api.d.ts',
  );
}
