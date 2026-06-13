# @mhersztowski/devtools

Source-code ⇄ UML toolkit for MyCastle. Parses **C / C++ / Python / JS / TS**,
generates **UML class diagrams** (in the editor's `*.umlproj.json` format),
diffs successive versions into the project's **git-like history**, and
round-trips a UML project back into **source-code skeletons**.

## Pipeline

```
source files ──▶ CodeModel (IR) ──▶ UML project (.umlproj.json)
                     ▲                     │  diff → history commit
                     └──── source code ◀───┘  (round-trip skeletons)
```

## Parsers (best-in-class)

| Language        | Library                                  | Notes                        |
| --------------- | ---------------------------------------- | ---------------------------- |
| TypeScript / JS | `typescript` Compiler API                | pure JS, semantic-grade      |
| Python          | `web-tree-sitter` + `tree-sitter-wasms`  | WASM grammar, no native build |
| C / C++         | `web-tree-sitter` + `tree-sitter-wasms`  | WASM grammar, no native build |

Tree-sitter grammars are loaded lazily; the TS/JS path works even if the WASM
grammars are unavailable.

## Quick start

```ts
import { UmlSyncService } from '@mhersztowski/devtools';

const svc = new UmlSyncService();

// 1. Generate a UML project from a code directory
const project = await svc.generateProjectFromDir('/path/to/src', 'MyApp', { relativeTo: '/path/to' });

// 2. Re-sync later — layout is preserved, changes become a history commit
const { project: updated, changes, summary, committed } = await svc.updateProjectFromDir(project, '/path/to/src', { relativeTo: '/path/to' });
//    summary e.g. "+2 ~3 -1"; `changes` lists every add/remove/modify

// 3. Round-trip: generate source skeletons from the UML
const files = svc.toSourceFiles(updated, 'typescript');
await svc.writeSourceFiles(files, '/path/to/generated');
```

Lower-level building blocks (`buildModel`, `generateProject`, `modelToDiagram`,
`diffDiagrams`, `generateCode`, `diagramToModel`, …) are all exported.

## Diff / history

`diffDiagrams(old, new)` returns component-level `ModelChange[]`
(`added | removed | modified` × `class | field | method | relation`).
`UmlSyncService.applyModel()` feeds the summary into a commit on the project's
current branch, so the UML editor's history shows exactly what each sync changed.

## Status

- ✅ TS/JS parsing (full), Python & C/C++ parsing (classes/structs, members,
  inheritance), UML generation with inheritance-aware layout, component diff,
  history commits, TS/Python/C++ skeleton generation.
- 🚧 Roadmap: non-destructive in-place code editing (preserve bodies/formatting),
  branch merge, richer C/C++ template & namespace handling.
