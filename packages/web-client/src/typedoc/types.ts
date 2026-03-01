export enum ReflectionKind {
  Project = 1,
  Module = 2,
  Enum = 8,
  EnumMember = 16,
  Variable = 32,
  Function = 64,
  Class = 128,
  Interface = 256,
  Constructor = 512,
  Property = 1024,
  Method = 2048,
  GetSignature = 262144,
  SetSignature = 2097152,
  TypeAlias = 4194304,
}

export const KIND_LABELS: Record<number, string> = {
  [ReflectionKind.Enum]: 'Enums',
  [ReflectionKind.Variable]: 'Variables',
  [ReflectionKind.Function]: 'Functions',
  [ReflectionKind.Class]: 'Classes',
  [ReflectionKind.Interface]: 'Interfaces',
  [ReflectionKind.TypeAlias]: 'Type Aliases',
};

export const KIND_ORDER = [
  ReflectionKind.Interface,
  ReflectionKind.Class,
  ReflectionKind.Enum,
  ReflectionKind.Function,
  ReflectionKind.TypeAlias,
  ReflectionKind.Variable,
];

export interface TypeDocComment {
  summary?: Array<{ kind: string; text: string }>;
  blockTags?: Array<{ tag: string; content: Array<{ kind: string; text: string }> }>;
}

export interface TypeDocSource {
  fileName: string;
  line: number;
  character: number;
  url?: string;
}

export interface TypeDocType {
  type: string;
  name?: string;
  value?: unknown;
  target?: number;
  package?: string;
  types?: TypeDocType[];
  elementType?: TypeDocType;
  declaration?: TypeDocReflection;
  typeArguments?: TypeDocType[];
  queryType?: TypeDocType;
  operator?: string;
  objectType?: TypeDocType;
  indexType?: TypeDocType;
  checkType?: TypeDocType;
  extendsType?: TypeDocType;
  trueType?: TypeDocType;
  falseType?: TypeDocType;
}

export interface TypeDocParameter {
  id: number;
  name: string;
  variant: string;
  kind: number;
  flags: Record<string, boolean>;
  type?: TypeDocType;
  comment?: TypeDocComment;
  defaultValue?: string;
}

export interface TypeDocSignature {
  id: number;
  name: string;
  variant: string;
  kind: number;
  flags: Record<string, boolean>;
  sources?: TypeDocSource[];
  parameters?: TypeDocParameter[];
  type?: TypeDocType;
  comment?: TypeDocComment;
  typeParameter?: TypeDocParameter[];
}

export interface TypeDocGroup {
  title: string;
  children: number[];
}

export interface TypeDocReflection {
  id: number;
  name: string;
  variant: string;
  kind: number;
  flags: Record<string, boolean>;
  children?: TypeDocReflection[];
  groups?: TypeDocGroup[];
  sources?: TypeDocSource[];
  signatures?: TypeDocSignature[];
  type?: TypeDocType;
  comment?: TypeDocComment;
  defaultValue?: string;
  extendedTypes?: TypeDocType[];
  implementedTypes?: TypeDocType[];
  typeParameter?: TypeDocParameter[];
  /** For variant="reference" — the ID of the target declaration */
  target?: number;
}

export interface TypeDocProject {
  schemaVersion: string;
  id: number;
  name: string;
  variant: string;
  kind: number;
  flags: Record<string, boolean>;
  children: TypeDocReflection[];
  groups?: TypeDocGroup[];
}
