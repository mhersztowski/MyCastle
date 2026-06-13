/**
 * C and C++ parser via tree-sitter (WASM). Extracts:
 *   • C   — `struct` definitions → classes with fields
 *   • C++ — `class`/`struct` with access sections, fields, methods, base classes
 */
import { CodeMember, CodeParam, CodeSymbol, Language, SymbolKind, Visibility } from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { collect, fieldText, parseTree, TSNode, TSGrammar } from './treeSitter.js';
import { LanguageParser } from './types.js';

function findName(decl: TSNode | null): string | undefined {
  if (!decl) return undefined;
  if (decl.type === 'field_identifier' || decl.type === 'identifier' || decl.type === 'type_identifier') return decl.text;
  // function/array/pointer/reference declarators nest the real name in 'declarator'
  const inner = decl.childForFieldName('declarator');
  if (inner) return findName(inner);
  for (const c of decl.namedChildren) { const r = findName(c); if (r) return r; }
  return undefined;
}

function functionDeclarator(decl: TSNode | null): TSNode | null {
  if (!decl) return null;
  if (decl.type === 'function_declarator') return decl;
  const inner = decl.childForFieldName('declarator');
  return inner ? functionDeclarator(inner) : null;
}

function cppParams(fnDecl: TSNode | null): CodeParam[] {
  if (!fnDecl) return [];
  const list = fnDecl.childForFieldName('parameters');
  if (!list) return [];
  const out: CodeParam[] = [];
  for (const p of list.namedChildren) {
    if (p.type !== 'parameter_declaration') continue;
    const type = fieldText(p, 'type');
    const nm = findName(p.childForFieldName('declarator'));
    out.push({ name: nm ?? '', type });
  }
  return out.filter((p) => p.name || p.type);
}

export class CppParser implements LanguageParser {
  readonly languages: Language[] = ['c', 'cpp'];

  async parse(content: string, file: string, language: Language): Promise<CodeSymbol[]> {
    const grammar: TSGrammar = language === 'c' ? 'c' : 'cpp';
    const tree = await parseTree(grammar, content);
    const symbols: CodeSymbol[] = [];
    const specifiers = collect(tree.rootNode, 'class_specifier', 'struct_specifier');

    for (const spec of specifiers) {
      const name = fieldText(spec, 'name');
      const body = spec.childForFieldName('body');
      if (!name || !body) continue; // skip anonymous / forward decls
      const kind: SymbolKind = spec.type === 'class_specifier' ? 'class' : 'struct';

      const extendsList: string[] = [];
      for (const base of collect(spec, 'base_class_clause')) {
        for (const id of collect(base, 'type_identifier')) extendsList.push(id.text);
      }

      const members: CodeMember[] = [];
      const used = new Set<string>();
      const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
        let id = memberId(name, base.kind, base.name);
        while (used.has(id)) id += '_';
        used.add(id);
        members.push({ ...base, id, text: renderMember(base) });
      };

      let vis: Visibility = kind === 'class' ? 'private' : 'public';
      for (const m of body.namedChildren) {
        if (m.type === 'access_specifier') {
          const t = m.text.replace(':', '').trim();
          vis = t === 'public' ? 'public' : t === 'protected' ? 'protected' : 'private';
        } else if (m.type === 'function_definition' || m.type === 'declaration' || m.type === 'field_declaration') {
          const decl = m.childForFieldName('declarator');
          const fn = functionDeclarator(decl);
          const type = fieldText(m, 'type');
          const nm = findName(decl);
          if (!nm) continue;
          if (fn) push({ kind: 'method', name: nm, visibility: vis, type, params: cppParams(fn) });
          else if (m.type === 'field_declaration') push({ kind: 'field', name: nm, visibility: vis, type });
        }
      }

      symbols.push({ id: symbolId(name), name, kind, file, language, extends: extendsList, implements: [], members });
    }
    return symbols;
  }
}
