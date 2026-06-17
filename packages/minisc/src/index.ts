export { tokenize } from './lexer';
export type { Token } from './lexer';
export { parse } from './parser';
export { codegen } from './codegen';
export type { CompiledProgram, CompiledFunction } from './codegen';
export { pack, disassemble } from './packer';
export type { CType } from './ast';

import { tokenize } from './lexer';
import { parse } from './parser';
import { codegen } from './codegen';
import { pack, disassemble } from './packer';

export interface CompileResult {
  bytecode: Uint8Array;
  size: number;
  disasm: string;
}

export function compile(source: string): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const program = codegen(ast);
  const bytecode = pack(program);
  return { bytecode, size: bytecode.length, disasm: disassemble(bytecode) };
}
