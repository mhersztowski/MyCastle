import { MTimer, MObject } from '@mhersztowski/minislib';
import { section, sub, ok, log, signal, cyan, sleep } from '../print.js';

export async function demoTimers(): Promise<void> {
  section('⏱️', 'MTIMER — interval & single-shot');

  sub('Repeating timer — 3 ticks at 120 ms');
  {
    const root = new MObject();
    const timer = new MTimer(root);
    let ticks = 0;

    timer.timeout.connect(() => {
      ticks++;
      signal('timer', 'timeout', `tick #${ticks}`);
    });

    timer.start(120);
    await sleep(420);
    timer.stop();

    log('ticks fired', ticks);
    ok(`Timer fired ~3 times in 420 ms (actual: ${ticks})`);
    root.destroy();
  }

  sub('Single-shot timer');
  {
    const root = new MObject();
    const timer = new MTimer(root);
    let fired = false;

    timer.timeout.connect(() => {
      fired = true;
      signal('timer', 'timeout', 'single-shot!');
    });

    timer.startSingleShot(100);
    await sleep(250);

    log('fired?', fired);
    log('active after fire', timer.active);
    ok('Single-shot fires once then stops');
    root.destroy();
  }

  sub('MTimer.create() convenience factory');
  {
    const root = new MObject();
    let count = 0;
    const t = MTimer.create(80, root);
    t.timeout.connect(() => count++);
    await sleep(300);
    t.stop();
    ok(`Factory timer ticked ${cyan(String(count))} times`);
    root.destroy();
  }

  sub('MTimer.singleShot() convenience factory');
  {
    let ran = false;
    const root = new MObject();
    MTimer.singleShot(80, root).timeout.connect(() => { ran = true; });
    await sleep(150);
    log('ran?', ran);
    root.destroy();
  }

  sub('Auto-stop on parent destroy (lifecycle integration)');
  {
    const parent = new MObject();
    const timer  = new MTimer(parent);
    let count = 0;

    timer.timeout.connect(() => count++);
    timer.start(50);
    await sleep(130);

    parent.destroy(); // destroys timer, calls stop()
    const countAtDestroy = count;
    await sleep(150); // further time passes — timer should be dead

    log('ticks at destroy',  countAtDestroy);
    log('ticks after destroy', count);
    ok('No ticks after parent destroyed');
  }

  sub('restart()');
  {
    const t = new MTimer();
    let count = 0;
    t.timeout.connect(() => count++);
    t.start(100);
    await sleep(250); // ~2 ticks
    t.restart();      // reset interval
    await sleep(250); // ~2 more ticks
    t.stop();
    ok(`Total ticks with restart: ${cyan(String(count))} (~4 expected)`);
    t.destroy();
  }
}
