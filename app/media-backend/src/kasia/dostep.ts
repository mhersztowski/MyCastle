/**
 * dostep.ts — hasło do panelu Kasi.
 *
 * `media-backend` nie ma uwierzytelniania i przez długi czas nie musiał go
 * mieć: pod publiczną domeną leżała kolejka podkastów, czyli nic. Z Kasią to
 * się zmienia — pod `/api/kasia/*` są zadania, kalendarz, waga i klucze API do
 * mowy, które muszą wracać do przeglądarki, bo to ona syntezuje głos.
 *
 * ## Dlaczego Basic, a nie JWT
 *
 * Kusi, żeby wziąć `JwtService` z `core-backend` i mieć „porządne" logowanie.
 * Tutaj byłoby to gorsze: JWT wymaga miejsca na tokeny, ich odświeżania
 * i ekranu logowania, a wszystko to po to, żeby obsłużyć **jednego użytkownika
 * z jednym hasłem**. Basic działa w przeglądarce bez linijki kodu po stronie
 * frontendu (okno hasła pokazuje sama przeglądarka), przechodzi przez WebView
 * w aplikacji mobilnej i da się go użyć z `curl` jednym parametrem.
 *
 * Warunek jest jeden i tutaj spełniony: **HTTPS**. Basic po HTTP przesyła hasło
 * w postaci czytelnej przy każdym żądaniu. Pod Coolify z certyfikatem to nie
 * problem; w sieci domowej po HTTP hasła i tak nie ma sensu ustawiać.
 *
 * ## Brak hasła to świadomy tryb, nie luka
 *
 * Bez `KASIA_HASLO` wszystko jest otwarte. Tak ma być: instalacja domowa
 * uruchamiana na `localhost` ma działać od razu, bez wymyślania hasła, którego
 * nikt nigdy nie wpisze. Odpowiedzialność za włączenie go przy publicznej
 * domenie spada na konfigurację — i dlatego `docker-compose.media.yml` mówi
 * o tym wprost przy zmiennej.
 */

import { timingSafeEqual } from 'node:crypto';

export interface WynikDostepu {
  ok: boolean;
  status?: 401;
}

/**
 * Porównanie odporne na pomiar czasu.
 *
 * Zwykłe `===` na napisach kończy się na pierwszej różnicy, więc czas
 * odpowiedzi zdradza, ile początkowych znaków się zgadza — a to wystarcza, żeby
 * odgadywać hasło znak po znaku. Różne długości sprowadzamy do tej samej
 * ścieżki przez zahaszowanie do stałej długości… a właściwie prościej: liczymy
 * porównanie zawsze na buforach równej długości, dokładając wynik porównania
 * długości do końcowej decyzji.
 */
function rowneBezpiecznie(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');

  // `timingSafeEqual` wymaga równych długości, więc porównujemy w stałym
  // rozmiarze i osobno uwzględniamy, czy długości się zgadzały.
  const dlugosc = Math.max(bufA.length, bufB.length, 1);
  const wyrownanyA = Buffer.alloc(dlugosc);
  const wyrownanyB = Buffer.alloc(dlugosc);
  bufA.copy(wyrownanyA);
  bufB.copy(wyrownanyB);

  return timingSafeEqual(wyrownanyA, wyrownanyB) && bufA.length === bufB.length;
}

/**
 * Czy żądanie ma prawo wejść.
 *
 * Przyjmujemy dwa sposoby podania hasła:
 *   • `Basic` — dla przeglądarki, która sama pokaże okno logowania,
 *   • `Bearer` — dla skryptów, gdzie kodowanie base64 jest zbędnym krokiem.
 *
 * Nazwa użytkownika przy `Basic` jest ignorowana: jest jedno hasło i jeden
 * użytkownik, więc wymaganie konkretnej nazwy dokładałoby rzecz do zapamiętania,
 * nie dokładając bezpieczeństwa.
 */
export function sprawdzHaslo(haslo: string, naglowek: string | undefined): WynikDostepu {
  if (!haslo) return { ok: true };
  if (!naglowek) return { ok: false, status: 401 };

  if (naglowek.startsWith('Bearer ')) {
    return rowneBezpiecznie(naglowek.slice(7).trim(), haslo)
      ? { ok: true }
      : { ok: false, status: 401 };
  }

  if (naglowek.startsWith('Basic ')) {
    try {
      const odkodowane = Buffer.from(naglowek.slice(6).trim(), 'base64').toString('utf8');
      // Hasło może zawierać dwukropek, więc dzielimy tylko na pierwszym.
      const podane = odkodowane.slice(odkodowane.indexOf(':') + 1);
      return rowneBezpiecznie(podane, haslo) ? { ok: true } : { ok: false, status: 401 };
    } catch {
      return { ok: false, status: 401 };
    }
  }

  return { ok: false, status: 401 };
}

/** Nagłówek każący przeglądarce pokazać okno hasła. */
export function naglowekWyzwania(): string {
  return 'Basic realm="Kasia", charset="UTF-8"';
}
