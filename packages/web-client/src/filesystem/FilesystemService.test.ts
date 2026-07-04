import type { DirectoryTree } from '@mhersztowski/core';

// Mock the MqttClient module so FilesystemService talks to a fake singleton.
// vi.hoisted keeps the mock object available to the hoisted vi.mock factory.
const mqttMock = vi.hoisted(() => ({
  listDirectory: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('../mqtt/MqttClient', () => ({
  mqttClient: mqttMock,
  MqttClient: class {},
}));

import { FilesystemService } from './FilesystemService';

// A representative tree with the well-known data files.
function sampleTree(): DirectoryTree {
  return {
    name: 'root',
    path: '',
    type: 'directory',
    children: [
      {
        name: 'data',
        path: 'data',
        type: 'directory',
        children: [
          { name: 'persons.json', path: 'data/persons.json', type: 'file' },
          { name: 'tasks.json', path: 'data/tasks.json', type: 'file' },
          {
            name: 'calendar',
            path: 'data/calendar',
            type: 'directory',
            children: [
              {
                name: '2026',
                path: 'data\\calendar\\2026', // backslashes to exercise normalization
                type: 'directory',
                children: [],
              },
            ],
          },
        ],
      },
      { name: 'readme.md', path: 'readme.md', type: 'file' },
    ],
  };
}

describe('FilesystemService', () => {
  let svc: FilesystemService;

  beforeEach(() => {
    vi.clearAllMocks();
    svc = new FilesystemService();
    mqttMock.readFile.mockResolvedValue({ path: '', content: '', lastModified: 't' });
    mqttMock.writeFile.mockResolvedValue({});
    mqttMock.deleteFile.mockResolvedValue({ success: true });
  });

  describe('loadDirectory / buildDirData', () => {
    it('builds a DirData tree and normalizes backslash paths', async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      const root = await svc.loadDirectory();

      expect(root).toBe(svc.getRootDir());
      const dataDir = root.getDirByName('data');
      expect(dataDir).toBeDefined();
      expect(dataDir!.getFileByName('persons.json')).toBeDefined();

      const yearDir = dataDir!.getDirByName('calendar')!.getDirByName('2026');
      expect(yearDir!.getPath()).toBe('data/calendar/2026'); // normalized
    });
  });

  describe('getDirByPath', () => {
    beforeEach(async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();
    });

    it('returns the root for "" and "/"', () => {
      expect(svc.getDirByPath('')).toBe(svc.getRootDir());
      expect(svc.getDirByPath('/')).toBe(svc.getRootDir());
    });

    it('resolves a nested directory by path', () => {
      const d = svc.getDirByPath('data/calendar');
      expect(d?.getName()).toBe('calendar');
    });

    it('returns undefined for a missing directory', () => {
      expect(svc.getDirByPath('data/nope')).toBeUndefined();
    });

    it('returns undefined before any directory is loaded', () => {
      const fresh = new FilesystemService();
      expect(fresh.getDirByPath('data')).toBeUndefined();
    });
  });

  describe('readFile', () => {
    it('returns null when no directory has been loaded', async () => {
      expect(await svc.readFile('data/persons.json')).toBeNull();
    });

    it('returns null for a path not present in the tree', async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();
      expect(await svc.readFile('data/ghost.json')).toBeNull();
    });

    it('reads content via MQTT and populates the FileData', async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();
      mqttMock.readFile.mockResolvedValue({
        path: 'data/persons.json',
        content: '{"type":"persons","items":[]}',
        lastModified: 't',
      });

      const fd = await svc.readFile('data/persons.json');
      expect(mqttMock.readFile).toHaveBeenCalledWith('data/persons.json');
      expect(fd?.toString()).toBe('{"type":"persons","items":[]}');
    });
  });

  describe('writeFile', () => {
    it('writes via MQTT and updates an existing in-memory file', async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();

      const fd = await svc.writeFile('data/tasks.json', '{"type":"tasks","tasks":[]}');
      expect(mqttMock.writeFile).toHaveBeenCalledWith('data/tasks.json', '{"type":"tasks","tasks":[]}');
      expect(fd?.toString()).toBe('{"type":"tasks","tasks":[]}');
    });

    it('adds a brand-new file to the in-memory tree', async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();

      const fd = await svc.writeFile('data/new/child.json', '{}');
      expect(fd?.getName()).toBe('child.json');
      // The intermediate directory must have been created.
      expect(svc.getDirByPath('data/new')?.getFileByName('child.json')).toBeDefined();
    });

    it('returns null when writing without a loaded tree (still calls MQTT)', async () => {
      const fd = await svc.writeFile('data/tasks.json', '{}');
      expect(mqttMock.writeFile).toHaveBeenCalled();
      expect(fd).toBeNull();
    });
  });

  describe('deleteFile', () => {
    it('returns the success flag from the MQTT response', async () => {
      mqttMock.deleteFile.mockResolvedValue({ success: true });
      expect(await svc.deleteFile('data/persons.json')).toBe(true);

      mqttMock.deleteFile.mockResolvedValue({ success: false });
      expect(await svc.deleteFile('data/persons.json')).toBe(false);
    });
  });

  describe('reloadDataFile — routing by path', () => {
    beforeEach(async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();
    });

    it('returns false for a path that is not a tracked data file', async () => {
      expect(await svc.reloadDataFile('readme.md', 'write')).toBe(false);
      expect(mqttMock.readFile).not.toHaveBeenCalled();
    });

    it('reloads a tracked data file from the backend', async () => {
      mqttMock.readFile.mockResolvedValue({
        path: 'data/persons.json',
        content: '{"type":"persons","items":[]}',
        lastModified: 't',
      });
      expect(await svc.reloadDataFile('data/persons.json', 'write')).toBe(true);
      expect(mqttMock.readFile).toHaveBeenCalledWith('data/persons.json');
    });

    it('treats data/calendar/*.json as a tracked calendar file', async () => {
      mqttMock.readFile.mockResolvedValue({
        path: 'data/calendar/2026/01/02.json',
        content: '{"type":"events","tasks":[]}',
        lastModified: 't',
      });
      expect(await svc.reloadDataFile('data/calendar/2026/01/02.json', 'write')).toBe(true);
    });

    it('handles a delete action by clearing without a re-read', async () => {
      expect(await svc.reloadDataFile('data/persons.json', 'delete')).toBe(true);
      expect(mqttMock.readFile).not.toHaveBeenCalled();
    });

    it('returns false before a tree is loaded', async () => {
      const fresh = new FilesystemService();
      expect(await fresh.reloadDataFile('data/persons.json', 'write')).toBe(false);
    });

    it('skips the redundant re-read for a file it just wrote itself', async () => {
      // writeFile marks the path as a recent self-write.
      await svc.writeFile('data/persons.json', '{"type":"persons","items":[]}');
      mqttMock.readFile.mockClear();

      const result = await svc.reloadDataFile('data/persons.json', 'write');
      expect(result).toBe(false);
      expect(mqttMock.readFile).not.toHaveBeenCalled();
    });

    it('returns false when the backend read throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mqttMock.readFile.mockRejectedValue(new Error('boom'));
      expect(await svc.reloadDataFile('data/tasks.json', 'write')).toBe(false);
      warn.mockRestore();
    });
  });

  describe('syncDirinfo', () => {
    beforeEach(async () => {
      mqttMock.listDirectory.mockResolvedValue(sampleTree());
      await svc.loadDirectory();
    });

    it('applies a dirinfo model to the target directory', async () => {
      // A file_json component parses the file content on construction, so give
      // persons.json valid JSON first.
      await svc.writeFile('data/persons.json', '{"type":"persons","items":[]}');
      const content = JSON.stringify({
        type: 'dir',
        name: 'data',
        files: [
          {
            type: 'file',
            name: 'persons.json',
            components: [{ type: 'file_json', ref: 'schema/persons', objectType: 'person' }],
          },
        ],
      });
      const ok = svc.syncDirinfo('data/dirinfo.json', content);
      expect(ok).toBe(true);
    });

    it('returns false for a directory that does not exist', () => {
      expect(svc.syncDirinfo('ghost/dirinfo.json', '{"type":"dir","files":[]}')).toBe(false);
    });

    it('returns false for malformed JSON content', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(svc.syncDirinfo('data/dirinfo.json', 'not json')).toBe(false);
      err.mockRestore();
    });

    it('returns false before any tree is loaded', () => {
      const fresh = new FilesystemService();
      expect(fresh.syncDirinfo('data/dirinfo.json', '{"type":"dir","files":[]}')).toBe(false);
    });
  });

  describe('accessors', () => {
    it('exposes calendar and datasource singletons', () => {
      expect(svc.getCalendar()).toBeDefined();
      expect(svc.getDataSource()).toBeDefined();
    });
  });
});
