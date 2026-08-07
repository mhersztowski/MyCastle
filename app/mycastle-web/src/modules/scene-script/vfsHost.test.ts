/**
 * Host sceny dla skryptów sięgających po VFS MyCastle.
 *
 * Sedno testów: skrypt ma czytać pliki **tym samym kanałem, co reszta strony**.
 * Drive listuje i otwiera pliki po REST, a host sceny sięgał po MQTT — więc
 * `Scene.load` kończyło się „Not connected to MQTT broker" na stronie, która
 * poza tym działała bez zarzutu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sciezkaBackendu, utworzHostaSceny } from './vfsHost';

describe('ścieżka skryptu na ścieżkę backendu', () => {
  it('dokłada katalog użytkownika', () => {
    expect(sciezkaBackendu('marcin', 'drive/projekty/dom.scene.json'))
      .toBe('/data/Minis/Users/marcin/drive/projekty/dom.scene.json');
  });

  it('działa dla katalogów spoza drive', () => {
    // W drzewie są też `server/…` — ograniczenie do `drive/` odcięłoby je bez słowa.
    expect(sciezkaBackendu('marcin', 'server/config.json'))
      .toBe('/data/Minis/Users/marcin/server/config.json');
  });

  it('znosi wiodący ukośnik', () => {
    expect(sciezkaBackendu('marcin', '/drive/a.json'))
      .toBe('/data/Minis/Users/marcin/drive/a.json');
  });

  it('nie wpuszcza wyjścia poza katalog użytkownika', () => {
    // Skrypt pisze użytkownik, ale to nie powód, by pozwalać mu sięgać
    // `..` do cudzych katalogów — backend i tak odmówi, lepiej wcześniej.
    expect(() => sciezkaBackendu('marcin', 'drive/../../inny/tajne.json')).toThrow(/poza/i);
  });
});

describe('odczyt i zapis', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const host = () => utworzHostaSceny({
    userName: 'marcin',
    authHeaders: () => ({ Authorization: 'Bearer xyz' }),
    present: () => {},
  });

  it('czyta plik i rozkodowuje treść', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: btoa('{"nodes":[]}') }),
    });

    await expect(host().readFile('drive/a.scene.json')).resolves.toBe('{"nodes":[]}');

    const [url, opcje] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/api/users/marcin/vfs/readFile');
    expect(url).toContain(encodeURIComponent('/data/Minis/Users/marcin/drive/a.scene.json'));
    expect((opcje as { headers: Record<string, string> }).headers.Authorization).toBe('Bearer xyz');
  });

  it('brak pliku daje null, a nie wyjątek', async () => {
    // `Scene.load` odróżnia „nie ma pliku" od awarii — na tym stoi `Scene.create`.
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(host().readFile('drive/nie-ma.json')).resolves.toBeNull();
  });

  it('błąd serwera tłumaczy się po ludzku', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(host().readFile('drive/a.json')).rejects.toThrow(/drive\/a\.json.*500/s);
  });

  it('zapisuje treść zakodowaną base64', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await host().writeFile!('drive/a.json', '{"x":1}');

    const [url, opcje] = fetchMock.mock.calls[0]!;
    const o = opcje as { method: string; body: string };
    expect(url).toContain('/api/users/marcin/vfs/writeFile');
    expect(o.method).toBe('POST');
    expect(JSON.parse(o.body).data).toBe(btoa('{"x":1}'));
  });

  it('nieudany zapis nie udaje sukcesu', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expect(host().writeFile!('drive/a.json', '{}')).rejects.toThrow(/403/);
  });

  it('radzi sobie z polskimi znakami w treści', async () => {
    // `btoa` nie przyjmuje znaków spoza latin-1 — bez kodowania UTF-8 zapis
    // sceny z polskim opisem wysypywałby się w losowym miejscu.
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await host().writeFile!('drive/a.json', '{"opis":"zażółć gęślą jaźń"}');

    const wyslane = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body).data;
    const odczyt = new TextDecoder().decode(
      Uint8Array.from(atob(wyslane), (c) => c.charCodeAt(0)),
    );
    expect(odczyt).toContain('zażółć gęślą jaźń');
  });
});
