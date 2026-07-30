/**
 * UML project types — the on-disk `*.umlproj.json` (v2) shape produced and
 * consumed by the MyCastle UML editor (app/mycastle-web). Kept structurally
 * identical so generated projects load directly in the editor.
 */

export type UmlKind = 'class' | 'abstract' | 'interface' | 'enum' | 'struct' | 'module';
export type MemberKind = 'field' | 'method';
export type RelType =
  | 'association' | 'directed' | 'aggregation' | 'composition'
  | 'generalization' | 'realization' | 'dependency';

export interface UmlMember {
  id: string;
  kind: MemberKind;
  text: string;
  /** Dokumentacja TSDoc (opis, `@param`, `@returns`, przykłady) — z kodu albo ręczna. */
  doc?: UmlDoc;
  /** Znacznik grupujący (np. `async`, `optional`) — kolor kropki i filtr w edytorze. */
  category?: string;
}

/**
 * Metadane dokumentacji w standardzie TSDoc, przypisane do elementu diagramu.
 * Kształt zgodny z `DocMeta` z modelu kodu, żeby przenoszenie kod ⇄ UML było
 * kopiowaniem, a nie tłumaczeniem.
 */
export interface UmlDoc {
  summary?: string;
  remarks?: string;
  /** Opisy argumentów po nazwie. */
  params?: Record<string, string>;
  returns?: string;
  examples?: string[];
  deprecated?: string;
  see?: string[];
  tags?: string[];
}

export interface UmlNodeData {
  kind: UmlKind;
  name: string;
  members: UmlMember[];
  linkedFile?: string;
  /** Dokumentacja TSDoc klasy/interfejsu/modułu. */
  doc?: UmlDoc;
}

export interface UmlNode {
  id: string;
  type: 'umlClass';
  position: { x: number; y: number };
  data: UmlNodeData;
}

export interface UmlEdgeData { relType: RelType; label?: string }

export interface UmlEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: 'uml';
  data: UmlEdgeData;
}

export interface UmlDiagram { id: string; name: string; nodes: UmlNode[]; edges: UmlEdge[] }

export interface ProjectSnapshot { diagrams: UmlDiagram[]; linkedPath?: string }
export interface UmlCommit { id: string; message: string; at: number; parents: string[]; snapshot: ProjectSnapshot }
export interface UmlHistory { commits: Record<string, UmlCommit>; branches: Record<string, string>; head: string }

export interface UmlProject {
  type: 'uml-project';
  version: 2;
  name: string;
  linkedPath?: string;
  diagrams: UmlDiagram[];
  history: UmlHistory;
  updatedAt: number;
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
