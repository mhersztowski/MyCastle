/**
 * Plik `.automate` — dokładnie ten sam format, co blok ```automate``` w
 * edytorze markdown, tylko trzymany osobno w drive użytkownika (skrypty akcji
 * Aury lądują w `drive/automate/aura/`, pozostałe gdziekolwiek).
 *
 * Dzięki temu skrypt akcji można otworzyć w Drive jak każdą inną notatkę,
 * a blok w markdownie i logika akcji nie mają dwóch różnych reprezentacji.
 * Nagłówek fence'a niesie ustawienia:
 *
 *   ```automate:blockId:autorun:html:t=a,b:h=360:u=p.umlproj.json:s=sciezka
 *
 * Wartości domyślne nie są zapisywane — plik zostaje krótki, a diff czytelny.
 */

export interface AuraScriptSettings {
  blockId: string;
  autorun: boolean;
  viewMode: 'code' | 'html';
  tags: string[];
  /** `null` = auto-rozmiar (token `h=` pomijany). */
  windowHeight: number | null;
  umlProjects: string[];
  scenePath: string;
}

export interface AuraScriptFile {
  /** Markdown przed blokiem (opis akcji) — przechodzi przez round-trip. */
  before?: string;
  /** Markdown po bloku. */
  after?: string;
  code: string;
  settings: AuraScriptSettings;
}

export const EMPTY_AURA_SCRIPT: AuraScriptFile = {
  before: '',
  after: '',
  code: '',
  settings: {
    blockId: '',
    autorun: false,
    viewMode: 'code',
    tags: [],
    windowHeight: null,
    umlProjects: [],
    scenePath: '',
  },
};

const decode = (s: string): string => {
  try { return decodeURIComponent(s); } catch { return s; }
};

const splitEncodedList = (raw: string): string[] =>
  raw.split(',').map(t => decode(t.trim())).filter(Boolean);

/** Parametry fence'a → ustawienia. Kolejność tokenów jest nieistotna. */
export function parseFenceParams(params: string): AuraScriptSettings {
  const parts = (params.trim() || '').split(':');
  const token = (prefix: string): string | undefined =>
    parts.find(p => p.startsWith(prefix))?.slice(prefix.length);

  const heightRaw = token('h=');
  const height = heightRaw ? Number(heightRaw) : NaN;

  return {
    blockId: parts[0] ?? '',
    autorun: parts.includes('autorun'),
    viewMode: parts.includes('html') ? 'html' : 'code',
    tags: splitEncodedList(token('t=') ?? ''),
    windowHeight: Number.isFinite(height) && height > 0 ? height : null,
    umlProjects: splitEncodedList(token('u=') ?? ''),
    scenePath: decode(token('s=') ?? ''),
  };
}

/** Ustawienia → parametry fence'a (bez wiodącego `automate`). */
export function buildFenceParams(settings: AuraScriptSettings): string {
  const parts: string[] = ['automate', settings.blockId || ''];
  if (settings.autorun) parts.push('autorun');
  if (settings.viewMode === 'html') parts.push('html');
  if (settings.tags.length > 0) parts.push(`t=${settings.tags.map(encodeURIComponent).join(',')}`);
  if (settings.windowHeight && settings.windowHeight > 0) parts.push(`h=${Math.round(settings.windowHeight)}`);
  if (settings.umlProjects.length > 0) parts.push(`u=${settings.umlProjects.map(encodeURIComponent).join(',')}`);
  if (settings.scenePath) parts.push(`s=${encodeURIComponent(settings.scenePath)}`);
  // Puste ogony obcinamy, żeby brak ustawień dawał gołe ```automate.
  while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts.join(':');
}

const FENCE_OPEN = /^(`{3,})automate(?::([^\n]*))?[ \t]*$/;

export function parseAuraScriptFile(text: string): AuraScriptFile {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE_OPEN.exec(lines[i]);
    if (!open) continue;

    let end = i + 1;
    while (end < lines.length && lines[end].trimEnd() !== open[1]) end++;

    return {
      before: lines.slice(0, i).join('\n'),
      after: lines.slice(Math.min(end + 1, lines.length)).join('\n'),
      code: lines.slice(i + 1, end).join('\n').replace(/\s+$/, ''),
      settings: parseFenceParams(open[2] ?? ''),
    };
  }

  // Plik bez bloku automate — traktujemy całość jako opis, kod pusty.
  return { ...EMPTY_AURA_SCRIPT, before: text, settings: { ...EMPTY_AURA_SCRIPT.settings } };
}

export function buildAuraScriptFile(file: AuraScriptFile): string {
  // Ogranicznik dłuższy niż najdłuższy ciąg backticków w kodzie — inaczej
  // skrypt zawierający ```js zamknąłby własny blok w połowie.
  const longest = Math.max(0, ...[...file.code.matchAll(/`{3,}/g)].map(m => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));

  const parts: string[] = [];
  const before = (file.before ?? '').replace(/\s+$/, '');
  if (before) parts.push(before, '');
  parts.push(`${fence}${buildFenceParams(file.settings)}`, file.code, fence);
  const after = (file.after ?? '').replace(/^\s+/, '').replace(/\s+$/, '');
  if (after) parts.push('', after);
  return `${parts.join('\n')}\n`;
}

/** Startowa treść pliku dla nowo utworzonego skryptu akcji. */
export function starterAuraScript(actionName: string, language: string): AuraScriptFile {
  return {
    before: `# ${actionName} (${language})\n\nLogika akcji głosowej. Blok poniżej jest tym samym skryptem automatyzacji,\nktóry znasz z edytora markdown — obok klasy \`Aura\` dostępne są \`api\` i \`display\`.`,
    after: '',
    code: [
      "import { Aura } from 'mycastle/packages/core/browser/aura/aura';",
      '',
      '// Konwersacja: say / ask / listen / callAction / endConversation',
      '// VFS: vfsReadFile / vfsReadJson · Sieć: googleSearch · Komponenty: showComponent',
      'await Aura.say("Cześć, tu Aura.");',
    ].join('\n'),
    settings: { ...EMPTY_AURA_SCRIPT.settings },
  };
}

// ── Nazwy neutralne (plik .automate nie należy tylko do Aury) ────────────────

export type AutomateFile = AuraScriptFile;
export type AutomateFileSettings = AuraScriptSettings;
export const EMPTY_AUTOMATE_FILE = EMPTY_AURA_SCRIPT;
export const parseAutomateFile = parseAuraScriptFile;
export const buildAutomateFile = buildAuraScriptFile;

/** Startowa treść nowego pliku `.automate` tworzonego z bloku w notatce. */
export function starterAutomateFile(name: string): AutomateFile {
  return {
    before: `# ${name}`,
    after: '',
    code: [
      "import { api, display } from 'mycastle/packages/core/browser/api/api';",
      '',
      'api.log.info("Witaj!");',
      'display.text("Wynik: OK");',
    ].join('\n'),
    settings: { ...EMPTY_AURA_SCRIPT.settings },
  };
}
