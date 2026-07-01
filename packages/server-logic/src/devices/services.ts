import { Service } from './ClientEntity';
import type { ActionDef } from './types';

/** Desktop notifications (ServerLogic.md → Services: Notification). */
export class NotificationService extends Service {
  readonly kind = 'notification';
  readonly defaultName = 'Notifications';

  actions(): ActionDef[] {
    return [
      { name: 'notify', label: 'Notify', params: [
        { name: 'title', type: 'string', default: 'MyCastle' },
        { name: 'message', type: 'string', default: 'Hello' },
        { name: 'level', type: 'enum', options: ['info', 'warning', 'error'], default: 'info', optional: true },
      ] },
    ];
  }
}

/** Remote filesystem access (ServerLogic.md → Services: FileSystem). */
export class FileSystemService extends Service {
  readonly kind = 'vfs';
  readonly defaultName = 'File System';

  actions(): ActionDef[] {
    return [
      { name: 'list', label: 'List dir', params: [{ name: 'path', type: 'string', default: '.' }], returns: true },
      { name: 'read', label: 'Read file', params: [{ name: 'path', type: 'string', default: '' }], returns: true },
      { name: 'write', label: 'Write file', params: [
        { name: 'path', type: 'string', default: '' },
        { name: 'content', type: 'string', default: '' },
      ] },
      { name: 'delete', label: 'Delete', params: [{ name: 'path', type: 'string', default: '' }] },
    ];
  }
}
