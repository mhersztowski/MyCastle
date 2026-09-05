import { describe, it, expect } from 'vitest';
import { detectServerUrl } from './detectPort';

describe('detectServerUrl', () => {
  it('adres wypisany wprost', () => {
    expect(detectServerUrl('  ➜  Local:   http://localhost:5173/')).toBe('http://localhost:5173/');
  });

  it('adres z 127.0.0.1 też jest adresem', () => {
    expect(detectServerUrl('Server running at http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
  });

  it('sam numer portu po słowie „port"', () => {
    // Wiele narzędzi pisze „listening on port 4000" i nic więcej.
    expect(detectServerUrl('Listening on port 4000')).toBe('http://localhost:4000');
  });

  it('zapis `host:port` po nazwie hosta', () => {
    expect(detectServerUrl('started on 0.0.0.0:8080')).toBe('http://localhost:8080');
  });

  it('0.0.0.0 zamieniamy na localhost', () => {
    // Adres nasłuchu nie jest adresem, pod który da się wejść w przeglądarce.
    expect(detectServerUrl('http://0.0.0.0:8080')).toBe('http://localhost:8080');
  });

  it('linia bez adresu nie zmyśla portu', () => {
    expect(detectServerUrl('Build completed in 3.2s')).toBeNull();
    expect(detectServerUrl('installed 120 packages')).toBeNull();
  });

  it('liczby, które nie są portem, nie są portem', () => {
    // „done in 1234 ms" nie znaczy port 1234.
    expect(detectServerUrl('done in 1234 ms')).toBeNull();
    expect(detectServerUrl('webpack 5.90.0 compiled')).toBeNull();
  });

  it('port poza zakresem odrzucamy', () => {
    expect(detectServerUrl('listening on port 99999')).toBeNull();
    expect(detectServerUrl('listening on port 0')).toBeNull();
  });

  it('pierwszy adres w linii wygrywa', () => {
    expect(detectServerUrl('Local: http://localhost:5173/ Network: http://192.168.0.5:5173/'))
      .toBe('http://localhost:5173/');
  });

  it('sekwencje sterujące terminala nie przeszkadzają', () => {
    // Vite koloruje wyjście; bez zdjęcia kodów adres nie daje się dopasować.
    const line = '\x1b[32m➜\x1b[0m  Local: \x1b[36mhttp://localhost:5173/\x1b[0m';
    expect(detectServerUrl(line)).toBe('http://localhost:5173/');
  });
});
