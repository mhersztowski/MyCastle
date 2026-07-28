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

describe('dzwonek', () => {
  /** Podstawiony Web Audio — sprawdzamy, że logika steruje nim poprawnie. */
  function fakeAudio() {
    const started: { freq: number; at: number; stop: number }[] = [];
    let currentTime = 0;
    const gainNode = () => ({
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    });
    const ctx = {
      state: 'running' as string,
      currentTime,
      destination: {},
      resume: vi.fn(async () => { ctx.state = 'running'; }),
      createGain: gainNode,
      createOscillator: () => {
        const osc = {
          type: 'sine',
          frequency: { value: 0, setValueAtTime: (v: number) => { osc.frequency.value = v; } },
          connect: () => {},
          disconnect: () => {},
          start: (at: number) => { started.push({ freq: osc.frequency.value, at, stop: 0 }); },
          stop: (at: number) => { if (started.length) started[started.length - 1].stop = at; },
          onended: null as null | (() => void),
        };
        return osc;
      },
      close: vi.fn(async () => {}),
    };
    return { ctx, started, setTime: (t: number) => { currentTime = t; ctx.currentTime = t; } };
  }

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    Aura.resetAudio();
  });

  it('woła prymityw hosta, gdy ten go dostarcza', async () => {
    const playBell = vi.fn(async () => {});
    const host = makeHost({ playBell });
    Aura.setHost(host);

    await Aura.bell(3);

    expect(playBell).toHaveBeenCalledTimes(1);
    expect(playBell).toHaveBeenCalledWith(expect.objectContaining({ times: 3 }));
  });

  it('bez hosta i bez Web Audio nie wywraca skryptu', async () => {
    Aura.setHost(makeHost());
    await expect(Aura.bell()).resolves.toBeUndefined();
  });

  it('gra zadaną liczbę uderzeń przez Web Audio', async () => {
    const { ctx, started } = fakeAudio();
    (globalThis as Record<string, unknown>).AudioContext = function () { return ctx; };
    Aura.setHost(makeHost());

    await Aura.bell({ times: 2, frequency: 700, duration: 0.01 });

    // Każde uderzenie to dwa oscylatory: ton podstawowy i składowa dzwonu.
    expect(started.length).toBe(4);
    expect(started[0].freq).toBe(700);
    expect(started[1].freq).toBeGreaterThan(700);
  });

  it('wznawia zawieszony kontekst (polityka autoplay)', async () => {
    const { ctx } = fakeAudio();
    ctx.state = 'suspended';
    (globalThis as Record<string, unknown>).AudioContext = function () { return ctx; };
    Aura.setHost(makeHost());

    await Aura.bell({ duration: 0.01 });

    expect(ctx.resume).toHaveBeenCalled();
  });

  it('liczbę uderzeń trzyma w rozsądnych granicach', async () => {
    const { ctx, started } = fakeAudio();
    (globalThis as Record<string, unknown>).AudioContext = function () { return ctx; };
    Aura.setHost(makeHost());

    await Aura.bell({ times: 99, duration: 0.01 });

    expect(started.length).toBeLessThanOrEqual(2 * 8);
  });
});

describe('akcje w tle', () => {
  /** Wpis trafia na listę natychmiast, ale dzwonek i zapowiedź to kilka mikrozadań. */
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).AudioContext;
    Aura.resetAudio();
  });

  it('zgłasza akcję, sygnalizuje ją i czeka na decyzję użytkownika', async () => {
    const pending = Aura.backgroundAction('Wyślij raport');
    // Zgłoszenie jest widoczne natychmiast — UI ma co pokazać, zanim ktoś kliknie.
    const [action] = Aura.backgroundActions();
    expect(action.label).toBe('Wyślij raport');

    await flush();
    expect(host.spoken).toContain('Nowa Akcja w tle');

    Aura.resolveBackgroundAction(action.id, 'run');
    await expect(pending).resolves.toMatchObject({ response: 'run', label: 'Wyślij raport' });
    // Po decyzji wpis znika z listy.
    expect(Aura.backgroundActions()).toHaveLength(0);
  });

  it('odrzucenie zwraca response "cancel"', async () => {
    const pending = Aura.backgroundAction('Skasuj kopie');
    Aura.resolveBackgroundAction(Aura.backgroundActions()[0].id, 'cancel');
    await expect(pending).resolves.toMatchObject({ response: 'cancel' });
  });

  it('powiadamia obserwatorów o zmianach listy (dla UI)', async () => {
    const seen: number[] = [];
    const unsubscribe = Aura.onBackgroundChange(() => seen.push(Aura.backgroundActions().length));

    const pending = Aura.backgroundAction('Zadanie');
    Aura.resolveBackgroundAction(Aura.backgroundActions()[0].id, 'run');
    await pending;

    expect(seen).toEqual([1, 0]);
    unsubscribe();
    void Aura.backgroundAction('Kolejne');
    expect(seen).toEqual([1, 0]);   // po wypisaniu już nie dostajemy powiadomień
  });

  it('kilka akcji czeka niezależnie', async () => {
    const a = Aura.backgroundAction('Pierwsza');
    const b = Aura.backgroundAction('Druga');
    const list = Aura.backgroundActions();
    expect(list).toHaveLength(2);

    Aura.resolveBackgroundAction(list[1].id, 'cancel');
    await expect(b).resolves.toMatchObject({ response: 'cancel', label: 'Druga' });
    expect(Aura.backgroundActions().map((x) => x.label)).toEqual(['Pierwsza']);

    Aura.resolveBackgroundAction(list[0].id, 'run');
    await expect(a).resolves.toMatchObject({ response: 'run' });
  });

  it('decyzja o nieznanym id nic nie psuje', () => {
    expect(() => Aura.resolveBackgroundAction('nie-ma', 'run')).not.toThrow();
  });

  it('reset odrzuca oczekujące zgłoszenia zamiast je porzucać', async () => {
    const pending = Aura.backgroundAction('Wisząca');
    Aura.reset();
    await expect(pending).resolves.toMatchObject({ response: 'cancel' });
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
