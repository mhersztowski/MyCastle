import { MLogger, MObject, debounce, throttle, promiseToSignals, connectOnce } from '@mhersztowski/minislib';
import { section, sub, ok, log, cyan, red, sleep } from '../print.js';

export async function demoLoggerAndUtils(): Promise<void> {
  section('🔧', 'MLOGGER + UTILITIES');

  // ── MLogger ──────────────────────────────────────────────────────────────
  sub('MLogger — categorized logging');
  {
    // Silence the default console sink so we can capture manually
    MLogger.silenceConsole();

    const records: string[] = [];
    MLogger.root().logged.connect((r) => {
      records.push(`[${r.level.toUpperCase()}][${r.category}] ${r.message}`);
    });

    const iotLog  = new MLogger('iot.sensor');
    const uiLog   = new MLogger('ui.editor');
    const authLog = new MLogger('auth', undefined, { minLevel: 'warn' });

    iotLog.info('Temperature read: 22.4°C', { raw: 0x1234 });
    iotLog.warn('Sensor drift detected');
    uiLog.debug('Cursor moved');
    uiLog.error('Monaco crash', { stack: '...' });
    authLog.debug('This should be suppressed (minLevel=warn)');
    authLog.warn('Token expiring soon');

    for (const r of records) ok(r);
    log('records captured (auth.debug suppressed)', records.length);
    MLogger.resetRoot();
    ok('Logger reset');
  }

  // ── debounce ─────────────────────────────────────────────────────────────
  sub('debounce — coalesces rapid calls');
  {
    let callCount  = 0;
    let firedCount = 0;
    const save = debounce(() => { firedCount++; }, 100);

    // Rapid-fire 5 calls — only last should run
    for (let i = 0; i < 5; i++) {
      save();
      callCount++;
    }
    await sleep(200);

    log('calls made',   callCount);
    log('times fired',  firedCount);
    ok('5 rapid calls debounced to 1 execution');
  }

  sub('debounce — auto-cancel on context destroy');
  {
    const ctx  = new MObject();
    let fired  = false;
    const fn   = debounce(() => { fired = true; }, 100, ctx);

    fn();
    ctx.destroy(); // cancel pending debounce
    await sleep(200);

    log('fired after ctx.destroy()', fired);
    ok('Pending debounce cancelled when context destroyed');
  }

  // ── throttle ─────────────────────────────────────────────────────────────
  sub('throttle — leading-edge rate limiting');
  {
    const fired: number[] = [];
    const throttled = throttle((n: number) => fired.push(n), 100);

    throttled(1); // fires immediately
    throttled(2); // throttled (< 100 ms)
    throttled(3); // throttled
    await sleep(150);
    throttled(4); // fires (>100 ms elapsed)

    log('calls that got through', fired);
    ok(`Only ${fired.length} of 4 calls passed the throttle`);
  }

  // ── promiseToSignals ──────────────────────────────────────────────────────
  sub('promiseToSignals — async bridge');
  {
    // Resolved case
    {
      const { resolved } = promiseToSignals<string>(
        Promise.resolve('data loaded'),
      );
      const results: string[] = [];
      resolved.connect((v) => results.push(v));
      await sleep(10);
      ok(`Resolved: ${cyan(results[0] ?? 'nothing')}`);
    }

    // Rejected case
    {
      const { rejected } = promiseToSignals<string>(
        Promise.reject(new Error('network error')),
      );
      const errors: string[] = [];
      rejected.connect((e) => errors.push(String((e as Error).message)));
      await sleep(10);
      ok(`Rejected: ${red(errors[0] ?? 'nothing')}`);
    }

    // Auto-cancel when context destroyed
    {
      const ctx = new MObject();
      let resolved = false;
      const { resolved: sig } = promiseToSignals(
        new Promise<void>((r) => setTimeout(r, 50)),
        ctx,
      );
      sig.connect(() => { resolved = true; });
      ctx.destroy(); // destroy before promise resolves
      await sleep(100);
      log('resolved after ctx.destroy()', resolved);
      ok('Signal suppressed because context was destroyed');
    }
  }

  // ── connectOnce ──────────────────────────────────────────────────────────
  sub('connectOnce — fires exactly once then auto-disconnects');
  {
    const { Signal: S } = await import('@mhersztowski/minislib');
    const sig = new S<[n: number]>();
    const received: number[] = [];
    connectOnce(sig, (n) => received.push(n));

    sig.emit(1);
    sig.emit(2);
    sig.emit(3);

    log('received', received);
    log('connectionCount after first emit', sig.connectionCount);
    ok(`Got only first emission (${cyan(String(received[0]))}), then disconnected`);
  }
}
