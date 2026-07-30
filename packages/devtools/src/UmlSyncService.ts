/**
 * High-level orchestrator tying parsers → UML projects together.
 *
 *   code → CodeModel → UML project        (generate / update with history)
 *   UML project → CodeModel → source code (round-trip skeleton generation)
 *
 * Re-syncing an existing project preserves manual node layout (positions are
 * matched by deterministic node id) and records every add/remove/modify as a
 * commit on the project's current git-like branch.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CodeModel, Language } from './model/CodeModel.js';
import { nodeId } from './model/ids.js';
import { buildModel, SourceFile } from './parsers/index.js';
import { detectLanguage, SUPPORTED_EXTENSIONS } from './parsers/types.js';
import { generateCode, GeneratedFile } from './codegen/index.js';
import { commitProject, generateProject, modelToDiagram } from './uml/generateUml.js';
import { diffDiagrams, ModelChange, summarizeChanges } from './uml/diffModel.js';
import { diagramToModel } from './uml/umlToModel.js';
import { UmlDiagram, UmlProject } from './uml/umlTypes.js';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'libraries', 'wasm-output']);

export interface ScanOptions {
  /** Make stored file paths relative to this dir (default: the scanned dir). */
  relativeTo?: string;
  maxFiles?: number;
}

export interface SyncResult {
  project: UmlProject;
  changes: ModelChange[];
  summary: string;
  committed: boolean;
}

export class UmlSyncService {
  /** Recursively collect parseable source files under `dir`. */
  async scanDirectory(dir: string, opts: ScanOptions = {}): Promise<SourceFile[]> {
    const base = opts.relativeTo ?? dir;
    const max = opts.maxFiles ?? 2000;
    const out: SourceFile[] = [];
    const exts = new Set(SUPPORTED_EXTENSIONS.map((e) => `.${e}`));

    const walk = async (cur: string): Promise<void> => {
      if (out.length >= max) return;
      let entries: import('node:fs').Dirent[];
      try { entries = await fs.readdir(cur, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (out.length >= max) break;
        const abs = path.join(cur, e.name);
        if (e.isDirectory()) { if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(abs); continue; }
        if (!exts.has(path.extname(e.name).toLowerCase())) continue;
        const lang = detectLanguage(e.name);
        if (!lang) continue;
        let content: string;
        try { content = await fs.readFile(abs, 'utf8'); } catch { continue; }
        out.push({ file: path.relative(base, abs).split(path.sep).join('/'), content, language: lang });
      }
    };
    await walk(dir);
    return out;
  }

  /**
   * Wczytuje wskazane pliki (zamiast całego katalogu). Przydatne, gdy diagram ma
   * powstać z kilku wybranych klas, a nie z całego modułu — reszta katalogu
   * dokładałaby do diagramu symbole, których nikt nie chciał.
   *
   * Ścieżki mogą być bezwzględne albo względem `baseDir`. Pliki nieczytelne
   * i w nieobsługiwanym języku są po cichu pomijane — wybór z listy plików
   * bywa zgrubny, a przerwanie całej operacji z powodu jednego `.md` byłoby
   * dla użytkownika zaskoczeniem.
   */
  async readFiles(files: string[], baseDir: string, opts: ScanOptions = {}): Promise<SourceFile[]> {
    const base = opts.relativeTo ?? baseDir;
    const max = opts.maxFiles ?? 2000;
    const out: SourceFile[] = [];
    for (const entry of files) {
      if (out.length >= max) break;
      const abs = path.isAbsolute(entry) ? entry : path.resolve(baseDir, entry);
      const lang = detectLanguage(path.basename(abs));
      if (!lang) continue;
      let content: string;
      try { content = await fs.readFile(abs, 'utf8'); } catch { continue; }
      out.push({ file: path.relative(base, abs).split(path.sep).join('/'), content, language: lang });
    }
    return out;
  }

  /** Parse a chosen set of files into a language-agnostic model. */
  async parseFiles(files: string[], baseDir: string, opts: ScanOptions = {}): Promise<CodeModel> {
    return buildModel(await this.readFiles(files, baseDir, opts));
  }

  /** Generate a brand-new UML project from a chosen set of files. */
  async generateProjectFromFiles(
    files: string[], baseDir: string, name: string, opts: ScanOptions = {},
  ): Promise<UmlProject> {
    const model = await this.parseFiles(files, baseDir, opts);
    const linked = opts.relativeTo ? path.relative(opts.relativeTo, baseDir).split(path.sep).join('/') : baseDir;
    return generateProject(model, name, linked);
  }

  /** Re-parse a chosen set of files and update an existing project in place. */
  async updateProjectFromFiles(
    project: UmlProject, files: string[], baseDir: string, opts: ScanOptions = {},
  ): Promise<SyncResult> {
    return this.applyModel(project, await this.parseFiles(files, baseDir, opts));
  }

  /** Parse a directory into a language-agnostic model. */
  async parseDirectory(dir: string, opts: ScanOptions = {}): Promise<CodeModel> {
    return buildModel(await this.scanDirectory(dir, opts));
  }

  /** Generate a brand-new UML project from a source directory. */
  async generateProjectFromDir(dir: string, name: string, opts: ScanOptions = {}): Promise<UmlProject> {
    const model = await this.parseDirectory(dir, opts);
    return generateProject(model, name, opts.relativeTo ? path.relative(opts.relativeTo, dir).split(path.sep).join('/') : dir);
  }

  /**
   * Re-parse a directory and update an existing project in place: refresh the
   * generated diagram (preserving layout), diff against the prior version and
   * record the changes as a commit.
   */
  async updateProjectFromDir(project: UmlProject, dir: string, opts: ScanOptions = {}): Promise<SyncResult> {
    const model = await this.parseDirectory(dir, opts);
    return this.applyModel(project, model);
  }

  /** Core update: merge a freshly parsed model into the project's diagram. */
  applyModel(project: UmlProject, model: CodeModel): SyncResult {
    const generatedIds = new Set(model.symbols.map((s) => nodeId(s.id)));
    const target = this.pickTargetDiagram(project, generatedIds);

    // Preserve positions of nodes that already exist in the target diagram.
    const positions = new Map<string, { x: number; y: number }>();
    if (target) for (const n of target.nodes) positions.set(n.id, n.position);

    const fresh = modelToDiagram(model, { positions, diagramName: target?.name ?? 'Model' });
    const newDiagram: UmlDiagram = target
      ? { ...target, nodes: fresh.nodes, edges: fresh.edges }
      : fresh;

    const changes = diffDiagrams(target ?? undefined, newDiagram);
    const summary = summarizeChanges(changes);

    let diagrams: UmlDiagram[];
    if (target) diagrams = project.diagrams.map((d) => (d.id === target.id ? newDiagram : d));
    else diagrams = [...project.diagrams, newDiagram];

    let updated: UmlProject = { ...project, diagrams, updatedAt: Date.now() };
    const committed = changes.length > 0;
    if (committed) updated = commitProject(updated, `Sync z kodu (${summary})`);

    return { project: updated, changes, summary, committed };
  }

  /** Reconstruct a model from the project's UML and emit source skeletons. */
  toSourceFiles(project: UmlProject, language: Language, diagramId?: string): GeneratedFile[] {
    const diagram = (diagramId ? project.diagrams.find((d) => d.id === diagramId) : project.diagrams[0]);
    if (!diagram) return [];
    return generateCode(diagramToModel(diagram, language), language);
  }

  /** Write generated files to disk. Existing files are skipped unless overwrite. */
  async writeSourceFiles(files: GeneratedFile[], targetDir: string, overwrite = false): Promise<{ written: string[]; skipped: string[] }> {
    const written: string[] = []; const skipped: string[] = [];
    await fs.mkdir(targetDir, { recursive: true });
    for (const f of files) {
      const abs = path.join(targetDir, f.file);
      if (!overwrite) { try { await fs.access(abs); skipped.push(f.file); continue; } catch { /* not present → write */ } }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, f.content, 'utf8');
      written.push(f.file);
    }
    return { written, skipped };
  }

  private pickTargetDiagram(project: UmlProject, generatedIds: Set<string>): UmlDiagram | null {
    let best: UmlDiagram | null = null; let bestScore = 0;
    for (const d of project.diagrams) {
      const score = d.nodes.reduce((a, n) => a + (generatedIds.has(n.id) ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }
}
