/**
 * scenariusze.ts — czym różnią się od siebie trzy spotkania.
 *
 * Do tej pory każde zaczynało się tym samym poleceniem („poprowadź spotkanie"),
 * więc poranne, wieczorne i niedzielne różniły się wyłącznie nazwą — model nie
 * miał z czego wywnioskować, że rano planuje się dzień, a wieczorem rozlicza.
 * Tutaj każde dostaje własne polecenie i **własny zakres danych**.
 *
 * ## Dlaczego zakres danych też się różni
 *
 * Wieczorne spotkanie omawia dzień, który minął, więc musi widzieć wstecz.
 * Niedzielne planuje tydzień, więc musi widzieć siedem dni naprzód — i tylko
 * ono potrzebuje wagi. Pytanie o wagę przy każdym porannym spotkaniu byłoby
 * nękaniem, a ciągnięcie tygodnia danych przy każdej wiadomości kosztowałoby
 * kilkanaście odczytów przez brokera bez powodu.
 */

import type { RodzajSpotkania } from './model';

export interface KontekstPolecenia {
  /** Która to próba zaczepienia (0 = pierwsza). */
  proba: number;
}

/** Ile danych trzeba pobrać dla danego rodzaju rozmowy. */
export interface ZakresDanych {
  /** Ile dni kalendarza wstecz. */
  wstecz: number;
  /** Ile dni kalendarza naprzód. */
  naprzod: number;
  /** Czy dołączyć pomiary wagi. */
  waga: boolean;
}

/**
 * `null` znaczy zwykłą rozmowę, nie spotkanie.
 *
 * Wtedy bierzemy zakres najmniejszy z sensownych: wczoraj, dziś i kilka dni
 * naprzód. To pokrywa pytania w rodzaju „co mam jutro", a nie ciągnie tygodnia.
 */
export function czegoPotrzebuje(rodzaj: RodzajSpotkania | null): ZakresDanych {
  switch (rodzaj) {
    case 'HersztuMorning':
      // Rano liczy się dziś; jutro i pojutrze przydają się do przesuwania zadań.
      return { wstecz: 0, naprzod: 2, waga: false };
    case 'HersztuEvening':
      // Wieczorem trzeba zobaczyć dzień, który się właśnie kończy, i wczorajszy
      // dla porównania — plus jutro, żeby dało się coś przenieść.
      return { wstecz: 1, naprzod: 1, waga: false };
    case 'HersztuWeekly':
      return { wstecz: 7, naprzod: 8, waga: true };
    default:
      return { wstecz: 1, naprzod: 3, waga: false };
  }
}

const PORANNE = `Zaczyna się HersztuMorning — spotkanie poranne.

Odezwij się pierwsza. Omów, co jest do zrobienia **dzisiaj**: wymień konkretne
zadania i wydarzenia po nazwie, a nie ogólnie „masz kilka rzeczy". Jeśli są
zaległości, powiedz o nich raz, bez wracania.

Zakończ jednym pytaniem — od czego zaczyna albo co jest dziś najważniejsze.
Nie podsumowuj dnia, który się jeszcze nie wydarzył.`;

const WIECZORNE = `Zaczyna się HersztuEvening — spotkanie wieczorne.

Odezwij się pierwsza. Omów, co udało się dzisiaj zrobić: przejdź po wydarzeniach
i zadaniach z dzisiejszą datą.

Jeśli w danych nie ma **nic** z dzisiaj, zaproponuj dopisanie wydarzenia albo
zadania — dzień bez śladu jest zwykle dniem źle zapisanym, a nie pustym.
Zaproponuj konkret na podstawie tego, co wiesz o jego projektach, zamiast pytać
ogólnie „co robiłeś".

Zastrzeżenie: jeśli kontekst mówi, że dane były **niedostępne**, to nie znaczy,
że dzień jest pusty. Wtedy nie wyciągaj wniosków i nie proponuj dopisywania —
powiedz wprost, że nie masz wglądu w dane.`;

const TYGODNIOWE = `Zaczyna się HersztuWeekly — podsumowanie tygodnia.

Odezwij się pierwsza i poprowadź dwie sprawy:

1. **Plan na kolejny tydzień.** Przejdź po zadaniach z terminami w nadchodzących
   dniach i po tym, co zostało zaległe. Zaproponuj, co przenieść, a co odpuścić.
   Wskaż dni, w których jest już dużo zaplanowane.

2. **Waga.** Jeśli dawno nie było pomiaru — przypomnij o zważeniu się. Jeśli
   jest trend, omów go rzeczowo: co się zmieniło i o ile. Doradzaj konkretnie,
   bez oceniania i bez zachęt w stylu trenera; nie gratuluj i nie pocieszaj.
   Jeśli pomiarów jest za mało na trend, powiedz to wprost zamiast zgadywać.`;

const WEDLUG_RODZAJU: Record<RodzajSpotkania, string> = {
  HersztuMorning: PORANNE,
  HersztuEvening: WIECZORNE,
  HersztuWeekly: TYGODNIOWE,
};

/**
 * Polecenie dla modelu na początek spotkania.
 *
 * Przy ponowieniu dokładamy prośbę o skrócenie: druga i trzecia próba trafiają
 * do kogoś, kto pierwszej nie przeczytał albo nie miał czasu — powtórzenie
 * pełnego wywodu zmniejsza szansę na odpowiedź, zamiast ją zwiększać.
 */
export function poleceniSpotkania(rodzaj: RodzajSpotkania, { proba }: KontekstPolecenia): string {
  const bazowe = WEDLUG_RODZAJU[rodzaj];
  if (proba === 0) return bazowe;

  return `${bazowe}

To już ${proba + 1}. próba — poprzednie zostały bez odpowiedzi. Napisz krócej niż
zwykle: jedno, dwa zdania i konkretne pytanie.`;
}
