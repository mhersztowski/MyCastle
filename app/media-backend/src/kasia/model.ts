/**
 * model.ts — pojęcia, którymi posługuje się asystentka Kasia.
 *
 * Same typy i stałe; logika siedzi w `prompt.ts`, `dostepnosc.ts`
 * i `harmonogram.ts`, a stan trwały w `KasiaStore.ts`.
 *
 * ## Dlaczego Kasia mieszka w backendzie, a nie na stronie
 *
 * Aura (`iot/aura` w MyCastle) żyje w karcie przeglądarki: zamknięcie karty
 * kończy asystenta. Kasia ma przypominać o poranku i wieczorze, podejmować
 * inicjatywę co kilka minut i pilnować niedzielnego podsumowania — czyli
 * działać wtedy, gdy właśnie **nikt na nią nie patrzy**. To przesądza miejsce:
 * stan i pętla są po stronie serwera, a strona jest tylko oknem na nie.
 */

/**
 * Błąd, za który odpowiada wywołujący — zła godzina, nieznane spotkanie.
 *
 * Odróżniony od zwykłego `Error`, bo trasy muszą go zamienić na 400, a nie 500.
 * Bez tego rozróżnienia literówka w godzinie wygląda w logu tak samo jak awaria
 * serwera, a klient dostaje odpowiedź sugerującą, że to nie jego wina.
 */
export class BladZadania extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = 'BladZadania';
  }
}

/** Rodzaje stałych spotkań. Nazwy własne, bo tak nazywa je użytkownik. */
export type RodzajSpotkania = 'HersztuMorning' | 'HersztuEvening' | 'HersztuWeekly';

export const RODZAJE_SPOTKAN: readonly RodzajSpotkania[] = [
  'HersztuMorning', 'HersztuEvening', 'HersztuWeekly',
] as const;

/**
 * Dostępność użytkownika.
 *
 * `spie` i `nie-przeszkadzac` różnią się nie siłą, lecz **czasem powrotu**:
 * ze snu wraca się o poranku, a z „nie przeszkadzać" wtedy, kiedy się je
 * wyłączy. Kasia traktuje je tak samo przy zaczepianiu, ale inaczej przy
 * planowaniu, kiedy wrócić.
 */
export type TrybDostepnosci = 'dostepny' | 'nie-przeszkadzac' | 'spie';

export interface Dostepnosc {
  tryb: TrybDostepnosci;
  /**
   * Do kiedy obowiązuje (znacznik czasu). Brak = do odwołania.
   *
   * Termin jest tu po to, żeby „nie przeszkadzać" włączone przed spotkaniem
   * nie zostało włączone na tydzień — a taki jest zwykły los takich trybów.
   */
  do?: number;
  /** Kiedy ustawiono — do pokazania „śpisz od 23:10". */
  od: number;
}

/** Jedno stałe spotkanie z Kasią. */
export interface Spotkanie {
  rodzaj: RodzajSpotkania;
  /** Godzina w formacie `HH:MM`, czas lokalny użytkownika. */
  godzina: string;
  /**
   * Dzień tygodnia 0–6 (niedziela = 0) — tylko dla spotkań tygodniowych.
   * Dla porannego i wieczornego bez znaczenia, bo są codzienne.
   */
  dzienTygodnia?: number;
  wlaczone: boolean;
  /**
   * Czy godzina została **uzgodniona w rozmowie**, czy jest wartością domyślną.
   *
   * Rozróżnienie ma znaczenie dla zachowania Kasi: o domyślną godzinę wypada
   * dopytać („o siódmej pasuje?"), uzgodnionej się nie podważa.
   */
  uzgodnione: boolean;
}

/**
 * Zaplanowane zaczepienie użytkownika.
 *
 * Przypomnienie nie jest zdarzeniem jednorazowym. Wymaganie mówi o przypominaniu
 * „w sposób inteligentny od ustalonej godziny" — czyli o ponawianiu aż do
 * odpowiedzi, z odstępami, które rosną, i z granicą, po której Kasia odpuszcza.
 * Dlatego przypomnienie ma stan i licznik prób, a nie tylko termin.
 */
export interface Przypomnienie {
  id: string;
  rodzaj: RodzajSpotkania;
  /** Godzina, o której **miało** się zacząć — punkt odniesienia dla ponowień. */
  ustalonaNa: number;
  /** Kiedy Kasia zaczepi najbliższym razem. */
  nastepnaProba: number;
  /** Ile razy już zaczepiła. */
  prob: number;
  stan: 'oczekuje' | 'odbyte' | 'porzucone';
}

/**
 * Fragment promptu dołożony z zewnątrz — przez skrypt Drive albo automatyzację.
 *
 * `kind` rozdziela dwa różne pytania, które Kasia zadaje modelowi:
 *   • `init`   — kim jesteś i jak masz się zachowywać (stałe),
 *   • `update` — co teraz rozważyć, gdy myślisz z własnej inicjatywy (zmienne).
 *
 * Wymieszanie ich dałoby asystentkę, która przy każdym samodzielnym namyśle
 * dostaje całą swoją definicję ponownie — i która nie umie zapomnieć
 * jednorazowej wskazówki.
 */
export interface FragmentPromptu {
  id: string;
  kind: 'init' | 'update';
  /** Kto dołożył — nazwa skryptu albo `ręcznie`. Widoczne w panelu. */
  zrodlo: string;
  tekst: string;
  dodanoO: number;
  /**
   * Kiedy wygasa. Brak = na stałe.
   *
   * Bez wygasania fragmenty odkładają się w nieskończoność: skrypt dokłada
   * „przypomnij o wizycie w czwartek", czwartek mija, a zdanie zostaje
   * w prompcie na zawsze i model zaczyna wracać do zeszłych spraw.
   */
  wygasaO?: number;
}

export interface WiadomoscKasi {
  id: string;
  rola: 'user' | 'assistant' | 'system';
  tresc: string;
  o: number;
  /**
   * Czy to wypowiedź z własnej inicjatywy Kasi, a nie odpowiedź na pytanie.
   * Panel oznacza je inaczej — inaczej rozmowa wygląda, jakby użytkownik
   * zadał pytanie, którego nie zadał.
   */
  zInicjatywy?: boolean;
}

export interface UstawieniaKasi {
  /** Prompt bazowy — kim Kasia jest. Fragmenty ze skryptów są doklejane. */
  promptInit: string;
  /** Prompt inicjatywy — o czym ma pomyśleć, gdy myśli sama. */
  promptUpdate: string;
  /** Co ile minut Kasia myśli sama. 0 wyłącza inicjatywę. */
  inicjatywaCoMin: number;
  /** Model LLM — sama nazwa, np. `claude-sonnet-5`. */
  model: string;
  /** Kto dostarcza model. */
  dostawca: 'anthropic' | 'openai' | 'ollama';
  /** Adres API — pozwala wskazać LiteLLM, vLLM albo lokalną Ollamę. */
  adresModelu: string;
  strefaCzasowa: string;
}

/**
 * Sekrety — nigdy nie opuszczają serwera.
 *
 * Trzymane osobno od `ustawienia`, żeby `GET /api/kasia/stan` mógł oddać cały
 * stan bez wycinania pól. Rozdzielenie na poziomie typu jest tu warte więcej
 * niż filtrowanie przy serializacji: filtr da się zapomnieć dopisać, gdy
 * dojdzie kolejny sekret, a osobne pole samo z siebie nie wycieknie.
 */
export interface SekretyKasi {
  /** Klucz API dostawcy modelu. */
  kluczModelu: string;
}

export interface StanKasi {
  ustawienia: UstawieniaKasi;
  /** Konfiguracja głosu — kopiowana z Aury, używana przez przeglądarkę. */
  glos?: unknown;
  dostepnosc: Dostepnosc;
  spotkania: Spotkanie[];
  przypomnienia: Przypomnienie[];
  fragmenty: FragmentPromptu[];
  rozmowa: WiadomoscKasi[];
}

// ── Wartości domyślne ────────────────────────────────────────────────────────

export const PROMPT_INIT_DOMYSLNY = `Jesteś Kasią — osobistą asystentką Marcina.

Mówisz po polsku, zwięźle i konkretnie. Nie zaczynasz od uprzejmości, tylko od
rzeczy. Jeśli czegoś nie wiesz, mówisz to wprost, zamiast zgadywać.

Twoje zadania:
• Prowadzisz trzy stałe spotkania: HersztuMorning (rano — co jest do zrobienia
  dzisiaj), HersztuEvening (wieczorem — co udało się zrobić), HersztuWeekly
  (w niedzielę — plan na tydzień i kontrola wagi).
• Masz dostęp do projektów, zadań, wydarzeń i kalendarza Marcina. Zanim coś
  stwierdzisz o jego dniu, sprawdź te dane.
• Wieczorem, jeśli w danym dniu nie ma żadnego wydarzenia ani ukończonego
  zadania, zaproponuj dopisanie czegoś — dzień bez śladu w danych to zwykle
  dzień źle zapisany, a nie pusty.
• W niedzielę przypominasz o zważeniu się i omawiasz postępy. Doradzasz
  rzeczowo, bez oceniania i bez zachęt w stylu trenera.

Godziny spotkań ustalasz w rozmowie. Gdy godzina jest tylko domyślna, dopytaj,
czy pasuje. Gdy została uzgodniona — trzymaj się jej i nie wracaj do tematu.`;

export const PROMPT_UPDATE_DOMYSLNY = `Myślisz teraz sama, nikt cię o nic nie pytał.

Zastanów się, czy jest powód, żeby się odezwać. Powodem jest na przykład:
• zbliża się albo minęła godzina spotkania, a nie zostało odbyte,
• w danych pojawiło się coś, o czym Marcin prosił, żeby przypomnieć,
• zadanie ma termin dzisiaj albo jutro i nie ruszyło.

Powodem **nie jest** samo to, że minęło trochę czasu. Jeśli nie masz nic
konkretnego, odpowiedz dokładnie: MILCZ`;

/** Odpowiedź modelu oznaczająca „nie mam nic do powiedzenia". */
export const MILCZENIE = 'MILCZ';

export const SPOTKANIA_DOMYSLNE: Spotkanie[] = [
  { rodzaj: 'HersztuMorning', godzina: '07:30', wlaczone: true, uzgodnione: false },
  { rodzaj: 'HersztuEvening', godzina: '21:00', wlaczone: true, uzgodnione: false },
  { rodzaj: 'HersztuWeekly', godzina: '18:00', dzienTygodnia: 0, wlaczone: true, uzgodnione: false },
];

export const USTAWIENIA_DOMYSLNE: UstawieniaKasi = {
  promptInit: PROMPT_INIT_DOMYSLNY,
  promptUpdate: PROMPT_UPDATE_DOMYSLNY,
  inicjatywaCoMin: 5,
  model: 'claude-sonnet-5',
  dostawca: 'anthropic',
  adresModelu: 'https://api.anthropic.com',
  strefaCzasowa: 'Europe/Warsaw',
};

export function stanPoczatkowy(teraz: number): StanKasi {
  return {
    ustawienia: { ...USTAWIENIA_DOMYSLNE },
    glos: undefined,
    dostepnosc: { tryb: 'dostepny', od: teraz },
    spotkania: SPOTKANIA_DOMYSLNE.map((s) => ({ ...s })),
    przypomnienia: [],
    fragmenty: [],
    rozmowa: [],
  };
}
