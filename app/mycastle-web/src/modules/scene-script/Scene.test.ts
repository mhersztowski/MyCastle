import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneGraph, GroupNode, SceneSerializer } from '@mhersztowski/core-scene3d';
import type { IScene } from '@mhersztowski/core-cad-viewer';
import { Scene, setSceneHost } from './Scene';

const SCENA_3D = (() => {
  const graph = new SceneGraph();
  graph.addNode(new GroupNode({ id: 'g', name: 'Grupa' }));
  return SceneSerializer.serialize(graph);
})();

const pliki = new Map<string, string>();
const pokazane: Array<{ scene: IScene; path: string }> = [];

beforeEach(() => {
  pliki.clear();
  pokazane.length = 0;
  pliki.set('drive/dom.scene.json', SCENA_3D);

  setSceneHost({
    readFile: async (path) => pliki.get(path) ?? null,
    writeFile: async (path, content) => { pliki.set(path, content); },
    present: (scene, opis) => { pokazane.push({ scene, path: opis.path }); },
  });
});

describe('Scene.load', () => {
  it('wczytuje scenę i pokazuje ją w panelu', async () => {
    const scena = await Scene.load('drive/dom.scene.json');

    expect(scena.kind).toBe('scene3d');
    expect(scena.getNode('Grupa')).not.toBeNull();
    // Skrypt, który wczytał scenę, prawie zawsze chce ją zobaczyć.
    expect(pokazane).toHaveLength(1);
    expect(pokazane[0].path).toBe('drive/dom.scene.json');
  });

  it('`silent` wczytuje bez panelu — dla skryptów, które tylko liczą', async () => {
    await Scene.load('drive/dom.scene.json', { silent: true });
    expect(pokazane).toHaveLength(0);
  });

  it('nieznane rozszerzenie to zrozumiały błąd z podpowiedzią', async () => {
    pliki.set('drive/cos.json', SCENA_3D);
    await expect(Scene.load('drive/cos.json')).rejects.toThrow(/rodzaju|kind/i);
  });

  it('rodzaj podany wprost ma pierwszeństwo nad nazwą pliku', async () => {
    pliki.set('drive/cos.json', SCENA_3D);
    const scena = await Scene.load('drive/cos.json', { kind: 'scene3d' });
    expect(scena.kind).toBe('scene3d');
  });

  it('brak pliku to błąd, a nie pusta scena udająca wczytaną', async () => {
    await expect(Scene.load('drive/nie-ma.scene.json')).rejects.toThrow(/Nie ma pliku/);
  });

  it('…chyba że skrypt prosi o utworzenie', async () => {
    const scena = await Scene.load('drive/nowa.scene.json', { createIfMissing: true });
    expect(scena.getAllNodes()).toEqual([]);
    expect(pokazane).toHaveLength(1);
  });
});

describe('Scene.save', () => {
  it('zapisuje tak, żeby dało się odczytać z powrotem', async () => {
    const scena = await Scene.load('drive/dom.scene.json', { silent: true });
    scena.nodeCreate({ type: 'group', name: 'Nowa' });

    await Scene.save('drive/kopia.scene.json', scena);

    const odczytana = await Scene.load('drive/kopia.scene.json', { silent: true });
    expect(odczytana.getNode('Nowa')).not.toBeNull();
    expect(odczytana.getNode('Grupa')).not.toBeNull();
  });

  it('zapis pod inną nazwą nie rusza pliku źródłowego', async () => {
    const scena = await Scene.load('drive/dom.scene.json', { silent: true });
    scena.nodeCreate({ type: 'group', name: 'Nowa' });
    await Scene.save('drive/kopia.scene.json', scena);

    expect(pliki.get('drive/dom.scene.json')).toBe(SCENA_3D);
  });
});

describe('Scene.create', () => {
  it('daje pustą scenę wybranego rodzaju', () => {
    expect(Scene.create('cad').kind).toBe('cad');
    expect(Scene.create('scene3d', { silent: true }).getAllNodes()).toEqual([]);
  });
});

describe('bez hosta', () => {
  it('mówi wprost, że sceny są niedostępne', async () => {
    setSceneHost(null);
    await expect(Scene.load('drive/dom.scene.json')).rejects.toThrow(/niedostępne/i);
  });
});

/**
 * Sceny z innego serwera.
 *
 * Projekty zrobione w cad-app leżą w `cad-backend`, który wystawia własny VFS
 * po HTTP. Kopiowanie ich do Drive tylko po to, żeby skrypt mógł je otworzyć,
 * byłoby pracą bez powodu.
 */
describe('Scene przez HTTP', () => {
  const wywolania: Array<{ url: string; init?: RequestInit }> = [];

  const wBase64 = (tekst: string) => btoa(String.fromCharCode(...new TextEncoder().encode(tekst)));

  const zHostem = (odpowiedz: (url: string) => Response) => {
    wywolania.length = 0;
    setSceneHost({
      readFile: async () => null,
      writeFile: async () => { throw new Error('Drive nie powinien tu być wołany'); },
      present: () => {},
      fetch: (async (url: string, init?: RequestInit) => {
        wywolania.push({ url: String(url), init });
        return odpowiedz(String(url));
      }) as unknown as typeof fetch,
    });
  };

  it('wczytuje scenę z VFS cudzego serwera', async () => {
    zHostem(() => new Response(JSON.stringify({ data: wBase64(SCENA_3D) }), { status: 200 }));

    const scena = await Scene.load('http://localhost:1897/users/marcin/projects/dom.scene.json', { vfs: true });

    expect(scena.getNode('Grupa')).not.toBeNull();
    expect(wywolania[0].url).toContain('/api/vfs/readFile');
  });

  it('czyta też zwykły plik po HTTP, bez opakowania VFS', async () => {
    zHostem(() => new Response(SCENA_3D, { status: 200 }));

    const scena = await Scene.load('https://serwer/pliki/dom.scene.json', { kind: 'scene3d' });
    expect(scena.getNode('Grupa')).not.toBeNull();
  });

  it('404 znaczy „nie ma pliku" — tak samo jak w Drive', async () => {
    zHostem(() => new Response('', { status: 404 }));

    await expect(Scene.load('http://localhost:1897/users/a/brak.scene.json', { vfs: true })).rejects.toThrow(/Nie ma pliku/);

    const nowa = await Scene.load('http://localhost:1897/users/a/brak.scene.json', { vfs: true, createIfMissing: true });
    expect(nowa.getAllNodes()).toEqual([]);
  });

  it('inny błąd niesie status, żeby dało się poznać przyczynę', async () => {
    zHostem(() => new Response('', { status: 403, statusText: 'Forbidden' }));
    await expect(Scene.load('http://localhost:1897/users/a/dom.scene.json', { vfs: true })).rejects.toThrow(/403/);
  });

  it('brak połączenia mówi o serwerze i o CORS', async () => {
    setSceneHost({
      readFile: async () => null,
      writeFile: async () => {},
      fetch: (async () => { throw new Error('Failed to fetch'); }) as unknown as typeof fetch,
    });
    await expect(Scene.load('http://localhost:1897/users/a/dom.scene.json', { vfs: true })).rejects.toThrow(/CORS/);
  });

  it('zapisuje z powrotem do VFS tego samego serwera', async () => {
    zHostem((url) => (url.includes('readFile')
      ? new Response(JSON.stringify({ data: wBase64(SCENA_3D) }), { status: 200 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 })));

    const adres = 'http://localhost:1897/users/marcin/projects/dom.scene.json';
    const scena = await Scene.load(adres, { vfs: true, silent: true });
    await Scene.save(adres, scena, { vfs: true });

    const zapis = wywolania.find((w) => w.url.includes('writeFile'));
    expect(zapis).toBeTruthy();
    expect(zapis!.init?.method).toBe('POST');
    // Treść idzie tak, jak VFS ją czyta — w base64, obok pola `data`.
    expect(String(zapis!.init?.body)).toContain('"data"');
  });

  it('pod zwykły plik po HTTP nie udaje zapisu', async () => {
    zHostem(() => new Response(SCENA_3D, { status: 200 }));

    const scena = await Scene.load('https://serwer/pliki/dom.scene.json', { kind: 'scene3d', silent: true });
    await expect(Scene.save('https://serwer/pliki/dom.scene.json', scena)).rejects.toThrow(/nie da się zapisać/);
  });
});

describe('adres, który zwraca stronę zamiast pliku', () => {
  /** Odpowiedź, jaką daje serwer aplikacji na trasę obsługiwaną po stronie klienta. */
  const stronaHtml = (tresc: string) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => tresc,
  }) as unknown as Response;

  it('tłumaczy, że przyszła strona, a nie scena', async () => {
    // Adres `/open/…` otwiera EDYTOR z projektem, a nie plik. Serwer oddaje
    // wtedy `index.html`, a `JSON.parse` kończył to komunikatem
    // „Unexpected token '<'", z którego nie wynika nic użytecznego.
    setSceneHost({
      readFile: async () => null,
      fetch: async () => stronaHtml('<!DOCTYPE html><html><body>aplikacja</body></html>'),
      present: () => {},
    });

    await expect(
      Scene.load('http://localhost:1898/open/users/default/scene3d/a/main.scene.json'),
    ).rejects.toThrow(/stron[ęy] HTML|nie plik/i);
  });

  it('podpowiada opcję vfs, bo to najczęstsza przyczyna', async () => {
    setSceneHost({
      readFile: async () => null,
      fetch: async () => stronaHtml('<!doctype html><html></html>'),
      present: () => {},
    });

    await expect(
      Scene.load('http://localhost:1898/users/default/scene3d/a/main.scene.json'),
    ).rejects.toThrow(/vfs/i);
  });

  it('nie myli sceny z HTML-em, gdy treść jest poprawna', async () => {
    setSceneHost({
      readFile: async () => null,
      fetch: async () => ({
        ok: true, status: 200, statusText: 'OK', text: async () => SCENA_3D,
      }) as unknown as Response,
      present: () => {},
    });

    const scena = await Scene.load('http://example.test/a.scene.json');
    expect(scena.getNode('Grupa')).not.toBeNull();
  });
});
