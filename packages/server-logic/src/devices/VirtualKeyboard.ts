import { Device } from './ClientEntity';
import type { ActionDef } from './types';

/** Keyboard control: type text, single key with modifiers, chorded hotkey. */
export class VirtualKeyboard extends Device {
  readonly kind = 'virtual-keyboard';
  readonly defaultName = 'Virtual Keyboard';

  actions(): ActionDef[] {
    return [
      { name: 'type_text', label: 'Type text', params: [
        { name: 'text', type: 'string', default: 'hello' },
      ] },
      { name: 'key_press', label: 'Key press', params: [
        { name: 'key', type: 'string', default: 'enter' },
        { name: 'modifiers', type: 'string', default: [], optional: true,
          label: 'modifiers (JSON array)' },
      ] },
      { name: 'hotkey', label: 'Hotkey', params: [
        { name: 'keys', type: 'string', default: ['ctrl', 'c'], label: 'keys (JSON array)' },
      ] },
    ];
  }
}
