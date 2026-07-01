import { Device } from './ClientEntity';
import type { ActionDef, ParamDef } from './types';

const BUTTON: ParamDef = { name: 'button', type: 'enum', options: ['left', 'right', 'middle'], default: 'left' };

/** Pointer control: move, click, scroll, press/release, query position/size. */
export class VirtualMouse extends Device {
  readonly kind = 'virtual-mouse';
  readonly defaultName = 'Virtual Mouse';

  actions(): ActionDef[] {
    return [
      { name: 'move', label: 'Move to', params: [
        { name: 'x', type: 'number', default: 200 },
        { name: 'y', type: 'number', default: 200 },
      ] },
      { name: 'move_rel', label: 'Move by', params: [
        { name: 'dx', type: 'number', default: 20 },
        { name: 'dy', type: 'number', default: 0 },
      ] },
      { name: 'click', label: 'Click', params: [
        { ...BUTTON },
        { name: 'x', type: 'number', optional: true },
        { name: 'y', type: 'number', optional: true },
        { name: 'count', type: 'number', default: 1, optional: true },
      ] },
      { name: 'scroll', label: 'Scroll', params: [
        { name: 'dx', type: 'number', default: 0 },
        { name: 'dy', type: 'number', default: 3 },
      ] },
      { name: 'press', label: 'Press', params: [{ ...BUTTON }] },
      { name: 'release', label: 'Release', params: [{ ...BUTTON }] },
      { name: 'get_pos', label: 'Get position', returns: true },
      { name: 'get_size', label: 'Get screen size', returns: true },
    ];
  }
}
