/**
 * Cele odsyłaczy — skąd bierze się treść dymka.
 *
 * Dwa błędy zebrały się tu w jeden objaw („nie wszystkie linki się pokazują"):
 * indeks celów nie obejmował książek, a wyciąganie treści rozpoznawało tylko
 * wzory i hasła. Odsyłacz do rysunku w podręczniku trafiał więc podwójnie
 * w próżnię.
 */
import { describe, it, expect } from 'vitest';
import { blockFenceFor } from './odsylacze';

const DOKUMENT = [
  '```formula:rh1-15-eq6',
  '\\frac{d^2x}{dt^2} + \\frac{k}{m} x = 0',
  '@vars x: m, k: N/m, m: kg',
  '```',
  '',
  '```figure:rh1-15-rys3',
  '![Rys. 15-3](data:image/png;base64,AAA)',
  '@caption Oscylator.',
  '```',
  '',
  '```table:rh1-15-tab1',
  '| a | b |',
  '```',
  '',
  '```term:rh1-poj-amplituda',
  'Amplituda — największe wychylenie.',
  '```',
].join('\n');

describe('wyciąganie treści celu', () => {
  it('znajduje wzór', () => {
    expect(blockFenceFor('formula', 'rh1-15-eq6').exec(DOKUMENT)?.[1]).toContain('\\frac{k}{m}');
  });

  it('znajduje hasło słownika', () => {
    expect(blockFenceFor('term', 'rh1-poj-amplituda').exec(DOKUMENT)?.[1]).toContain('Amplituda');
  });

  /**
   * To był ten brakujący przypadek: rodzaje inne niż wzór i hasło szły przez
   * wyrażenie szukające ```formula, więc rysunek nigdy się nie znalazł
   * i dymek pokazywał pustkę.
   */
  it('znajduje rysunek', () => {
    expect(blockFenceFor('figure', 'rh1-15-rys3').exec(DOKUMENT)?.[1]).toContain('Rys. 15-3');
  });

  it('znajduje tablicę', () => {
    expect(blockFenceFor('table', 'rh1-15-tab1').exec(DOKUMENT)?.[1]).toContain('| a | b |');
  });

  it('nie myli identyfikatorów o wspólnym początku', () => {
    const dokument = ['```formula:eq6', 'A', '```', '```formula:eq60', 'B', '```'].join('\n');
    expect(blockFenceFor('formula', 'eq6').exec(dokument)?.[1].trim()).toBe('A');
  });

  it('identyfikator ze znakami specjalnymi nie psuje wyrażenia', () => {
    // Kropka w regexie pasuje do wszystkiego — bez ucieczki „15.6" znalazłoby
    // „15-6" i podglądem byłby cudzy wzór.
    const dokument = '```formula:15-6\nX\n```';
    expect(blockFenceFor('formula', '15.6').exec(dokument)).toBeNull();
  });
});
