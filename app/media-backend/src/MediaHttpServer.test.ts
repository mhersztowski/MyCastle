/**
 * Testy sprawdzenia adresu przed pobraniem.
 *
 * Serwer pobiera adresy podane przez przeglądarkę — kanał RSS i plik odcinka.
 * Bez tej bramki aplikacja byłaby narzędziem do odpytywania sieci wewnętrznej
 * z jej własnego wnętrza, co jest klasycznym SSRF.
 */

import { describe, it, expect } from 'vitest';
import { isSafeHttpUrl } from './MediaHttpServer';

describe('isSafeHttpUrl', () => {
  it('przepuszcza publiczne http i https', () => {
    expect(isSafeHttpUrl('https://example.org/rss')).toBe(true);
    expect(isSafeHttpUrl('http://podcast.example.com/ep1.mp3')).toBe(true);
  });

  it('odrzuca inne protokoły', () => {
    // `file:` czytałby dysk serwera, `gopher:` bywał drogą do usług lokalnych.
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('gopher://example.org')).toBe(false);
    expect(isSafeHttpUrl('data:text/plain,cokolwiek')).toBe(false);
  });

  it('odrzuca maszynę lokalną', () => {
    expect(isSafeHttpUrl('http://localhost:1996/api/queue')).toBe(false);
    expect(isSafeHttpUrl('http://127.0.0.1/')).toBe(false);
    expect(isSafeHttpUrl('http://[::1]/')).toBe(false);
  });

  it('odrzuca sieci prywatne', () => {
    expect(isSafeHttpUrl('http://10.0.0.5/')).toBe(false);
    expect(isSafeHttpUrl('http://192.168.1.1/')).toBe(false);
    expect(isSafeHttpUrl('http://172.16.0.1/')).toBe(false);
    expect(isSafeHttpUrl('http://172.31.255.255/')).toBe(false);
  });

  it('przepuszcza adresy 172.x spoza zakresu prywatnego', () => {
    // 172.15 i 172.32 są publiczne — zbyt szeroka reguła blokowałaby zwykłe
    // serwery kanałów.
    expect(isSafeHttpUrl('http://172.15.0.1/')).toBe(true);
    expect(isSafeHttpUrl('http://172.32.0.1/')).toBe(true);
  });

  it('odrzuca link-local, przez który chmury wystawiają metadane', () => {
    expect(isSafeHttpUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
  });

  it('odrzuca nazwy lokalne', () => {
    expect(isSafeHttpUrl('http://drukarka.local/')).toBe(false);
    expect(isSafeHttpUrl('http://serwer.localhost/')).toBe(false);
  });

  it('odrzuca śmieci zamiast adresu', () => {
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl('nie-adres')).toBe(false);
  });
});
