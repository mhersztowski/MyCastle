/**
 * testminislib — interactive demo for @mhersztowski/minislib
 *
 * Run: pnpm dev  (from app/testminislib/)
 *      or: pnpm --filter testminislib dev
 */

import { c, bold, gray, green } from './print.js';

import { demoSignals      } from './demos/01-signals.js';
import { demoObjectTree   } from './demos/02-object-tree.js';
import { demoProperties   } from './demos/03-properties.js';
import { demoTimers       } from './demos/04-timers.js';
import { demoEventBus     } from './demos/05-eventbus.js';
import { demoStateMachine } from './demos/06-statemachine.js';
import { demoCommandStack } from './demos/07-commands.js';
import { demoListModel    } from './demos/08-listmodel.js';
import { demoLoggerAndUtils } from './demos/09-logger-utils.js';
import { demoSmartHome    } from './demos/10-smart-home.js';

const DEMOS: Array<{ label: string; fn: () => void | Promise<void> }> = [
  { label: 'Signals & Slots',           fn: demoSignals       },
  { label: 'Object Tree',               fn: demoObjectTree    },
  { label: 'Observable Properties',     fn: demoProperties    },
  { label: 'Timers',                    fn: demoTimers        },
  { label: 'Event Bus',                 fn: demoEventBus      },
  { label: 'State Machine',             fn: demoStateMachine  },
  { label: 'Command Stack (undo/redo)', fn: demoCommandStack  },
  { label: 'List Model',                fn: demoListModel     },
  { label: 'Logger + Utilities',        fn: demoLoggerAndUtils },
  { label: 'SHOWCASE: Smart Home',      fn: demoSmartHome     },
];

async function main(): Promise<void> {
  // ── Banner ────────────────────────────────────────────────────────────────
  const line = '═'.repeat(62);
  console.log(`\n${c.bCyan}${line}${c.reset}`);
  console.log(`  ${bold('minislib')} ${gray('— Qt-inspired object system for TypeScript/Node.js')}`);
  console.log(`  ${gray('Signals · Slots · Object Tree · Properties · Timers')}`);
  console.log(`  ${gray('EventBus · StateMachine · CommandStack · ListModel · Logger')}`);
  console.log(`${c.bCyan}${line}${c.reset}\n`);

  // ── Run demos ─────────────────────────────────────────────────────────────
  let passed = 0;
  let failed = 0;

  for (const { label, fn } of DEMOS) {
    try {
      await fn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`\n${c.bRed}✖ Demo "${label}" threw:${c.reset}`, err);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = `═`.repeat(62);
  console.log(`\n${c.bCyan}${summary}${c.reset}`);
  console.log(
    `  ${bold('Results:')}  ` +
    `${green(String(passed) + ' passed')}` +
    (failed > 0 ? `  ${c.bRed}${failed} failed${c.reset}` : ''),
  );
  console.log(`${c.bCyan}${summary}${c.reset}\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
