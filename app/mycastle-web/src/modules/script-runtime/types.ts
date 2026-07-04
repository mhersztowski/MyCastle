import React from 'react';
import type { CredentialsApi } from '../../services/credentialsApi';

export type { CredentialsApi, CredentialEntry } from '../../services/credentialsApi';

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

export interface HttpOptions {
  /** Extra headers merged with the default Content-Type / Authorization. */
  headers?: Record<string, string>;
  /** Set false to skip the auto Authorization header (external APIs). Default true. */
  auth?: boolean;
}

export interface ScriptHttp {
  /** GET → parse JSON. Throws on non-2xx. */
  get<T = unknown>(url: string, options?: HttpOptions): Promise<T>;
  /** POST JSON body → parse JSON. Throws on non-2xx. */
  post<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** PUT JSON body → parse JSON. Throws on non-2xx. */
  put<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** PATCH JSON body → parse JSON. Throws on non-2xx. */
  patch<T = unknown>(url: string, body?: unknown, options?: HttpOptions): Promise<T>;
  /** DELETE → parse JSON. Throws on non-2xx. */
  delete<T = unknown>(url: string, options?: HttpOptions): Promise<T>;
  /** GET → return raw text (not JSON). Useful for Markdown, CSV, plain HTML. */
  getText(url: string, options?: HttpOptions): Promise<string>;
  /** Raw fetch — full control, no automatic headers. Returns the native Response. */
  raw(url: string, init?: RequestInit): Promise<Response>;
}

export interface ScriptContext {
  auth: ScriptAuth;
  http: ScriptHttp;
  /** Zaszyfrowane credentiale użytkownika (Settings → Sekrety). */
  secrets: CredentialsApi;
  md: typeof md;
  table: typeof table;
  reactive: typeof reactive;
  /** Document env vars loaded by File components. `env.get('name')` / `env.all()`. */
  env: { get: (name: string) => unknown; all: () => Record<string, unknown> };
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
