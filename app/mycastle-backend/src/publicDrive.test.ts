/**
 * Publiczne katalogi Drive — co serwer wydaje bez logowania.
 *
 * Sprawdzenie dotyczy **decyzji**, nie transportu: czy dana ścieżka w ogóle
 * kwalifikuje się do wydania. Sam odczyt pliku i nagłówki HTTP są już
 * przetestowane po stronie `HttpUploadServer`.
 *
 * Reguła przychodzi z `@mhersztowski/core` i jest ta sama, której używa strona
 * Drive przy decyzji „pokazać przycisk kopiowania linku". Ten test pilnuje, że
 * backend faktycznie z niej korzysta, zamiast mieć własną kopię.
 */
import { describe, it, expect } from 'vitest';
import { isPublicDrivePath, PUBLIC_DRIVE_DIRS } from '@mhersztowski/core';

describe('co jest publiczne', () => {
  it('baza wiedzy i repozytoria, obok dotychczasowego „public"', () => {
    expect(isPublicDrivePath('public/logo.png')).toBe(true);
    expect(isPublicDrivePath('knowledge/15-1.md')).toBe(true);
    expect(isPublicDrivePath('git/projekt/README.md')).toBe(true);
  });

  it('reszta Drive zostaje prywatna', () => {
    expect(isPublicDrivePath('notatki/hasla.md')).toBe(false);
    expect(isPublicDrivePath('automate/aura/skrypt.automate')).toBe(false);
    expect(isPublicDrivePath('.postepy.json')).toBe(false);
  });

  /**
   * Wyjście w górę drzewa musi być odrzucone **przed** dotknięciem dysku.
   *
   * Serwer normalizuje ścieżkę jeszcze raz przy odczycie, ale poleganie na tym
   * jednym sprawdzeniu znaczyłoby, że decyzja o publiczności i ochrona przed
   * wyjściem z katalogu mieszkają w dwóch miejscach — a wtedy zmiana jednego
   * z nich cicho psuje drugie.
   */
  it('nie da się wyjść poza katalog publiczny', () => {
    expect(isPublicDrivePath('knowledge/../../../etc/passwd')).toBe(false);
    expect(isPublicDrivePath('public/../notatki/hasla.md')).toBe(false);
  });

  it('lista publicznych katalogów jest krótka i jawna', () => {
    // Każdy wpis to zgoda na czytanie bez konta — rozrost tej listy ma być
    // widoczny w diffie, a nie ukryty w regule.
    expect([...PUBLIC_DRIVE_DIRS]).toEqual(['public', 'knowledge', 'git']);
  });
});

describe('listowanie katalogu publicznego', () => {
  /**
   * Czytelnik bez konta potrzebuje drzewa, zanim sięgnie po pojedynczy plik:
   * baza wiedzy to katalog kilkuset dokumentów, a bez listowania nie ma jak
   * ich odkryć. Ukrywanie nazw przy jednoczesnym wydawaniu plików nie dodałoby
   * zresztą bezpieczeństwa — katalog jest publiczny świadomie, a jego struktura
   * jest spisem treści.
   */
  it('listowanie podlega tej samej regule co odczyt pliku', () => {
    // Reguła jest wspólna, więc katalog spoza listy nie da się ani odczytać,
    // ani wylistować — jedno sprawdzenie, nie dwa rozjeżdżające się.
    expect(isPublicDrivePath('knowledge')).toBe(true);
    expect(isPublicDrivePath('knowledge/book')).toBe(true);
    expect(isPublicDrivePath('notatki')).toBe(false);
  });
});
