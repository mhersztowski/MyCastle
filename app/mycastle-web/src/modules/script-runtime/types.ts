import React from 'react';

// ─── Output marker classes ───────────────────────────────────────────────────

export class MarkdownOutput {
  constructor(public readonly content: string) {}
}

export class TableOutput {
  constructor(
    public readonly data: Record<string, unknown>[] | unknown[][],
    public readonly columns?: string[],
  ) {}
}

export interface ReactiveConfig {
  /** Optional: fetch initial value before first subscription event */
  initial?: () => Promise<unknown> | unknown;
  /** Subscribe to live updates; return cleanup fn */
  subscribe: (callback: (value: unknown) => void) => () => void;
  /** Convert raw value to displayable content */
  render: (value: unknown) => React.ReactNode | string;
}

export class ReactiveValue {
  constructor(public readonly config: ReactiveConfig) {}
}

export type ScriptOutput =
  | string
  | MarkdownOutput
  | TableOutput
  | ReactiveValue
  | React.ReactElement
  | null
  | undefined;

// ─── Helper functions available inside scripts ────────────────────────────────

/** Tag-template literal: explicit markdown output */
export function md(strings: TemplateStringsArray, ...values: unknown[]): MarkdownOutput {
  const content = strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
  return new MarkdownOutput(content);
}

/** Explicit table output */
export function table(
  data: Record<string, unknown>[] | unknown[][],
  columns?: string[],
): TableOutput {
  return new TableOutput(data, columns);
}

/** Reactive / live value — block re-renders on each subscription event */
export function reactive(config: ReactiveConfig): ReactiveValue {
  return new ReactiveValue(config);
}

// ─── Script context ───────────────────────────────────────────────────────────

export interface ScriptAuth {
  currentUser: string | null;
  token: string | null;
  isAdmin: boolean;
}

export interface ScriptHttp {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body?: unknown) => Promise<unknown>;
}

export interface ScriptContext {
  auth: ScriptAuth;
  http: ScriptHttp;
  md: typeof md;
  table: typeof table;
  reactive: typeof reactive;
  // plugin namespaces (e.g. iot, map, timeline, flow) injected at runtime
  [key: string]: unknown;
}

export interface DisplayApi {
  text: (str: string) => void;
  table: (data: Record<string, unknown>[] | unknown[][]) => void;
  list: (items: unknown[]) => void;
  json: (obj: unknown) => void;
}

export interface DisplayItem {
  type: 'text' | 'table' | 'list' | 'json';
  data: unknown;
}
