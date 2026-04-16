import { MLogger } from '@mhersztowski/minislib';
import { HomeController } from '../smart-home/HomeController.js';
import {
  section, sub, ok, log, transition,
  cyan, green, yellow, red, magenta, gray,
  sleep,
} from '../print.js';

export async function demoSmartHome(): Promise<void> {
  section('🏠', 'SHOWCASE — Smart Home Controller');
  console.log(`  ${gray('All features combined: MObject tree · Signals · Properties')}`);
  console.log(`  ${gray('MTimer · MEventBus · MStateMachine · MCommandStack · MListModel · MLogger')}`);

  // ── Silence default logger, hook our own pretty-printer ────────────────
  MLogger.silenceConsole();
  MLogger.root().logged.connect((r) => {
    const icon = r.level === 'error' ? red('✖') : r.level === 'warn' ? yellow('⚠') : cyan('ℹ');
    console.log(`  ${icon} ${gray('[' + r.category + ']')} ${r.message}`);
  });

  const home = new HomeController();

  // Track light changes from event bus
  home.bus.subscribeAll((topic, payload) => {
    if (topic === 'light:changed') {
      const { room, brightness, on } = payload as { room: string; brightness: number; on: boolean };
      const bar = '█'.repeat(Math.round(brightness / 10));
      console.log(
        `  ${magenta('💡')} ${cyan(room).padEnd(18)} ` +
        `${on ? green(bar.padEnd(10, '░')) : gray('░'.repeat(10))} ` +
        `${yellow(String(brightness) + '%')}`,
      );
    }
  }, home);

  // ── Initial state ────────────────────────────────────────────────────────
  sub('Initial state');
  log('mode', home.mode);
  log('rooms', home.children.filter(c => c.objectName !== 'HomeController')
    .map(c => c.objectName).join(', '));

  // ── Set living room lights ───────────────────────────────────────────────
  sub('Turning on lights manually');
  home.living.light.setBrightness(80);
  home.kitchen.light.setBrightness(60);
  home.bedroom.light.setBrightness(40);
  await sleep(50);

  // ── Let sensors run ──────────────────────────────────────────────────────
  sub('Sensor readings (1 s)');
  const readings: Map<string, number> = new Map();
  home.bus.subscribe('sensor:reading', (d) => {
    const { room, type, value } = d as { room: string; type: string; value: number };
    readings.set(`${room}:${type}`, value);
  }, home);
  await sleep(600);

  for (const [k, v] of readings.entries()) {
    const [, type] = k.split(':');
    const unit = type === 'temp' ? '°C' : '%';
    console.log(`  ${cyan(k.padEnd(20))} ${yellow(v.toFixed(1) + unit)}`);
  }
  ok(`Received ${readings.size} sensor readings`);

  // ── Undo/redo lights ─────────────────────────────────────────────────────
  sub('Light undo/redo (MCommandStack)');
  home.living.light.setBrightness(30);
  await sleep(20);
  log('living brightness after set(30)', home.living.light.brightness.value);
  log('undoDesc', home.living.light.undoDescription);

  home.living.light.undo();
  await sleep(20);
  log('living brightness after undo', home.living.light.brightness.value);

  home.living.light.redo();
  await sleep(20);
  log('living brightness after redo', home.living.light.brightness.value);
  ok('Light state correctly travels through undo/redo');

  // ── Mode transitions ─────────────────────────────────────────────────────
  sub('Mode transitions (MStateMachine)');

  transition('home', 'away', 'leave');
  home.fsm.send('leave');
  await sleep(80);
  log('mode', home.mode);
  log('living brightness (lights off?)', home.living.light.brightness.value);

  await sleep(100);

  transition('away', 'home', 'arrive');
  home.fsm.send('arrive');
  await sleep(50);
  log('mode', home.mode);

  transition('home', 'night', 'sleep');
  home.fsm.send('sleep');
  await sleep(50);
  log('mode', home.mode);
  log('living brightness (dim?)', home.living.light.brightness.value);

  transition('night', 'home', 'wake');
  home.fsm.send('wake');
  await sleep(50);

  // ── Alarm ────────────────────────────────────────────────────────────────
  sub('Alarm scenario');
  transition('home', 'alarm', 'intrusion');
  home.fsm.send('intrusion');
  await sleep(80);
  log('mode', home.mode);
  log('all lights at 100?', [home.living, home.kitchen, home.bedroom]
    .every(r => r.light.brightness.value === 100));

  home.fsm.send('reset');
  log('mode after reset', home.mode);

  // ── Alert log ────────────────────────────────────────────────────────────
  sub('Alert log (MListModel)');
  log('alerts collected', home.alerts.count);
  const alertsByLevel: Record<string, number> = {};
  for (const a of home.alerts) {
    alertsByLevel[a.severity] = (alertsByLevel[a.severity] ?? 0) + 1;
  }
  log('by severity', alertsByLevel);

  // ── Object tree ──────────────────────────────────────────────────────────
  sub('Object tree structure');
  function printTree(obj: import('@mhersztowski/minislib').MObject, indent = 0): void {
    const prefix = indent === 0 ? '' : '  '.repeat(indent - 1) + '├─ ';
    console.log(`  ${gray('│')} ${prefix}${cyan(obj.objectName || '(anonymous)')}`);
    for (const child of obj.children) printTree(child, indent + 1);
  }
  printTree(home);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  sub('Destroy cascade');
  const childCount = home.children.length;
  home.destroy();
  log('home.isDestroyed', home.isDestroyed);
  ok(`Cascade destroyed all ${childCount} children and their subtrees`);

  MLogger.resetRoot();
}
