/**
 * TypeScript / JavaScript parser built on the TypeScript Compiler API — the
 * best-in-class option for these languages (no native deps). Syntactic-only
 * (ts.createSourceFile) which is enough to extract structure cheaply.
 */
import ts from 'typescript';
import { CodeMember, CodeParam, CodeSymbol, Language, Visibility } from '../model/CodeModel.js';
import { memberId, symbolId } from '../model/ids.js';
import { renderMember } from '../model/render.js';
import { LanguageParser } from './types.js';

function visibilityOf(mods: readonly ts.ModifierLike[] | undefined): Visibility {
  if (!mods) return 'public';
  for (const m of mods) {
    if (m.kind === ts.SyntaxKind.PrivateKeyword) return 'private';
    if (m.kind === ts.SyntaxKind.ProtectedKeyword) return 'protected';
    if (m.kind === ts.SyntaxKind.PublicKeyword) return 'public';
  }
  return 'public';
}
const hasMod = (mods: readonly ts.ModifierLike[] | undefined, k: ts.SyntaxKind) => !!mods?.some((m) => m.kind === k);

function typeText(node: ts.TypeNode | undefined): string | undefined {
  return node ? node.getText().replace(/\s+/g, ' ').trim() : undefined;
}

function params(decl: ts.SignatureDeclarationBase): CodeParam[] {
  return decl.parameters.map((p) => ({ name: p.name.getText(), type: typeText(p.type) }));
}

function heritage(node: ts.ClassDeclaration | ts.InterfaceDeclaration): { ext: string[]; impl: string[] } {
  const ext: string[] = []; const impl: string[] = [];
  for (const h of node.heritageClauses ?? []) {
    for (const t of h.types) {
      const name = t.expression.getText();
      if (h.token === ts.SyntaxKind.ExtendsKeyword) ext.push(name);
      else impl.push(name);
    }
  }
  return { ext, impl };
}

export class TsParser implements LanguageParser {
  readonly languages: Language[] = ['typescript', 'javascript'];

  parse(content: string, file: string, language: Language): CodeSymbol[] {
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true,
      language === 'javascript' ? ts.ScriptKind.JSX : ts.ScriptKind.TSX);
    const symbols: CodeSymbol[] = [];

    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const name = node.name.text;
        const { ext, impl } = heritage(node);
        symbols.push({
          id: symbolId(name), name, kind: 'class', file, language,
          isAbstract: hasMod(node.modifiers, ts.SyntaxKind.AbstractKeyword),
          extends: ext, implements: impl,
          members: this.classMembers(name, node.members),
        });
      } else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const ext: string[] = [];
        for (const h of node.heritageClauses ?? []) for (const t of h.types) ext.push(t.expression.getText());
        symbols.push({
          id: symbolId(name), name, kind: 'interface', file, language,
          extends: ext, implements: [],
          members: this.interfaceMembers(name, node.members),
        });
      } else if (ts.isEnumDeclaration(node)) {
        const name = node.name.text;
        const members: CodeMember[] = node.members.map((em, i) => {
          const mn = em.name.getText();
          const base = { kind: 'field' as const, name: mn, visibility: 'public' as Visibility };
          return { id: memberId(name, 'field', mn) + `#${i}`, ...base, text: mn };
        });
        symbols.push({ id: symbolId(name), name, kind: 'enum', file, language, extends: [], implements: [], members });
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return symbols;
  }

  private classMembers(owner: string, members: ts.NodeArray<ts.ClassElement>): CodeMember[] {
    const out: CodeMember[] = [];
    const used = new Set<string>();
    const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(owner, base.kind, base.name);
      while (used.has(id)) id += '_';
      used.add(id);
      out.push({ ...base, id, text: renderMember(base) });
    };
    for (const m of members) {
      if (ts.isPropertyDeclaration(m)) {
        push({ kind: 'field', name: m.name.getText(), visibility: visibilityOf(m.modifiers), type: typeText(m.type), isStatic: hasMod(m.modifiers, ts.SyntaxKind.StaticKeyword) });
      } else if (ts.isMethodDeclaration(m)) {
        push({ kind: 'method', name: m.name.getText(), visibility: visibilityOf(m.modifiers), type: typeText(m.type), params: params(m), isStatic: hasMod(m.modifiers, ts.SyntaxKind.StaticKeyword), isAbstract: hasMod(m.modifiers, ts.SyntaxKind.AbstractKeyword) });
      } else if (ts.isGetAccessorDeclaration(m) || ts.isSetAccessorDeclaration(m)) {
        push({ kind: 'method', name: m.name.getText(), visibility: visibilityOf(m.modifiers), type: typeText(m.type), params: params(m) });
      } else if (ts.isConstructorDeclaration(m)) {
        push({ kind: 'method', name: 'constructor', visibility: 'public', params: params(m) });
        // constructor parameter properties become fields
        for (const p of m.parameters) {
          if (p.modifiers?.length) push({ kind: 'field', name: p.name.getText(), visibility: visibilityOf(p.modifiers), type: typeText(p.type) });
        }
      }
    }
    return out;
  }

  private interfaceMembers(owner: string, members: ts.NodeArray<ts.TypeElement>): CodeMember[] {
    const out: CodeMember[] = [];
    const used = new Set<string>();
    const push = (base: Omit<CodeMember, 'id' | 'text'>) => {
      let id = memberId(owner, base.kind, base.name);
      while (used.has(id)) id += '_';
      used.add(id);
      out.push({ ...base, id, text: renderMember(base) });
    };
    for (const m of members) {
      if (ts.isPropertySignature(m)) push({ kind: 'field', name: m.name.getText(), visibility: 'public', type: typeText(m.type) });
      else if (ts.isMethodSignature(m)) push({ kind: 'method', name: m.name.getText(), visibility: 'public', type: typeText(m.type), params: params(m) });
    }
    return out;
  }
}
