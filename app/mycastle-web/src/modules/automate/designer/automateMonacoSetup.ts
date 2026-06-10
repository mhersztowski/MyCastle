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
   * Lista nazw plików i katalogów w podanym katalogu.
   * @param path - Ścieżka do katalogu, np. \`"data/"\`
   * @returns Tablica nazw plików i katalogów (bez typu — użyj \`listDetailed\` żeby odróżnić)
   * @example
   * const files = await api.file.list('data/');
   * // ["persons.json", "tasks.json", "subdir", ...]
   */
  list(path: string): Promise<string[]>;

  /**
   * Lista wpisów z informacją o typie (plik vs katalog).
   * @example
   * const entries = await api.file.listDetailed('data/');
   * for (const e of entries) {
   *   api.log.info(\`\${e.isDirectory ? '📁' : '📄'} \${e.name}\`);
   * }
   */
  listDetailed(path: string): Promise<FileEntry[]>;

  /**
   * Rekurencyjny walk po drzewie. Callback dostaje każdy plik i katalog raz.
   * @param path - Korzeń od którego zacząć
   * @param callback - Funkcja wywoływana dla każdego wpisu. Może być async.
   * @example
   * let total = 0;
   * await api.file.walk('data/', (entry) => {
   *   if (entry.isFile) total++;
   * });
   * api.log.info(\`Plików łącznie: \${total}\`);
   */
  walk(path: string, callback: (entry: FileEntry) => void | Promise<void>): Promise<void>;

  /**
   * Filtruj rekurencyjnie po wzorcu glob.
   * Wzorzec: \`*\` = w obrębie segmentu (nie matchuje \`/\`);
   *          dwie gwiazdki = przez segmenty (rekurencyjnie).
   * @param rootPath - Katalog startowy
   * @param pattern - Wzorzec globa (zobacz wyżej)
   * @returns Pełne ścieżki dopasowanych PLIKÓW (katalogi pomijane)
   * @example
   * const jsons = await api.file.glob('data/', '*.json');
   * const reports = await api.file.glob('reports/', 'report-*.csv');
   */
  glob(rootPath: string, pattern: string): Promise<string[]>;

  /**
   * Metadane pliku/katalogu — rozmiar, data modyfikacji, typ.
   * @throws gdy ścieżka nie istnieje
   * @example
   * const s = await api.file.stat('data/persons.json');
   * api.log.info(\`\${s.name}: \${s.size} B, \${s.modified.toISOString()}\`);
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Czy ścieżka istnieje (plik lub katalog). Nie rzuca błędu.
   * @example
   * if (!(await api.file.exists('data/cache.json'))) {
   *   await api.file.write('data/cache.json', '{}');
   * }
   */
  exists(path: string): Promise<boolean>;

  /** Czy to istniejący PLIK (false dla katalogu lub braku). */
  isFile(path: string): Promise<boolean>;

  /** Czy to istniejący KATALOG. */
  isDirectory(path: string): Promise<boolean>;

  /**
   * Rozmiar pliku w bajtach (skrót do \`stat().size\`). 0 dla katalogu.
   * @example
   * const totalBytes = await api.file.size('data/backup.json');
   * api.log.info(\`\${(totalBytes / 1024).toFixed(1)} KB\`);
   */
  size(path: string): Promise<number>;

  /**
   * Data ostatniej modyfikacji (skrót do \`stat().modified\`).
   * @example
   * const m = await api.file.modified('data/log.txt');
   * const ageMs = Date.now() - m.getTime();
   */
  modified(path: string): Promise<Date>;

  /**
   * Usuń plik. Dla katalogu użyj \`rmdir\`.
   * @example
   * await api.file.delete('data/old-cache.json');
   */
  delete(path: string): Promise<void>;

  /**
   * Skopiuj plik. Nadpisuje cel jeśli istnieje.
   * @example
   * await api.file.copy('data/template.json', 'data/instance-1.json');
   */
  copy(from: string, to: string): Promise<void>;

  /**
   * Przenieś / zmień nazwę. Nie atomic dla wszystkich backendów
   * (failure mode: copy OK + delete FAIL → dwa pliki zamiast utraty danych).
   * @example
   * await api.file.rename('data/draft.md', 'data/published.md');
   */
  rename(from: string, to: string): Promise<void>;

  /** Alias do \`rename\`. */
  move(from: string, to: string): Promise<void>;

  /**
   * Utwórz katalog (rekurencyjnie). Idempotent. Wewnętrznie wstawia
   * \`.keep\` sentinel żeby pusty katalog był widoczny w \`list\`.
   * @example
   * await api.file.mkdir('data/2026/06/07');
   */
  mkdir(path: string): Promise<void>;

  /**
   * Usuń katalog. Domyślnie tylko jeśli pusty.
   * @param recursive - true = usuń zawartość przed katalogiem (jak \`rm -rf\`)
   * @example
   * await api.file.rmdir('data/old-backups', true);
   */
  rmdir(path: string, recursive?: boolean): Promise<void>;
}

/** Wpis zwracany przez \`listDetailed\` / \`walk\` / \`glob\`. */
interface FileEntry {
  /** Sama nazwa (ostatni segment ścieżki). */
  name: string;
  /** Pełna ścieżka. */
  path: string;
  /** Czy to plik. */
  isFile: boolean;
  /** Czy to katalog. */
  isDirectory: boolean;
}

/** Metadata pojedynczej pozycji w filesystemie. */
interface FileStat {
  /** Pełna ścieżka. */
  path: string;
  /** Sama nazwa. */
  name: string;
  /** Rozmiar w bajtach. Dla katalogu zawsze 0. */
  size: number;
  /** Data ostatniej modyfikacji. */
  modified: Date;
  /** Czy to plik. */
  isFile: boolean;
  /** Czy to katalog. */
  isDirectory: boolean;
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

  /** Wyszukiwanie i uruchamianie INNYCH skryptów automatyzacji osadzonych
   *  w plikach .md w drive użytkownika — adresowane przez tagi (Ustawienia
   *  skryptu → Tagi). */
  scripts: ScriptsApi;

  /** Zaszyfrowane credentiale użytkownika (Settings → Sekrety). */
  secrets: SecretsApi;
}

/** Zaszyfrowane credentiale użytkownika (Settings → Sekrety). */
interface SecretsApi {
  /** Lista WŁASNYCH credentiali (metadane, bez wartości). global=publiczny. */
  list(): Promise<Array<{ key: string; type: string; name: string; global: boolean; updatedAt: number }>>;
  /**
   * Odczyt wartości po nazwie. null gdy brak / brak dostępu.
   * @param owner opcjonalny właściciel — odczyt CUDZEGO sekretu (tylko gdy globalny;
   *   dla cudzego owner-a podaj też typ). Domyślnie = zalogowany użytkownik.
   */
  get(name: string, type?: string, owner?: string): Promise<string | null>;
  /** Zapis/aktualizacja. global=true → publiczny (dostępny dla wszystkich). Domyślny typ 'other'. */
  set(name: string, value: string, type?: string, global?: boolean): Promise<void>;
  /** Usunięcie WŁASNEGO. Zwraca true gdy coś usunięto. */
  delete(name: string, type?: string): Promise<boolean>;
}

/**
 * Pojedynczy skrypt znaleziony przez findByTag — metadane + treść,
 * gotowa do uruchomienia ręcznego lub przez \`runByTag\`.
 */
interface DiscoveredScript {
  /** Ścieżka VFS do pliku .md, w którym jest skrypt. */
  path: string;
  /** TipTap block id (może być pusty dla starszych bloków). */
  blockId: string;
  /** Treść skryptu — dokładnie taka jak w fence. */
  code: string;
  /** Tagi z fence'a. */
  tags: string[];
  /** Czy blok jest oznaczony autorun. (runByTag ignoruje tę flagę.) */
  autorun: boolean;
  /** Zapamiętany widok (code vs html). */
  viewMode: 'code' | 'html';
  /** Wysokość okna w px lub null dla auto. */
  windowHeight: number | null;
}

/** Wynik uruchomienia pojedynczego skryptu w batchu runByTag. */
interface ScriptRunResult {
  path: string;
  blockId: string;
  tags: string[];
  /** True iff skrypt zakończył się bez wyjątku. */
  ok: boolean;
  /** Zwrócona wartość (gdy ok). */
  result?: unknown;
  /** Treść błędu (gdy !ok). */
  error?: string;
  /** Czas wykonania w ms. */
  durationMs: number;
}

/**
 * API do wyszukiwania i uruchamiania innych skryptów automatyzacji w drive.
 *
 * Każdy blok kodu (fence) automate w plikach .md może mieć tagi (Ustawienia
 * skryptu → "Tagi skryptu"). To API pozwala znajdować skrypty po tagach i
 * uruchamiać je seryjnie. Trzy scope'y skanowania:
 *
 * - **byTag** — cały drive (od \`options.root\`, domyślnie \`'data'\`).
 *   Globalny workflow ("daily runner").
 * - **InParents** — TYLKO katalogi NADRZĘDNE wobec pliku .md, w którym
 *   znajduje się skrypt wywołujący. Per-katalog skan jest non-recursive
 *   (liczą się pliki bezpośrednio w katalogu-przodku). Dla scenariusza
 *   konfiguracji dziedziczonej z góry.
 * - **InChilds** — katalog hostujący skrypt + WSZYSTKIE jego podkatalogi,
 *   rekursywnie. Dla scenariusza "wszystko poniżej tego folderu".
 *
 * Plik .md zawierający skrypt wywołujący jest ZAWSZE wykluczany z wyników
 * — żeby self-tag nie wywołał nieskończonej rekurencji.
 *
 * \`InParents\` / \`InChilds\` wymagają znajomości ścieżki pliku hostującego —
 * dostarczanej przez MdEditor. Wywołanie spoza MdEditora (np. z flow
 * designera) rzuci błąd; użyj wtedy \`runByTag\`.
 */
interface ScriptsApi {
  /**
   * Znajdź wszystkie skrypty z danym tagiem w całym drive (read-only).
   *
   * @param tag - Etykieta do dopasowania (case-sensitive, exact match).
   * @param options - Konfiguracja skanowania.
   * @returns Tablica metadanych skryptów (pusta gdy żaden nie pasuje).
   *
   * @example
   * const found = await api.scripts.findByTag('backup');
   * for (const s of found) {
   *   api.log.info(s.path + ': ' + s.code.length + ' znakow');
   * }
   */
  findByTag(tag: string, options?: {
    /** Katalog startowy skanowania. Domyślnie \`'data'\` (cały VFS). */
    root?: string;
  }): Promise<DiscoveredScript[]>;

  /**
   * Znajdź skrypty z tagiem w katalogach NADRZĘDNYCH wobec hostującego .md.
   *
   * Walker idzie od katalogu pliku-hosta w górę aż do \`options.root\`. Każdy
   * katalog-przodek skanowany jest non-recursive (tylko pliki .md bezpośrednio
   * w nim). Najpierw najbliższy rodzic, potem dziadek, …
   *
   * @example
   * // Skrypty "config" w katalogu bieżącym wzwyż — pozwala dziedziczyć
   * // wartości / konfigurację z plików leżących wyżej w drzewie.
   * const configs = await api.scripts.findInParentsByTag('config');
   */
  findInParentsByTag(tag: string, options?: {
    /** Górna granica wspinaczki. Domyślnie \`'data'\`. */
    root?: string;
  }): Promise<DiscoveredScript[]>;

  /**
   * Znajdź skrypty z tagiem POD katalogiem hostującego .md (rekursywnie).
   *
   * @example
   * // Wszystkie "task" pod bieżącym folderem.
   * const subtasks = await api.scripts.findInChildsByTag('task');
   */
  findInChildsByTag(tag: string): Promise<DiscoveredScript[]>;

  /**
   * Znajdź i uruchom seryjnie skrypty z tagiem — cały drive.
   *
   * Każdy skrypt-dziecko jest wykonywany w świeżej AsyncFunction z tym samym
   * obiektem \`api\` co skrypt wywołujący — zapisy do filesystemu, zmienne i
   * powiadomienia są wspólne. \`display.*\` w dzieciach jest stubowane do no-op.
   *
   * Domyślnie kontynuuje po błędach (jeden uszkodzony skrypt nie zatrzymuje
   * batcha). \`stopOnError: true\` daje fail-fast.
   *
   * @example
   * const results = await api.scripts.runByTag('daily');
   * const failed = results.filter(r => !r.ok);
   * if (failed.length) {
   *   api.notify(failed.length + ' skryptow sie wywalilo', 'warning');
   * }
   */
  runByTag(tag: string, options?: {
    /** Katalog startowy. Domyślnie \`'data'\`. */
    root?: string;
    /** Przerwij batch po pierwszym błędzie. Domyślnie false. */
    stopOnError?: boolean;
  }): Promise<ScriptRunResult[]>;

  /**
   * Znajdź + uruchom skrypty z tagiem w katalogach NADRZĘDNYCH hosta.
   *
   * Identyczne semantyki wykonania jak \`runByTag\` (sekwencyjnie, wspólny api).
   * Scope ograniczony do katalogów-przodków — przydatne dla setup'u
   * propagowanego z wyższych poziomów drzewa.
   *
   * @example
   * // Odpal wszystkie skrypty "init" w katalogach nad bieżącym plikiem.
   * await api.scripts.runInParentsByTag('init');
   */
  runInParentsByTag(tag: string, options?: {
    /** Górna granica wspinaczki. Domyślnie \`'data'\`. */
    root?: string;
    /** Przerwij batch po pierwszym błędzie. Domyślnie false. */
    stopOnError?: boolean;
  }): Promise<ScriptRunResult[]>;

  /**
   * Znajdź + uruchom skrypty z tagiem w katalogu hosta i jego podkatalogach.
   *
   * @example
   * // Subtaski — wszystkie skrypty "task" pod bieżącym katalogiem projektu.
   * const results = await api.scripts.runInChildsByTag('task');
   */
  runInChildsByTag(tag: string, options?: {
    /** Przerwij batch po pierwszym błędzie. Domyślnie false. */
    stopOnError?: boolean;
  }): Promise<ScriptRunResult[]>;
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

/**
 * Register a `.d.ts` ambient declaration with Monaco's TypeScript service.
 *
 * Uses `monaco.editor.createModel()` instead of `setExtraLibs`/`addExtraLib`
 * — same pattern as `TypeScriptIntelliSensePlugin` from packages/texteditor.
 *
 * The reason is critical for completions to actually work:
 *
 *   - `setExtraLibs` (and `addExtraLib` in some Monaco builds) RESTART the
 *     TypeScript web worker on every call. Each restart leaves the worker
 *     spinning up — busy reading typelibs and initialising. While that's in
 *     progress, completion queries time out silently and the user sees no
 *     IntelliSense. Repeated calls (e.g. on every Monaco dialog open) keep
 *     the worker perpetually catching up and IntelliSense never settles.
 *
 *   - `monaco.editor.createModel()` registers the file *incrementally* via
 *     the existing model-sync channel. No worker restart. The TypeScript
 *     service's module resolver also probes `monaco.editor.getModel(uri)`
 *     during file lookup, so a model at e.g. `file:///automate-api.d.ts`
 *     is exactly what TS picks up as an ambient global file.
 *
 * Idempotent: identical content is a no-op; changed content does an
 * in-place `setValue()` instead of replacing the model.
 */
function registerDtsModel(monaco: Monaco, uri: string, content: string): void {
  const u = monaco.Uri.parse(uri);
  const existing = monaco.editor.getModel(u);
  if (existing) {
    if (existing.getValue() !== content) {
      existing.setValue(content);
    }
    return;
  }
  // Language MUST be 'typescript' — JS worker doesn't honour ambient `.d.ts`
  // declarations the same way (Monaco's JS service is a thin wrapper around
  // the TS service and global ambients are only resolved through the latter's
  // model graph).
  monaco.editor.createModel(content, 'typescript', u);
}

/**
 * Register multiple `.d.ts` files at once. Kept under the historic
 * `mergeExtraLibs` name so call sites don't have to change, but the body is
 * the new createModel-based path described above.
 *
 * @param monaco   Monaco namespace from `@monaco-editor/react beforeMount`
 * @param newLibs  Libraries to register (filePath → content)
 */
function mergeExtraLibs(monaco: Monaco, newLibs: Map<string, string>): void {
  // Diagnostic — surfaces the active compiler options so we can verify
  // monacoWorkers.ts actually ran (it sets target=ES2020, allowJs, etc.).
  // Without those defaults, the TS service often falls back to ES3-ish
  // behaviour where completions silently no-op for modern code.
  try {
    const jsDefaults = monaco.languages.typescript.javascriptDefaults;
    const tsDefaults = monaco.languages.typescript.typescriptDefaults;
    // eslint-disable-next-line no-console
    console.log('[AutomateMonaco] compiler options — js:', jsDefaults.getCompilerOptions(),
      '| ts:', tsDefaults.getCompilerOptions());
  } catch (err) {
    console.warn('[AutomateMonaco] compiler options probe failed:', err);
  }

  for (const [filePath, content] of newLibs) {
    registerDtsModel(monaco, filePath, content);
    // eslint-disable-next-line no-console
    console.log(`[AutomateMonaco] createModel: ${filePath} (${content.length} bytes)`);
  }
}

/**
 * Register Automate API types in Monaco. Idempotent — safe to call from every
 * `beforeMount`; the underlying merge sees identical state and is cheap.
 *
 * Importantly this DOES NOT call `setCompilerOptions` or `setDiagnosticsOptions`
 * any more. monacoWorkers.ts already configures both `javascriptDefaults` and
 * `typescriptDefaults` with the full ES2020/NodeJs/allowJs/esModuleInterop
 * setup and turns on every mode feature (completionItems, hovers, signatureHelp,
 * …). Overwriting from here would strip those fields back to the minimal
 * `{target, allowNonTsExtensions, allowJs, checkJs}` set the previous code
 * wrote — which is exactly what was killing IntelliSense (the TS worker came
 * up without `moduleResolution`, completion provider couldn't initialise).
 *
 * If for some reason `monacoWorkers.ts` hasn't run yet (e.g. someone reuses
 * this in a page without that import), we defensively re-apply the mode
 * configuration so completions are always on.
 */
/**
 * Apply the common Monaco defaults that every in-Markdown script editor
 * (Automate Script, Plugin Script) needs:
 *   - Full mode configuration (completions, hovers, signature help, …) on
 *     both JS and TS defaults — defensive in case nothing else set them.
 *   - A tuned `diagnosticCodesToIgnore` list so we get genuine errors
 *     (typos in `api.*` etc.) but not TS-strict squiggles that fire on
 *     perfectly valid JS bodies (Cannot find name 'foo', implicit any, …).
 *
 * Exported so PluginScriptExtension can reuse the exact same setup without
 * having to duplicate the list of ignored diagnostic codes.
 */
export function applyScriptDefaults(monaco: Monaco): void {
  const fullModeCfg = {
    completionItems: true,
    hovers: true,
    documentSymbols: true,
    definitions: true,
    references: true,
    documentHighlights: true,
    rename: true,
    diagnostics: true,
    onTypeFormattingEdits: true,
    signatureHelp: true,
    codeActions: true,
    inlayHints: true,
  };
  try {
    monaco.languages.typescript.javascriptDefaults.setModeConfiguration(fullModeCfg);
    monaco.languages.typescript.typescriptDefaults.setModeConfiguration(fullModeCfg);
  } catch (err) {
    console.warn('[ScriptMonaco] setModeConfiguration failed:', err);
  }

  // The script editor uses `defaultLanguage="typescript"` so ambient `.d.ts`
  // declarations are visible. The script body is plain JS though, so we
  // silently ignore the most common TS-only errors that would otherwise
  // squiggle perfectly valid code:
  //   2304 — Cannot find name (user-defined globals not in our .d.ts)
  //   2552 — Cannot find name. Did you mean…
  //   7006 — Parameter implicitly has 'any' type
  //   7044 — Parameter implicitly has 'any' type from usage
  //   2580 — Cannot find name 'require'
  //   1108 — A 'return' statement can only be used within a function body
  //   1378 — Top-level 'await' (we don't actually use it but Monaco's strict
  //          target check trips here when the script is short)
  // We keep semantic+syntax validation ON for everything else so genuine bugs
  // (typos in `api.*` / `auth.*` etc.) still get flagged.
  try {
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2304, 2552, 7006, 7044, 2580, 1108, 1378],
    });
  } catch (err) {
    console.warn('[ScriptMonaco] setDiagnosticsOptions failed:', err);
  }
}

export function setupAutomateMonaco(monaco: Monaco): void {
  applyScriptDefaults(monaco);

  // file:// prefix is the conventional virtual URI for Monaco extra libs —
  // matches what TypeScriptIntelliSensePlugin uses, so the TS worker treats
  // them identically.
  mergeExtraLibs(monaco, new Map([
    ['file:///automate-api.d.ts', AUTOMATE_API_TYPES],
  ]));
}

/** Allow other setups (e.g. PluginScriptExtension) to share the merge logic. */
export { mergeExtraLibs };
