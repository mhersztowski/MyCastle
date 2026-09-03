/**
 * narzedzia.ts — czym Kasia może **działać**, a nie tylko o czym mówić.
 *
 * Do tej pory jej prompt zawierał zdanie „godziny spotkań ustalasz w rozmowie",
 * a model nie miał żadnego sposobu, żeby taką godzinę zmienić: odpowiadał
 * „ustawiłam" i nic się nie działo. To samo z dopisywaniem zadań, które ma
 * proponować wieczorem, i z wagą, o którą pyta w niedzielę. Ten plik zamyka tę
 * lukę — daje modelowi narzędzia i wykonuje je po stronie serwera.
 *
 * ## Zasady, którymi się tu kierujemy
 *
 * **Walidacja jest tutaj, nie w prompcie.** Model bywa pewny siebie i poda
 * godzinę „rano" albo wagę 600 kg. Prośba w prompcie („podawaj HH:MM") zmniejsza
 * częstość takich wywołań, ale ich nie wyklucza — a jedno przepuszczone psuje
 * dane. Sprawdzamy więc każdy parametr i odsyłamy modelowi czytelny powód
 * odmowy, który potrafi powtórzyć użytkownikowi.
 *
 * **Terminy przeliczamy sami.** W rozmowie pada „jutro", nie „2026-09-04".
 * Model dostaje dzisiejszą datę w kontekście i teoretycznie umie dodać dobę,
 * ale w praktyce myli się przy końcach miesiąca i zmianach czasu. Skoro i tak
 * musimy sprawdzić zapis, to równie dobrze możemy przyjąć słowo.
 *
 * **Kasia dodaje i zmienia, nie usuwa.** Żadne narzędzie nie kasuje danych.
 * Pomyłka modelu ma kosztować najwyżej niepotrzebny wpis, który widać i da się
 * skasować ręcznie — nie utratę czegoś, czego nikt nie zauważy.
 */

import { RODZAJE_SPOTKAN, type RodzajSpotkania } from './model';

/** Schemat narzędzia w postaci, którą rozumieją oba API modeli. */
export interface SchematNarzedzia {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

/** Co gospodarz musi umieć, żeby narzędzia miały co robić. */
export interface WykonawcaNarzedzi {
  ustawSpotkanie(rodzaj: RodzajSpotkania, zmiany: { godzina?: string; wlaczone?: boolean }): Promise<unknown>;
  dopiszZadanie(z: { name: string; dueDate?: string; projectId?: string; description?: string }): Promise<string>;
  dopiszWydarzenie(w: { name: string; startTime: string; endTime: string; description?: string }): Promise<string>;
  zapiszWage(kg: number, uwaga?: string): Promise<unknown>;
  projekty(): Promise<Array<{ id: string; name: string }>>;
}

export interface WynikNarzedzia {
  ok: boolean;
  /** Treść odsyłana modelowi — to na jej podstawie formułuje odpowiedź. */
  tresc: string;
}

/** Rodzaje działań, które front rozpoznaje po ikonie. */
export const RODZAJE_DZIALAN = [
  'ustaw_godzine_spotkania', 'dopisz_zadanie', 'dopisz_wydarzenie', 'zapisz_wage',
] as const;

const GODZINA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const DOBA = 24 * 3600_000;

// ── Definicje dla modelu ─────────────────────────────────────────────────────

export const NARZEDZIA: SchematNarzedzia[] = [
  {
    name: 'ustaw_godzine_spotkania',
    description:
      'Zmienia godzinę stałego spotkania (porannego, wieczornego albo tygodniowego). '
      + 'Użyj, gdy w rozmowie ustalicie nową porę — bez tego godzina zostanie stara, '
      + 'mimo że powiesz, że ją zmieniłaś.',
    input_schema: {
      type: 'object',
      properties: {
        rodzaj: {
          type: 'string',
          description: 'Które spotkanie.',
          enum: [...RODZAJE_SPOTKAN],
        },
        godzina: { type: 'string', description: 'Godzina w zapisie HH:MM, np. 08:15.' },
      },
      required: ['rodzaj', 'godzina'],
    },
  },
  {
    name: 'dopisz_zadanie',
    description:
      'Dopisuje zadanie do listy zadań w MyCastle. Używaj, gdy rozmowa kończy się '
      + 'ustaleniem, że coś trzeba zrobić — zwłaszcza wieczorem, gdy proponujesz '
      + 'zapisanie tego, co się wydarzyło albo co czeka.',
    input_schema: {
      type: 'object',
      properties: {
        nazwa: { type: 'string', description: 'Krótka nazwa zadania.' },
        termin: {
          type: 'string',
          description: 'Termin: „dzisiaj", „jutro", „pojutrze" albo data RRRR-MM-DD. Pomiń, gdy bez terminu.',
        },
        projekt: { type: 'string', description: 'Nazwa projektu, do którego zadanie należy. Opcjonalne.' },
        opis: { type: 'string', description: 'Dłuższy opis. Opcjonalne.' },
      },
      required: ['nazwa'],
    },
  },
  {
    name: 'dopisz_wydarzenie',
    description:
      'Dopisuje wydarzenie do kalendarza. Używaj, gdy ustalicie coś o konkretnej porze '
      + '— wizytę, spotkanie, blok pracy. Do rzeczy bez godziny użyj zamiast tego zadania.',
    input_schema: {
      type: 'object',
      properties: {
        nazwa: { type: 'string', description: 'Nazwa wydarzenia.' },
        dzien: { type: 'string', description: '„dzisiaj", „jutro", „pojutrze" albo data RRRR-MM-DD.' },
        od: { type: 'string', description: 'Godzina rozpoczęcia HH:MM.' },
        do: { type: 'string', description: 'Godzina zakończenia HH:MM. Pomiń, gdy ma trwać godzinę.' },
      },
      required: ['nazwa', 'dzien', 'od'],
    },
  },
  {
    name: 'zapisz_wage',
    description:
      'Zapisuje pomiar masy ciała. Używaj, gdy w rozmowie padnie liczba kilogramów — '
      + 'zwłaszcza w niedzielę, gdy pytasz o ważenie. Bez tego pomiar przepadnie.',
    input_schema: {
      type: 'object',
      properties: {
        kg: { type: 'number', description: 'Masa w kilogramach, np. 84.2.' },
        uwaga: { type: 'string', description: 'Krótka uwaga, np. „po treningu". Opcjonalne.' },
      },
      required: ['kg'],
    },
  },
];

export function schematyDlaModelu(): SchematNarzedzia[] {
  return NARZEDZIA;
}

// ── Przeliczanie terminów ────────────────────────────────────────────────────

function dzienZnacznika(znacznik: number, strefa: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: strefa, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(znacznik));
}

/**
 * Słowo albo data → dzień w zapisie `RRRR-MM-DD`.
 *
 * `null` znaczy „nie rozumiem" i jest tu **ważniejsze niż wygoda**: gdyby
 * nierozpoznany termin cicho stawał się dzisiejszą datą, zadanie z rozmowy
 * o przyszłym tygodniu wylądowałoby na dziś i zaśmieciło poranne spotkanie.
 */
function naDzien(termin: string, teraz: number, strefa: string): string | null {
  const t = termin.trim().toLowerCase();

  if (DATA.test(t)) return t;

  const przesuniecia: Record<string, number> = {
    'dzisiaj': 0, 'dziś': 0, 'dzis': 0,
    'jutro': 1,
    'pojutrze': 2,
    'wczoraj': -1,
  };

  const p = przesuniecia[t];
  return p === undefined ? null : dzienZnacznika(teraz + p * DOBA, strefa);
}

/** Dzień i godzina lokalna → znacznik ISO. */
function naIso(dzien: string, godzina: string, strefa: string): string {
  // Składamy przez przesunięcie strefy w tym dniu — inaczej lipcowe wydarzenie
  // zapisane zimą trafiłoby o godzinę obok.
  const wzorzec = new Date(`${dzien}T${godzina}:00Z`);
  const przesuniecie = przesuniecieStrefy(wzorzec.getTime(), strefa);
  return new Date(wzorzec.getTime() - przesuniecie).toISOString();
}

function przesuniecieStrefy(znacznik: number, strefa: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: strefa, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(f.formatToParts(new Date(znacznik)).map((x) => [x.type, x.value]));
  const jakoUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return jakoUtc - znacznik;
}

// ── Wykonanie ────────────────────────────────────────────────────────────────

function tekst(p: Record<string, unknown>, klucz: string): string {
  const v = p[klucz];
  return typeof v === 'string' ? v.trim() : '';
}

export async function wykonajNarzedzie(
  nazwa: string,
  parametry: unknown,
  wykonawca: WykonawcaNarzedzi,
  teraz: number = Date.now(),
  strefa = 'Europe/Warsaw',
): Promise<WynikNarzedzia> {
  const p = (parametry ?? {}) as Record<string, unknown>;

  try {
    switch (nazwa) {
      case 'ustaw_godzine_spotkania': {
        const rodzaj = tekst(p, 'rodzaj') as RodzajSpotkania;
        const godzina = tekst(p, 'godzina');

        if (!RODZAJE_SPOTKAN.includes(rodzaj)) {
          return { ok: false, tresc: `Nie znam spotkania „${rodzaj}". Dozwolone: ${RODZAJE_SPOTKAN.join(', ')}.` };
        }
        if (!GODZINA.test(godzina)) {
          return { ok: false, tresc: `„${godzina}" to nie jest godzina. Podaj ją w zapisie HH:MM, np. 08:15.` };
        }

        await wykonawca.ustawSpotkanie(rodzaj, { godzina });
        return { ok: true, tresc: `Ustawiono ${rodzaj} na ${godzina}.` };
      }

      case 'dopisz_zadanie': {
        const name = tekst(p, 'nazwa');
        if (!name) return { ok: false, tresc: 'Zadanie musi mieć nazwę.' };

        let dueDate: string | undefined;
        const termin = tekst(p, 'termin');
        if (termin) {
          const dzien = naDzien(termin, teraz, strefa);
          if (!dzien) {
            return {
              ok: false,
              tresc: `Nie rozumiem terminu „${termin}". Podaj „dzisiaj", „jutro", „pojutrze" albo datę RRRR-MM-DD.`,
            };
          }
          // Termin zadania to dzień, nie chwila — kotwiczymy w południe.
          dueDate = naIso(dzien, '12:00', strefa);
        }

        let projectId: string | undefined;
        let uwagaOProjekcie = '';
        const projekt = tekst(p, 'projekt');
        if (projekt) {
          const lista = await wykonawca.projekty();
          const znaleziony = lista.find((x) => x.name.toLowerCase() === projekt.toLowerCase())
            ?? lista.find((x) => x.name.toLowerCase().includes(projekt.toLowerCase()));
          if (znaleziony) projectId = znaleziony.id;
          /*
           * Nieznany projekt nie blokuje zapisu.
           *
           * Zadanie jest ważniejsze niż jego przypisanie: odmowa znaczyłaby, że
           * literówka w nazwie projektu gubi całą treść rozmowy. Mówimy o tym
           * modelowi, żeby mógł to przekazać dalej.
           */
          else uwagaOProjekcie = ` Nie znalazłam projektu „${projekt}", zadanie jest bez projektu.`;
        }

        await wykonawca.dopiszZadanie({
          name, dueDate, projectId,
          description: tekst(p, 'opis') || undefined,
        });

        return {
          ok: true,
          tresc: `Dopisano zadanie „${name}"${termin ? ` na ${termin}` : ' (bez terminu)'}.${uwagaOProjekcie}`,
        };
      }

      case 'dopisz_wydarzenie': {
        const name = tekst(p, 'nazwa');
        if (!name) return { ok: false, tresc: 'Wydarzenie musi mieć nazwę.' };

        const dzien = naDzien(tekst(p, 'dzien'), teraz, strefa);
        if (!dzien) {
          return { ok: false, tresc: 'Nie rozumiem dnia. Podaj „dzisiaj", „jutro" albo datę RRRR-MM-DD.' };
        }

        const od = tekst(p, 'od');
        if (!GODZINA.test(od)) {
          return { ok: false, tresc: `„${od}" to nie jest godzina rozpoczęcia. Zapis HH:MM.` };
        }

        const startTime = naIso(dzien, od, strefa);
        const doGodz = tekst(p, 'do');

        let endTime: string;
        if (doGodz) {
          if (!GODZINA.test(doGodz)) {
            return { ok: false, tresc: `„${doGodz}" to nie jest godzina zakończenia. Zapis HH:MM.` };
          }
          endTime = naIso(dzien, doGodz, strefa);
          if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
            return { ok: false, tresc: 'Koniec wypada przed początkiem — popraw godziny.' };
          }
        } else {
          // Domyślna godzina trwania; lepsza niż pytanie o coś, co zwykle jest oczywiste.
          endTime = new Date(new Date(startTime).getTime() + 3600_000).toISOString();
        }

        await wykonawca.dopiszWydarzenie({
          name, startTime, endTime, description: tekst(p, 'opis') || undefined,
        });

        return { ok: true, tresc: `Dopisano wydarzenie „${name}" (${dzien}, ${od}).` };
      }

      case 'zapisz_wage': {
        const kg = Number(p.kg);
        if (!Number.isFinite(kg) || kg <= 20 || kg >= 400) {
          return { ok: false, tresc: `${p.kg} kg to niemożliwa waga — nie zapisuję.` };
        }
        await wykonawca.zapiszWage(kg, tekst(p, 'uwaga') || undefined);
        return { ok: true, tresc: `Zapisano pomiar ${String(kg).replace('.', ',')} kg.` };
      }

      default:
        return { ok: false, tresc: `Nieznane narzędzie „${nazwa}".` };
    }
  } catch (err) {
    /*
     * Awaria zapisu wraca jako treść dla modelu, nie jako wyjątek.
     *
     * Model musi móc powiedzieć „nie udało się zapisać, bo…", zamiast urwać
     * odpowiedź w połowie. Użytkownik dowiaduje się wtedy, że jego pomiar nie
     * został zapisany — a to jedyna rzecz, która ma tu znaczenie.
     */
    return { ok: false, tresc: `Nie udało się: ${(err as Error).message}` };
  }
}
