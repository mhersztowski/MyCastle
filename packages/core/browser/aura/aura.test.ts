/**
 * Testy logiki Aury. Cała wartość wydzielenia jej z komponentu Reacta jest
 * właśnie tutaj: kroki konwersacji, obsługa błędów wyszukiwarki i kontekst
 * agenta dają się sprawdzić bez przeglądarki, mikrofonu i modelu AI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Aura, type AuraChatMessage, type AuraHost } from './aura';

interface FakeHost extends AuraHost {
  assistant: string[];
  user: string[];
  spoken: string[];
  answers: string[];
  actions: string[];
  debugs: string[];
  aiReplies: string[];
  lastAiMessages: AuraChatMessage[];
}

function makeHost(overrides: Partial<AuraHost> = {}): FakeHost {
  let lastUtterance = '';
  const host: FakeHost = {
    assistant: [],
    user: [],
    spoken: [],
    answers: [],
    actions: [],
    debugs: [],
    aiReplies: [],
    lastAiMessages: [],

    appendAssistant: (t) => { host.assistant.push(t); },
    appendUser: (t) => { host.user.push(t); },
    speak: async (t) => { host.spoken.push(t); },
    capture: async () => host.answers.shift() ?? '',
    setThinking: () => {},
    showComponent: () => {},
    runAction: async (id) => { host.actions.push(id); },
    askAi: async (messages) => {
      host.lastAiMessages = [...messages];
      return host.aiReplies.shift() ?? '';
    },
    readVfsFile: async (path) => `treść:${path}`,
    queryVfsJson: async (query) => ({ echo: query.path }),
    getLastUtterance: () => lastUtterance,
    setLastUtterance: (t) => { lastUtterance = t; },
    getSerperKey: () => '',
    debug: (m) => { host.debugs.push(m); },
    ...overrides,
  };
  return host;
}

let host: FakeHost;

beforeEach(() => {
  Aura.reset();
  host = makeHost();
  Aura.setHost(host);
  Aura.beginRun();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('konwersacja', () => {
  it('say wypisuje i wypowiada tekst', async () => {
    await Aura.say('Cześć');
    expect(host.assistant).toEqual(['Cześć']);
    expect(host.spoken).toEqual(['Cześć']);
  });

  it('say nie odczytuje pustego tekstu', async () => {
    await Aura.say('   ');
    expect(host.assistant).toEqual(['   ']);
    expect(host.spoken).toEqual([]);
  });

  it('ask zwraca odpowiedź i zapamiętuje ją jako ostatnią wypowiedź', async () => {
    host.answers.push('Marcin');
    const answer = await Aura.ask('Jak masz na imię?');
    expect(answer).toBe('Marcin');
    expect(host.user).toEqual(['Marcin']);
    expect(await Aura.lastUtterance()).toBe('Marcin');
  });

  it('listen bez odpowiedzi informuje o braku', async () => {
    const heard = await Aura.listen(5);
    expect(heard).toBe('');
    expect(host.assistant[0]).toContain('do 5s');
    expect(host.assistant[1]).toBe('(nie usłyszałem odpowiedzi)');
  });

  it('utteranceContains ignoruje wielkość liter', async () => {
    host.answers.push('Włącz Światło W Salonie');
    await Aura.ask('?');
    expect(await Aura.utteranceContains('światło')).toBe(true);
    expect(await Aura.utteranceContains('radio')).toBe(false);
  });

  it('callAction przekazuje ostatnią wypowiedź', async () => {
    host.answers.push('zapal lampę');
    await Aura.ask('?');
    await Aura.callAction('lampa');
    expect(host.actions).toEqual(['lampa']);
  });

  it('callAction z pustym identyfikatorem nic nie robi', async () => {
    await Aura.callAction('');
    expect(host.actions).toEqual([]);
  });

  it('endConversation pomija pusty komunikat', async () => {
    await Aura.endConversation('   ');
    await Aura.endConversation('Do usłyszenia');
    expect(host.assistant).toEqual(['Do usłyszenia']);
  });

  it('onActivator zbiera handlery bieżącego przebiegu', async () => {
    const fn = async () => {};
    await Aura.onActivator('hej', fn);
    expect(Aura.pendingHandlers()).toEqual([fn]);
    Aura.beginRun();
    expect(Aura.pendingHandlers()).toEqual([]);
  });
});

describe('komponenty', () => {
  it('przyjmuje konfigurację jako JSON-string (z bloczka) i jako obiekt (ze skryptu)', async () => {
    const shown: unknown[] = [];
    Aura.setHost(makeHost({ showComponent: (cfg) => { shown.push(cfg); } }));

    await Aura.showComponent('{"id":"zegar"}');
    await Aura.showComponent({ id: 'pogoda', mode: 'popup' });
    await Aura.showComponent('to nie jest JSON');
    await Aura.showComponent({ mode: 'inline' });   // brak id

    expect(shown).toEqual([{ id: 'zegar' }, { id: 'pogoda', mode: 'popup' }]);
  });
});

describe('agent AI', () => {
  it('trzyma kontekst rozmowy między promptami', async () => {
    host.aiReplies.push('Cześć!', 'Nadal ja.');
    await Aura.agentSendPrompt('Kto tam?');
    await Aura.agentSendPrompt('A teraz?');

    expect(host.lastAiMessages.map(m => m.content))
      .toEqual(['Kto tam?', 'Cześć!', 'A teraz?']);
    expect(await Aura.agentResponse()).toBe('Nadal ja.');
  });

  it('agentNewChat zaczyna kontekst od zera', async () => {
    host.aiReplies.push('pierwsza', 'druga');
    await Aura.agentSendPrompt('jeden');
    await Aura.agentNewChat('inny');
    await Aura.agentSendPrompt('dwa');
    expect(host.lastAiMessages.map(m => m.content)).toEqual(['dwa']);
  });
});

describe('VFS / Pliki', () => {
  it('czyta plik i przycina puste ścieżki', async () => {
    expect(await Aura.vfsReadFile('notatki/plan.md')).toBe('treść:notatki/plan.md');
    expect(await Aura.vfsReadFile('')).toBe('');
  });

  it('vfsReadJson przyjmuje string i obiekt, odrzuca zapytanie bez ścieżki', async () => {
    expect(await Aura.vfsReadJson('{"path":"dane.json"}')).toEqual({ echo: 'dane.json' });
    expect(await Aura.vfsReadJson({ path: 'inne.json' })).toEqual({ echo: 'inne.json' });
    expect(await Aura.vfsReadJson('{}')).toBeNull();
    expect(await Aura.vfsReadJson('nie-json')).toBeNull();
  });
});

describe('googleSearch', () => {
  it('bez klucza mówi, gdzie go wpisać', async () => {
    const urls = await Aura.googleSearch('pogoda');
    expect(urls).toEqual([]);
    expect(host.assistant[0]).toContain('Serper.dev');
  });

  it('zwraca adresy z odpowiedzi backendu', async () => {
    Aura.setHost(makeHost({ getSerperKey: () => 'key-123' }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ urls: ['https://a.example', 'https://b.example'] }),
    })));
    expect(await Aura.googleSearch('pogoda')).toEqual(['https://a.example', 'https://b.example']);
  });

  it('błąd HTTP nie wywraca skryptu — zwraca pustą listę i komunikat', async () => {
    const h = makeHost({ getSerperKey: () => 'key-123' });
    Aura.setHost(h);
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => 'not found',
    })));
    expect(await Aura.googleSearch('pogoda')).toEqual([]);
    expect(h.assistant[0]).toContain('404');
  });

  it('awaria sieci jest raportowana, nie rzucana', async () => {
    const h = makeHost({ getSerperKey: () => 'key-123' });
    Aura.setHost(h);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await Aura.googleSearch('pogoda')).toEqual([]);
    expect(h.assistant[0]).toContain('offline');
  });

  it('puste zapytanie nie rusza sieci', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await Aura.googleSearch('   ')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('funkcje globalne', () => {
  it('rejestruje i woła funkcję globalną', async () => {
    await Aura.registerGlobal('suma', async (a, b) => Number(a) + Number(b));
    expect(await Aura.callGlobal('suma', 2, 3)).toBe(5);
  });

  it('brak funkcji nie przerywa skryptu', async () => {
    expect(await Aura.callGlobal('nieistnieje')).toBeUndefined();
    expect(host.debugs.some(d => d.includes('nieistnieje'))).toBe(true);
  });

  it('beginRun czyści funkcje globalne poprzedniego przebiegu', async () => {
    await Aura.registerGlobal('x', async () => 1);
    Aura.beginRun();
    expect(await Aura.callGlobal('x')).toBeUndefined();
  });
});

describe('zgodność ze starym API', () => {
  it('obiekt aura deleguje do klasy', async () => {
    const { aura } = await import('./aura');
    host.answers.push('tak');
    await aura.say('Test');
    expect(await aura.ask('Pytanie?')).toBe('tak');
    expect(host.assistant).toEqual(['Test', 'Pytanie?']);
  });
});
