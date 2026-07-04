import { DirData } from './DirData';
import { FileData } from './FileData';

function makeFile(name: string, path: string): FileData {
  const dir = new DirData('parent', 'parent');
  return new FileData(name, path, dir);
}

describe('FileData', () => {
  describe('getters', () => {
    it('exposes name, path and parent dir', () => {
      const dir = new DirData('data', 'data');
      const f = new FileData('notes.md', 'data/notes.md', dir);
      expect(f.getName()).toBe('notes.md');
      expect(f.getPath()).toBe('data/notes.md');
      expect(f.getDir()).toBe(dir);
    });
  });

  describe('getExt', () => {
    it('returns the extension without the dot', () => {
      expect(makeFile('notes.md', 'data/notes.md').getExt()).toBe('md');
      expect(makeFile('a.tar.gz', 'x/a.tar.gz').getExt()).toBe('gz');
    });

    it('returns empty string when there is no extension', () => {
      expect(makeFile('README', 'dir/README').getExt()).toBe('');
    });

    it('returns empty string for a dotfile at position 0', () => {
      // lastIndexOf('.') === 0 → index > 0 is false → ''
      expect(makeFile('.env', '.env').getExt()).toBe('');
    });
  });

  describe('getDirPath', () => {
    it('returns the directory portion of the path', () => {
      expect(makeFile('notes.md', 'data/sub/notes.md').getDirPath()).toBe('data/sub');
    });

    it('returns the whole path when there is no slash', () => {
      expect(makeFile('notes.md', 'notes.md').getDirPath()).toBe('notes.md');
    });
  });

  describe('data encoding round-trips', () => {
    it('setData / toString round-trips UTF-8 text', () => {
      const f = makeFile('a.txt', 'a.txt');
      const bytes = new TextEncoder().encode('héllo wörld');
      f.setData(bytes);
      expect(f.toString()).toBe('héllo wörld');
      expect(f.getData()).toBe(bytes);
    });

    it('starts with empty data', () => {
      const f = makeFile('a.txt', 'a.txt');
      expect(f.getData().length).toBe(0);
      expect(f.toString()).toBe('');
    });

    it('toBase64 / fromBase64 round-trips binary data', () => {
      const f = makeFile('a.bin', 'a.bin');
      f.setData(new Uint8Array([0, 1, 2, 250, 255]));
      const b64 = f.toBase64();

      const g = makeFile('b.bin', 'b.bin');
      g.fromBase64(b64);
      expect(Array.from(g.getData())).toEqual([0, 1, 2, 250, 255]);
    });
  });

  describe('components', () => {
    it('addComponent / getComponentByType', () => {
      const f = makeFile('a.txt', 'a.txt');
      expect(f.getComponents()).toEqual([]);
      const fake = { getType: () => 'my-type' } as any;
      f.addComponent(fake);
      expect(f.getComponents()).toHaveLength(1);
      expect(f.getComponentByType('my-type')).toBe(fake);
      expect(f.getComponentByType('other')).toBeUndefined();
    });
  });
});
