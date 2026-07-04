/**
 * Generates the public API artifacts under `packages/core/api/`:
 *   • json-schema/{Name}.schema.json — JSON Schema (all referenced types inlined
 *     as `definitions`) via ts-json-schema-generator.
 *   • d.ts/{Name}.d.ts — a self-contained TypeScript declaration bundling the
 *     root type together with every project type it transitively references.
 *
 * Targets: the PIM models (Event/Person/Project/Task) from core, plus the CAD
 * scene model (`ProjectData`) from core-cad. Re-run with `pnpm gen:api`.
 */
import { createGenerator } from 'ts-json-schema-generator';
import ts from 'typescript';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..', '..');
const R = (p: string) => resolve(repoRoot, p);

const CORE_TSCONFIG = R('packages/core/tsconfig.json');
const CAD_TSCONFIG = R('packages/core-cad/tsconfig.json');

interface Target {
  name: string;   // output file base name
  file: string;   // source file declaring `type`
  type: string;   // root type name
  tsconfig: string;
}

const targets: Target[] = [
  { name: 'EventModel',   file: R('packages/core/src/models/EventModel.ts'),   type: 'EventModel',   tsconfig: CORE_TSCONFIG },
  { name: 'PersonModel',  file: R('packages/core/src/models/PersonModel.ts'),  type: 'PersonModel',  tsconfig: CORE_TSCONFIG },
  { name: 'ProjectModel', file: R('packages/core/src/models/ProjectModel.ts'), type: 'ProjectModel', tsconfig: CORE_TSCONFIG },
  { name: 'TaskModel',    file: R('packages/core/src/models/TaskModel.ts'),    type: 'TaskModel',    tsconfig: CORE_TSCONFIG },
  // CAD scene model (.cad.json): ProjectData → settings, layers, entities…
  { name: 'CadScene',     file: R('packages/core-cad/src/project/Project.ts'), type: 'ProjectData',  tsconfig: CAD_TSCONFIG },
];

const OUT_SCHEMA = R('packages/core/api/json-schema');
const OUT_DTS = R('packages/core/api/d.ts');
mkdirSync(OUT_SCHEMA, { recursive: true });
mkdirSync(OUT_DTS, { recursive: true });

// ── JSON Schema ─────────────────────────────────────────────────────────────

function genSchema(t: Target): number {
  const gen = createGenerator({
    path: t.file,
    tsconfig: t.tsconfig,
    type: t.type,
    expose: 'all',        // referenced types become reusable definitions
    topRef: true,
    jsDoc: 'extended',
    skipTypeCheck: true,
    additionalProperties: false,
  });
  const schema = gen.createSchema(t.type);
  writeFileSync(resolve(OUT_SCHEMA, `${t.name}.schema.json`), JSON.stringify(schema, null, 2) + '\n');
  return Object.keys(schema.definitions ?? {}).length;
}

// ── self-contained .d.ts (compiler API type bundler) ─────────────────────────

const programCache = new Map<string, ts.Program>();
function programFor(tsconfigPath: string): ts.Program {
  const cached = programCache.get(tsconfigPath);
  if (cached) return cached;
  const cfg = ts.readConfigFile(tsconfigPath, ts.sys.readFile).config;
  const parsed = ts.parseJsonConfigFileContent(cfg, ts.sys, dirname(tsconfigPath));
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  programCache.set(tsconfigPath, program);
  return program;
}

const rightmostId = (name: ts.EntityName): ts.Identifier =>
  ts.isQualifiedName(name) ? rightmostId(name.right) : name;

function isProjectDecl(node: ts.Node): boolean {
  const sf = node.getSourceFile();
  return !sf.isDeclarationFile && !sf.fileName.includes('node_modules');
}

function genDts(t: Target): number {
  const program = programFor(t.tsconfig);
  const checker = program.getTypeChecker();
  const rootSf = program.getSourceFile(t.file);
  if (!rootSf) throw new Error(`source not found in program: ${t.file}`);

  const parts: string[] = [];
  const seen = new Set<string>();

  const collectSymbol = (sym: ts.Symbol) => {
    const target = (sym.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(sym) : sym;
    for (const decl of target.getDeclarations() ?? []) {
      if (!(ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl) || ts.isEnumDeclaration(decl))) continue;
      if (!isProjectDecl(decl) || !decl.name) continue;
      const name = decl.name.getText();
      if (seen.has(name)) continue;
      seen.add(name);
      collectRefs(decl);                 // dependencies first
      let text = decl.getText().trim();
      if (!/^export\b/.test(text)) text = `export ${text}`;
      parts.push(text);
    }
  };

  const collectRefs = (node: ts.Node) => {
    const visit = (n: ts.Node) => {
      if (ts.isTypeReferenceNode(n)) {
        const s = checker.getSymbolAtLocation(rightmostId(n.typeName));
        if (s) collectSymbol(s);
      } else if (ts.isExpressionWithTypeArguments(n) && ts.isIdentifier(n.expression)) {
        const s = checker.getSymbolAtLocation(n.expression);   // `extends X`
        if (s) collectSymbol(s);
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(node, visit);
  };

  // Seed from the root declaration in its own file.
  const root = rootSf.statements.find(
    (s): s is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration =>
      (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) || ts.isEnumDeclaration(s)) &&
      s.name.getText() === t.type,
  );
  if (!root) throw new Error(`type ${t.type} not found in ${t.file}`);
  const rootSym = checker.getSymbolAtLocation(root.name);
  if (rootSym) collectSymbol(rootSym);

  const header =
    `/** Auto-generated by \`pnpm gen:api\` — do not edit by hand.\n` +
    ` *  Self-contained type bundle for \`${t.type}\`. */\n\n`;
  writeFileSync(resolve(OUT_DTS, `${t.name}.d.ts`), header + parts.join('\n\n') + '\n');
  return parts.length;
}

// ── run ──────────────────────────────────────────────────────────────────────

for (const t of targets) {
  const defs = genSchema(t);
  const decls = genDts(t);
  console.log(`✓ ${t.name}  (${t.type})  →  schema: ${defs} defs · d.ts: ${decls} decls`);
}
console.log(`\nWrote to:\n  ${OUT_SCHEMA}\n  ${OUT_DTS}`);
