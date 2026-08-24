/**
 * Testy przycisku z zegarka.
 *
 * Sam endpoint jest krótki, ale ma dwie cechy, których nie widać w kodzie i przy
 * których łatwo o cichą pomyłkę: musi działać **bez uwierzytelnienia** (zegarek
 * nie ma sesji ani miejsca na wpisanie hasła) i musi **zawsze coś powiedzieć
 * w logu** — bo przy sprawdzaniu, czy przycisk w ogóle działa, konsola backendu
 * jest jedynym miejscem, w które można spojrzeć.
 */

import { describe, it, expect } from 'vitest';
import { formatWatchPress, parseWatchPress } from './watchPress';

describe('odczyt zgłoszenia', () => {
  it('przyjmuje puste ciało', () => {
    // Zegarek może wysłać samo naciśnięcie, bez żadnych danych — i to jest
    // poprawne zgłoszenie, nie błąd.
    const wynik = parseWatchPress('');
    expect(wynik.ok).toBe(true);
  });

  it('przyjmuje pełne zgłoszenie', () => {
    const wynik = parseWatchPress(JSON.stringify({ pressed: true, at: 1700000000000, device: 'watch-6' }));
    expect(wynik.ok).toBe(true);
    expect(wynik.at).toBe(1700000000000);
    expect(wynik.device).toBe('watch-6');
  });

  it('uszkodzony JSON nie przewraca zgłoszenia', () => {
    /*
     * Naciśnięcie przycisku jest zdarzeniem samo w sobie; jeśli treść przyszła
     * zniekształcona, to i tak wiemy, że ktoś nacisnął. Odrzucenie zgłoszenia
     * przez literówkę w polu pobocznym byłoby gorsze od jego przyjęcia.
     */
    const wynik = parseWatchPress('{to nie jest JSON');
    expect(wynik.ok).toBe(true);
    expect(wynik.warning).toBeDefined();
  });

  it('brak czasu uzupełnia czasem odebrania', () => {
    // Zegarek bywa rozsynchronizowany; czas serwera jest tym, którego szukamy
    // w logu, gdy porównujemy zgłoszenie z czymkolwiek innym.
    const wynik = parseWatchPress('{}', () => 1700000000000);
    expect(wynik.at).toBe(1700000000000);
  });

  it('czas spoza rozsądnego zakresu jest zastępowany', () => {
    // Zegarek po resecie melduje zwykle 1970 (zero) albo wartość zupełnie
    // przypadkową. Granice to rok 2020 i 2100 — na tyle szerokie, żeby nie
    // odrzucać poprawnych zgłoszeń, i na tyle wąskie, żeby odsiać śmieci.
    const teraz = () => 1700000000000;
    expect(parseWatchPress(JSON.stringify({ at: 0 }), teraz).at).toBe(1700000000000);
    expect(parseWatchPress(JSON.stringify({ at: 5e12 }), teraz).at).toBe(1700000000000);
    expect(parseWatchPress(JSON.stringify({ at: -1 }), teraz).at).toBe(1700000000000);
  });

  it('czas mieszczący się w zakresie jest zachowany', () => {
    // Rok 2096 jest dziwny, ale nie jest błędem formatu — nie zgadujemy za
    // użytkownika, co jest „za daleko".
    expect(parseWatchPress(JSON.stringify({ at: 4e12 }), () => 1).at).toBe(4e12);
  });
});

describe('wpis do logu', () => {
  it('zawiera czas i źródło', () => {
    const linia = formatWatchPress({ ok: true, at: 1700000000000, device: 'watch-6' }, '192.168.0.174');
    expect(linia).toContain('192.168.0.174');
    expect(linia).toContain('watch-6');
    expect(linia).toMatch(/⌚|WATCH/);
  });

  it('bez nazwy urządzenia nadal jest czytelny', () => {
    const linia = formatWatchPress({ ok: true, at: 1700000000000 }, '192.168.0.174');
    expect(linia).toContain('192.168.0.174');
    expect(linia.length).toBeGreaterThan(10);
  });

  it('ostrzeżenie o uszkodzonej treści trafia do logu', () => {
    // Inaczej zniekształcone zgłoszenia wyglądałyby dokładnie jak poprawne
    // i nikt by nie zauważył, że zegarek wysyła śmieci.
    const linia = formatWatchPress({ ok: true, at: 1, warning: 'treść nie jest JSON-em' }, '10.0.0.1');
    expect(linia).toContain('treść nie jest JSON-em');
  });

  it('nie wpuszcza znaków sterujących z sieci do konsoli', () => {
    /*
     * Nazwa urządzenia przychodzi z zewnątrz. Sekwencje ANSI w logu potrafią
     * przestawić kolory terminala albo ukryć wcześniejsze wiersze — a log
     * backendu jest tym, czemu przy diagnozie się ufa.
     */
    const linia = formatWatchPress({ ok: true, at: 1, device: 'zeg[31marek\nfałszywy wiersz' }, '10.0.0.1');
    expect(linia).not.toContain('');
    expect(linia.split('\n')).toHaveLength(1);
  });

  it('bardzo długa nazwa urządzenia jest przycinana', () => {
    const linia = formatWatchPress({ ok: true, at: 1, device: 'x'.repeat(500) }, '10.0.0.1');
    expect(linia.length).toBeLessThan(200);
  });
});
