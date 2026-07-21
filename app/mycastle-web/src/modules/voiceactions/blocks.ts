/**
 * Definicje bloczków Blockly i generatora JS dla Edytora Konwersacji (Aura).
 *
 * Bloki pozwalają budować logikę konwersacji graficznie:
 *  - aura_on_activator  — hat: "Gdy usłyszysz sekwencję [fraza]" (aktywator = sekwencja słów)
 *  - aura_say           — "Odpowiedz [tekst]" (treść odpowiedzi / TTS)
 *  - aura_ask           — "Zapytaj [tekst] i zapisz w [zmienna]"
 *  - aura_last_utterance— ostatnia wypowiedź użytkownika (String)
 *  - aura_utterance_contains — czy wypowiedź zawiera [tekst] (Boolean)
 *  - aura_call_action   — uruchom inną akcję po id
 *  - aura_wait          — poczekaj [n] s
 *  - aura_stop          — zakończ konwersację
 *
 * Generator produkuje JS wywołujący runtime `aura` (podgląd logiki).
 */

import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { FieldVfsFile, FieldVfsJson, registerVfsFields } from './fields';

const HUE_EVENT = 285;   // fiolet — aktywatory
const HUE_SPEAK = 200;   // niebieski — mowa
const HUE_LOGIC = 160;   // zielony — logika/wartości
const HUE_ACTION = 30;   // pomarańcz — akcje
const HUE_AGENT = 250;   // indygo — agent AI
const HUE_VFS = 45;      // złoto — pliki/VFS

let blocksDefined = false;
let generatorsRegistered = false;

export function defineAuraConversationBlocks(): void {
  if (blocksDefined) return;
  blocksDefined = true;
  registerVfsFields();

  // Hat: aktywator konwersacji (sekwencja słów)
  Blockly.Blocks['aura_on_activator'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🎙 Gdy usłyszysz sekwencję')
        .appendField(new Blockly.FieldTextInput('włącz światło'), 'PHRASE');
      this.appendStatementInput('DO').appendField('zrób');
      this.setColour(HUE_EVENT);
      this.setTooltip('Aktywator: sekwencja słów uruchamiająca konwersację (nie pojedyncze słowo).');
    },
  };

  // Odpowiedz [tekst]
  Blockly.Blocks['aura_say'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('TEXT').setCheck('String').appendField('🔊 Odpowiedz');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SPEAK);
      this.setTooltip('Wypowiedz treść odpowiedzi (TTS).');
    },
  };

  // Odpowiedz wartością zmiennej
  Blockly.Blocks['aura_say_var'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🔊 Odpowiedz zmienną')
        .appendField(new Blockly.FieldVariable('odpowiedz'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SPEAK);
      this.setTooltip('Wypowiedz treść zapisaną w zmiennej (TTS).');
    },
  };

  // Zapytaj [tekst] i zapisz w [zmienna]
  Blockly.Blocks['aura_ask'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('TEXT').setCheck('String').appendField('❓ Zapytaj');
      this.appendDummyInput()
        .appendField('i zapisz odpowiedź w')
        .appendField(new Blockly.FieldVariable('odpowiedz'), 'VAR');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SPEAK);
      this.setTooltip('Zadaj pytanie i zapisz wypowiedź użytkownika w zmiennej.');
    },
  };

  // Ostatnia wypowiedź (String)
  Blockly.Blocks['aura_last_utterance'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('🗣 ostatnia wypowiedź');
      this.setOutput(true, 'String');
      this.setColour(HUE_LOGIC);
      this.setTooltip('Tekst ostatniej wypowiedzi użytkownika.');
    },
  };

  // Wypowiedź zawiera [tekst] (Boolean)
  Blockly.Blocks['aura_utterance_contains'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('TEXT').setCheck('String').appendField('wypowiedź zawiera');
      this.setOutput(true, 'Boolean');
      this.setColour(HUE_LOGIC);
      this.setTooltip('Czy ostatnia wypowiedź zawiera dany tekst?');
    },
  };

  // Uruchom akcję [id]
  Blockly.Blocks['aura_call_action'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('▶ uruchom akcję')
        .appendField(new Blockly.FieldTextInput('id-akcji'), 'ACTION_ID');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_ACTION);
      this.setTooltip('Uruchom inną akcję głosową po jej id.');
    },
  };

  // Poczekaj [n] s
  Blockly.Blocks['aura_wait'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('⏱ poczekaj')
        .appendField(new Blockly.FieldNumber(1, 0, 3600, 0.5), 'SECONDS')
        .appendField('s');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_ACTION);
    },
  };

  // Zakończ konwersację
  Blockly.Blocks['aura_stop'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('⏹ zakończ konwersację');
      this.setPreviousStatement(true, null);
      this.setColour(HUE_ACTION);
    },
  };

  // Nasłuchuj z limitem czasu (zwraca rozpoznany tekst)
  Blockly.Blocks['aura_listen'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🎧 Nasłuchuj (timeout')
        .appendField(new Blockly.FieldNumber(5, 0, 600, 1), 'SECONDS')
        .appendField('s)');
      this.setOutput(true, 'String');
      this.setColour(HUE_LOGIC);
      this.setTooltip('Nasłuchuj wypowiedzi użytkownika przez zadany czas; zwraca rozpoznany tekst (pusty po upływie timeoutu).');
    },
  };

  // Nowy czat agenta AI [id]
  Blockly.Blocks['aura_agent_new_chat'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🤖 Nowy czat agenta AI')
        .appendField(new Blockly.FieldTextInput('chat1'), 'ID');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_AGENT);
      this.setTooltip('Rozpocznij nowy kontekst rozmowy z agentem AI (identyfikowany po id).');
    },
  };

  // Wyślij prompt do agenta AI
  Blockly.Blocks['aura_agent_send_prompt'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('PROMPT').setCheck('String').appendField('🤖 Wyślij prompt do agenta AI');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_AGENT);
      this.setTooltip('Wyślij prompt do agenta AI. Odpowiedź zapisze się w „Odpowiedź agenta AI".');
    },
  };

  // Wyślij prompt do agenta AI z wartości zmiennej
  Blockly.Blocks['aura_agent_send_prompt_var'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🤖 Wyślij prompt do agenta AI (zmienna')
        .appendField(new Blockly.FieldVariable('pytanie'), 'VAR')
        .appendField(')');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_AGENT);
      this.setTooltip('Wyślij do agenta AI treść zapisaną w zmiennej. Odpowiedź zapisze się w „Odpowiedź agenta AI".');
    },
  };

  // Odpowiedź agenta AI (wartość)
  Blockly.Blocks['aura_agent_response'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('💬 Odpowiedź agenta AI');
      this.setOutput(true, 'String');
      this.setColour(HUE_AGENT);
      this.setTooltip('Ostatnia odpowiedź agenta AI.');
    },
  };

  // Wczytaj plik z VFS (zwraca treść pliku) — z oknem wyboru pliku
  Blockly.Blocks['aura_vfs_read_file'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('📂 Wczytaj plik z VFS')
        .appendField(new FieldVfsFile(''), 'PATH');
      this.setOutput(true, 'String');
      this.setColour(HUE_VFS);
      this.setTooltip('Otwiera okno wyboru pliku z VFS i zwraca jego treść (tekst).');
    },
  };

  // Wczytaj JSON z VFS (plik + ścieżka wewnątrz JSON + filtry) — zwraca wartość/tablicę
  Blockly.Blocks['aura_vfs_read_json'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🗂 Wczytaj JSON z VFS')
        .appendField(new FieldVfsJson('{}'), 'QUERY');
      this.setOutput(true, 'Array');
      this.setColour(HUE_VFS);
      this.setTooltip('Wybierz plik JSON, ścieżkę wewnątrz niego (okrojenie) i filtry (np. ma atrybut, zawiera tekst, jest liczbą…).');
    },
  };
}

export function registerAuraGenerators(): void {
  if (generatorsRegistered) return;
  generatorsRegistered = true;
  const g = javascriptGenerator;

  g.forBlock['aura_on_activator'] = function (block) {
    const phrase = block.getFieldValue('PHRASE') || '';
    const body = g.statementToCode(block, 'DO');
    return `aura.onActivator(${JSON.stringify(phrase)}, async () => {\n${body}});\n`;
  };

  g.forBlock['aura_say'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `await aura.say(${text});\n`;
  };

  g.forBlock['aura_say_var'] = function (block) {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `await aura.say(${varName});\n`;
  };

  g.forBlock['aura_ask'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await aura.ask(${text});\n`;
  };

  g.forBlock['aura_last_utterance'] = function () {
    return ['aura.lastUtterance()', Order.FUNCTION_CALL];
  };

  g.forBlock['aura_utterance_contains'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`aura.utteranceContains(${text})`, Order.FUNCTION_CALL];
  };

  g.forBlock['aura_call_action'] = function (block) {
    const id = block.getFieldValue('ACTION_ID') || '';
    return `await aura.callAction(${JSON.stringify(id)});\n`;
  };

  g.forBlock['aura_wait'] = function (block) {
    const s = block.getFieldValue('SECONDS') || 0;
    return `await aura.wait(${s});\n`;
  };

  g.forBlock['aura_stop'] = function () {
    return 'return;\n';
  };

  g.forBlock['aura_listen'] = function (block) {
    const s = block.getFieldValue('SECONDS') || 0;
    return [`await aura.listen(${s})`, Order.AWAIT];
  };

  g.forBlock['aura_agent_new_chat'] = function (block) {
    const id = block.getFieldValue('ID') || '';
    return `await aura.agentNewChat(${JSON.stringify(id)});\n`;
  };

  g.forBlock['aura_agent_send_prompt'] = function (block) {
    const prompt = g.valueToCode(block, 'PROMPT', Order.NONE) || "''";
    return `await aura.agentSendPrompt(${prompt});\n`;
  };

  g.forBlock['aura_agent_send_prompt_var'] = function (block) {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `await aura.agentSendPrompt(${varName});\n`;
  };

  g.forBlock['aura_agent_response'] = function () {
    return ['aura.agentResponse()', Order.FUNCTION_CALL];
  };

  g.forBlock['aura_vfs_read_file'] = function (block) {
    const path = block.getFieldValue('PATH') || '';
    return [`await aura.vfsReadFile(${JSON.stringify(path)})`, Order.AWAIT];
  };

  g.forBlock['aura_vfs_read_json'] = function (block) {
    const cfg = block.getFieldValue('QUERY') || '{}';
    // cfg to poprawny JSON → wstaw jako literał obiektu argumentu
    return [`await aura.vfsReadJson(${cfg})`, Order.AWAIT];
  };
}

/** Toolbox edytora konwersacji: kategoria „Konwersacja" + Text/Logic/Loops + Zmienne/Funkcje. */
export const AURA_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Konwersacja', colour: String(HUE_EVENT),
      contents: [
        { kind: 'block', type: 'aura_on_activator' },
        { kind: 'block', type: 'aura_say', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Cześć!' } } } } },
        { kind: 'block', type: 'aura_say_var' },
        { kind: 'block', type: 'aura_ask', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Co mam zrobić?' } } } } },
        { kind: 'block', type: 'aura_last_utterance' },
        { kind: 'block', type: 'aura_utterance_contains', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'tak' } } } } },
        { kind: 'block', type: 'aura_call_action' },
        { kind: 'block', type: 'aura_wait' },
        { kind: 'block', type: 'aura_stop' },
        { kind: 'block', type: 'aura_listen' },
        { kind: 'block', type: 'aura_agent_new_chat' },
        { kind: 'block', type: 'aura_agent_send_prompt', inputs: { PROMPT: { shadow: { type: 'text', fields: { TEXT: 'Podsumuj rozmowę' } } } } },
        { kind: 'block', type: 'aura_agent_send_prompt_var' },
        { kind: 'block', type: 'aura_agent_response' },
      ],
    },
    {
      kind: 'category', name: 'VFS / Pliki', colour: String(HUE_VFS),
      contents: [
        { kind: 'block', type: 'aura_vfs_read_file' },
        { kind: 'block', type: 'aura_vfs_read_json' },
      ],
    },
    {
      kind: 'category', name: 'Tekst', categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
        { kind: 'block', type: 'text_changeCase' },
      ],
    },
    {
      kind: 'category', name: 'Logika', categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
      ],
    },
    {
      kind: 'category', name: 'Pętle', categorystyle: 'loop_category',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } },
        { kind: 'block', type: 'controls_whileUntil' },
      ],
    },
    {
      kind: 'category', name: 'Matematyka', categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
        { kind: 'block', type: 'math_arithmetic' },
      ],
    },
    { kind: 'sep' },
    { kind: 'category', name: 'Zmienne', categorystyle: 'variable_category', custom: 'VARIABLE' },
    { kind: 'category', name: 'Funkcje', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
  ],
};

/** Wygeneruj podgląd kodu JS z workspace. */
export function generateConversationCode(ws: Blockly.Workspace): string {
  try {
    return javascriptGenerator.workspaceToCode(ws);
  } catch {
    return '';
  }
}

/**
 * Wygeneruj kod JS z zapisanego XML (headless — bez renderu).
 * Używane w runtime Aury do wykonania logiki konwersacji.
 */
export function codeFromXml(xml: string): string {
  if (!xml || !xml.trim()) return '';
  defineAuraConversationBlocks();
  registerAuraGenerators();
  const ws = new Blockly.Workspace();
  try {
    const dom = Blockly.utils.xml.textToDom(xml);
    Blockly.Xml.domToWorkspace(dom, ws);
    return javascriptGenerator.workspaceToCode(ws);
  } catch {
    return '';
  } finally {
    ws.dispose();
  }
}
