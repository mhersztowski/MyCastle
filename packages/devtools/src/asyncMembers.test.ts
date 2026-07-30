/**
 * Metody `async` mają być rozpoznawalne w modelu i w diagramie — inaczej na UML
 * nie widać, które wywołania są asynchroniczne, a to jedna z ważniejszych
 * informacji przy czytaniu cudzego kodu.
 */
import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { generateProject } from './uml/generateUml.js';
import { parseMemberText, renderMember } from './model/render.js';

const SRC = `
export class Api {
  sync(): number { return 1; }
  async fetchOne(id: string): Promise<string> { return id; }
  static async loadAll(): Promise<string[]> { return []; }
  private async retry(): Promise<void> {}
}

export async function topLevel(): Promise<void> {}
export function plain(): void {}
`;

async function model() {
  return buildModel([{ file: 'src/api.ts', content: SRC, language: 'typescript' }]);
}

describe('metody async', () => {
  it('oznacza metody async flagą, zwykłe zostawia bez niej', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    const byName = (n: string) => api.members.find((m) => m.name === n)!;

    expect(byName('fetchOne').isAsync).toBe(true);
    expect(byName('loadAll').isAsync).toBe(true);
    expect(byName('retry').isAsync).toBe(true);
    expect(byName('sync').isAsync).toBeFalsy();
  });

  it('oznacza też funkcje modułowe', async () => {
    const mod = (await model()).symbols.find((s) => s.kind === 'module')!;
    expect(mod.members.find((m) => m.name === 'topLevel')?.isAsync).toBe(true);
    expect(mod.members.find((m) => m.name === 'plain')?.isAsync).toBeFalsy();
  });

  it('wiersz UML zawiera słowo async (po static)', async () => {
    const api = (await model()).symbols.find((s) => s.name === 'Api')!;
    expect(api.members.find((m) => m.name === 'fetchOne')!.text).toContain('async fetchOne');
    expect(api.members.find((m) => m.name === 'loadAll')!.text).toContain('static async loadAll');
  });

  it('węzły diagramu dostają kategorię "async"', async () => {
    const project = generateProject(await model(), 'Api', 'src');
    const node = project.diagrams[0].nodes.find((n) => n.data.name === 'Api')!;
    const cat = (n: string) => node.data.members.find((m) => m.text.includes(`${n}(`))?.category;

    expect(cat('fetchOne')).toBe('async');
    expect(cat('sync')).toBeUndefined();
  });

  it('tekst wiersza daje się odczytać z powrotem (round-trip do codegenu)', () => {
    const line = renderMember({ kind: 'method', name: 'fetchOne', visibility: 'public', isAsync: true, type: 'Promise<string>', params: [{ name: 'id', type: 'string' }] });
    const parsed = parseMemberText(line);
    expect(parsed.name).toBe('fetchOne');
    expect(parsed.isAsync).toBe(true);
    expect(parsed.type).toBe('Promise<string>');
  });
});

describe('generowanie kodu z diagramu', () => {
  it('zachowuje `async` w drodze kod → UML → kod (TypeScript)', async () => {
    const { generateCode } = await import('./codegen/index.js');
    const { diagramToModel } = await import('./uml/umlToModel.js');
    const project = generateProject(await model(), 'Api', 'src');
    const back = diagramToModel(project.diagrams[0], 'typescript');
    const files = generateCode(back, 'typescript');
    const code = files.map((f) => f.content).join('\n');

    expect(code).toContain('async fetchOne(');
    expect(code).toContain('static async loadAll(');
    expect(code).toMatch(/\n\s+sync\(/);   // zwykła metoda bez async
  });
});
