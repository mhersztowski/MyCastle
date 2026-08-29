/**
 * prompt.ts — składanie promptu, którym Kasia myśli.
 *
 * Prompt nie jest jednym napisem w ustawieniach. Składa się z trzech warstw,
 * i rozdzielenie ich jest tu całą treścią:
 *
 *   1. **baza** — to, co użytkownik napisał w panelu (`promptInit` / `promptUpdate`),
 *   2. **fragmenty** — dołożone z zewnątrz przez skrypty Drive i automatyzacje,
 *   3. **kontekst** — stan świata w tej chwili: data, dostępność, spotkania.
 *
 * Warstwy różnią się tym, **kto i jak często je zmienia**. Baza to decyzja
 * użytkownika, rzadka i świadoma. Fragmenty dokłada kod, często i bez wiedzy
 * użytkownika — dlatego każdy niesie swoje źródło i wchodzi do promptu podpisany.
 * Kontekst zmienia się co minutę i nie jest nigdzie zapisywany.
 *
 * Bez tego podziału skrypt dopisujący jedno zdanie musiałby przepisać cały
 * prompt użytkownika, a model dostawałby datę wmieszaną w opis własnej roli.
 */

import type { Dostepnosc, FragmentPromptu, Spotkanie } from './model';
import { opisDostepnosci } from './dostepnosc';
import { opisSpotkania } from './harmonogram';

/** Dokłada fragment; ten sam identyfikator nadpisuje poprzednią treść. */
export function dodajFragment(
  fragmenty: FragmentPromptu[],
  nowy: FragmentPromptu,
): FragmentPromptu[] {
  const bez = fragmenty.filter((f) => !(f.id === nowy.id && f.zrodlo === nowy.zrodlo));
  return [...bez, nowy];
}

/** Odsiewa fragmenty, których termin minął. */
export function usunWygasle(fragmenty: FragmentPromptu[], teraz: number): FragmentPromptu[] {
  return fragmenty.filter((f) => f.wygasaO == null || f.wygasaO > teraz);
}

export interface ZapytanieOPrompt {
  baza: string;
  fragmenty: FragmentPromptu[];
  kind: 'init' | 'update';
  teraz: number;
  kontekst?: string;
}

export function zbudujPrompt({ baza, fragmenty, kind, teraz, kontekst }: ZapytanieOPrompt): string {
  const wybrane = usunWygasle(fragmenty, teraz)
    .filter((f) => f.kind === kind)
    .sort((a, b) => a.dodanoO - b.dodanoO);

  const czesci = [baza.trim()];

  if (wybrane.length > 0) {
    /*
     * Fragmenty wchodzą **podpisane źródłem**. Model dostaje wtedy informację,
     * że zdanie pochodzi z automatyzacji, a nie z opisu jego roli — i może je
     * potraktować jako polecenie na dziś, a nie jako część własnej tożsamości.
     */
    const lista = wybrane.map((f) => `• [${f.zrodlo}] ${f.tekst.trim()}`).join('\n');
    czesci.push(`Dodatkowe wskazówki dołożone przez skrypty:\n${lista}`);
  }

  if (kontekst?.trim()) czesci.push(kontekst.trim());

  return czesci.join('\n\n');
}

export interface OpisSwiata {
  teraz: number;
  strefa: string;
  dostepnosc: Dostepnosc;
  spotkania: Spotkanie[];
  /** Dane z MyCastle — projekty, zadania, wydarzenia. Dochodzi w kolejnym etapie. */
  dane?: string;
}

/**
 * Stan świata jako tekst dla modelu.
 *
 * Data i godzina muszą tu być, bo model ich nie zna — a bez nich nie odróżni
 * „dzisiaj" od „wczoraj" i nie stwierdzi, czy jest niedziela. Dzień tygodnia
 * podajemy słowem, nie liczbą: HersztuWeekly wypada w niedzielę i model musi
 * móc to sprawdzić bez arytmetyki na datach, w której łatwo się myli.
 */
export function opisKontekstu({ teraz, strefa, dostepnosc, spotkania, dane }: OpisSwiata): string {
  const data = new Intl.DateTimeFormat('pl-PL', {
    timeZone: strefa, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(teraz));

  const linie = [
    'Stan na teraz:',
    `• Data i godzina: ${data} (strefa ${strefa}).`,
    `• ${opisDostepnosci(dostepnosc, teraz, strefa)}`,
  ];

  if (spotkania.length > 0) {
    linie.push('• Ustalone spotkania:');
    for (const s of spotkania.filter((x) => x.wlaczone)) linie.push(`    – ${opisSpotkania(s)}`);
  }

  if (dane?.trim()) linie.push('', dane.trim());

  return linie.join('\n');
}
