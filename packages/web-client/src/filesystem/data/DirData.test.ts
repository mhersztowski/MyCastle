import { DirData } from './DirData';
import { FileData } from './FileData';

// Build a small in-memory tree:
//   data/
//     persons.json
//     calendar/
//       2026/
//         01/
//           02.json
function buildTree(): DirData {
  const root = new DirData('data', 'data');

  const personsFile = new FileData('persons.json', 'data/persons.json', root);
  root.getFiles().push(personsFile);

  const calendar = root.createSubDirs(['calendar', '2026', '01']);
  const dayFile = new FileData('02.json', 'data/calendar/2026/01/02.json', calendar);
  calendar.getFiles().push(dayFile);

  return root;
}

describe('DirData', () => {
  describe('constructor / getters', () => {
    it('stores name and path', () => {
      const d = new DirData('foo', 'a/b/foo');
      expect(d.getName()).toBe('foo');
      expect(d.getPath()).toBe('a/b/foo');
      expect(d.getDirs()).toEqual([]);
      expect(d.getFiles()).toEqual([]);
      expect(d.getComponents()).toEqual([]);
    });
  });

  describe('createSubDirs', () => {
    it('creates a nested chain and computes cumulative paths', () => {
      const root = new DirData('root', 'root');
      const leaf = root.createSubDirs(['a', 'b', 'c']);

      expect(leaf.getName()).toBe('c');
      expect(leaf.getPath()).toBe('root/a/b/c');

      const a = root.getDirByName('a');
      expect(a?.getPath()).toBe('root/a');
      expect(a?.getDirByName('b')?.getPath()).toBe('root/a/b');
    });

    it('reuses existing directories instead of duplicating them', () => {
      const root = new DirData('root', 'root');
      root.createSubDirs(['a', 'b']);
      root.createSubDirs(['a', 'c']);

      expect(root.getDirs()).toHaveLength(1); // only one 'a'
      const a = root.getDirByName('a')!;
      expect(a.getDirs().map(d => d.getName()).sort()).toEqual(['b', 'c']);
    });

    it('returns the root itself for an empty path', () => {
      const root = new DirData('root', 'root');
      expect(root.createSubDirs([])).toBe(root);
    });
  });

  describe('getFileByName / getDirByName', () => {
    it('finds direct children by name and returns undefined for misses', () => {
      const root = buildTree();
      expect(root.getFileByName('persons.json')?.getName()).toBe('persons.json');
      expect(root.getFileByName('nope.json')).toBeUndefined();
      expect(root.getDirByName('calendar')?.getName()).toBe('calendar');
      expect(root.getDirByName('missing')).toBeUndefined();
    });
  });

  describe('getFileByPath', () => {
    it('finds a file at the root level', () => {
      const root = buildTree();
      const f = root.getFileByPath('persons.json');
      expect(f?.getPath()).toBe('data/persons.json');
    });

    it('finds a deeply nested file', () => {
      const root = buildTree();
      const f = root.getFileByPath('calendar/2026/01/02.json');
      expect(f?.getName()).toBe('02.json');
    });

    it('skips the leading root-name segment when path is prefixed with root name', () => {
      const root = buildTree(); // name === path === 'data'
      const f = root.getFileByPath('data/calendar/2026/01/02.json');
      expect(f?.getName()).toBe('02.json');
    });

    it('normalizes backslashes before resolving', () => {
      const root = buildTree();
      const f = root.getFileByPath('calendar\\2026\\01\\02.json');
      expect(f?.getName()).toBe('02.json');
    });

    it('returns undefined for a non-existent intermediate directory', () => {
      const root = buildTree();
      expect(root.getFileByPath('calendar/9999/01/02.json')).toBeUndefined();
    });

    it('returns undefined for an empty path', () => {
      const root = buildTree();
      expect(root.getFileByPath('')).toBeUndefined();
      expect(root.getFileByPath('/')).toBeUndefined();
    });
  });

  describe('getSubDir', () => {
    it('resolves nested directories by segments', () => {
      const root = buildTree();
      const d = root.getSubDir(['calendar', '2026', '01']);
      expect(d?.getPath()).toBe('data/calendar/2026/01');
    });

    it('skips the leading root-name segment', () => {
      const root = buildTree();
      const d = root.getSubDir(['data', 'calendar']);
      expect(d?.getName()).toBe('calendar');
    });

    it('returns the root for an empty segment list', () => {
      const root = buildTree();
      expect(root.getSubDir([])).toBe(root);
    });

    it('returns undefined for a missing segment', () => {
      const root = buildTree();
      expect(root.getSubDir(['calendar', 'nope'])).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('empties dirs and files', () => {
      const root = buildTree();
      expect(root.getDirs().length).toBeGreaterThan(0);
      root.clear();
      expect(root.getDirs()).toEqual([]);
      expect(root.getFiles()).toEqual([]);
    });
  });

  describe('getComponentByType', () => {
    it('returns undefined when no components are registered', () => {
      const root = new DirData('x', 'x');
      expect(root.getComponentByType('anything')).toBeUndefined();
    });
  });
});
