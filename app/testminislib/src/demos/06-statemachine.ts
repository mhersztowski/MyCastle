import { MStateMachine } from '@mhersztowski/minislib';
import { section, sub, ok, log, transition, cyan, red, yellow, green } from '../print.js';

export function demoStateMachine(): void {
  section('🔄', 'MSTATEMACHINE — finite state machine');

  sub('Simple on/off toggle');
  {
    const fsm = new MStateMachine();
    fsm.addState('off');
    fsm.addState('on');
    fsm.addTransition({ from: 'off', to: 'on',  event: 'toggle' });
    fsm.addTransition({ from: 'on',  to: 'off', event: 'toggle' });
    fsm.start('off');

    log('initial state', fsm.currentStateId);
    fsm.send('toggle'); log('after toggle', fsm.currentStateId);
    fsm.send('toggle'); log('after toggle', fsm.currentStateId);
    ok('Simple toggle works');
    fsm.destroy();
  }

  sub('Guard conditions');
  {
    const fsm = new MStateMachine();
    fsm.addState('locked');
    fsm.addState('unlocked');
    fsm.addState('alarm');

    fsm.addTransition<string>({
      from: 'locked', to: 'unlocked', event: 'enter-pin',
      guard: (pin) => pin === '1234',
    });
    fsm.addTransition<string>({
      from: 'locked', to: 'alarm', event: 'enter-pin',
      guard: (pin) => pin !== '1234',
    });
    fsm.addTransition({ from: 'unlocked', to: 'locked', event: 'lock' });
    fsm.addTransition({ from: 'alarm',    to: 'locked', event: 'reset' });

    fsm.start('locked');

    fsm.send('enter-pin', 'wrong');
    transition('locked', fsm.currentStateId!, 'enter-pin(wrong)');

    fsm.send('reset');
    transition(fsm.currentStateId!, 'locked', 'reset');

    fsm.send('enter-pin', '1234');
    transition('locked', fsm.currentStateId!, 'enter-pin(1234)');

    ok(`Final state: ${cyan(fsm.currentStateId!)}`);
    fsm.destroy();
  }

  sub('state.entered / state.exited signals');
  {
    const fsm  = new MStateMachine();
    const idle = fsm.addState('idle');
    const run  = fsm.addState('running');
    const done = fsm.addState('done');
    const log_: string[] = [];

    idle.entered.connect(() => log_.push('idle:entered'));
    idle.exited.connect((to) => log_.push(`idle:exited→${to.id}`));
    run.entered.connect(() => log_.push('run:entered'));
    run.exited.connect((to) => log_.push(`run:exited→${to.id}`));
    done.entered.connect(() => log_.push('done:entered'));

    fsm.addTransition({ from: 'idle',    to: 'running', event: 'start' });
    fsm.addTransition({ from: 'running', to: 'done',    event: 'finish' });
    fsm.start('idle');

    fsm.send('start');
    fsm.send('finish');

    for (const entry of log_) {
      ok(cyan(entry));
    }
    fsm.destroy();
  }

  sub('Action on transition');
  {
    let actionFired = false;
    const fsm = new MStateMachine();
    fsm.addState('inactive');
    fsm.addState('active');
    fsm.addTransition<{ userId: string }>({
      from: 'inactive', to: 'active', event: 'activate',
      action: (payload) => {
        actionFired = true;
        ok(`Action ran with userId: ${cyan(payload.userId)}`);
      },
    });
    fsm.start('inactive');
    fsm.send('activate', { userId: 'alice' });
    log('actionFired?', actionFired);
    fsm.destroy();
  }

  sub('stateChanged signal + transitionFailed signal');
  {
    const fsm = new MStateMachine();
    fsm.addState('a');
    fsm.addState('b');
    fsm.addTransition({ from: 'a', to: 'b', event: 'go' });
    fsm.start('a');

    const changes: string[] = [];
    const failures: string[] = [];
    fsm.stateChanged.connect((next, prev) => changes.push(`${prev?.id}→${next.id}`));
    fsm.transitionFailed.connect((evt, from) => failures.push(`${evt}@${from}`));

    fsm.send('go');         // ok
    fsm.send('go');         // no transition from 'b' — fails
    fsm.send('nonexistent'); // fails

    log('changes', changes);
    log('failures', failures);
    fsm.destroy();
  }

  sub('IoT device connection FSM');
  {
    const fsm = new MStateMachine();
    ['disconnected','connecting','connected','reconnecting','error'].forEach(s => fsm.addState(s));
    fsm.addTransition({ from: 'disconnected',  to: 'connecting',   event: 'connect' });
    fsm.addTransition({ from: 'connecting',    to: 'connected',    event: 'ack' });
    fsm.addTransition({ from: 'connecting',    to: 'error',        event: 'timeout' });
    fsm.addTransition({ from: 'connected',     to: 'reconnecting', event: 'drop' });
    fsm.addTransition({ from: 'reconnecting',  to: 'connected',    event: 'ack' });
    fsm.addTransition({ from: 'reconnecting',  to: 'error',        event: 'timeout' });
    fsm.addTransition({ from: 'error',         to: 'disconnected', event: 'reset' });
    fsm.addTransition({ from: 'connected',     to: 'disconnected', event: 'disconnect' });
    fsm.start('disconnected');

    const path: string[] = [fsm.currentStateId!];
    fsm.stateChanged.connect((s) => path.push(s.id));

    fsm.send('connect');
    fsm.send('ack');
    fsm.send('drop');
    fsm.send('ack');
    fsm.send('disconnect');

    ok(`Connection path: ${path.map(s =>
      s === 'connected' ? green(s) :
      s === 'error'     ? red(s) :
      s === 'disconnected' ? yellow(s) : cyan(s)
    ).join(' → ')}`);
    fsm.destroy();
  }
}
