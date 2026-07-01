/**
 * Action/parameter schema for client devices & services.
 *
 * These describe *what* an entity can do and *which parameters* each action
 * takes, so any UI (the Server Logic page, a CLI, a designer) can render an
 * action panel and build a valid command payload without hard-coding anything.
 * The wire command is an Envelope `{ type: action.name, payload: params }`.
 */

export type EntityCategory = 'device' | 'service';

export type ParamType = 'string' | 'number' | 'boolean' | 'enum';

export interface ParamDef {
  /** Payload key. */
  name: string;
  type: ParamType;
  /** UI label (defaults to `name`). */
  label?: string;
  /** Omit from the payload when the user leaves it empty. */
  optional?: boolean;
  /** Seed value used to build the default payload. */
  default?: unknown;
  /** Allowed values for `type: 'enum'`. */
  options?: string[];
  /** Bounds/step hints for `type: 'number'`. */
  min?: number;
  max?: number;
  step?: number;
}

export interface ActionDef {
  /** Command type placed in the Envelope `type` field. */
  name: string;
  label?: string;
  description?: string;
  params?: ParamDef[];
  /** True when the action replies with data (e.g. `get_pos`, `get_size`). */
  returns?: boolean;
}

function defaultForType(t: ParamType): unknown {
  switch (t) {
    case 'number': return 0;
    case 'boolean': return false;
    default: return '';
  }
}

/** Build the default payload for an action from its parameter defaults. */
export function defaultPayload(action: ActionDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of action.params ?? []) {
    if (p.optional && p.default === undefined) continue;
    out[p.name] = p.default ?? (p.type === 'enum' ? (p.options?.[0] ?? '') : defaultForType(p.type));
  }
  return out;
}
