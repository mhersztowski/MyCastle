/**
 * Language-agnostic intermediate representation (IR) of parsed source code.
 * Every language parser produces a {@link CodeModel}; everything downstream
 * (UML generation, diff/history, code generation) operates on this IR alone.
 */

export type Language = 'typescript' | 'javascript' | 'python' | 'c' | 'cpp';

export type SymbolKind = 'class' | 'interface' | 'enum' | 'struct';
export type MemberKind = 'field' | 'method';
export type Visibility = 'public' | 'private' | 'protected' | 'package';

export const VISIBILITY_SIGIL: Record<Visibility, string> = {
  public: '+', private: '-', protected: '#', package: '~',
};

export interface CodeParam { name: string; type?: string }

export interface CodeMember {
  /** Stable within a symbol — matched across re-parses for diffing. */
  id: string;
  kind: MemberKind;
  name: string;
  visibility: Visibility;
  /** Field type, or method return type. */
  type?: string;
  /** Method parameters (undefined for fields). */
  params?: CodeParam[];
  isStatic?: boolean;
  isAbstract?: boolean;
  /** Pre-rendered UML line, e.g. `+ getId(): string`. */
  text: string;
}

export interface CodeSymbol {
  /** Stable id (qualified name) — survives re-parses, used by diff + layout. */
  id: string;
  kind: SymbolKind;
  name: string;
  /** User-root-relative source file the symbol was parsed from. */
  file: string;
  language: Language;
  isAbstract?: boolean;
  members: CodeMember[];
  /** Raw base-type names (resolved to relations by resolveRelations). */
  extends: string[];
  implements: string[];
}

export type RelationType =
  | 'generalization' | 'realization' | 'association' | 'composition' | 'dependency';

export interface CodeRelation {
  id: string;
  fromId: string;
  toId: string;
  type: RelationType;
  label?: string;
}

export interface CodeModel {
  symbols: CodeSymbol[];
  relations: CodeRelation[];
  files: string[];
}

export function emptyModel(): CodeModel {
  return { symbols: [], relations: [], files: [] };
}

/** Map a UML/source visibility into the leading sigil used in member text. */
export function sigil(v: Visibility): string {
  return VISIBILITY_SIGIL[v];
}
