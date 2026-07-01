import { Device } from './ClientEntity';
import type { ActionDef } from './types';

/** A small on-screen panel: show text, clear, read current content. */
export class VirtualDisplay extends Device {
  readonly kind = 'virtual-display';
  readonly defaultName = 'Virtual Display';

  actions(): ActionDef[] {
    return [
      { name: 'show_text', label: 'Show text', params: [
        { name: 'text', type: 'string', default: 'Hello' },
        { name: 'color', type: 'string', default: '#e0e0e0', optional: true },
        { name: 'background', type: 'string', default: '#101418', optional: true },
      ] },
      { name: 'clear', label: 'Clear' },
      { name: 'get', label: 'Get content', returns: true },
    ];
  }
}
