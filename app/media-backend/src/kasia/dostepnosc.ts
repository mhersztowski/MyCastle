/**
 * dostepnosc.ts — czy Kasi wolno się teraz odezwać.
 *
 * Jedno miejsce, w którym rozstrzyga się „nie przeszkadzać / śpię". Wszystkie
 * ścieżki, którymi Kasia mogłaby zaczepić — cron spotkań, pętla inicjatywy,
 * API dla skryptów — pytają tę funkcję, zamiast każda sprawdzać po swojemu.
 *
 * Odpowiedź na pytanie **nie znaczy odwołania**: przypomnienie zablokowane przez
 * sen nie znika, tylko czeka (patrz `harmonogram.ts`). Inaczej wyłączenie
 * telefonu na noc kasowałoby poranne spotkanie.
 */

import type { Dostepnosc, TrybDostepnosci } from './model';

const MINUTA = 60_000;

/** Czy tryb wciąż obowiązuje, czy jego termin już minął. */
function trybObowiazuje(d: Dostepnosc, teraz: number): boolean {
  if (d.tryb === 'dostepny') return false;
  return d.do == null || teraz < d.do;
}

/** Czy Kasia może teraz zaczepić użytkownika z własnej woli. */
export function czyMoznaZaczepic(d: Dostepnosc, teraz: number): boolean {
  return !trybObowiazuje(d, teraz);
}

/**
 * Nowy stan dostępności.
 *
 * `minut` jest opcjonalne, bo „nie przeszkadzać na 45 minut" i „nie przeszkadzać
 * do odwołania" to dwie różne rzeczy, których nie da się wyrazić jedną liczbą.
 * Wartość niedodatnia znaczy brak terminu — użytkownik, który wpisze zero,
 * chciał wyłączyć ograniczenie czasowe, a nie ustawić tryb na zero minut.
 */
export function ustawDostepnosc(
  tryb: TrybDostepnosci,
  teraz: number,
  minut?: number,
): Dostepnosc {
  if (tryb === 'dostepny') return { tryb, od: teraz };
  const doKiedy = minut != null && minut > 0 ? teraz + minut * MINUTA : undefined;
  return doKiedy != null ? { tryb, od: teraz, do: doKiedy } : { tryb, od: teraz };
}

/** Godzina w zapisie `HH:MM` czasu lokalnego. */
function godzina(znacznik: number, strefa = 'Europe/Warsaw'): string {
  return new Intl.DateTimeFormat('pl-PL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: strefa,
  }).format(new Date(znacznik));
}

/**
 * Dlaczego Kasia milczy — zdanie dla dziennika i dla panelu.
 *
 * `null`, gdy nie milczy. Zwracamy zdanie, a nie kod błędu, bo jedynym odbiorcą
 * jest człowiek czytający, czemu nie dostał przypomnienia.
 */
export function powodMilczenia(d: Dostepnosc, teraz: number, strefa?: string): string | null {
  if (!trybObowiazuje(d, teraz)) return null;

  const co = d.tryb === 'spie' ? 'Marcin śpi' : 'włączone „nie przeszkadzać"';
  const doKiedy = d.do != null ? `do ${godzina(d.do, strefa)}` : 'do odwołania';
  return `${co} (${doKiedy}).`;
}

/** Stan dostępności jako zdanie wstawiane do promptu. */
export function opisDostepnosci(d: Dostepnosc, teraz: number, strefa?: string): string {
  const powod = powodMilczenia(d, teraz, strefa);
  return powod
    ? `Nie wolno teraz zaczepiać: ${powod}`
    : 'Marcin jest dostępny.';
}
