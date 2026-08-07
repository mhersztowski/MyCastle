/**
 * potrzebneQt.ts — czy skrypt sięga po widgety Qt z przeglądarki.
 *
 * Drive wczytywał `qobject.module.js` i `qt.module.js` **przed każdym** skryptem
 * i przerywał uruchomienie, gdy ich nie znalazł. Te pliki leżą w katalogu
 * użytkownika (`drive/users/{u}/lit/qt`), więc kto ich tam nie ma, nie mógł
 * uruchomić **żadnego** skryptu — również takiego, który tylko czyta scenę albo
 * wypisuje liczbę. Widgety Qt są dodatkiem, a nie warunkiem startu.
 *
 * Rozpoznajemy potrzebę z treści skryptu. To rozwiązanie przybliżone i takie ma
 * być: pomyłka w jedną stronę kosztuje pobranie dwóch plików, w drugą — błąd
 * „QLabel is not a constructor" zamiast zdania, co doinstalować. Kolejność tych
 * kosztów jest zamierzona.
 */

/** Nazwy zapisane samymi wielkimi literami to skróty (`QUARTAL`, `SQL`), nie klasy. */
const samePrzedstawiciele = (token: string): boolean => token === token.toUpperCase();

export function potrzebujeQt(kod: string): boolean {
  if (!kod) return false;

  // Import z katalogu `qt` — wtedy nie ma po co zgadywać z nazw.
  if (/from\s+['"][^'"]*\/qt\/[^'"]*['"]/.test(kod)) return true;

  for (const token of kod.match(/\bQ[A-Za-z]\w*/g) ?? []) {
    if (samePrzedstawiciele(token)) continue;
    // `QLabel`, `QVBoxLayout` — oraz `QtCanvas`, które nie pasuje do pierwszego
    // wzorca, bo po `Q` ma małe `t`.
    if (/^Q[A-Z]/.test(token) || /^Qt[A-Z]/.test(token)) return true;
  }

  return false;
}
