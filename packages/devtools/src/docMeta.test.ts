/**
 * Testy przenoszenia dokumentacji TSDoc z kodu do UML.
 *
 * Sens: po kliknięciu „Z kodu" opisy klas, metod i argumentów mają być widoczne
 * w edytorze UML jako metadane — bez zaglądania do źródeł.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { generateProject } from './uml/generateUml.js';
import { diagramToModel } from './uml/umlToModel.js';

const SRC = `
/**
 * Klient REST backendu.
 *
 * Trzyma jedno połączenie i ponawia żądania.
 * @see https://example.test/docs
 */
export class Api {
  /** Adres bazowy. */
  baseUrl: string;

  /**
   * Pobiera zasób po identyfikatorze.
   *
   * Wynik jest cache'owany na czas sesji.
   * @param id Identyfikator zasobu.
   * @param retries Liczba ponowień przy błędzie sieci.
   * @returns Treść zasobu jako tekst.
   * @example
   * const t = await Api.fetchOne('42');
   * @deprecated Użyj fetchMany.
   */
  static async fetchOne(id: string, retries: number): Promise<string> { return id; }

  noDocs(): void {}
}

/** Formatuje datę do postaci ISO. @param d Data wejściowa. */
export function formatDate(d: Date): string { return d.toISOString(); }
`;

async function model() {
  return buildModel([{ file: 'src/api.ts', content: SRC, language: 'typescript' }]);
}

describe('parser TS — TSDoc', () => {
  it('czyta opis klasy: pierwszy akapit jako streszczenie, resztę jako remarks', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.doc?.summary).toBe('Klient REST backendu.');
    expect(api.doc?.remarks).toContain('Trzyma jedno połączenie');
    expect(api.doc?.see).toEqual(['https://example.test/docs']);
  });

  it('czyta opisy argumentów po nazwie', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    const fetchOne = api.members.find((m) => m.name === 'fetchOne')!;
    expect(fetchOne.doc?.params).toEqual({
      id: 'Identyfikator zasobu.',
      retries: 'Liczba ponowień przy błędzie sieci.',
    });
  });

  it('czyta returns, example i deprecated', async () => {
    const fetchOne = (await model()).symbols
      .find((s) => s.name === 'Api')!.members.find((m) => m.name === 'fetchOne')!;
    expect(fetchOne.doc?.returns).toBe('Treść zasobu jako tekst.');
    expect(fetchOne.doc?.examples?.[0]).toContain("Api.fetchOne('42')");
    expect(fetchOne.doc?.deprecated).toBe('Użyj fetchMany.');
  });

  it('element bez komentarza nie dostaje pustego obiektu', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.members.find((m) => m.name === 'noDocs')?.doc).toBeUndefined();
  });

  it('dokumentuje też pola i funkcje modułowe', async () => {
    const symbols = (await model()).symbols;
    expect(symbols.find((s) => s.name === 'Api')!.members.find((m) => m.name === 'baseUrl')?.doc?.summary)
      .toBe('Adres bazowy.');
    const mod = symbols.find((s) => s.kind === 'module')!;
    const fn = mod.members.find((m) => m.name === 'formatDate')!;
    expect(fn.doc?.summary).toBe('Formatuje datę do postaci ISO.');
    expect(fn.doc?.params).toEqual({ d: 'Data wejściowa.' });
  });
});

describe('UML — metadane dokumentacji', () => {
  it('węzeł i jego członkowie niosą doc po „Z kodu"', async () => {
    const project = generateProject(await model(), 'Api', 'src');
    const node = project.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    expect(node.data.doc?.summary).toBe('Klient REST backendu.');

    const member = node.data.members.find((m) => m.text.includes('fetchOne('))!;
    expect(member.doc?.params?.id).toBe('Identyfikator zasobu.');
    expect(member.doc?.returns).toBe('Treść zasobu jako tekst.');
  });

  it('członek bez dokumentacji nie ma pola doc (mniejszy plik projektu)', async () => {
    const project = generateProject(await model(), 'Api', 'src');
    const node = project.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    expect(node.data.members.find((m) => m.text.includes('noDocs('))?.doc).toBeUndefined();
  });

  it('dokumentacja przeżywa drogę UML → model kodu (regeneracja)', async () => {
    const project = generateProject(await model(), 'Api', 'src');
    const back = diagramToModel(project.diagrams[0], 'typescript');
    const api = back.symbols.find((s) => s.name === 'Api')!;
    expect(api.doc?.summary).toBe('Klient REST backendu.');
    expect(api.members.find((m) => m.name === 'fetchOne')?.doc?.returns).toBe('Treść zasobu jako tekst.');
  });
});
