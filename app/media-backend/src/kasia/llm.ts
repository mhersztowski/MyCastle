/**
 * llm.ts — dostęp do modelu językowego.
 *
 * Interfejs jest wąski celowo: Kasia potrzebuje jednej operacji — „masz prompt
 * systemowy i historię, powiedz coś". Wszystko ponadto (narzędzia, strumienie,
 * obrazy) dochodziłoby wtedy, gdy będzie potrzebne, a nie na zapas.
 *
 * ## Dlaczego dostawcy są tutaj, a nie w przeglądarce
 *
 * Aura w MyCastle woła model wprost z karty przeglądarki i wybór dostawcy jest
 * jej sprawą. U Kasi jest inaczej: myśli z własnej inicjatywy i prowadzi
 * spotkania także wtedy, gdy nikt nie ma otwartej strony. Model musi więc być
 * osiągalny dla serwera, a klucze API muszą leżeć po jego stronie.
 *
 * Panel wybiera dostawcę i model — ale robi to, zapisując ustawienie
 * w backendzie, a nie wołając API samemu.
 *
 * ## Testowalność
 *
 * Rozdzielenie interfejsu od implementacji ma konkretny powód, nie estetyczny:
 * `KasiaService` musi dać się przetestować bez sieci i bez klucza. Testy
 * podstawiają atrapę i sprawdzają **decyzje** Kasi — kiedy się odzywa, kiedy
 * milczy — a nie jakość zdań modelu.
 */

import type { WiadomoscKasi } from './model';

export type DostawcaModelu = 'anthropic' | 'openai' | 'ollama';

export interface KonfiguracjaModelu {
  dostawca: DostawcaModelu;
  /** Klucz API. Ollama działa lokalnie i go nie potrzebuje. */
  klucz: string;
  /** Adres API — pozwala wskazać LiteLLM, vLLM albo lokalną Ollamę. */
  adres: string;
  model: string;
}

export const ADRESY_DOMYSLNE: Record<DostawcaModelu, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  ollama: 'http://localhost:11434/v1',
};

export const MODELE_DOMYSLNE: Record<DostawcaModelu, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o',
  ollama: 'llama3.2',
};

export interface ZapytanieDoModelu {
  system: string;
  rozmowa: WiadomoscKasi[];
  model: string;
  /** Ile najwyżej tokenów w odpowiedzi. */
  maxTokens?: number;
}

export interface Model {
  odpowiedz(zapytanie: ZapytanieDoModelu): Promise<string>;
  /** Czy model jest skonfigurowany (jest klucz). Panel pokazuje to wprost. */
  gotowy(): boolean;
  /** Co dokładnie brakuje — komunikat dla panelu, nie kod błędu. */
  czegoBrakuje(): string | null;
}

/**
 * Wiadomości w postaci, którą rozumieją oba API.
 *
 * Wpisy `system` z naszej rozmowy (notatki o tym, co Kasia zrobiła sama)
 * filtrujemy, zamiast przepisywać je na `user` — inaczej model odpowiadałby na
 * własne notatki. Pustą historię uzupełniamy jednym pytaniem, bo oba API
 * wymagają co najmniej jednej wiadomości, a przy inicjatywie nikt nic nie
 * powiedział.
 */
function naWiadomosci(rozmowa: WiadomoscKasi[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  const w = rozmowa
    .filter((x) => x.rola !== 'system' && x.tresc.trim())
    .map((x) => ({ role: x.rola as 'user' | 'assistant', content: x.tresc }));

  if (w.length === 0) {
    return [{ role: 'user', content: 'Zastanów się, czy masz coś do powiedzenia.' }];
  }

  /*
   * Anthropic wymaga, żeby pierwsza wiadomość była od użytkownika, i odrzuca
   * dwie z rzędu tej samej roli. Rozmowa Kasi łamie oba warunki w normalnym
   * użyciu: zaczyna się od jej własnej wypowiedzi z inicjatywy, a kolejne
   * przypomnienia idą jedno po drugim bez odpowiedzi.
   */
  const scalone: typeof w = [];
  for (const x of w) {
    const ostatni = scalone.at(-1);
    if (ostatni && ostatni.role === x.role) ostatni.content += `\n\n${x.content}`;
    else scalone.push({ ...x });
  }
  if (scalone[0].role === 'assistant') {
    scalone.unshift({ role: 'user', content: '(kontynuacja rozmowy)' });
  }
  return scalone;
}

/**
 * Zaślepka na czas, gdy nie ma konfiguracji.
 *
 * Nie rzuca wyjątku przy tworzeniu, tylko przy próbie użycia — dzięki temu
 * backend wstaje i pokazuje panel, w którym widać, czego brakuje. Serwer, który
 * nie startuje przez brak jednej zmiennej środowiskowej, jest trudniejszy do
 * naprawienia niż serwer, który mówi, co jest nie tak.
 */
export class ModelNieskonfigurowany implements Model {
  constructor(private readonly powod: string) {}

  gotowy(): boolean { return false; }
  czegoBrakuje(): string { return this.powod; }

  async odpowiedz(): Promise<string> {
    throw new Error(`Model językowy nie jest skonfigurowany: ${this.powod}`);
  }
}

/** Anthropic — własne API, inne niż OpenAI (prompt systemowy osobnym polem). */
export class ModelAnthropic implements Model {
  constructor(private readonly cfg: KonfiguracjaModelu) {}

  gotowy(): boolean { return this.cfg.klucz.length > 0; }
  czegoBrakuje(): string | null { return this.gotowy() ? null : 'brak klucza API Anthropic'; }

  async odpowiedz({ system, rozmowa, model, maxTokens }: ZapytanieDoModelu): Promise<string> {
    if (!this.gotowy()) throw new Error('Brak klucza API Anthropic.');

    const res = await fetch(`${this.cfg.adres}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.cfg.klucz,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || this.cfg.model,
        max_tokens: maxTokens ?? 1024,
        system,
        messages: naWiadomosci(rozmowa),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }

    const dane = await res.json() as { content?: Array<{ type: string; text?: string }> };
    return (dane.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('')
      .trim();
  }
}

/**
 * OpenAI i wszystko, co mówi jego protokołem — LiteLLM, vLLM, Ollama.
 *
 * Jedna klasa dla trzech dostawców, bo różnią się wyłącznie adresem i tym, czy
 * wymagają klucza. Osobne klasy powtarzałyby ten sam kod trzy razy.
 */
export class ModelOpenAiZgodny implements Model {
  constructor(
    private readonly cfg: KonfiguracjaModelu,
    /** Ollama działa lokalnie i klucza nie potrzebuje. */
    private readonly wymagaKlucza = true,
  ) {}

  gotowy(): boolean { return !this.wymagaKlucza || this.cfg.klucz.length > 0; }

  czegoBrakuje(): string | null {
    return this.gotowy() ? null : `brak klucza API (${this.cfg.dostawca})`;
  }

  async odpowiedz({ system, rozmowa, model, maxTokens }: ZapytanieDoModelu): Promise<string> {
    if (!this.gotowy()) throw new Error(`Brak klucza API dla ${this.cfg.dostawca}.`);

    const naglowki: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.klucz) naglowki.Authorization = `Bearer ${this.cfg.klucz}`;

    const res = await fetch(`${this.cfg.adres}/chat/completions`, {
      method: 'POST',
      headers: naglowki,
      body: JSON.stringify({
        model: model || this.cfg.model,
        max_tokens: maxTokens ?? 1024,
        // Tutaj prompt systemowy jest zwykłą wiadomością, w odróżnieniu od Anthropic.
        messages: [{ role: 'system', content: system }, ...naWiadomosci(rozmowa)],
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.cfg.dostawca} (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }

    const dane = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return (dane.choices?.[0]?.message?.content ?? '').trim();
  }
}

/** Wybiera implementację na podstawie konfiguracji. */
export function utworzModel(cfg: KonfiguracjaModelu): Model {
  switch (cfg.dostawca) {
    case 'anthropic':
      return cfg.klucz
        ? new ModelAnthropic(cfg)
        : new ModelNieskonfigurowany('brak klucza API Anthropic — ustaw go w panelu Kasi albo w .env');
    case 'openai':
      return cfg.klucz
        ? new ModelOpenAiZgodny(cfg)
        : new ModelNieskonfigurowany('brak klucza API OpenAI — ustaw go w panelu Kasi albo w .env');
    case 'ollama':
      // Ollama działa lokalnie, więc jest gotowa bez klucza.
      return new ModelOpenAiZgodny(cfg, false);
    default:
      return new ModelNieskonfigurowany(`nieznany dostawca „${String(cfg.dostawca)}"`);
  }
}
