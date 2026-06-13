import { describe, it, expect } from 'vitest';
import { buildModel } from './parsers/index.js';
import { generateProject } from './uml/generateUml.js';
import { generateTs } from './codegen/tsCodegen.js';
import { diagramToModel } from './uml/umlToModel.js';
import { UmlSyncService } from './UmlSyncService.js';

const SRC = `
export abstract class Animal {
  protected name: string;
  abstract makeSound(): void;
}
export class Dog extends Animal implements Pet {
  private breed: string;
  makeSound(): void {}
  fetch(): void {}
}
export interface Pet {
  name: string;
  feed(food: string): void;
}
export class Owner {
  pets: Animal;
  adopt(a: Animal): void {}
}
`;

describe('devtools TS pipeline', () => {
  it('parses classes, interfaces, members and relations', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC, language: 'typescript' }]);
    const names = model.symbols.map((s) => s.name).sort();
    expect(names).toEqual(['Animal', 'Dog', 'Owner', 'Pet']);

    const animal = model.symbols.find((s) => s.name === 'Animal')!;
    expect(animal.kind).toBe('class');
    expect(animal.isAbstract).toBe(true);
    expect(animal.members.find((m) => m.name === 'makeSound')?.kind).toBe('method');

    // generalization Dog→Animal, realization Dog→Pet, association Owner→Animal
    const rel = (from: string, to: string) => model.relations.find((r) => model.symbols.find((s) => s.id === r.fromId)?.name === from && model.symbols.find((s) => s.id === r.toId)?.name === to);
    expect(rel('Dog', 'Animal')?.type).toBe('generalization');
    expect(rel('Dog', 'Pet')?.type).toBe('realization');
    expect(rel('Owner', 'Animal')?.type).toBe('association');
  });

  it('generates a loadable UML project', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const project = generateProject(model, 'Zoo', 'src');
    expect(project.type).toBe('uml-project');
    expect(project.version).toBe(2);
    expect(project.diagrams[0].nodes.length).toBe(4);
    expect(Object.keys(project.history.branches)).toContain('main');
    const dog = project.diagrams[0].nodes.find((n) => n.data.name === 'Dog')!;
    expect(dog.data.linkedFile).toBe('src/zoo.ts');
    expect(dog.data.members.some((m) => m.kind === 'method' && m.text.includes('fetch'))).toBe(true);
  });

  it('records add/remove/modify changes as a commit on re-sync', async () => {
    const svc = new UmlSyncService();
    const m1 = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const project = generateProject(m1, 'Zoo', 'src');
    const commitsBefore = Object.keys(project.history.commits).length;

    const SRC2 = SRC.replace('fetch(): void {}', 'fetch(): boolean {}') + '\nexport class Cat extends Animal { makeSound(): void {} }\n';
    const m2 = await buildModel([{ file: 'src/zoo.ts', content: SRC2 }]);
    const res = svc.applyModel(project, m2);

    expect(res.committed).toBe(true);
    expect(res.changes.some((c) => c.kind === 'added' && c.symbol === 'Cat')).toBe(true);
    expect(res.changes.some((c) => c.kind === 'modified' && c.target === 'method')).toBe(true);
    expect(Object.keys(res.project.history.commits).length).toBe(commitsBefore + 1);
  });

  it('treats a method signature change as modified (not remove+add)', async () => {
    const svc = new UmlSyncService();
    const A = `export class Svc { func2(arg1: number): void {} }`;
    const B = `export class Svc { func2(arg1: number, arg2: string): void {} }`;
    const project = generateProject(await buildModel([{ file: 'a.ts', content: A }]), 'S');
    const res = svc.applyModel(project, await buildModel([{ file: 'a.ts', content: B }]));
    const methodChanges = res.changes.filter((c) => c.target === 'method');
    expect(methodChanges.length).toBe(1);
    expect(methodChanges[0].kind).toBe('modified');
    expect(methodChanges[0].from).toContain('func2(arg1');
    expect(methodChanges[0].to).toContain('arg2');
  });

  it('round-trips UML back into TypeScript skeletons', async () => {
    const model = await buildModel([{ file: 'src/zoo.ts', content: SRC }]);
    const project = generateProject(model, 'Zoo');
    const back = diagramToModel(project.diagrams[0], 'typescript');
    const files = generateTs(back);
    const dog = files.find((f) => f.file === 'Dog.ts')!;
    expect(dog.content).toContain('class Dog');
    expect(dog.content).toContain('extends Animal');
    expect(dog.content).toContain('fetch(');
  });
});
