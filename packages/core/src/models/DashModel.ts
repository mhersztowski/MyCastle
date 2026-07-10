// DashModel — model danych sceny edytora dash (*.dash.json) z Drive.
//
// Definicje bloczków (nodes) sceny: DashObject (generic / group / qt-widget),
// Var, FunctionCall, ClassObj, GetProp, SetProp + połączenia (FcEdge) i cała
// scena (DashScene). Framework-agnostic (bez React) — współdzielone modele.
//
// Uwaga: NodeData (dane propa węzła React Flow, z callbackami) NIE należą tu —
// to typy warstwy widoku i pozostają w komponencie edytora.

/** Wartość pola/property bloczka (rekurencyjny JSON). */
export type DashValue =
  | string
  | number
  | boolean
  | null
  | DashValue[]
  | { [k: string]: DashValue };

/** Typ pola encji (mapowany na widget edycji w Properties). */
export type QFieldType =
  | 'QIcon' | 'QImage' | 'QString' | 'QNumber' | 'QArray' | 'QMap'
  | 'QObjectRef' | 'QChildsObjectRef' | 'QFilePath';

/** Wartość pola typu QObjectRef — referencja do obiektu w innym pliku. */
export interface QObjectRefValue {
  filePath: string;
  objectPath: string;
  [k: string]: DashValue;
}

/** Definicja pola encji (nazwa + typ tekstowy). */
export interface FieldDef {
  name: string;
  type: string;
}

/** Bazowy transform — każdy DashObject go ma (jak geometry QWidget w Qt). */
export interface DashTransform {
  x: number;
  y: number;
  rot: number;
  scale: number;
  width: number;
  height: number;
}

/** Główny bloczek sceny: encja / grupa / widget Qt. */
export interface DashObject {
  id: string;
  className: string;
  objectName: string;
  transform: DashTransform;
  customFields?: FieldDef[];
  properties: Record<string, DashValue>;
  showPins?: boolean;
  showDetails?: boolean;
  showHeader?: boolean;
  zIndex?: number;
  /** 'group' renderuje kontener przesuwający dzieci; 'qt-widget' to widget MinisQt
   *  (core/browser/qt) — `className` trzyma typ widgetu (np. 'QPushButton'). */
  kind?: 'group' | 'qt-widget' | 'shape';
  /** Id grupy/rodzica (dzieci śledzone przez parentId). */
  parentId?: string;
  /** Połączenia sygnałów qt (nazwa sygnału → handler z data source). */
  signalHandlers?: Record<string, { sourceId: string; symbolPath: string }>;
}

/** Płaska pozycja funkcji z data source (do wyboru jako handler sygnału). */
export interface HandlerFn {
  sourceId: string;
  sourceName: string;
  fileType: DataSourceEntry['fileType'];
  symbolPath: string;
  params: string;      // surowy tekst parametrów (z typami dla TS)
  paramCount: number;
  lang?: 'python';
}

/** Używane tylko przy parsowaniu starych scen (x/y bez transform). */
export type LegacyDashObject = Omit<DashObject, 'transform'> & { transform?: DashTransform; x?: number; y?: number };

/** Źródło danych (plik z funkcjami/klasami/JSON) podpięte do sceny. */
export interface DataSourceEntry {
  id: string;
  name: string;
  filePath: string;
  fileType: 'json' | 'js' | 'python' | 'ts' | 'pdf' | 'djvu' | 'dash';
}

/** Bloczek wywołania funkcji z data source. */
export interface FunctionCallObject {
  id: string;
  sourceId: string;       // DataSourceEntry.id
  symbolPath: string;     // np. "ClassName.methodName" lub "functionName"
  paramNames: string[];
  argOverrides: Record<number, string>;  // ręczne wartości argów, gdy brak podpiętego Var
  result: string | null;  // JSON-serialized ostatni wynik
  error: string | null;
  x: number;
  y: number;
  pinsFlipped?: boolean;  // true: piny argów po prawej, return po prawej
  /** 'python' → uruchom funkcję przez Pyodide (source to .py). */
  lang?: 'python';
  /** Id grupy, do której bloczek należy (grupowanie w drzewie SCENE). */
  parentId?: string;
}

/** Bloczek zmiennej (Var). */
export interface VarObject {
  id: string;
  varName: string;
  varValue: string | null;  // JSON-serialized wartość
  x: number;
  y: number;
  pinsFlipped?: boolean;  // true: oba piny po prawej
  parentId?: string;
}

/** Połączenie (krawędź) między bloczkami. */
export interface FcEdge {
  id: string;
  source: string;
  sourceHandle: string;   // 'return' na FunctionCall, 'value_out' na Var, 'get_X'/'instance_out' na ClassObj
  target: string;
  targetHandle: string;   // 'arg_N'/'this' na FunctionCall, 'value_in' na Var, 'set_X'/'instance_in' na ClassObj
}

/** Bloczek instancji klasy (ClassObj). */
export interface ClassObjItem {
  id: string;
  sourceId: string;
  className: string;
  fieldNames: string[];       // uporządkowana lista pól/getterów
  instanceValue: string | null; // JSON-serialized bieżąca instancja
  x: number;
  y: number;
  pinsFlipped?: boolean;      // true: piny SET po prawej, GET po lewej
  parentId?: string;
}

/** Bloczek odczytu property (GetProp). */
export interface GetPropObject {
  id: string;
  propNameOverride: string;   // inline fallback, gdy propname_in nie podpięty
  result: string | null;
  error: string | null;
  x: number;
  y: number;
  parentId?: string;
}

/** Bloczek zapisu property (SetProp). */
export interface SetPropObject {
  id: string;
  propNameOverride: string;
  result: string | null;
  error: string | null;
  x: number;
  y: number;
  parentId?: string;
}

/** Wbudowane biblioteki sandboxu (ujednolicone z automatyzacją Markdown). */
export interface DashLibs {
  three?: boolean;
  lit?: boolean;
}

/** Konfiguracja środowiska Python (Pyodide) sceny. Strukturalnie zgodna z
 *  PyodideConfig z warstwy web (mycastle-web) — core nie zależy od web. */
export interface DashPyodideConfig {
  enabled: boolean;
  packages: string[];
  pypi: string[];
}

/** Ustawienia WIDOKU canvas (siatka / początek 0,0 / linijki / siatka wyświetlacza).
 *  Zapisywane w scenie (*.dash.json) → utrwalane w backend VFS razem z sceną. */
export interface DashViewSettings {
  /** Siatka pomocnicza. */
  grid?: boolean;
  /** Rozstaw siatki w jednostkach sceny (px). */
  gridSpacing?: number;
  /** Krzyżyk w początku układu (0,0). */
  origin?: boolean;
  /** Linijki (miarki) na górnej/lewej krawędzi. */
  rulers?: boolean;
  /** Siatka wyświetlacza — grubsze prostokąty o rzeczywistym rozmiarze ekranu. */
  display?: {
    enabled?: boolean;
    /** Rzeczywista szerokość wyświetlacza w jednostkach sceny (np. 800). */
    width?: number;
    /** Rzeczywista wysokość wyświetlacza (np. 480). */
    height?: number;
  };
}

/** Cała scena edytora dash (*.dash.json). */
export interface DashScene {
  type: 'dash-scene';
  /** 1 = transformy globalne (legacy); 2 = transformy lokalne względem rodzica (parentId). */
  version: 1 | 2;
  umlProjectPath?: string;
  umlSources?: Array<{ id: string; path: string }>;
  dataSources?: DataSourceEntry[];
  functionCalls?: FunctionCallObject[];
  vars?: VarObject[];
  classObjs?: ClassObjItem[];
  getProps?: GetPropObject[];
  setProps?: SetPropObject[];
  fcEdges?: FcEdge[];
  objects: DashObject[];
  /** Wbudowane biblioteki włączone dla sandboxu tej dashboard (Three.js / Lit). */
  libs?: DashLibs;
  /** Środowisko Python (Pyodide) — uruchamiane równolegle w Web Workerze, gdy włączone. */
  pyodide?: DashPyodideConfig;
  /** Ustawienia widoku canvas (siatka / 0,0 / linijki / siatka wyświetlacza). */
  view?: DashViewSettings;
}

/** Członek klasy UML (pole/metoda) — używane przy imporcie UML do sceny. */
export interface UmlMember {
  id: string;
  kind: 'field' | 'method';
  text: string;
}

/** Definicja klasy UML (nazwa + rodzaj + pola) używana do tworzenia encji. */
export interface UmlClassDef {
  name: string;
  kind: 'class' | 'abstract' | 'interface' | 'enum';
  fields: FieldDef[];
}

/** Źródło UML (plik `.umlproj.json`) z listą klas. */
export interface UmlSource {
  id: string;
  path: string;
  name: string;
  classes: UmlClassDef[];
}
