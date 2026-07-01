/**
 * Catalog of known device/service classes keyed by `kind`. Lets any consumer
 * (the Server Logic page, a CLI) resolve a registered entity's action schema
 * from just its `kind`, without owning the definitions itself.
 */

import { ClientEntity } from './ClientEntity';
import type { ActionDef, EntityCategory } from './types';
import { VirtualMouse } from './VirtualMouse';
import { VirtualKeyboard } from './VirtualKeyboard';
import { VirtualDisplay } from './VirtualDisplay';
import { NotificationService, FileSystemService } from './services';

/** Concrete entity constructor. */
export type EntityCtor = new (id: string, name?: string) => ClientEntity;

/** kind → class. Extend this when you add a new device/service. */
export const ENTITY_CLASSES: Record<string, EntityCtor> = {
  'virtual-mouse': VirtualMouse,
  'virtual-keyboard': VirtualKeyboard,
  'virtual-display': VirtualDisplay,
  'notification': NotificationService,
  'vfs': FileSystemService,
};

/** Instantiate the class registered for `kind` (null if unknown). */
export function createEntity(kind: string, id: string, name?: string): ClientEntity | null {
  const Ctor = ENTITY_CLASSES[kind];
  return Ctor ? new Ctor(id, name) : null;
}

/** Action schema for a `kind`, or null when the kind isn't in the catalog. */
export function actionsForKind(kind: string): ActionDef[] | null {
  const e = createEntity(kind, '_');
  return e ? e.actions() : null;
}

/** Category (`device`/`service`) for a `kind`, or null when unknown. */
export function categoryForKind(kind: string): EntityCategory | null {
  const e = createEntity(kind, '_');
  return e ? e.category : null;
}
