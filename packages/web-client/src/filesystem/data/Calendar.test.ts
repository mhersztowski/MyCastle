import { CalendarItem } from './Calendar';
import { DirData } from './DirData';
import { FileData } from './FileData';

function fileWithContent(path: string, content: string): FileData {
  const f = new FileData(path.split('/').pop()!, path, new DirData('root', 'root'));
  f.setData(new TextEncoder().encode(content));
  return f;
}

describe('CalendarItem.fromFileData', () => {
  it('parses date from a calendar/YYYY/MM/DD.json path', () => {
    const f = fileWithContent(
      'data/calendar/2026/03/09.json',
      JSON.stringify({ type: 'events', tasks: [] }),
    );
    const item = CalendarItem.fromFileData(f);
    expect(item).not.toBeNull();
    const d = item!.getDate();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March → 0-based month index 2
    expect(d.getDate()).toBe(9);
    expect(item!.getFileData()).toBe(f);
  });

  it('extracts events from a well-formed events payload', () => {
    const events = [{ id: 'e1', name: 'meeting' }];
    const f = fileWithContent(
      'x/calendar/2026/03/09.json',
      JSON.stringify({ type: 'events', tasks: events }),
    );
    const item = CalendarItem.fromFileData(f);
    expect(item!.getEvents()).toEqual(events);
  });

  it('returns null when the path is not a calendar day file', () => {
    const f = fileWithContent('data/persons.json', '{}');
    expect(CalendarItem.fromFileData(f)).toBeNull();
  });

  it('yields an item with no events when JSON is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = fileWithContent('calendar/2026/03/09.json', 'not json');
    const item = CalendarItem.fromFileData(f);
    expect(item).not.toBeNull();
    expect(item!.getEvents()).toEqual([]);
    warn.mockRestore();
  });

  it('yields an item with no events when type is not "events"', () => {
    const f = fileWithContent(
      'calendar/2026/03/09.json',
      JSON.stringify({ type: 'other', tasks: [{ id: 'e1' }] }),
    );
    const item = CalendarItem.fromFileData(f);
    expect(item!.getEvents()).toEqual([]);
  });

  describe('setFileData', () => {
    it('replaces the associated file data', () => {
      const f1 = fileWithContent('calendar/2026/03/09.json', '{"type":"events","tasks":[]}');
      const item = CalendarItem.fromFileData(f1)!;
      const f2 = fileWithContent('calendar/2026/03/10.json', '{"type":"events","tasks":[]}');
      item.setFileData(f2);
      expect(item.getFileData()).toBe(f2);
    });
  });
});
