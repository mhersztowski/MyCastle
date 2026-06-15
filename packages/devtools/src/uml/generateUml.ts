import { CodeModel, CodeSymbol, RelationType } from '../model/CodeModel.js';
import { commitId, diagramId, edgeId, nodeId, umlMemberId } from '../model/ids.js';
import { handlesFor, layoutSymbols, XY } from './layout.js';
import { clone, ProjectSnapshot, RelType, UmlDiagram, UmlEdge, UmlHistory, UmlKind, UmlNode, UmlProject } from './umlTypes.js';

let counter = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}_${counter++}`;

function kindToUml(s: CodeSymbol): UmlKind {
  if (s.kind === 'interface') return 'interface';
  if (s.kind === 'enum') return 'enum';
  if (s.kind === 'module') return 'module';
  if (s.kind === 'struct') return 'struct';
  if (s.kind === 'class' && s.isAbstract) return 'abstract';
  return 'class';
}
const relToUml = (t: RelationType): RelType => t; // names align with the editor

export interface GenerateOptions {
  /** Reuse positions for nodes that already exist (keeps manual layout). */
  positions?: Map<string, XY>;
  diagramName?: string;
}

/** Build a single UML diagram from a parsed model. */
export function modelToDiagram(model: CodeModel, opts: GenerateOptions = {}): UmlDiagram {
  const auto = layoutSymbols(model.symbols, model.relations);
  const posOf = (symId: string): XY => opts.positions?.get(nodeId(symId)) ?? auto.get(symId) ?? { x: 0, y: 0 };

  const nodes: UmlNode[] = model.symbols.map((s) => ({
    id: nodeId(s.id),
    type: 'umlClass',
    position: posOf(s.id),
    data: {
      kind: kindToUml(s),
      name: s.name,
      members: s.members.map((m) => ({ id: umlMemberId(m.id), kind: m.kind, text: m.text })),
      linkedFile: s.file,
    },
  }));

  const edges: UmlEdge[] = model.relations.map((r) => {
    const h = handlesFor(posOf(r.fromId), posOf(r.toId));
    return { id: edgeId(r.id), source: nodeId(r.fromId), target: nodeId(r.toId), sourceHandle: h.sourceHandle, targetHandle: h.targetHandle, type: 'uml', data: { relType: relToUml(r.type) } };
  });

  return { id: diagramId(opts.diagramName ?? 'model'), name: opts.diagramName ?? 'Model', nodes, edges };
}

function initialHistory(diagrams: UmlDiagram[], linkedPath: string | undefined, message: string): UmlHistory {
  const id = commitId(uid('c'));
  const snapshot: ProjectSnapshot = { diagrams: clone(diagrams), linkedPath };
  return { commits: { [id]: { id, message, at: Date.now(), parents: [], snapshot } }, branches: { main: id }, head: 'main' };
}

/** Generate a brand-new UML project from a model. */
export function generateProject(model: CodeModel, name: string, linkedPath?: string): UmlProject {
  const diagram = modelToDiagram(model, { diagramName: 'Model' });
  return { type: 'uml-project', version: 2, name, linkedPath, diagrams: [diagram], history: initialHistory([diagram], linkedPath, 'Wygenerowano z kodu źródłowego'), updatedAt: Date.now() };
}

/** Append a commit (advancing the current branch) to a project's history. */
export function commitProject(project: UmlProject, message: string): UmlProject {
  const snapshot: ProjectSnapshot = { diagrams: clone(project.diagrams), linkedPath: project.linkedPath };
  const head = project.history.head;
  const parent = project.history.branches[head];
  const id = commitId(uid('c'));
  const commit = { id, message, at: Date.now(), parents: parent ? [parent] : [], snapshot };
  return {
    ...project,
    history: { ...project.history, commits: { ...project.history.commits, [id]: commit }, branches: { ...project.history.branches, [head]: id } },
    updatedAt: Date.now(),
  };
}

export { kindToUml };
