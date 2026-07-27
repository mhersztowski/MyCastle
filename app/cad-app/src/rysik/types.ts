/**
 * Rysik — typy rdzenia.
 *
 * Zasada nadrzędna: blok jest danymi, nie kodem. Wszystko poniżej opisuje
 * dane bloku i deklarację (manifest), z której generowany jest panel,
 * walidacja, serializacja i wartości domyślne — jedno źródło prawdy.
 */

/** Prymitywy, jakie może przyjąć właściwość literalna. */
export type Primitive = number | string | boolean;

/** Wartość YAML zachowywana bez interpretacji (extras: camera, dane nieznane manifestowi). */
export type YamlValue =
  | Primitive
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

/**
 * Wartość właściwości w trzech postaciach. To rdzeń środowiska: ten sam
 * parametr może być liczbą, wiązaniem do zmiennej dokumentu albo wyrażeniem.
 */
export type ParamValue =
  | { src: 'literal'; value: Primitive }
  | { src: 'ref'; name: string }
  | { src: 'expr'; code: string; deps: string[] };

export type ParamSource = ParamValue['src'];

/** Warunek widoczności pola — porównania na wartościach innych pól. */
export type VisibleCond =
  | { eq: Primitive }
  | { ne: Primitive }
  | { gt: number }
  | { lt: number }
  | { in: Primitive[] };

export type VisibleIf = Record<string, VisibleCond>;

export type PropKind =
  | 'number'
  | 'quantity'
  | 'enum'
  | 'bool'
  | 'string'
  | 'color'
  | 'resource';

export type WidgetKind =
  | 'slider'
  | 'spin'
  | 'dial'
  | 'select'
  | 'radio'
  | 'switch'
  | 'text'
  | 'textarea'
  | 'color'
  | 'file';

interface PropSpecBase {
  label: string;
  /** Grupa w panelu; pola bez grupy trafiają do „Ogólne”. */
  group?: string;
  widget?: WidgetKind;
  /** Krótki opis pod polem i w dokumentacji bloku. */
  doc?: string;
  visibleIf?: VisibleIf;
  /** Dozwolone źródła wartości. Domyślnie wszystkie trzy. */
  sources?: ParamSource[];
}

export interface NumberPropSpec extends PropSpecBase {
  kind: 'number' | 'quantity';
  default: number;
  unit?: string;
  range?: [number, number];
  step?: number;
  /** Zawijanie zakresu (azymut 359 → 1). Tylko dla `quantity`. */
  wrap?: boolean;
  /** Liczba miejsc po przecinku przy zapisie — kwantyzacja floatów. */
  precision?: number;
  /** Wartość używana przy renderze statycznym (PDF), gdy pole jest ref/expr. */
  pdfDefault?: number;
}

export interface EnumPropSpec extends PropSpecBase {
  kind: 'enum';
  options: string[];
  default: string;
  pdfDefault?: string;
}

export interface BoolPropSpec extends PropSpecBase {
  kind: 'bool';
  default: boolean;
  pdfDefault?: boolean;
}

export interface StringPropSpec extends PropSpecBase {
  kind: 'string' | 'color';
  default: string;
  pdfDefault?: string;
}

export interface ResourcePropSpec extends PropSpecBase {
  kind: 'resource';
  /** Akceptowane typy MIME — wyłącznie ścieżki względne, nigdy base64. */
  accept?: string[];
  default?: string;
}

export type PropSpec =
  | NumberPropSpec
  | EnumPropSpec
  | BoolPropSpec
  | StringPropSpec
  | ResourcePropSpec;

/** Deklaracja kolekcji podelementów (markery, adnotacje) — panel dziecka z tego samego generatora. */
export interface ChildSpec {
  /** Nazwa typu dziecka używana w hitTest: `marker:id`. */
  kind: string;
  label: string;
  /** Manifest właściwości pojedynczego dziecka. */
  props: Record<string, PropSpec>;
}

export interface EventSpec {
  payload: string;
  throttle?: number;
}

export interface BlockManifest {
  type: string;
  version: number;
  title: string;
  /** Ikona MUI (nazwa) — czysto prezentacyjne. */
  icon?: string;
  doc?: string;
  props: Record<string, PropSpec>;
  /** Kolekcje podelementów zapisywane w ciele bloku (klucz YAML → spec). */
  children?: Record<string, ChildSpec>;
  events?: Record<string, EventSpec>;
  /** Typy dzieci, które scena potrafi zaznaczyć. */
  selectable?: string[];
}

/** Pojedynczy podelement bloku (marker, adnotacja). */
export interface ChildNode {
  /** Identyfikator stabilny w dokumencie — zapisywany jako pole `id`. */
  id: string;
  kind: string;
  props: Record<string, ParamValue>;
  /** Klucze spoza manifestu dziecka — przechodzą przez round-trip nietknięte. */
  extras: [string, YamlValue][];
}

/**
 * Blok dokumentu. `extras` trzyma klucze, których manifest nie zna
 * (np. `camera`) — przechodzą przez round-trip nietknięte.
 */
export interface BlockNode {
  /** Uid sesyjny — nie jest zapisywany do pliku. */
  uid: string;
  type: string;
  /** `#| label:` — spina blok z cross-refami Quarto (@fig-...). */
  label?: string;
  /** `#| fig-cap:` */
  caption?: string;
  /** Pozostałe opcje `#|` w kolejności napotkania. */
  options: [string, string][];
  props: Record<string, ParamValue>;
  children: Record<string, ChildNode[]>;
  extras: [string, YamlValue][];
}

/** Zmienna dokumentu — wspólny punkt dla suwaka w tekście i parametru sceny. */
export interface DocVar {
  name: string;
  label?: string;
  value: Primitive;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Fragment dokumentu: surowy markdown, blok Rysika albo miejsce, w którym
 * zapisany jest blok zmiennych dokumentu (`vars` żyją w `RysikDoc.vars`,
 * segment trzyma tylko pozycję w pliku).
 */
export type DocSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'block'; block: BlockNode }
  | { kind: 'vars' };

export interface RysikDoc {
  /** Nagłówek YAML dokumentu (bez ograniczników `---`), pusty gdy brak. */
  frontmatter: string;
  segments: DocSegment[];
  vars: DocVar[];
}

/** Operacja odwracalna — jednostka historii. */
export interface Op {
  path: (string | number)[];
  from: unknown;
  to: unknown;
}

export interface HistoryEntry {
  label: string;
  ops: Op[];
  ts: number;
}
