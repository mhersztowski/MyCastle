import { describe, it, expect } from 'vitest';
import { parseDotEnv, mergeProjectEnv } from './projectEnv';

describe('parseDotEnv', () => {
  it('czyta zwykłe pary', () => {
    expect(parseDotEnv('API_KEY=abc\nPORT=3000\n')).toEqual({ API_KEY: 'abc', PORT: '3000' });
  });

  it('pomija komentarze i puste linie', () => {
    expect(parseDotEnv('# komentarz\n\nA=1\n  # wcięty\nB=2')).toEqual({ A: '1', B: '2' });
  });

  it('zdejmuje cudzysłowy, ale zostawia treść', () => {
    expect(parseDotEnv('A="ze spacją"\nB=\'też\'')).toEqual({ A: 'ze spacją', B: 'też' });
  });

  it('wartość ze znakiem równości zostaje w całości', () => {
    // Tokeny i hasła bywają zakończone `=` (base64) — cięcie na każdym znaku
    // równości uszkadzałoby je po cichu.
    expect(parseDotEnv('TOKEN=abc=def==')).toEqual({ TOKEN: 'abc=def==' });
  });

  it('`export` przed nazwą nie przeszkadza', () => {
    // Plik `.env` bywa też źródłowany w powłoce.
    expect(parseDotEnv('export A=1')).toEqual({ A: '1' });
  });

  it('znak `#` wewnątrz wartości nie jest komentarzem', () => {
    expect(parseDotEnv('COLOR=#ff00ff')).toEqual({ COLOR: '#ff00ff' });
  });

  it('linia bez znaku równości jest pomijana, nie wywraca pliku', () => {
    expect(parseDotEnv('A=1\nto nie jest przypisanie\nB=2')).toEqual({ A: '1', B: '2' });
  });

  it('nazwa niebędąca identyfikatorem odpada', () => {
    // Zmienna, której powłoka nie przyjmie, tylko udawałaby, że działa.
    expect(parseDotEnv('2X=1\nOK_1=2')).toEqual({ OK_1: '2' });
  });
});

describe('mergeProjectEnv', () => {
  it('plik projektu przebija środowisko backendu', () => {
    // Sens `.env` polega na tym, że projekt ustawia **swoje** wartości;
    // przegrywanie ze zmienną serwera czyniłoby plik ozdobą.
    expect(mergeProjectEnv({ NODE_ENV: 'production', PATH: '/bin' }, { NODE_ENV: 'development' }))
      .toMatchObject({ NODE_ENV: 'development', PATH: '/bin' });
  });

  it('PATH z projektu jest ignorowany', () => {
    // Podmiana PATH zdecydowałaby, **który** node i npm się uruchomi — to nie
    // jest konfiguracja projektu, tylko przejęcie środowiska procesu serwera.
    expect(mergeProjectEnv({ PATH: '/bin' }, { PATH: '/zly' }).PATH).toBe('/bin');
  });

  it('brak pliku nie zmienia niczego', () => {
    expect(mergeProjectEnv({ A: '1' }, {})).toEqual({ A: '1' });
  });
});
