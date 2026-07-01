/**
 * Base classes for the things a client exposes: **devices** and **services**
 * (see ServerLogic.md). An entity is a small, framework-agnostic definition —
 * identity + an action catalog — plus an optional command handler for hosts
 * that actually execute it (a native TS client, or the server itself).
 *
 * The concrete virtual entities (VirtualMouse, VirtualKeyboard, …) live next to
 * this file so the whole device/service model has one home in server-logic.
 */

import type { RegisteredEntity } from '../messages';
import type { ActionDef, EntityCategory } from './types';

export abstract class ClientEntity {
  /** Capability tag advertised in registration, e.g. `virtual-mouse`. */
  abstract readonly kind: string;
  /** `device` or `service`. */
  abstract readonly category: EntityCategory;
  /** Fallback label when no instance name is given. */
  abstract readonly defaultName: string;

  /**
   * @param id    Stable id, unique within the client (used in the topic path).
   * @param name  Optional human label; falls back to `defaultName`.
   */
  constructor(readonly id: string, readonly name?: string) {}

  /** The actions this entity understands. */
  abstract actions(): ActionDef[];

  /** Command names — what registration advertises as `capabilities`. */
  capabilities(): string[] {
    return this.actions().map((a) => a.name);
  }

  /** Look up a single action definition by command name. */
  action(name: string): ActionDef | undefined {
    return this.actions().find((a) => a.name === name);
  }

  /** The wire form used in `client-device-new` / `client-service-new`. */
  toRegisteredEntity(): RegisteredEntity {
    return {
      id: this.id,
      name: this.name ?? this.defaultName,
      kind: this.kind,
      capabilities: this.capabilities(),
    };
  }

  /**
   * Execute a command. The base has no side effects — hosts that run the entity
   * (native client, server) override this. UIs and the server control plane use
   * the definition (actions/params) without ever calling handle().
   */
  handle(action: string, _params: Record<string, unknown>): unknown {
    throw new Error(`${this.kind}: no handler for action '${action}'`);
  }
}

/** A device sub-entity (`.../device/{id}/...`). */
export abstract class Device extends ClientEntity {
  readonly category = 'device' as const;
}

/** A service sub-entity (`.../service/{id}/...`). */
export abstract class Service extends ClientEntity {
  readonly category = 'service' as const;
}
