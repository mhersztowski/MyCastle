/**
 * strumien.ts — czytanie odpowiedzi modelu po kawałku.
 *
 * Do tej pory Kasia czekała na całą odpowiedź, potem front ją syntezował —
 * między końcem pytania a pierwszym słowem mijało 4–8 sekund. Strumień skraca
 * to do ~1,5 s, bo pierwsze zdanie da się wypowiedzieć, gdy model generuje
 * dalszy ciąg.
 *
 * Tutaj jest wyłącznie **parsowanie**: składanie zdarzeń SSE, wyciąganie
 * fragmentów tekstu i wywołań narzędzi z dwóch różnych formatów oraz cięcie
 * tekstu na zdania. Wszystko czyste i testowalne bez sieci — bo to właśnie
 * w tych trzech miejscach mieszkają błędy, których nie widać, dopóki nie
 * trafi się na dziwny podział porcji.
 */

/**
 * Składanie zdarzeń Server-Sent Events z porcji bajtów.
 *
 * Sieć tnie strumień w dowolnym miejscu — także w środku liczby albo w połowie
 * słowa `data:`. Bufor trzyma niedokończoną resztę do następnej porcji;
 * bez niego co kilkanaście fragmentów gubiłby się jeden, i to niepowtarzalnie.
 */
export class ParserSse {
  private bufor = '';

  /** Dokłada porcję i zwraca ładunki `data:` kompletnych zdarzeń. */
  dodaj(porcja: string): string[] {
    this.bufor += porcja;
    const gotowe: string[] = [];

    // Zdarzenia rozdziela pusta linia; CRLF obsługujemy razem z LF.
    for (;;) {
      const koniec = this.bufor.search(/\r?\n\r?\n/);
      if (koniec === -1) break;

      const blok = this.bufor.slice(0, koniec);
      this.bufor = this.bufor.slice(koniec).replace(/^\r?\n\r?\n/, '');

      for (const linia of blok.split(/\r?\n/)) {
        // `event:` i komentarze (`:`) nas nie interesują — treść jest w `data:`.
        if (!linia.startsWith('data:')) continue;
        const dane = linia.slice(5).trim();
        if (dane) gotowe.push(dane);
      }
    }

    return gotowe;
  }
}

/** Co niesie pojedyncze zdarzenie strumienia. */
export interface Delta {
  tekst?: string;
  narzedzieStart?: { indeks: number; id: string; nazwa: string };
  narzedzieParametry?: { indeks: number; fragment: string };
  koniec?: boolean;
}

/**
 * Zdarzenie Anthropic → delta.
 *
 * Parametry narzędzia przychodzą jako **fragmenty tekstu JSON**
 * (`input_json_delta`), nie jako obiekt: model generuje je token po tokenie,
 * więc do czasu zakończenia bloku są niepełne i nie da się ich sparsować.
 */
export function deltyAnthropic(dane: string): Delta {
  try {
    const z = JSON.parse(dane) as {
      type?: string;
      index?: number;
      delta?: { type?: string; text?: string; partial_json?: string };
      content_block?: { type?: string; id?: string; name?: string };
    };

    if (z.type === 'message_stop') return { koniec: true };

    if (z.type === 'content_block_start' && z.content_block?.type === 'tool_use') {
      return {
        narzedzieStart: {
          indeks: z.index ?? 0,
          id: z.content_block.id ?? '',
          nazwa: z.content_block.name ?? '',
        },
      };
    }

    if (z.type === 'content_block_delta') {
      if (z.delta?.type === 'text_delta') return { tekst: z.delta.text ?? '' };
      if (z.delta?.type === 'input_json_delta') {
        return { narzedzieParametry: { indeks: z.index ?? 0, fragment: z.delta.partial_json ?? '' } };
      }
    }

    return {};
  } catch {
    // Uszkodzone zdarzenie pomijamy — jedno zgubione słowo jest lepsze niż
    // przerwana odpowiedź.
    return {};
  }
}

/** Zdarzenie OpenAI → delta. */
export function deltyOpenAi(dane: string): Delta {
  if (dane === '[DONE]') return { koniec: true };

  try {
    const z = JSON.parse(dane) as {
      choices?: Array<{
        delta?: {
          content?: string;
          tool_calls?: Array<{
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
      }>;
    };

    const delta = z.choices?.[0]?.delta;
    if (!delta) return {};

    const wywolanie = delta.tool_calls?.[0];
    if (wywolanie) {
      const indeks = wywolanie.index ?? 0;
      // Pierwsze zdarzenie niesie nazwę, kolejne dokładają argumenty.
      if (wywolanie.function?.name) {
        return { narzedzieStart: { indeks, id: wywolanie.id ?? '', nazwa: wywolanie.function.name } };
      }
      if (wywolanie.function?.arguments) {
        return { narzedzieParametry: { indeks, fragment: wywolanie.function.arguments } };
      }
    }

    if (delta.content) return { tekst: delta.content };
    return {};
  } catch {
    return {};
  }
}

// ── Cięcie na zdania ─────────────────────────────────────────────────────────

/**
 * Skróty, po których kropka **nie kończy zdania**.
 *
 * Bez tej listy „spotkanie o godz. 18" rozpada się na dwa kawałki i syntezator
 * czyta je z pauzą oraz opadającą intonacją w środku zdania. Lista jest krótka
 * i celowo obejmuje tylko to, co naprawdę pada w rozmowie o kalendarzu i wadze.
 */
const SKROTY = [
  'godz', 'tzn', 'np', 'itp', 'itd', 'ok', 'ul', 'nr', 'tj', 'ok', 'min', 'sek', 'kg', 'ok',
];

/**
 * Wycina z bufora kompletne zdania.
 *
 * `koniec` mówi, że strumień się skończył — wtedy oddajemy resztę, choćby bez
 * kropki, bo nic już nie dojdzie.
 */
export function tnijNaZdania(bufor: string, koniec: boolean): { zdania: string[]; reszta: string } {
  const zdania: string[] = [];
  let poczatek = 0;   // początek bieżącego zdania w buforze
  let i = 0;          // gdzie szukamy następnego terminatora

  while (i < bufor.length) {
    const znak = bufor[i];
    if (!'.!?…\n'.includes(znak)) { i += 1; continue; }

    /*
     * Kropka po skrócie albo w liczbie nie kończy zdania.
     *
     * Idziemy dalej **tym samym przebiegiem**, zamiast wywoływać się
     * rekurencyjnie i sklejać wyniki — sklejanie po `trim()` gubiło spację
     * i dawało „godz.18" zamiast „godz. 18".
     */
    if (znak === '.') {
      const przed = bufor.slice(poczatek, i);
      const ostatnieSlowo = przed.split(/[\s(]/).pop() ?? '';
      const cyfraPoKropce = /^\d/.test(bufor.slice(i + 1));

      if (SKROTY.includes(ostatnieSlowo.toLowerCase()) || (/\d$/.test(przed) && cyfraPoKropce)) {
        i += 1;
        continue;
      }
    }

    const zdanie = bufor.slice(poczatek, i + 1).trim();
    if (zdanie) zdania.push(zdanie);
    i += 1;
    poczatek = i;
  }

  let reszta = bufor.slice(poczatek);
  if (koniec && reszta.trim()) {
    zdania.push(reszta.trim());
    reszta = '';
  }

  return { zdania, reszta };
}
