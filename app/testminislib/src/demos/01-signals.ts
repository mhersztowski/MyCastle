import { Signal } from '@mhersztowski/minislib';
import { section, sub, ok, signal, log, cyan } from '../print.js';

export function demoSignals(): void {
  section('⚡', 'SIGNALS & SLOTS');

  // ── Basic connect / emit ────────────────────────────────────────────────
  sub('Basic connect / emit');
  {
    const clicked = new Signal<[x: number, y: number]>();
    const history: string[] = [];

    const conn = clicked.connect((x, y) => {
      history.push(`(${x},${y})`);
      signal('button', 'clicked', x, y);
    });

    clicked.emit(10, 20);
    clicked.emit(30, 40);
    ok(`Received ${history.length} events: ${cyan(history.join(', '))}`);
    log('connectionCount', clicked.connectionCount);

    conn.disconnect();
    clicked.emit(99, 99); // silenced
    ok(`After disconnect — connectionCount: ${cyan(String(clicked.connectionCount))}`);
  }

  // ── Multiple slots, isolation ────────────────────────────────────────────
  sub('Multiple slots + error isolation');
  {
    const dataReady = new Signal<[payload: string]>();
    const received: string[] = [];

    dataReady.connect(() => { throw new Error('bad slot'); });   // should not stop others
    dataReady.connect((p) => received.push('A:' + p));
    dataReady.connect((p) => received.push('B:' + p));

    dataReady.emit('hello');
    ok(`Despite a throwing slot, other slots ran: ${cyan(received.join(', '))}`);
  }

  // ── blockSignals ────────────────────────────────────────────────────────
  sub('blockSignals');
  {
    const sig = new Signal<[n: number]>();
    const values: number[] = [];
    sig.connect((n) => values.push(n));

    sig.emit(1);
    sig.blockSignals(true);
    sig.emit(2);
    sig.emit(3);
    sig.blockSignals(false);
    sig.emit(4);

    ok(`Received while blocked=false: ${cyan(values.join(', '))}  (2,3 suppressed)`);
    log('blocked', sig.blocked);
  }

  // ── Generic signal types ────────────────────────────────────────────────
  sub('Type-safe generic signals');
  {
    const userLoggedIn = new Signal<[userId: string, role: 'admin' | 'user']>();
    let lastUser = '';
    userLoggedIn.connect((id, role) => {
      lastUser = `${id}/${role}`;
      signal('auth', 'userLoggedIn', id, role);
    });
    userLoggedIn.emit('alice', 'admin');
    ok(`Last login: ${cyan(lastUser)}`);
  }

  // ── disconnectAll ────────────────────────────────────────────────────────
  sub('disconnectAll');
  {
    const sig = new Signal();
    const fn = () => {};
    sig.connect(fn); sig.connect(fn); sig.connect(fn);
    log('before disconnectAll', sig.connectionCount);
    sig.disconnectAll();
    log('after  disconnectAll', sig.connectionCount);
    ok('All slots removed at once');
  }
}
