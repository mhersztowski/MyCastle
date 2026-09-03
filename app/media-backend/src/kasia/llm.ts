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
import type { SchematNarzedzia } from './narzedzia';
import { ParserSse, deltyAnthropic, deltyOpenAi, type Delta } from './strumien';

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

/** Prośba modelu o wykonanie narzędzia. */
export interface WywolanieNarzedzia {
  /** Identyfikator nadany przez model — po nim wraca wynik. */
  id: string;
  nazwa: string;
  parametry: unknown;
}

/**
 * Krok rozmowy widziany przez model.
 *
 * Rozszerzenie ponad `WiadomoscKasi`, bo pętla narzędziowa musi przekazać
 * modelowi jego własne wywołania i ich wyniki. Te kroki **nie trafiają do
 * trwałej rozmowy** — panel ma pokazywać rozmowę, nie protokół wykonania.
 */
export type KrokRozmowy =
  | { rola: 'user' | 'assistant'; tresc: string }
  | { rola: 'assistant'; tresc: string; narzedzia: WywolanieNarzedzia[] }
  | { rola: 'narzedzie'; id: string; nazwa: string; wynik: string };

export interface ZapytanieDoModelu {
  system: string;
  rozmowa: WiadomoscKasi[];
  model: string;
  /** Ile najwyżej tokenów w odpowiedzi. */
  maxTokens?: number;
  /** Narzędzia udostępnione modelowi; brak = rozmowa bez działania. */
  narzedzia?: SchematNarzedzia[];
  /** Kroki dołożone przez pętlę narzędziową — wywołania i ich wyniki. */
  kroki?: KrokRozmowy[];
}

export interface OdpowiedzModelu {
  tekst: string;
  /** Gdy niepuste, model prosi o wykonanie narzędzi i czeka na wyniki. */
  narzedzia: WywolanieNarzedzia[];
}

/** Co dzieje się w trakcie strumienia. */
export interface NasluchStrumienia {
  /** Kolejny fragment tekstu — front dokłada go do wypowiedzi. */
  tekst(fragment: string): void;
}

export interface Model {
  odpowiedz(zapytanie: ZapytanieDoModelu): Promise<string>;
  /** Wariant z narzędziami. Domyślnie opakowuje `odpowiedz`. */
  odpowiedzZNarzedziami?(zapytanie: ZapytanieDoModelu): Promise<OdpowiedzModelu>;
  /**
   * Wariant strumieniowy: fragmenty lecą na bieżąco, wynik wraca po zakończeniu.
   *
   * Zwracany obiekt jest ten sam co przy `odpowiedzZNarzedziami`, więc pętla
   * narzędziowa nie musi wiedzieć, którą drogą przyszła odpowiedź.
   */
  odpowiedzStrumieniem?(z: ZapytanieDoModelu, n: NasluchStrumienia): Promise<OdpowiedzModelu>;
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
 * Czyta odpowiedź SSE i składa z niej tekst oraz wywołania narzędzi.
 *
 * Wspólne dla obu dostawców — różnią się wyłącznie tym, jak wygląda pojedyncze
 * zdarzenie, a to rozstrzyga przekazany `parsuj`. Parametry narzędzi zbieramy
 * jako **tekst**, bo przychodzą fragmentami niebędącymi poprawnym JSON-em
 * do samego końca; parsujemy je dopiero po zamknięciu strumienia.
 */
async function czytajStrumien(
  odpowiedz: Response,
  parsuj: (dane: string) => Delta,
  nasluch: NasluchStrumienia,
): Promise<OdpowiedzModelu> {
  const czytnik = odpowiedz.body?.getReader();
  if (!czytnik) throw new Error('Odpowiedź nie ma treści do odczytania.');

  const dekoder = new TextDecoder();
  const parser = new ParserSse();
  let tekst = '';
  const budowane = new Map<number, { id: string; nazwa: string; parametry: string }>();

  for (;;) {
    const { done, value } = await czytnik.read();
    if (done) break;

    for (const zdarzenie of parser.dodaj(dekoder.decode(value, { stream: true }))) {
      const d = parsuj(zdarzenie);

      if (d.tekst) { tekst += d.tekst; nasluch.tekst(d.tekst); }

      if (d.narzedzieStart) {
        budowane.set(d.narzedzieStart.indeks, {
          id: d.narzedzieStart.id, nazwa: d.narzedzieStart.nazwa, parametry: '',
        });
      }

      if (d.narzedzieParametry) {
        const cel = budowane.get(d.narzedzieParametry.indeks);
        if (cel) cel.parametry += d.narzedzieParametry.fragment;
      }
    }
  }

  return {
    tekst: tekst.trim(),
    narzedzia: [...budowane.values()].map((b) => ({
      id: b.id,
      nazwa: b.nazwa,
      // Puste parametry to poprawny przypadek (narzędzie bez argumentów);
      // niepoprawny JSON traktujemy jak brak — walidacja narzędzia to wychwyci.
      parametry: (() => {
        try { return b.parametry ? JSON.parse(b.parametry) : {}; } catch { return {}; }
      })(),
    })),
  };
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

  async odpowiedz(z: ZapytanieDoModelu): Promise<string> {
    return (await this.odpowiedzZNarzedziami(z)).tekst;
  }

  /**
   * Kroki pętli narzędziowej w formacie Anthropic.
   *
   * Wywołanie narzędzia jest tu blokiem `tool_use` **wewnątrz** wiadomości
   * asystenta, a wynik blokiem `tool_result` w wiadomości **użytkownika** —
   * nie osobną rolą, jak w OpenAI. Stąd dwie różne funkcje mapujące zamiast
   * jednej wspólnej: podobieństwo obu API kończy się na nazwie pola `tools`.
   */
  private static kroki(kroki: KrokRozmowy[]): unknown[] {
    return kroki.map((k) => {
      if (k.rola === 'narzedzie') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: k.id, content: k.wynik }],
        };
      }
      if ('narzedzia' in k && k.narzedzia.length > 0) {
        return {
          role: 'assistant',
          content: [
            ...(k.tresc ? [{ type: 'text', text: k.tresc }] : []),
            ...k.narzedzia.map((n) => ({
              type: 'tool_use', id: n.id, name: n.nazwa, input: n.parametry ?? {},
            })),
          ],
        };
      }
      return { role: k.rola, content: k.tresc };
    });
  }

  async odpowiedzStrumieniem(
    z: ZapytanieDoModelu, nasluch: NasluchStrumienia,
  ): Promise<OdpowiedzModelu> {
    if (!this.gotowy()) throw new Error('Brak klucza API Anthropic.');

    const res = await fetch(`${this.cfg.adres}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.cfg.klucz,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: z.model || this.cfg.model,
        max_tokens: z.maxTokens ?? 1024,
        system: z.system,
        messages: [...naWiadomosci(z.rozmowa), ...ModelAnthropic.kroki(z.kroki ?? [])],
        ...(z.narzedzia?.length ? { tools: z.narzedzia } : {}),
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    return czytajStrumien(res, deltyAnthropic, nasluch);
  }

  async odpowiedzZNarzedziami(
    { system, rozmowa, model, maxTokens, narzedzia, kroki = [] }: ZapytanieDoModelu,
  ): Promise<OdpowiedzModelu> {
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
        messages: [...naWiadomosci(rozmowa), ...ModelAnthropic.kroki(kroki)],
        ...(narzedzia?.length ? { tools: narzedzia } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }

    const dane = await res.json() as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
    };
    const bloki = dane.content ?? [];

    return {
      tekst: bloki.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim(),
      narzedzia: bloki
        .filter((c) => c.type === 'tool_use')
        .map((c) => ({ id: c.id ?? '', nazwa: c.name ?? '', parametry: c.input })),
    };
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

  async odpowiedz(z: ZapytanieDoModelu): Promise<string> {
    return (await this.odpowiedzZNarzedziami(z)).tekst;
  }

  /**
   * Kroki pętli narzędziowej w formacie OpenAI.
   *
   * Tu wynik narzędzia ma **własną rolę** (`tool`), a wywołania siedzą w polu
   * `tool_calls` wiadomości asystenta, z parametrami jako **napis JSON**, nie
   * obiekt. Anthropic robi jedno i drugie inaczej — patrz komentarz tam.
   */
  private static kroki(kroki: KrokRozmowy[]): unknown[] {
    return kroki.map((k) => {
      if (k.rola === 'narzedzie') {
        return { role: 'tool', tool_call_id: k.id, content: k.wynik };
      }
      if ('narzedzia' in k && k.narzedzia.length > 0) {
        return {
          role: 'assistant',
          content: k.tresc || null,
          tool_calls: k.narzedzia.map((n) => ({
            id: n.id,
            type: 'function',
            function: { name: n.nazwa, arguments: JSON.stringify(n.parametry ?? {}) },
          })),
        };
      }
      return { role: k.rola, content: k.tresc };
    });
  }

  async odpowiedzStrumieniem(
    z: ZapytanieDoModelu, nasluch: NasluchStrumienia,
  ): Promise<OdpowiedzModelu> {
    if (!this.gotowy()) throw new Error(`Brak klucza API dla ${this.cfg.dostawca}.`);

    const naglowki: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.cfg.klucz) naglowki.Authorization = `Bearer ${this.cfg.klucz}`;

    const res = await fetch(`${this.cfg.adres}/chat/completions`, {
      method: 'POST',
      headers: naglowki,
      body: JSON.stringify({
        model: z.model || this.cfg.model,
        max_tokens: z.maxTokens ?? 1024,
        messages: [
          { role: 'system', content: z.system },
          ...naWiadomosci(z.rozmowa),
          ...ModelOpenAiZgodny.kroki(z.kroki ?? []),
        ],
        ...(z.narzedzia?.length
          ? {
            tools: z.narzedzia.map((n) => ({
              type: 'function',
              function: { name: n.name, description: n.description, parameters: n.input_schema },
            })),
          }
          : {}),
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.cfg.dostawca} (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    return czytajStrumien(res, deltyOpenAi, nasluch);
  }

  async odpowiedzZNarzedziami(
    { system, rozmowa, model, maxTokens, narzedzia, kroki = [] }: ZapytanieDoModelu,
  ): Promise<OdpowiedzModelu> {
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
        messages: [
          { role: 'system', content: system },
          ...naWiadomosci(rozmowa),
          ...ModelOpenAiZgodny.kroki(kroki),
        ],
        ...(narzedzia?.length
          ? {
            tools: narzedzia.map((n) => ({
              type: 'function',
              function: { name: n.name, description: n.description, parameters: n.input_schema },
            })),
          }
          : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`${this.cfg.dostawca} (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }

    const dane = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const wiadomosc = dane.choices?.[0]?.message;

    return {
      tekst: (wiadomosc?.content ?? '').trim(),
      narzedzia: (wiadomosc?.tool_calls ?? []).map((c) => ({
        id: c.id,
        nazwa: c.function?.name ?? '',
        // Parametry przychodzą jako napis; zepsuty JSON traktujemy jak brak
        // argumentów — walidacja narzędzia i tak odrzuci wywołanie z powodem.
        parametry: (() => {
          try { return JSON.parse(c.function?.arguments ?? '{}'); } catch { return {}; }
        })(),
      })),
    };
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
