/**
 * dane.ts — dane z MyCastle w postaci, którą da się dać modelowi.
 *
 * Tu nie ma sieci; wszystko jest czystymi funkcjami na już pobranych danych.
 * Pobieranie siedzi w `MycastleClient.ts`.
 *
 * ## Dlaczego to nie jest „wrzuć wszystko do promptu"
 *
 * Kusi, żeby podać modelowi całą listę zadań i niech sam wybierze, co ważne.
 * Trzy powody, dla których tego nie robimy:
 *
 *   • **Koszt.** Prompt idzie do modelu przy każdym namyśle — domyślnie co pięć
 *     minut. Sto zadań w każdym zapytaniu to sto zadań razy dwanaście na godzinę.
 *   • **Uwaga.** Model gubi rzeczy w długim kontekście; jedno pilne zadanie
 *     w setce nieistotnych jest w praktyce niewidoczne.
 *   • **Prawdziwość.** Wybór „co jest pilne" da się zrobić dokładnie i taniej
 *     w kodzie, na datach. Zostawiony modelowi bywa zmyślony.
 *
 * Dlatego zadania są **grupowane po terminie**, a lista bez terminu wchodzi
 * jako sama liczba. Wieczorne spotkanie ma zauważyć pusty dzień, więc pustka
 * jest tu wypowiadana wprost, a nie zostawiona jako brak wzmianki.
 */

// ── Kształt danych w plikach MyCastle ────────────────────────────────────────

/** `data/projects.json` → `{ type: 'projects', projects: [...] }` */
export interface Projekt {
  id: string;
  name: string;
  description?: string;
}

/** `data/tasks.json` → `{ type: 'tasks', tasks: [...] }` */
export interface Zadanie {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  /** Szacowany czas w godzinach (ułamkowo: 0,25 = kwadrans). */
  duration?: number;
  /** Termin w ISO 8601. Brak znaczy „kiedyś". */
  dueDate?: string;
  done?: boolean;
  status?: string;
  docPath?: string;
}

/** `data/calendar/{RRRR}/{MM}/{DD}.json` → `{ type: 'events', tasks: [...] }` */
export interface Wydarzenie {
  taskId: string;
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
}

export interface PogrupowaneZadania {
  zalegle: Zadanie[];
  naDzis: Zadanie[];
  wkrotce: Zadanie[];
  bezTerminu: Zadanie[];
}

/** Ile dni naprzód liczy się jeszcze jako „wkrótce". */
const HORYZONT_DNI = 3;

/** Ile pozycji najwyżej wypisujemy w jednej grupie. */
const LIMIT_GRUPY = 12;

// ── Czas w strefie użytkownika ───────────────────────────────────────────────

/** Dzień kalendarzowy w strefie użytkownika, w zapisie `RRRR-MM-DD`. */
function dzien(znacznik: number, strefa: string): string {
  // `en-CA` daje z definicji układ RRRR-MM-DD, więc nie trzeba sklejać ręcznie.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: strefa, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(znacznik));
}

function godzina(znacznik: number, strefa: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: strefa, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(znacznik));
}

/**
 * Lista dni kalendarzowych wokół podanej chwili.
 *
 * Idziemy po dobach doliczanych do znacznika, a nie po numerach dni w miesiącu:
 * dzięki temu przejście przez koniec miesiąca i roku wychodzi samo, bez
 * sprawdzania, ile dni ma luty.
 */
export function zakresDni(teraz: number, wstecz: number, naprzod: number, strefa: string): string[] {
  const DOBA = 24 * 3600_000;
  const dni: string[] = [];
  for (let i = -wstecz; i <= naprzod; i += 1) dni.push(dzien(teraz + i * DOBA, strefa));
  return [...new Set(dni)];
}

/** `2026-08-27` → `data/calendar/2026/08/27.json`. */
export function sciezkiKalendarza(dni: string[]): string[] {
  return dni.map((d) => {
    const [rok, miesiac, dzienMiesiaca] = d.split('-');
    return `data/calendar/${rok}/${miesiac}/${dzienMiesiaca}.json`;
  });
}

/** Skleja wydarzenia z wielu dni i porządkuje chronologicznie. */
export function scalWydarzenia(dni: Wydarzenie[][]): Wydarzenie[] {
  return dni
    .flat()
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

// ── Wybór tego, co istotne ───────────────────────────────────────────────────

function ukonczone(z: Zadanie): boolean {
  if (z.done) return true;
  // Różne części MyCastle zapisują ukończenie inaczej; przyjmujemy oba zapisy.
  return ['done', 'ukonczone', 'zrobione', 'completed'].includes((z.status ?? '').toLowerCase());
}

/**
 * Rozdziela zadania na cztery rozłączne grupy według terminu.
 *
 * Rozłączność jest tu warunkiem, a nie szczegółem: to samo zadanie wymienione
 * i jako „na dziś", i jako „zaległe" kazałoby modelowi mówić o nim dwa razy,
 * a użytkownikowi wyglądałoby na dwa różne zadania.
 */
export function wybierzZadania(zadania: Zadanie[], teraz: number, strefa: string): PogrupowaneZadania {
  const dzis = dzien(teraz, strefa);
  const granicaWkrotce = zakresDni(teraz, 0, HORYZONT_DNI, strefa);

  const wynik: PogrupowaneZadania = { zalegle: [], naDzis: [], wkrotce: [], bezTerminu: [] };

  for (const z of zadania) {
    if (!z.dueDate) {
      if (!ukonczone(z)) wynik.bezTerminu.push(z);
      continue;
    }

    const termin = new Date(z.dueDate).getTime();
    if (!Number.isFinite(termin)) { wynik.bezTerminu.push(z); continue; }

    const dzienTerminu = dzien(termin, strefa);

    if (dzienTerminu === dzis) { wynik.naDzis.push(z); continue; }
    if (dzienTerminu < dzis) {
      // Ukończone zaległe nie są zaległe — to zwykłe zamknięte zadania.
      if (!ukonczone(z)) wynik.zalegle.push(z);
      continue;
    }
    if (granicaWkrotce.includes(dzienTerminu) && !ukonczone(z)) wynik.wkrotce.push(z);
  }

  return wynik;
}

// ── Opis dla modelu ──────────────────────────────────────────────────────────

export interface ZapytanieOOpis {
  projekty: Projekt[];
  zadania: Zadanie[];
  wydarzenia: Wydarzenie[];
  teraz: number;
  strefa: string;
  /**
   * Czego nie udało się pobrać.
   *
   * Ma wpływ na treść, a nie tylko na przypis: przy niepełnych danych **nie
   * wolno** powiedzieć, że dzień jest pusty. „Nic nie ma" i „nie wiadomo, czy
   * coś jest" prowadzą do przeciwnych zachowań — pierwsze każe Kasi doradzać
   * dopisanie wydarzeń, drugie każe jej milczeć na ten temat.
   */
  bledy?: string[];
}

function wierszZadania(z: Zadanie, nazwaProjektu: (id?: string) => string, strefa: string): string {
  const projekt = nazwaProjektu(z.projectId);
  const czas = z.duration ? `, ~${z.duration} h` : '';
  const termin = z.dueDate ? ` [${dzien(new Date(z.dueDate).getTime(), strefa)}]` : '';
  return `    – ${z.name}${projekt ? ` (${projekt})` : ''}${czas}${termin}`;
}

function grupa(tytul: string, zadania: Zadanie[], nazwaProjektu: (id?: string) => string, strefa: string): string[] {
  if (zadania.length === 0) return [];
  const widoczne = zadania.slice(0, LIMIT_GRUPY);
  const linie = [`  ${tytul} (${zadania.length}):`, ...widoczne.map((z) => wierszZadania(z, nazwaProjektu, strefa))];
  // Ucięcie musi być widoczne — inaczej model uzna, że to cała lista.
  if (zadania.length > widoczne.length) {
    linie.push(`    … i jeszcze ${zadania.length - widoczne.length}`);
  }
  return linie;
}

export function opisDanych({ projekty, zadania, wydarzenia, teraz, strefa, bledy = [] }: ZapytanieOOpis): string {
  const nazwaProjektu = (id?: string): string =>
    (id ? projekty.find((p) => p.id === id)?.name ?? '' : '');

  const pog = wybierzZadania(zadania, teraz, strefa);
  const dzis = dzien(teraz, strefa);
  const dzisiejsze = wydarzenia.filter((w) => dzien(new Date(w.startTime).getTime(), strefa) === dzis);

  const linie: string[] = ['Dane z MyCastle:'];

  if (dzisiejsze.length > 0) {
    linie.push(`  Wydarzenia dzisiaj (${dzisiejsze.length}):`);
    for (const w of dzisiejsze.slice(0, LIMIT_GRUPY)) {
      const od = godzina(new Date(w.startTime).getTime(), strefa);
      const doG = godzina(new Date(w.endTime).getTime(), strefa);
      linie.push(`    – ${od}–${doG} ${w.name}`);
    }
  }

  linie.push(...grupa('Zadania na dziś', pog.naDzis, nazwaProjektu, strefa));
  linie.push(...grupa('Zaległe', pog.zalegle, nazwaProjektu, strefa));
  linie.push(...grupa('Na najbliższe dni', pog.wkrotce, nazwaProjektu, strefa));

  /*
   * Zadania bez terminu wchodzą jako liczba, nie jako lista.
   *
   * Bywa ich kilkadziesiąt i żadne nie jest pilne — wypisane zajęłyby więcej
   * miejsca niż wszystko, co naprawdę dotyczy dzisiaj. Sama liczba wystarczy,
   * żeby Kasia mogła o nich wspomnieć przy planowaniu tygodnia.
   */
  if (pog.bezTerminu.length > 0) {
    linie.push(`  Bez terminu: ${pog.bezTerminu.length} zadań.`);
  }

  // Projekt bez nazwy nic nie wnosi, a w wyliczeniu wygląda jak zgubiony wyraz.
  const nazwane = projekty.map((p) => p.name?.trim()).filter((n): n is string => Boolean(n));
  if (nazwane.length > 0) {
    linie.push(`  Projekty (${nazwane.length}): ${nazwane.join(', ')}`);
  }

  /*
   * Pusty dzień wypowiadany wprost.
   *
   * HersztuEvening ma zauważyć dzień bez śladu w danych i zaproponować
   * dopisanie czegoś. Model nie wywnioskuje pustki z braku wzmianki — brak
   * danych i brak sekcji wyglądają dla niego tak samo.
   */
  if (bledy.length > 0) {
    linie.push(
      `  UWAGA: część danych była niedostępna (${bledy.length}). Nie wiadomo, czy dzień`,
      '  jest pusty — nie wyciągaj wniosków z tego, czego tu nie widzisz.',
    );
  } else if (dzisiejsze.length === 0 && pog.naDzis.length === 0) {
    linie.push('  Na dzisiaj nie ma ani jednego wydarzenia, ani zadania z terminem.');
  }

  return linie.join('\n');
}
