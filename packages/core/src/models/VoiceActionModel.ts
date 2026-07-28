// VoiceActionModel — modele „akcji głosowych" (voice actions) dla asystenta Aura.
//
// VoiceAction opisuje rodzaj/typ konwersacji rozpoznawany po frazach-aktywatorach
// (aktywator to sekwencja słów, nie jedno słowo). VoiceActionVariant to wariant
// językowy z logiką konwersacji zdefiniowaną graficznie w edytorze Blockly (XML).
//
// Framework-agnostic (bez React) — współdzielony model.

/** Pojedyncza akcja głosowa — typ/rodzaj konwersacji. */
export interface VoiceAction {
  type: 'voice_action';
  id: string;
  name: string;
  tag: string;
  /** Dokładne frazy aktywujące (sekwencja słów, np. "włącz światło w salonie"). */
  activatorStrings: string[];
  /** Frazy podobne / rozmyte — dopasowanie przybliżone do aktywacji. */
  activatorsSimilarStringsArray: string[];
  /** Domyślny język akcji (np. "pl"). */
  language: string;
}

/**
 * Sposób definiowania logiki wariantu:
 *  - `blockly` — bloczki w edytorze konwersacji (pole `blocklyXml`),
 *  - `automate` — skrypt automatyzacji w pliku Drive (pole `scriptPath`),
 *    zapisany w tym samym formacie co blok ```automate``` w edytorze markdown.
 */
export type VoiceActionLogicMode = 'blockly' | 'automate';

/** Wariant językowy akcji głosowej — logika w Blockly albo w skrypcie automatyzacji. */
export interface VoiceActionVariant {
  id: string;
  voiceActionId: string;
  language: string;
  /** Serializacja workspace edytora Blockly (XML). */
  blocklyXml: string;
  /** Brak wartości = `blockly` (zgodność wsteczna ze starymi konfiguracjami). */
  mode?: VoiceActionLogicMode;
  /**
   * Ścieżka pliku ze skryptem względem katalogu drive użytkownika,
   * np. `automate/aura/powitanie-pl.automate`. Używana gdy `mode === 'automate'`.
   */
  scriptPath?: string;
}

/** Słowo aktywacyjne (wake word) dla danego języka — konfigurowane w Edytorze Konwersacji. */
export interface WakeWord {
  language: string;
  phrase: string;
}

/** Zbiór akcji głosowych, ich wariantów oraz słów aktywacyjnych (plik data/voice_actions.json). */
export interface VoiceActionCollection {
  type: 'voice_actions';
  actions: VoiceAction[];
  variants: VoiceActionVariant[];
  /** Słowa aktywacyjne per język (np. pl="hej aura", en="hey aura"). */
  wakeWords?: WakeWord[];
  /** Globalny workspace Blockly (definicje funkcji/procedur globalnych) — XML. */
  globalXml?: string;
  /**
   * Konfiguracja wyszukiwania internetowego (bloczek „Wygoogluj") — Serper.dev (wyniki Google).
   * `serperKey` = klucz API Serper.dev. `apiKey`/`cx` pozostają dla zgodności wstecznej (nieużywane).
   */
  googleSearch?: {
    apiKey?: string;
    cx?: string;
    serperKey?: string;
  };
  /** Przypominanie o akcjach w tle (`Aura.backgroundAction`) czekających na decyzję. */
  backgroundReminder?: AuraBackgroundReminder;
}

/** Ustawienia przypomnień o zgłoszeniach z listy „W tle". */
export interface AuraBackgroundReminder {
  enabled: boolean;
  /** Co ile minut Aura ma przypominać (1–600). */
  minutes: number;
}

export const DEFAULT_BACKGROUND_REMINDER: AuraBackgroundReminder = { enabled: true, minutes: 5 };

export const DEFAULT_VOICE_ACTION_COLLECTION: VoiceActionCollection = {
  type: 'voice_actions',
  actions: [],
  variants: [],
  wakeWords: [],
  globalXml: '',
  backgroundReminder: { ...DEFAULT_BACKGROUND_REMINDER },
};

/** Fabryka akcji głosowej (id dostarczany przez wywołującego — brak zależności od crypto). */
export function createVoiceAction(id: string, partial?: Partial<VoiceAction>): VoiceAction {
  return {
    type: 'voice_action',
    id,
    name: partial?.name ?? 'Nowa akcja',
    tag: partial?.tag ?? '',
    activatorStrings: partial?.activatorStrings ?? [],
    activatorsSimilarStringsArray: partial?.activatorsSimilarStringsArray ?? [],
    language: partial?.language ?? 'pl',
  };
}

/** Fabryka wariantu językowego akcji głosowej. */
export function createVoiceActionVariant(
  id: string,
  voiceActionId: string,
  language: string,
  blocklyXml = '',
): VoiceActionVariant {
  return { id, voiceActionId, language, blocklyXml, mode: 'blockly' };
}

/** Tryb logiki wariantu z domyślną wartością dla starych zapisów bez pola `mode`. */
export function variantLogicMode(variant: Pick<VoiceActionVariant, 'mode'>): VoiceActionLogicMode {
  return variant.mode === 'automate' ? 'automate' : 'blockly';
}

/** Katalog skryptów Aury względem drive użytkownika. */
export const AURA_SCRIPT_DIR = 'automate/aura';

/** Rozszerzenie plików skryptów Automate (wspólne dla Aury i bloków w notatkach). */
export const AUTOMATE_EXT = '.automate';

/**
 * Domyślna ścieżka pliku skryptu dla wariantu: `automate/aura/{akcja}-{język}.automate`.
 * Nazwa akcji jest sprowadzana do bezpiecznego sluga, żeby ścieżka nie zależała
 * od polskich znaków ani spacji wpisanych przez użytkownika.
 */
export function auraScriptPath(actionName: string, language: string, fallbackId: string): string {
  const slug = actionName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // znaki diakrytyczne po NFD
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const base = slug || fallbackId;
  return `${AURA_SCRIPT_DIR}/${base}-${language}${AUTOMATE_EXT}`;
}
