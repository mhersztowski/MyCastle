/**
 * Device & service model for the server-logic layer — base classes plus the
 * built-in virtual entities. Browser-safe (no minislib / Node), so it re-exports
 * cleanly from both `@mhersztowski/server-logic` and `.../web`.
 */

export type { EntityCategory, ParamType, ParamDef, ActionDef } from './types';
export { defaultPayload } from './types';

export { ClientEntity, Device, Service } from './ClientEntity';

export { VirtualMouse } from './VirtualMouse';
export { VirtualKeyboard } from './VirtualKeyboard';
export { VirtualDisplay } from './VirtualDisplay';
export { NotificationService, FileSystemService } from './services';

export {
  ENTITY_CLASSES, type EntityCtor,
  createEntity, actionsForKind, categoryForKind,
} from './catalog';
