/**
 * Testy wyboru KONKRETNYCH plików jako źródła diagramu (obok skanu katalogu).
 * Sens tej ścieżki: diagram ma pokazywać wybrane klasy, a nie wszystko, co leży
 * w module — więc sprawdzamy, że reszta katalogu naprawdę nie wchodzi do modelu.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { UmlSyncService } from './UmlSyncService.js';

let dir = '';
const svc = new UmlSyncService();

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'uml-files-'));
  await mkdir(path.join(dir, 'src'), { recursive: true });
  await writeFile(path.join(dir, 'src/alpha.ts'), 'export class Alpha { run(): void {} }\n');
  await writeFile(path.join(dir, 'src/beta.ts'), 'export class Beta { stop(): void {} }\n');
  await writeFile(path.join(dir, 'src/notes.md'), '# nie kod\n');
});

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('UmlSyncService — wybrane pliki', () => {
  it('bierze tylko wskazane pliki, resztę katalogu pomija', async () => {
    const model = await svc.parseFiles(['src/alpha.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Alpha']);
  });

  it('kilka plików daje wspólny model', async () => {
    const model = await svc.parseFiles(['src/alpha.ts', 'src/beta.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name).sort()).toEqual(['Alpha', 'Beta']);
  });

  it('pomija pliki nieczytelne i w nieobsługiwanym języku', async () => {
    const model = await svc.parseFiles(['src/alpha.ts', 'src/notes.md', 'src/nie-ma.ts'], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Alpha']);
  });

  it('ścieżki bezwzględne działają tak samo jak względne', async () => {
    const model = await svc.parseFiles([path.join(dir, 'src/beta.ts')], dir, { relativeTo: dir });
    expect(model.symbols.map((s) => s.name)).toEqual(['Beta']);
  });

  it('generuje projekt UML z wybranych plików', async () => {
    const project = await svc.generateProjectFromFiles(['src/alpha.ts'], dir, 'Wybrane', { relativeTo: dir });
    expect(project.type).toBe('uml-project');
    expect(project.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['Alpha']);
  });

  it('aktualizacja dokłada symbole z nowego zestawu plików', async () => {
    const project = await svc.generateProjectFromFiles(['src/alpha.ts'], dir, 'Wybrane', { relativeTo: dir });
    const res = await svc.updateProjectFromFiles(project, ['src/beta.ts'], dir, { relativeTo: dir });

    // Rozłączny zestaw symboli trafia do NOWEGO diagramu — tak działa wybór
    // diagramu docelowego w `applyModel` (wspólny ze ścieżką katalogową):
    // aktualizacja nadpisuje tylko diagram, w którym te symbole już były.
    const all = res.project.diagrams.flatMap((d) => d.nodes.map((n) => n.data.name));
    expect(all.sort()).toEqual(['Alpha', 'Beta']);
    expect(res.changes.length).toBeGreaterThan(0);
  });

  it('ponowna synchronizacja tych samych plików aktualizuje istniejący diagram', async () => {
    const project = await svc.generateProjectFromFiles(['src/alpha.ts'], dir, 'Wybrane', { relativeTo: dir });
    const res = await svc.updateProjectFromFiles(project, ['src/alpha.ts'], dir, { relativeTo: dir });
    expect(res.project.diagrams).toHaveLength(1);
    expect(res.project.diagrams[0].nodes.map((n) => n.data.name)).toEqual(['Alpha']);
  });
});
