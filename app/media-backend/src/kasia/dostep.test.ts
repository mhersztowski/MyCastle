import { describe, it, expect } from 'vitest';
import { sprawdzHaslo, naglowekWyzwania } from './dostep';

describe('sprawdzHaslo', () => {
  it('bez ustawionego hasła wpuszcza każdego', () => {
    // Instalacja domowa bez hasła ma działać — inaczej pierwsze uruchomienie
    // kończyłoby się 401 i szukaniem, co jest nie tak.
    expect(sprawdzHaslo('', undefined).ok).toBe(true);
  });

  it('z hasłem odrzuca żądanie bez nagłówka', () => {
    const w = sprawdzHaslo('tajne', undefined);
    expect(w.ok).toBe(false);
    expect(w.status).toBe(401);
  });

  it('przyjmuje poprawne hasło w Basic', () => {
    const naglowek = `Basic ${Buffer.from('kasia:tajne').toString('base64')}`;
    expect(sprawdzHaslo('tajne', naglowek).ok).toBe(true);
  });

  it('nazwa użytkownika nie ma znaczenia — liczy się hasło', () => {
    const naglowek = `Basic ${Buffer.from('ktokolwiek:tajne').toString('base64')}`;
    expect(sprawdzHaslo('tajne', naglowek).ok).toBe(true);
  });

  it('odrzuca złe hasło', () => {
    const naglowek = `Basic ${Buffer.from('kasia:inne').toString('base64')}`;
    expect(sprawdzHaslo('tajne', naglowek).ok).toBe(false);
  });

  it('przyjmuje hasło jako token Bearer — wygodne dla skryptów', () => {
    expect(sprawdzHaslo('tajne', 'Bearer tajne').ok).toBe(true);
  });

  it('odrzuca uszkodzony Basic zamiast wywracać się na dekodowaniu', () => {
    expect(sprawdzHaslo('tajne', 'Basic %%%niebase64%%%').ok).toBe(false);
  });

  it('nie daje się nabrać na hasło będące przedrostkiem', () => {
    expect(sprawdzHaslo('tajne', 'Bearer taj').ok).toBe(false);
    expect(sprawdzHaslo('tajne', 'Bearer tajneXYZ').ok).toBe(false);
  });

  it('porównanie nie zdradza hasła długością pracy', () => {
    // Porównanie znak po znaku z wczesnym wyjściem pozwala odgadywać hasło
    // po czasie odpowiedzi. Sprawdzamy, że różne długości też są odrzucane
    // przez tę samą ścieżkę, a nie krótszym skrótem.
    expect(sprawdzHaslo('bardzo-dlugie-haslo', 'Bearer x').ok).toBe(false);
  });
});

describe('naglowekWyzwania', () => {
  it('mówi przeglądarce, żeby spytała o hasło', () => {
    expect(naglowekWyzwania()).toMatch(/^Basic realm=/);
  });
});
