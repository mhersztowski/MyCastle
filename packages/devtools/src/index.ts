/**
 * @mhersztowski/devtools — source-code ⇄ UML toolkit.
 *
 * Pipeline: parse C/C++/Python/JS/TS into a language-agnostic CodeModel, turn
 * it into a MyCastle UML project (`*.umlproj.json`), diff successive versions
 * into the project's git-like history, and round-trip a UML project back into
 * source-code skeletons.
 */

// IR model
export type {
  Language, SymbolKind, MemberKind, Visibility, CodeParam, CodeMember,
  CodeSymbol, RelationType, CodeRelation, CodeModel,
} from './model/CodeModel.js';
export { emptyModel, VISIBILITY_SIGIL, sigil } from './model/CodeModel.js';
export { renderMember, parseMemberText } from './model/render.js';
export { resolveRelations, finalizeModel, extractTypeNames } from './model/resolve.js';
export * as ids from './model/ids.js';

// Parsers
export { buildModel, parseSource, detectLanguage, SUPPORTED_EXTENSIONS } from './parsers/index.js';
export type { SourceFile, LanguageParser } from './parsers/index.js';
export { TsParser } from './parsers/TsParser.js';
export { PythonParser } from './parsers/PythonParser.js';
export { CppParser } from './parsers/CppParser.js';
export { isGrammarAvailable } from './parsers/treeSitter.js';

// UML
export type {
  UmlKind, RelType, UmlMember, UmlNodeData, UmlNode, UmlEdgeData, UmlEdge,
  UmlDiagram, ProjectSnapshot, UmlCommit, UmlHistory, UmlProject,
} from './uml/umlTypes.js';
export { modelToDiagram, generateProject, commitProject, kindToUml } from './uml/generateUml.js';
export { layoutSymbols, handlesFor } from './uml/layout.js';
export { diffDiagrams, summarizeChanges, describeChanges } from './uml/diffModel.js';
export type { ModelChange, ChangeKind, ChangeTarget } from './uml/diffModel.js';
export { diagramToModel } from './uml/umlToModel.js';

// Code generation
export { generateCode, generateTs, generateTsSymbol, generatePython, generatePythonSymbol, generateCpp, generateCppSymbol } from './codegen/index.js';
export type { GeneratedFile } from './codegen/index.js';

// Orchestrator
export { UmlSyncService } from './UmlSyncService.js';
export type { ScanOptions, SyncResult } from './UmlSyncService.js';

// Git repository support (.repo.json clones)
export { GitRepoService, parseRepoJson, stringifyRepoJson } from './git/GitRepoService.js';
export type { RepoJson, GitRef, GitStatus, GitInfo, GitCommandResult } from './git/GitRepoService.js';
