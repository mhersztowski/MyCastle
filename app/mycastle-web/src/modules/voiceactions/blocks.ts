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
 *  - aura_bell          — zagraj dzwonek [n] razy
 *  - aura_background_action — zgłoś akcję w tle i poczekaj na decyzję użytkownika
 *  - srv_*              — operacje backendu (packages/core/browser/server/api.ts) przez fasadę `Server`
 *  - aura_stop          — zakończ konwersację
 *
 * Generator produkuje JS wywołujący runtime `aura` (podgląd logiki).
 */

import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';
import { FieldVfsFile, FieldVfsJson, FieldShowComponent, registerVfsFields } from './fields';

const HUE_EVENT = 285;   // fiolet — aktywatory
const HUE_SPEAK = 200;   // niebieski — mowa
const HUE_LOGIC = 160;   // zielony — logika/wartości
const HUE_ACTION = 30;   // pomarańcz — akcje
const HUE_AGENT = 250;   // indygo — agent AI
const HUE_VFS = 45;      // złoto — pliki/VFS
const HUE_GLOBAL = 330;  // magenta — funkcje globalne
const HUE_WEB = 210;     // niebieski — sieć/Google
const HUE_COMPONENT = 100; // limonka — komponenty UI
const HUE_SERVER = 15;   // ceglasty — API backendu (Server.*)

// Nazwy funkcji globalnych (do dropdownu bloku wywołania) — aktualizowane przez edytor.
let globalNames: string[] = [];
export function setGlobalFunctionNames(names: string[]): void {
  globalNames = Array.from(new Set(names.filter(Boolean)));
}
function globalNameOptions(this: Blockly.FieldDropdown | void): [string, string][] {
  const opts: [string, string][] = globalNames.map(n => [n, n] as [string, string]);
  // Zachowaj zapisaną nazwę, nawet jeśli nie ma jej jeszcze na liście (unikaj resetu na headless).
  try {
    const cur = this && (this as Blockly.FieldDropdown).getValue?.() as string | null;
    if (cur && !globalNames.includes(cur)) opts.unshift([cur, cur]);
  } catch { /* pomiń */ }
  return opts.length ? opts : [['(brak funkcji)', '']];
}

/** Wyodrębnij nazwy funkcji globalnych z XML workspace „Global". */
export function extractGlobalFunctionNames(xml: string): string[] {
  if (!xml || !xml.trim()) return [];
  try {
    const dom = Blockly.utils.xml.textToDom(xml);
    const blocks = dom.querySelectorAll('block[type="aura_global_def"]');
    const names: string[] = [];
    blocks.forEach(b => {
      const f = b.querySelector(':scope > field[name="NAME"]');
      const n = (f?.textContent || '').trim();
      if (n) names.push(n);
    });
    return names;
  } catch {
    return [];
  }
}

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

  // Dzwonek sygnalizacyjny — dźwięk syntezowany w przeglądarce (bez pliku audio)
  Blockly.Blocks['aura_bell'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🔔 dzwonek')
        .appendField(new Blockly.FieldNumber(1, 1, 8, 1), 'TIMES')
        .appendField('raz(y)');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_ACTION);
      this.setTooltip('Gra dzwonek sygnalizacyjny i czeka, aż wybrzmi — dobre przed zapowiedzią.');
    },
  };

  // Akcja w tle — zgłoszenie czeka na „Uruchom"/„Odrzuć" w widoku „W tle"
  Blockly.Blocks['aura_background_action'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('LABEL').setCheck('String').appendField('🕓 akcja w tle');
      this.appendDummyInput()
        .appendField('zapisz decyzję w')
        .appendField(new Blockly.FieldVariable('decyzja'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_ACTION);
      this.setTooltip(
        'Zgłasza akcję na listę „W tle" (dzwonek + zapowiedź) i CZEKA, aż użytkownik '
        + 'kliknie Uruchom albo Odrzuć. Do zmiennej trafia "run" lub "cancel".',
      );
    },
  };

  // ── Serwer: operacje backendu (fasada `Server` → browser/server/api.ts) ────
  // Bloczki celowo nie mają parametru „połączenie" — fasada zestawia je sama
  // przy pierwszym użyciu, poświadczeniami zalogowanego użytkownika.

  Blockly.Blocks['srv_file_read'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('PATH').setCheck('String').appendField('📄 wczytaj plik');
      this.appendDummyInput().appendField('do').appendField(new Blockly.FieldVariable('tresc'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
      this.setTooltip('Odczyt pliku z serwera. Ścieżka względem katalogu użytkownika, np. drive/notatka.md');
    },
  };

  Blockly.Blocks['srv_file_write'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('PATH').setCheck('String').appendField('💾 zapisz plik');
      this.appendValueInput('DATA').setCheck('String').appendField('treść');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
      this.setTooltip('Zapis pliku na serwerze (nadpisuje).');
    },
  };

  Blockly.Blocks['srv_http_request'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('URL').setCheck('String').appendField('🌐 pobierz z adresu');
      this.appendDummyInput()
        .appendField('metodą')
        .appendField(new Blockly.FieldDropdown([['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT'], ['DELETE', 'DELETE']]), 'METHOD')
        .appendField('do')
        .appendField(new Blockly.FieldVariable('odpowiedz'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
      this.setTooltip('Żądanie HTTP wykonuje SERWER, więc omija ograniczenia CORS przeglądarki. Do zmiennej trafia ciało odpowiedzi.');
    },
  };

  Blockly.Blocks['srv_log'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('MSG').setCheck('String')
        .appendField('📝 log')
        .appendField(new Blockly.FieldDropdown([['info', 'info'], ['ostrzeżenie', 'warning'], ['błąd', 'error']]), 'LEVEL');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
      this.setTooltip('Wysyła komunikat na kanał logu (widget „IoT Log" na Pulpicie, plik log.txt).');
    },
  };

  Blockly.Blocks['srv_iot_devices'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('📡 lista urządzeń IoT do')
        .appendField(new Blockly.FieldVariable('urzadzenia'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
    },
  };

  Blockly.Blocks['srv_iot_command'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('DEVICE').setCheck('String').appendField('📡 urządzenie');
      this.appendValueInput('COMMAND').setCheck('String').appendField('komenda');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
      this.setTooltip('Wysyła komendę do urządzenia i czeka na potwierdzenie.');
    },
  };

  Blockly.Blocks['srv_iot_telemetry'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('DEVICE').setCheck('String').appendField('📈 telemetria urządzenia');
      this.appendValueInput('KEY').setCheck('String').appendField('metryka');
      this.appendDummyInput().appendField('do').appendField(new Blockly.FieldVariable('wartosc'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
    },
  };

  Blockly.Blocks['srv_mail_send'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('TO').setCheck('String').appendField('✉ wyślij wiadomość do');
      this.appendValueInput('TOPIC').setCheck('String').appendField('temat');
      this.appendValueInput('CONTENT').setCheck('String').appendField('treść');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
    },
  };

  Blockly.Blocks['srv_git'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('PATH').setCheck('String')
        .appendField('git')
        .appendField(new Blockly.FieldDropdown([['commit', 'commit'], ['pull', 'pull'], ['push', 'push']]), 'OP')
        .appendField('w repo');
      this.appendValueInput('MSG').setCheck('String').appendField('opis (dla commit)');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_SERVER);
    },
  };

  // Zakończ konwersację — z tekstem wyświetlanym na stronie (bez mowy)
  Blockly.Blocks['aura_stop'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('⏹ zakończ konwersację, pokaż tekst')
        .appendField(new Blockly.FieldTextInput('Koniec konwersacji'), 'MSG');
      this.setPreviousStatement(true, null);
      this.setColour(HUE_ACTION);
      this.setTooltip('Kończy konwersację i wyświetla tekst na stronie (bez odczytu głosem).');
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

  // Wygoogluj — zwraca listę adresów URL dla zapytania (Serper.dev = wyniki Google)
  Blockly.Blocks['aura_google_search'] = {
    init(this: Blockly.Block) {
      this.appendValueInput('QUERY').setCheck('String').appendField('🔎 Wygoogluj');
      this.setOutput(true, 'Array');
      this.setColour(HUE_WEB);
      this.setTooltip('Wyszukaj w internecie (Serper.dev = wyniki Google) i zwróć listę adresów URL. Wymaga klucza API w Edytorze Konwersacji.');
    },
  };

  // Wyświetl komponent (osadzony span lub popup przez przycisk) — z oknem wyboru
  Blockly.Blocks['aura_show_component'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🧩 Wyświetl komponent')
        .appendField(new FieldShowComponent('{}'), 'CONFIG');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_COMPONENT);
      this.setTooltip('Wyświetla komponent (wbudowany lub z Programming/Components) w czacie Aury — osadzony lub jako popup.');
    },
  };

  // Definicja funkcji globalnej (tylko w workspace „Global")
  Blockly.Blocks['aura_global_def'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🌐 Funkcja globalna')
        .appendField(new Blockly.FieldTextInput('mojaFunkcja'), 'NAME');
      this.appendDummyInput()
        .appendField('argumenty (po przecinku)')
        .appendField(new Blockly.FieldTextInput(''), 'PARAMS');
      this.appendStatementInput('DO').appendField('zrób');
      this.appendValueInput('RESULT').appendField('zwróć (opcjonalnie)');
      this.setColour(HUE_GLOBAL);
      this.setTooltip('Zdefiniuj funkcję globalną (dostępną we wszystkich akcjach). Argumenty rozdziel przecinkami.');
    },
  };

  // Wywołanie funkcji globalnej (instrukcja) — z wyborem await/async
  Blockly.Blocks['aura_call_global'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🌐 Wywołaj funkcję')
        .appendField(new Blockly.FieldDropdown(globalNameOptions), 'NAME')
        .appendField('czekaj (await)')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'AWAIT');
      this.appendValueInput('ARGS').setCheck('Array').appendField('argumenty (lista)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(HUE_GLOBAL);
      this.setTooltip('Wywołaj funkcję globalną po nazwie. „czekaj (await)" — czy poczekać na jej zakończenie.');
    },
  };

  // Wywołanie funkcji globalnej (wartość — zwraca wynik) — z wyborem await/async
  Blockly.Blocks['aura_call_global_return'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('🌐 Wynik funkcji')
        .appendField(new Blockly.FieldDropdown(globalNameOptions), 'NAME')
        .appendField('czekaj (await)')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'AWAIT');
      this.appendValueInput('ARGS').setCheck('Array').appendField('argumenty (lista)');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setColour(HUE_GLOBAL);
      this.setTooltip('Wywołaj funkcję globalną po nazwie i użyj jej wyniku. Bez „await" zwraca obietnicę (Promise).');
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
    return `await Aura.onActivator(${JSON.stringify(phrase)}, async () => {\n${body}});\n`;
  };

  g.forBlock['aura_say'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `await Aura.say(${text});\n`;
  };

  g.forBlock['aura_say_var'] = function (block) {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `await Aura.say(${varName});\n`;
  };

  g.forBlock['aura_ask'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await Aura.ask(${text});\n`;
  };

  g.forBlock['aura_last_utterance'] = function () {
    return ['await Aura.lastUtterance()', Order.AWAIT];
  };

  g.forBlock['aura_utterance_contains'] = function (block) {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return [`await Aura.utteranceContains(${text})`, Order.AWAIT];
  };

  g.forBlock['aura_call_action'] = function (block) {
    const id = block.getFieldValue('ACTION_ID') || '';
    return `await Aura.callAction(${JSON.stringify(id)});\n`;
  };

  g.forBlock['aura_wait'] = function (block) {
    const s = block.getFieldValue('SECONDS') || 0;
    return `await Aura.wait(${s});\n`;
  };

  g.forBlock['aura_bell'] = function (block) {
    const times = block.getFieldValue('TIMES') || 1;
    return `await Aura.bell(${times});\n`;
  };

  g.forBlock['aura_background_action'] = function (block) {
    const label = g.valueToCode(block, 'LABEL', Order.NONE) || "''";
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    // Do zmiennej trafia samo 'run'/'cancel' — w bloczkach porównuje się je tekstem.
    return `${varName} = (await Aura.backgroundAction(${label})).response;\n`;
  };

  // ── Serwer ────────────────────────────────────────────────────────────────

  g.forBlock['srv_file_read'] = function (block) {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await Server.fileRead(${path});\n`;
  };

  g.forBlock['srv_file_write'] = function (block) {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    const data = g.valueToCode(block, 'DATA', Order.NONE) || "''";
    return `await Server.fileWrite(${path}, ${data});\n`;
  };

  g.forBlock['srv_http_request'] = function (block) {
    const url = g.valueToCode(block, 'URL', Order.NONE) || "''";
    const method = block.getFieldValue('METHOD') || 'GET';
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await Server.httpJson(${url}, { method: ${JSON.stringify(method)} });\n`;
  };

  g.forBlock['srv_log'] = function (block) {
    const msg = g.valueToCode(block, 'MSG', Order.NONE) || "''";
    const level = block.getFieldValue('LEVEL') || 'info';
    const fn = level === 'error' ? 'logError' : level === 'warning' ? 'logWarning' : 'logInfo';
    return `await Server.${fn}(${msg});\n`;
  };

  g.forBlock['srv_iot_devices'] = function (block) {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await Server.iotDevices();\n`;
  };

  g.forBlock['srv_iot_command'] = function (block) {
    const device = g.valueToCode(block, 'DEVICE', Order.NONE) || "''";
    const command = g.valueToCode(block, 'COMMAND', Order.NONE) || "''";
    return `await Server.iotCommand(${device}, ${command});\n`;
  };

  g.forBlock['srv_iot_telemetry'] = function (block) {
    const device = g.valueToCode(block, 'DEVICE', Order.NONE) || "''";
    const key = g.valueToCode(block, 'KEY', Order.NONE) || "''";
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `${varName} = await Server.iotTelemetry(${device}, ${key});\n`;
  };

  g.forBlock['srv_mail_send'] = function (block) {
    const to = g.valueToCode(block, 'TO', Order.NONE) || "''";
    const topic = g.valueToCode(block, 'TOPIC', Order.NONE) || "''";
    const content = g.valueToCode(block, 'CONTENT', Order.NONE) || "''";
    return `await Server.mailSend(${to}, ${topic}, ${content});\n`;
  };

  g.forBlock['srv_git'] = function (block) {
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    const msg = g.valueToCode(block, 'MSG', Order.NONE) || "''";
    const op = block.getFieldValue('OP') || 'commit';
    // `commit` bierze opis, pozostałe operacje go ignorują.
    return op === 'commit'
      ? `await Server.gitCommit(${path}, ${msg});\n`
      : `await Server.git${op === 'pull' ? 'Pull' : 'Push'}(${path});\n`;
  };

  g.forBlock['aura_stop'] = function (block) {
    const msg = block.getFieldValue('MSG') || '';
    return `await Aura.endConversation(${JSON.stringify(msg)});\nreturn;\n`;
  };

  g.forBlock['aura_listen'] = function (block) {
    const s = block.getFieldValue('SECONDS') || 0;
    return [`await Aura.listen(${s})`, Order.AWAIT];
  };

  g.forBlock['aura_agent_new_chat'] = function (block) {
    const id = block.getFieldValue('ID') || '';
    return `await Aura.agentNewChat(${JSON.stringify(id)});\n`;
  };

  g.forBlock['aura_agent_send_prompt'] = function (block) {
    const prompt = g.valueToCode(block, 'PROMPT', Order.NONE) || "''";
    return `await Aura.agentSendPrompt(${prompt});\n`;
  };

  g.forBlock['aura_agent_send_prompt_var'] = function (block) {
    const varName = g.getVariableName(block.getFieldValue('VAR'));
    return `await Aura.agentSendPrompt(${varName});\n`;
  };

  g.forBlock['aura_agent_response'] = function () {
    return ['await Aura.agentResponse()', Order.AWAIT];
  };

  g.forBlock['aura_vfs_read_file'] = function (block) {
    const path = block.getFieldValue('PATH') || '';
    return [`await Aura.vfsReadFile(${JSON.stringify(path)})`, Order.AWAIT];
  };

  g.forBlock['aura_vfs_read_json'] = function (block) {
    const cfg = block.getFieldValue('QUERY') || '{}';
    // przekaż jako string (bezpieczniej niż wstawianie surowego JSON jako literału)
    return [`await Aura.vfsReadJson(${JSON.stringify(cfg)})`, Order.AWAIT];
  };

  g.forBlock['aura_google_search'] = function (block) {
    const query = g.valueToCode(block, 'QUERY', Order.NONE) || "''";
    return [`await Aura.googleSearch(${query})`, Order.AWAIT];
  };

  g.forBlock['aura_show_component'] = function (block) {
    const cfg = block.getFieldValue('CONFIG') || '{}';
    // przekaż jako string (parsowany w Aura.showComponent)
    return `await Aura.showComponent(${JSON.stringify(cfg)});\n`;
  };

  g.forBlock['aura_global_def'] = function (block) {
    const name = block.getFieldValue('NAME') || 'fn';
    const params = String(block.getFieldValue('PARAMS') || '').split(',').map((s: string) => s.trim()).filter(Boolean).join(', ');
    const body = g.statementToCode(block, 'DO');
    const ret = g.valueToCode(block, 'RESULT', Order.NONE);
    return `await Aura.registerGlobal(${JSON.stringify(name)}, async (${params}) => {\n${body}${ret ? `  return ${ret};\n` : ''}});\n`;
  };

  g.forBlock['aura_call_global'] = function (block) {
    const name = block.getFieldValue('NAME') || '';
    const args = g.valueToCode(block, 'ARGS', Order.NONE);
    const doAwait = block.getFieldValue('AWAIT') !== 'FALSE';
    const call = `Aura.callGlobal(${JSON.stringify(name)}${args ? `, ...(${args} || [])` : ''})`;
    return `${doAwait ? 'await ' : ''}${call};\n`;
  };

  g.forBlock['aura_call_global_return'] = function (block) {
    const name = block.getFieldValue('NAME') || '';
    const args = g.valueToCode(block, 'ARGS', Order.NONE);
    const doAwait = block.getFieldValue('AWAIT') !== 'FALSE';
    const call = `Aura.callGlobal(${JSON.stringify(name)}${args ? `, ...(${args} || [])` : ''})`;
    return doAwait ? [`await ${call}`, Order.AWAIT] : [call, Order.FUNCTION_CALL];
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
        { kind: 'block', type: 'aura_bell' },
        {
          kind: 'block', type: 'aura_background_action',
          inputs: { LABEL: { shadow: { type: 'text', fields: { TEXT: 'Wyślij raport' } } } },
        },
        { kind: 'block', type: 'aura_stop' },
        { kind: 'block', type: 'aura_listen' },
        { kind: 'block', type: 'aura_agent_new_chat' },
        { kind: 'block', type: 'aura_agent_send_prompt', inputs: { PROMPT: { shadow: { type: 'text', fields: { TEXT: 'Podsumuj rozmowę' } } } } },
        { kind: 'block', type: 'aura_agent_send_prompt_var' },
        { kind: 'block', type: 'aura_agent_response' },
      ],
    },
    {
      kind: 'category', name: 'Serwer', colour: String(HUE_SERVER),
      contents: [
        { kind: 'block', type: 'srv_file_read', inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'drive/notatka.md' } } } } },
        {
          kind: 'block', type: 'srv_file_write',
          inputs: {
            PATH: { shadow: { type: 'text', fields: { TEXT: 'drive/notatka.md' } } },
            DATA: { shadow: { type: 'text', fields: { TEXT: 'treść' } } },
          },
        },
        { kind: 'block', type: 'srv_http_request', inputs: { URL: { shadow: { type: 'text', fields: { TEXT: 'https://api.example.com/dane' } } } } },
        { kind: 'block', type: 'srv_log', inputs: { MSG: { shadow: { type: 'text', fields: { TEXT: 'Akcja wykonana' } } } } },
        { kind: 'block', type: 'srv_iot_devices' },
        {
          kind: 'block', type: 'srv_iot_command',
          inputs: {
            DEVICE: { shadow: { type: 'text', fields: { TEXT: 'lampa' } } },
            COMMAND: { shadow: { type: 'text', fields: { TEXT: 'on' } } },
          },
        },
        {
          kind: 'block', type: 'srv_iot_telemetry',
          inputs: {
            DEVICE: { shadow: { type: 'text', fields: { TEXT: 'czujnik' } } },
            KEY: { shadow: { type: 'text', fields: { TEXT: 'temperature' } } },
          },
        },
        {
          kind: 'block', type: 'srv_mail_send',
          inputs: {
            TO: { shadow: { type: 'text', fields: { TEXT: 'ktos@example.com' } } },
            TOPIC: { shadow: { type: 'text', fields: { TEXT: 'Aura' } } },
            CONTENT: { shadow: { type: 'text', fields: { TEXT: 'Wiadomość z akcji' } } },
          },
        },
        {
          kind: 'block', type: 'srv_git',
          inputs: {
            PATH: { shadow: { type: 'text', fields: { TEXT: 'drive/git/repo' } } },
            MSG: { shadow: { type: 'text', fields: { TEXT: 'zmiany z Aury' } } },
          },
        },
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
      kind: 'category', name: 'Sieć / Google', colour: String(HUE_WEB),
      contents: [
        { kind: 'block', type: 'aura_google_search', inputs: { QUERY: { shadow: { type: 'text', fields: { TEXT: 'pogoda Warszawa' } } } } },
      ],
    },
    {
      kind: 'category', name: 'Komponenty', colour: String(HUE_COMPONENT),
      contents: [
        { kind: 'block', type: 'aura_show_component' },
      ],
    },
    {
      kind: 'category', name: 'Funkcje globalne', colour: String(HUE_GLOBAL),
      contents: [
        { kind: 'block', type: 'aura_call_global' },
        { kind: 'block', type: 'aura_call_global_return' },
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
    {
      kind: 'category', name: 'Listy', categorystyle: 'list_category',
      contents: [
        { kind: 'block', type: 'lists_create_with' },
        { kind: 'block', type: 'lists_repeat', inputs: { NUM: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } },
        { kind: 'block', type: 'lists_length' },
        { kind: 'block', type: 'lists_isEmpty' },
        { kind: 'block', type: 'lists_indexOf' },
        { kind: 'block', type: 'lists_getIndex' },
        { kind: 'block', type: 'lists_setIndex' },
      ],
    },
    { kind: 'sep' },
    { kind: 'category', name: 'Zmienne', categorystyle: 'variable_category', custom: 'VARIABLE' },
    { kind: 'category', name: 'Funkcje', categorystyle: 'procedure_category', custom: 'PROCEDURE' },
  ],
};

/**
 * Kategorie specyficzne dla Aury (bez standardowych: Tekst, Logika, Pętle…),
 * gotowe do wstrzyknięcia w cudzy toolbox — używa ich Edytor Automate otwierany
 * z Edytora Konwersacji. Nazwy dostają przedrostek, żeby w palecie było widać,
 * skąd bloczek pochodzi i czym różni się od zwykłej automatyzacji.
 *
 * Wywołanie rejestruje też definicje bloczków i generatory (obie operacje są
 * idempotentne), więc host nie musi o tym pamiętać.
 */
const AURA_OWN_CATEGORIES = ['Konwersacja', 'Serwer', 'VFS / Pliki', 'Sieć / Google', 'Komponenty', 'Funkcje globalne'];

export function auraToolboxCategories(prefix = 'Aura'): Blockly.utils.toolbox.ToolboxItemInfo[] {
  defineAuraConversationBlocks();
  registerAuraGenerators();
  registerVfsFields();
  return (AURA_TOOLBOX.contents as Array<{ kind: string; name?: string }>)
    .filter(c => c.kind === 'category' && !!c.name && AURA_OWN_CATEGORIES.includes(c.name))
    .map(c => ({ ...c, name: `${prefix}: ${c.name}` })) as Blockly.utils.toolbox.ToolboxItemInfo[];
}

/**
 * Toolbox workspace „Global" — definicje funkcji globalnych + wszystkie kategorie
 * (funkcje mogą korzystać z mowy, agenta, VFS itd.).
 */
export const AURA_GLOBAL_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: 'Definicje globalne', colour: String(HUE_GLOBAL),
      contents: [
        { kind: 'block', type: 'aura_global_def' },
      ],
    },
    ...AURA_TOOLBOX.contents,
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
