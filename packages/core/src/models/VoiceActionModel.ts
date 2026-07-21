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

/** Wariant językowy akcji głosowej — logika konwersacji w Blockly. */
export interface VoiceActionVariant {
  id: string;
  voiceActionId: string;
  language: string;
  /** Serializacja workspace edytora Blockly (XML). */
  blocklyXml: string;
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
}

export const DEFAULT_VOICE_ACTION_COLLECTION: VoiceActionCollection = {
  type: 'voice_actions',
  actions: [],
  variants: [],
  wakeWords: [],
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
  return { id, voiceActionId, language, blocklyXml };
}
