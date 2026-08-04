/**
 * Które katalogi Drive są publiczne — jedna reguła dla backendu i dla UI.
 *
 * Reguła istniała dotąd w dwóch miejscach naraz: backend sprawdzał, czy ścieżka
 * zaczyna się od `drive/public`, a strona Drive miała własną kopię tego samego
 * warunku. Póki katalog był jeden, rozjazd nie miał jak wyjść na jaw. Przy
 * trzech wyszedłby przy pierwszym: backend serwowałby plik, którego UI nie
 * oznaczyłoby jako publicznego (albo odwrotnie — pokazałoby link do 403).
 */
import { describe, it, expect } from 'vitest';
import { PUBLIC_DRIVE_DIRS, isPublicDrivePath, publicDriveUrl, publicDriveRoot } from './publicPaths';

describe('rozpoznanie ścieżki publicznej', () => {
  it('katalog publiczny i wszystko w nim', () => {
    for (const dir of PUBLIC_DRIVE_DIRS) {
      expect(isPublicDrivePath(dir)).toBe(true);
      expect(isPublicDrivePath(`${dir}/plik.md`)).toBe(true);
      expect(isPublicDrivePath(`${dir}/glebiej/plik.md`)).toBe(true);
    }
  });

  it('katalogi wiedzy i repozytoriów są publiczne razem z „public"', () => {
    expect(isPublicDrivePath('knowledge/15-1.md')).toBe(true);
    expect(isPublicDrivePath('git/projekt/README.md')).toBe(true);
  });

  it('reszta Drive nie jest', () => {
    expect(isPublicDrivePath('notatki/prywatne.md')).toBe(false);
    expect(isPublicDrivePath('automate/skrypt.automate')).toBe(false);
  });

  /**
   * Nazwa zaczynająca się od nazwy katalogu publicznego **nie** jest publiczna.
   *
   * `publiczne-notatki/` zaczyna się od „public", a nie ma z nim nic wspólnego.
   * Sprawdzenie przez `startsWith` bez ukośnika wpuściłoby je na zewnątrz.
   */
  it('nie łapie się na katalog o podobnej nazwie', () => {
    expect(isPublicDrivePath('publiczne-notatki/x.md')).toBe(false);
    expect(isPublicDrivePath('knowledge-robocze/x.md')).toBe(false);
    expect(isPublicDrivePath('github/x.md')).toBe(false);
  });

  it('próba wyjścia w górę nie jest publiczna, choćby zaczynała się dobrze', () => {
    expect(isPublicDrivePath('public/../notatki/tajne.md')).toBe(false);
    expect(isPublicDrivePath('knowledge/../../etc/passwd')).toBe(false);
  });

  it('ukośnik na początku nie zmienia odpowiedzi', () => {
    expect(isPublicDrivePath('/knowledge/15-1.md')).toBe(true);
  });
});

describe('korzeń publicznej ścieżki', () => {
  it('podaje katalog, z którego bierze się publiczność', () => {
    expect(publicDriveRoot('knowledge/15-1.md')).toBe('knowledge');
    expect(publicDriveRoot('public/a/b.png')).toBe('public');
    expect(publicDriveRoot('notatki/x.md')).toBeUndefined();
  });
});

describe('adres publiczny', () => {
  it('buduje adres z nazwą użytkownika i ścieżką', () => {
    expect(publicDriveUrl('https://app.example', 'ala', 'knowledge/15-1.md'))
      .toBe('https://app.example/public/drive/users/ala/knowledge/15-1.md');
  });

  it('koduje znaki specjalne w nazwie i ścieżce', () => {
    const url = publicDriveUrl('https://x', 'jan kowalski', 'knowledge/rozdział 15.md');

    expect(url).toContain('jan%20kowalski');
    expect(url).toContain('rozdzia%C5%82%2015.md');
    // Ukośniki zostają ukośnikami — inaczej adres przestałby wskazywać plik.
    expect(url).toContain('/knowledge/');
  });

  it('nie buduje adresu dla ścieżki spoza katalogów publicznych', () => {
    expect(publicDriveUrl('https://x', 'ala', 'notatki/x.md')).toBeUndefined();
  });
});
