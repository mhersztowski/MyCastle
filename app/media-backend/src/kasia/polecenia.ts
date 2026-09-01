/**
 * polecenia.ts — wykonywanie poleceń przychodzących po MQTT.
 *
 * Druga strona `packages/core/browser/kasia/kasia.ts`: to, co skrypt Drive
 * publikuje na `kasia/{user}/inbox`, ląduje tutaj. Osobny plik, bo warstwy
 * różnią się odpowiedzialnością — `KasiaService` wie, co Kasia potrafi,
 * a to miejsce wie, jak nazywają się polecenia i co wolno przez nie zrobić.
 *
 * ## Co wolno skryptowi
 *
 * Nie wszystko, co potrafi panel. Dwa ograniczenia są celowe:
 *
 *   • **`powiedz` podlega dostępności.** Skrypt nie może zaczepić kogoś, kto
 *     śpi — inaczej przycisk „nie przeszkadzać" przestałby cokolwiek znaczyć,
 *     bo wystarczyłby jeden skrypt, żeby go obejść.
 *   • **`stan` nie oddaje rozmowy ani promptów.** Skrypt ma móc sprawdzić, czy
 *     wolno zaczepiać i o której są spotkania; treść korespondencji z asystentką
 *     to co innego niż informacja o jej dostępności.
 *
 * ## Dlaczego nic tu nie rzuca wyjątkiem
 *
 * Polecenia przychodzą wiadomością MQTT, a nie żądaniem HTTP — wyjątek nie ma
 * komu wypłynąć. Skrypt po drugiej stronie czekałby dwadzieścia sekund do
 * upływu limitu i dostał „brak odpowiedzi" zamiast powodu. Dlatego każdy błąd
 * wraca jako `{ ok: false, error }`.
 */

import type { KasiaService } from './KasiaService';
import { czyMoznaZaczepic, powodMilczenia } from './dostepnosc';

export interface WynikPolecenia {
  ok: boolean;
  data?: unknown;
  error?: string;
}

/** Polecenia, które rozumiemy — wymieniane w odmowie, żeby dało się poprawić literówkę. */
export const ZNANE_POLECENIA = [
  'fragment.dodaj', 'fragment.usun', 'powiedz', 'zapytaj', 'stan', 'waga.zapisz',
] as const;

function tekstZ(payload: unknown, pole = 'tekst'): string {
  const p = payload as Record<string, unknown> | undefined;
  const v = p?.[pole];
  return typeof v === 'string' ? v : '';
}

export async function obsluzPolecenie(
  kasia: KasiaService,
  type: string,
  payload?: unknown,
  teraz: number = Date.now(),
): Promise<WynikPolecenia> {
  const p = (payload ?? {}) as Record<string, unknown>;

  try {
    switch (type) {
      case 'fragment.dodaj': {
        const tekst = tekstZ(payload).trim();
        if (!tekst) return { ok: false, error: 'Fragment bez treści.' };

        const wygasaZa = Number(p.wygasaZa);
        await kasia.dodajFragment({
          id: typeof p.id === 'string' && p.id ? p.id : Math.random().toString(36).slice(2, 10),
          // Nieznany rodzaj → `update`: literówka nie powinna wywracać skryptu,
          // a `update` jest bezpieczniejszy, bo nie wchodzi do stałej definicji Kasi.
          kind: p.kind === 'init' ? 'init' : 'update',
          zrodlo: typeof p.zrodlo === 'string' && p.zrodlo ? p.zrodlo : 'skrypt',
          tekst,
          wygasaO: Number.isFinite(wygasaZa) && wygasaZa > 0 ? teraz + wygasaZa * 60_000 : undefined,
        }, teraz);
        return { ok: true };
      }

      case 'fragment.usun': {
        const idFragmentu = typeof p.id === 'string' ? p.id : '';
        if (!idFragmentu) return { ok: false, error: 'Brak identyfikatora fragmentu.' };
        // Źródło jest częścią klucza — skrypt nie kasuje wpisów innego skryptu.
        await kasia.usunFragment(idFragmentu, typeof p.zrodlo === 'string' ? p.zrodlo : 'skrypt');
        return { ok: true };
      }

      case 'powiedz': {
        const tekst = tekstZ(payload).trim();
        if (!tekst) return { ok: false, error: 'Pusta wypowiedź.' };

        const stan = kasia.stan();
        if (!czyMoznaZaczepic(stan.dostepnosc, teraz)) {
          return {
            ok: true,
            data: {
              wyslano: false,
              powod: powodMilczenia(stan.dostepnosc, teraz, stan.ustawienia.strefaCzasowa),
            },
          };
        }

        await kasia.wypowiedzZInicjatywy(tekst, teraz);
        return { ok: true, data: { wyslano: true } };
      }

      case 'zapytaj': {
        const tekst = tekstZ(payload).trim();
        if (!tekst) return { ok: false, error: 'Puste pytanie.' };
        if (!kasia.modelGotowy()) {
          return { ok: false, error: `Model nie jest gotowy: ${kasia.czegoBrakujeModelowi()}` };
        }
        return { ok: true, data: { odpowiedz: await kasia.powiedz(tekst, teraz) } };
      }

      case 'stan': {
        const s = kasia.stan();
        return {
          ok: true,
          data: {
            dostepnosc: { tryb: s.dostepnosc.tryb, do: s.dostepnosc.do },
            spotkania: s.spotkania.map((x) => ({
              rodzaj: x.rodzaj, godzina: x.godzina, wlaczone: x.wlaczone,
            })),
            fragmenty: s.fragmenty.map((f) => ({
              id: f.id, kind: f.kind, zrodlo: f.zrodlo, tekst: f.tekst,
            })),
            wiadomosci: s.rozmowa.length,
          },
        };
      }

      case 'waga.zapisz': {
        const kg = Number(p.kg);
        if (!Number.isFinite(kg)) return { ok: false, error: 'Brak liczby w polu „kg".' };
        const data = typeof p.data === 'string' && p.data
          ? p.data
          : new Date(teraz).toISOString().slice(0, 10);
        return {
          ok: true,
          data: await kasia.zapiszWage({
            data, kg, uwaga: typeof p.uwaga === 'string' ? p.uwaga : undefined,
          }),
        };
      }

      default:
        return {
          ok: false,
          error: `Nieznane polecenie „${type}". Znane: ${ZNANE_POLECENIA.join(', ')}.`,
        };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
