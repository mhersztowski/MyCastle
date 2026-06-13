/** Python parser via tree-sitter (WASM). Extracts classes, methods and fields. */
import { CodeMember, CodeParam, CodeSymbol, Language, Visibility } from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { collect, fieldText, parseTree, TSNode } from './treeSitter.js';
import { LanguageParser } from './types.js';

function pyVisibility(name: string): Visibility {
  if (name.startsWith('__') && name.endsWith('__')) return 'public'; // dunder/magic
  if (name.startsWith('__')) return 'private';
  if (name.startsWith('_')) return 'protected';
  return 'public';
}

function firstIdentifier(n: TSNode): string | undefined {
  if (n.type === 'identifier') return n.text;
  for (const c of n.namedChildren) { const r = firstIdentifier(c); if (r) return r; }
  return undefined;
}

function methodParams(paramsNode: TSNode | null): CodeParam[] {
  if (!paramsNode) return [];
  const out: CodeParam[] = [];
  for (const p of paramsNode.namedChildren) {
    if (p.type === 'identifier') { if (p.text !== 'self' && p.text !== 'cls') out.push({ name: p.text }); continue; }
    if (p.type === 'typed_parameter') {
      const nm = firstIdentifier(p); const ty = fieldText(p, 'type');
      if (nm && nm !== 'self' && nm !== 'cls') out.push({ name: nm, type: ty });
      continue;
    }
    if (p.type === 'default_parameter' || p.type === 'typed_default_parameter') {
      const nm = firstIdentifier(p);
      if (nm && nm !== 'self' && nm !== 'cls') out.push({ name: nm, type: fieldText(p, 'type') });
    }
  }
  return out;
}

export class PythonParser implements LanguageParser {
  readonly languages: Language[] = ['python'];

  async parse(content: string, file: string, _language: Language): Promise<CodeSymbol[]> {
    const tree = await parseTree('python', content);
    const symbols: CodeSymbol[] = [];

    for (const cls of collect(tree.rootNode, 'class_definition')) {
      const name = fieldText(cls, 'name');
      if (!name) continue;
      const supers = cls.childForFieldName('superclasses');
      const extendsList = supers ? supers.namedChildren.filter((c) => c.type === 'identifier' || c.type === 'attribute').map((c) => c.text.split('.').pop()!).filter((x) => x !== 'object') : [];

      const body = cls.childForFieldName('body');
      const members: CodeMember[] = [];
      const used = new Set<string>();
      const fieldNames = new Set<string>();
      const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
        let id = memberId(name, base.kind, base.name);
        while (used.has(id)) id += '_';
        used.add(id);
        members.push({ ...base, id, text: renderMember(base) });
      };

      if (body) {
        for (const stmt of body.namedChildren) {
          if (stmt.type === 'function_definition') {
            const mn = fieldText(stmt, 'name') ?? 'method';
            push({ kind: 'method', name: mn, visibility: pyVisibility(mn), params: methodParams(stmt.childForFieldName('parameters')), type: fieldText(stmt, 'return_type') });
            // self.<x> = ... fields inside the method body
            if (mn === '__init__' || mn === '__post_init__') {
              const fnBody = stmt.childForFieldName('body');
              if (fnBody) {
                for (const asn of collect(fnBody, 'assignment')) {
                  const left = asn.childForFieldName('left');
                  if (left && left.type === 'attribute' && left.childForFieldName('object')?.text === 'self') {
                    const fn = left.childForFieldName('attribute')?.text;
                    if (fn && !fieldNames.has(fn)) { fieldNames.add(fn); push({ kind: 'field', name: fn, visibility: pyVisibility(fn), type: fieldText(asn, 'type') }); }
                  }
                }
              }
            }
          } else if (stmt.type === 'expression_statement') {
            const asn = stmt.namedChildren[0];
            if (asn && asn.type === 'assignment') {
              const left = asn.childForFieldName('left');
              if (left && left.type === 'identifier' && !fieldNames.has(left.text)) {
                fieldNames.add(left.text);
                push({ kind: 'field', name: left.text, visibility: pyVisibility(left.text), type: fieldText(asn, 'type') });
              }
            }
          }
        }
      }

      symbols.push({ id: symbolId(name), name, kind: 'class', file, language: 'python', extends: extendsList, implements: [], members });
    }
    return symbols;
  }
}
