import { CodeSymbol, Language } from '../model/CodeModel.js';

/** A parser turns one source file's content into symbols (no relations yet). */
export interface LanguageParser {
  readonly languages: Language[];
  parse(content: string, file: string, language: Language): Promise<CodeSymbol[]> | CodeSymbol[];
}

const EXT_LANG: Record<string, Language> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', pyi: 'python',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', 'c++': 'cpp',
};

export function detectLanguage(file: string): Language | null {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return EXT_LANG[ext] ?? null;
}

export const SUPPORTED_EXTENSIONS = Object.keys(EXT_LANG);
