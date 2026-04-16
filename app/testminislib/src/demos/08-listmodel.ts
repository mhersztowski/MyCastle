import { MListModel, MObject } from '@mhersztowski/minislib';
import { section, sub, ok, log, cyan } from '../print.js';

interface Task { id: number; title: string; done: boolean; }

export function demoListModel(): void {
  section('📋', 'MLISTMODEL — observable collection');

  sub('append / prepend / insert');
  {
    const list = new MListModel<string>();
    const events: string[] = [];
    list.rowsInserted.connect((idx, count) => events.push(`+${count}@${idx}`));

    list.append('c', 'd');
    list.prepend('a', 'b');
    list.insert(2, 'X');

    log('items', list.toArray());
    log('events', events);
    ok('append / prepend / insert all fire rowsInserted');
    list.destroy();
  }

  sub('remove / removeItem');
  {
    const list = new MListModel(['a', 'b', 'c', 'd']);
    const removed: string[] = [];
    list.rowsRemoved.connect((idx, count) => removed.push(`-${count}@${idx}`));

    list.remove(1, 2); // remove 'b','c'
    ok(`After remove(1,2): ${cyan(list.toArray().join(','))}`);

    list.removeItem('a');
    ok(`After removeItem('a'): ${cyan(list.toArray().join(','))}`);

    log('remove events', removed);
    list.destroy();
  }

  sub('set — update in place');
  {
    const list = new MListModel([1, 2, 3]);
    const changes: number[] = [];
    list.dataChanged.connect((_idx, val) => changes.push(val));

    list.set(1, 99);
    log('list after set(1, 99)', list.toArray());
    log('dataChanged values', changes);
    list.destroy();
  }

  sub('move');
  {
    const list = new MListModel(['A','B','C','D','E']);
    list.move(0, 4); // move A to end
    ok(`After move(0→4): ${cyan(list.toArray().join(','))}`);
    list.destroy();
  }

  sub('sort');
  {
    const list = new MListModel([3, 1, 4, 1, 5, 9, 2, 6]);
    list.sort((a, b) => a - b);
    ok(`Sorted: ${cyan(list.toArray().join(', '))}`);
    list.destroy();
  }

  sub('reset — atomic bulk replace');
  {
    const list = new MListModel([1, 2, 3]);
    let resetCount = 0;
    list.modelReset.connect(() => resetCount++);

    list.reset([10, 20, 30, 40]);
    log('after reset', list.toArray());
    log('modelReset events', resetCount);
    list.destroy();
  }

  sub('filter / find / contains / indexOf');
  {
    const list = new MListModel([1, 2, 3, 4, 5, 6, 7, 8]);
    const evens   = list.filter(n => n % 2 === 0);
    const firstBig = list.find(n => n > 5);
    log('filter evens', evens);
    log('find first >5', firstBig);
    log('contains 3', list.contains(3));
    log('indexOf 5', list.indexOf(5));
    list.destroy();
  }

  sub('forEach / map');
  {
    const tasks = new MListModel<Task>([
      { id: 1, title: 'Design API', done: true  },
      { id: 2, title: 'Write tests', done: false },
      { id: 3, title: 'Deploy',     done: false },
    ]);

    const titles = tasks.map(t => `[${t.done ? '✓' : ' '}] ${t.title}`);
    for (const t of titles) ok(t);
    log('count', tasks.count);
    log('isEmpty', tasks.isEmpty);
    tasks.destroy();
  }

  sub('Lifetime: auto-disconnect on context destroy');
  {
    const list = new MListModel<number>([1, 2, 3]);
    const ctx  = new MObject();
    const received: number[] = [];

    list.rowsInserted.connect((idx) => received.push(idx), ctx);

    list.append(4); // received
    ctx.destroy();
    list.append(5); // ignored

    log('insertions received', received.length);
    ok('Subscription cleaned up when context destroyed');
    list.destroy();
  }

  sub('iterator protocol (for...of)');
  {
    const list = new MListModel([10, 20, 30]);
    let sum = 0;
    for (const n of list) sum += n;
    log('sum via for...of', sum);
    ok('MListModel is iterable');
    list.destroy();
  }
}
