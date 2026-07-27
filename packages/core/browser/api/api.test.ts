/**
 * Testy granicy środowiska skryptów. Sedno: skrypt uruchomiony tam, gdzie
 * czegoś nie ma, ma dostać czytelny komunikat, a nie `TypeError: undefined`.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createAutomateApi,
  createDisplay,
  createUnavailableApi,
  createUnavailableDisplay,
  type DisplayItem,
} from './api';

describe('createDisplay', () => {
  it('przekazuje pozycje do odbiorcy przebiegu', () => {
    const items: DisplayItem[] = [];
    const display = createDisplay({ push: (item) => items.push(item) });

    display.text('gotowe');
    display.json({ a: 1 });
    display.list([1, 2]);

    expect(items.map(i => i.type)).toEqual(['text', 'json', 'list']);
    expect(items[0].data).toBe('gotowe');
  });

  it('nadaje każdej pozycji nowy identyfikator — renderer musi ją przemontować', () => {
    const items: DisplayItem[] = [];
    const display = createDisplay({ push: (item) => items.push(item) });
    display.text('a');
    display.text('a');
    expect(items[0].id).not.toBe(items[1].id);
  });

  it('dwa przebiegi piszą do swoich odbiorców, nie do wspólnego', () => {
    const a: DisplayItem[] = [];
    const b: DisplayItem[] = [];
    const displayA = createDisplay({ push: (i) => a.push(i) });
    const displayB = createDisplay({ push: (i) => b.push(i) });

    displayA.text('z bloku A');
    displayB.text('z bloku B');
    displayA.text('znowu A');   // przebieg A trwa dalej po starcie B

    expect(a.map(i => i.data)).toEqual(['z bloku A', 'znowu A']);
    expect(b.map(i => i.data)).toEqual(['z bloku B']);
  });

  it('wersja niedostępna nic nie rysuje i melduje próbę', () => {
    const notes: string[] = [];
    const display = createUnavailableDisplay('brak panelu wyników', (m) => notes.push(m));
    display.text('cokolwiek');
    display.dom({});
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('brak panelu wyników');
  });
});

describe('createAutomateApi', () => {
  it('przepuszcza to, co host udostępnia', async () => {
    const info = vi.fn();
    const api = createAutomateApi({ log: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() } });
    api.log.info('działa');
    expect(info).toHaveBeenCalledWith('działa');
  });

  it('brakujący namespace melduje brak zamiast rzucać', () => {
    const notes: string[] = [];
    const api = createAutomateApi({}, {
      unavailableReason: 'skrypt uruchomiony w Aurze',
      onUnavailable: (m) => notes.push(m),
    });

    expect(() => (api.speech as { speak(t: string): void }).speak('hej')).not.toThrow();
    expect(notes[0]).toContain('api.speech.speak()');
    expect(notes[0]).toContain('skrypt uruchomiony w Aurze');
  });

  it('sondowanie obecności namespace\'u nie hałasuje', () => {
    const notes: string[] = [];
    const api = createAutomateApi({}, { onUnavailable: (m) => notes.push(m) });
    expect('shopping' in api).toBe(true);
    expect(typeof api.shopping).toBe('object');
    expect(notes).toHaveLength(0);   // dopiero wywołanie metody coś zgłasza
  });

  it('lista `silent` wycisza wybrane namespace\'y', () => {
    const notes: string[] = [];
    const api = createAutomateApi({}, { onUnavailable: (m) => notes.push(m), silent: ['notify'] });
    (api.notify as { info(m: string): void }).info('x');
    (api.speech as { speak(m: string): void }).speak('y');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('api.speech');
  });

  it('nie udaje obiektu thenable — `await api` nie zawiesza skryptu', async () => {
    const api = createUnavailableApi('render bezgłowy');
    await expect(Promise.resolve(api)).resolves.toBe(api);
  });

  it('createUnavailableApi domyka całe środowisko', () => {
    const notes: string[] = [];
    const api = createUnavailableApi('render bezgłowy', (m) => notes.push(m));
    (api.file as { read(p: string): void }).read('a.txt');
    api.log.info('cokolwiek');
    expect(notes).toHaveLength(2);
    expect(notes.every(n => n.includes('render bezgłowy'))).toBe(true);
  });
});
