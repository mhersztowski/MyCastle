import { describe, it, expect } from 'vitest';
import { adresyVfs, ciałoZapisu, jestUrl, trescZOdpowiedzi } from './sceneUrl';

describe('rozpoznanie adresu', () => {
  it('ścieżka w Drive to nie URL', () => {
    expect(jestUrl('drive/projekty/dom.scene.json')).toBe(false);
    expect(jestUrl('/users/marcin/plan.cad.json')).toBe(false);
  });

  it('adres z protokołem to URL', () => {
    expect(jestUrl('http://localhost:1897/users/marcin/plan.cad.json')).toBe(true);
    expect(jestUrl('HTTPS://serwer/plik.json')).toBe(true);
  });
});

describe('adresy VFS', () => {
  it('ścieżka staje się wywołaniem VFS na wyraźne życzenie', () => {
    const { read, write } = adresyVfs('http://localhost:1897/users/marcin/projects/plan.cad.json', true);

    expect(read).toContain('/api/vfs/readFile');
    expect(read).toContain('path=%2Fusers%2Fmarcin%2Fprojects%2Fplan.cad.json');
    expect(write).toContain('/api/vfs/writeFile');
  });

  it('gotowe wywołanie VFS zostaje użyte wprost, a zapis wynika z niego', () => {
    const { read, write } = adresyVfs('http://host:1897/api/vfs/readFile?path=/users/a/dom.scene.json');

    expect(read).toContain('/api/vfs/readFile');
    expect(read).toContain('path=');
    expect(write).toContain('/api/vfs/writeFile');
  });

  it('zwykły plik po HTTP nie ma gdzie zapisać', () => {
    // Lepiej powiedzieć to od razu niż udawać zapis i zgubić pracę.
    const { read, write } = adresyVfs('https://serwer/pliki/scena.json');
    expect(read).toBe('https://serwer/pliki/scena.json');
    expect(write).toBeNull();
  });

  it('nie robi z każdego adresu ścieżki VFS', () => {
    expect(adresyVfs('https://serwer/obrazek.png').write).toBeNull();
  });

  it('bez opcji `vfs` plik sceny też jest zwykłym plikiem', () => {
    // Zgadywanie po rozszerzeniu psuło serwery plików: dostawały adres
    // `/api/vfs/readFile`, którego nie znają, i oddawały 404 bez wskazówki.
    const { read, write } = adresyVfs('https://serwer/pliki/dom.scene.json');
    expect(read).toBe('https://serwer/pliki/dom.scene.json');
    expect(write).toBeNull();
  });
});

describe('treść z odpowiedzi', () => {
  it('odpakowuje base64 z VFS', () => {
    const tresc = '{"wersja":1}';
    const zakodowana = btoa(String.fromCharCode(...new TextEncoder().encode(tresc)));
    expect(trescZOdpowiedzi(JSON.stringify({ data: zakodowana }))).toBe(tresc);
  });

  it('polskie znaki wracają poprawnie', () => {
    // `atob` oddaje bajty w znakach; bez dekodowania UTF-8 „Warstwa górna"
    // wracałaby jako krzaki.
    const tresc = '{"nazwa":"Warstwa górna — łuk"}';
    const zakodowana = btoa(String.fromCharCode(...new TextEncoder().encode(tresc)));
    expect(trescZOdpowiedzi(JSON.stringify({ data: zakodowana }))).toBe(tresc);
  });

  it('zwykły plik JSON przechodzi bez zmian', () => {
    const scena = '{"version":"1.0.0","root":{}}';
    expect(trescZOdpowiedzi(scena)).toBe(scena);
  });

  it('odpowiedź, która nie jest JSON-em, zostaje jak jest', () => {
    expect(trescZOdpowiedzi('nie json')).toBe('nie json');
  });
});

describe('ciało zapisu', () => {
  it('pakuje treść tak, jak czyta ją VFS', () => {
    const tresc = '{"nazwa":"łuk"}';
    expect(trescZOdpowiedzi(ciałoZapisu(tresc))).toBe(tresc);
  });
});
