import {
  MObject, MEventBus, MStateMachine, MListModel, MLogger,
  debounce,
} from '@mhersztowski/minislib';
import { Room } from './Room.js';

export interface Alert { at: number; severity: 'info' | 'warn' | 'error'; message: string; }

export class HomeController extends MObject {
  readonly bus  = new MEventBus(this);
  readonly fsm  = new MStateMachine(this);
  readonly alerts = new MListModel<Alert>([], this);
  readonly log  = new MLogger('home', this);

  readonly living: Room;
  readonly kitchen: Room;
  readonly bedroom: Room;

  constructor() {
    super(undefined, 'HomeController');

    // ── Rooms ──────────────────────────────────────────────────────────────
    this.living  = new Room('living',  this.bus, this);
    this.kitchen = new Room('kitchen', this.bus, this);
    this.bedroom = new Room('bedroom', this.bus, this);

    // ── State machine: home modes ──────────────────────────────────────────
    ['home', 'away', 'night', 'alarm'].forEach(s => this.fsm.addState(s));
    this.fsm.addTransition({ from: 'home',  to: 'away',  event: 'leave'  });
    this.fsm.addTransition({ from: 'away',  to: 'home',  event: 'arrive' });
    this.fsm.addTransition({ from: 'home',  to: 'night', event: 'sleep'  });
    this.fsm.addTransition({ from: 'night', to: 'home',  event: 'wake'   });
    ['home', 'away', 'night'].forEach(s =>
      this.fsm.addTransition({ from: s as 'home', to: 'alarm', event: 'intrusion' }),
    );
    this.fsm.addTransition({ from: 'alarm', to: 'home',  event: 'reset'  });
    this.fsm.start('home');

    // ── Temperature alert (debounced so rapid samples don't flood) ─────────
    const checkTemp = debounce((data: unknown) => {
      const { room, type, value } = data as { room: string; type: string; value: number };
      if (type !== 'temp') return;
      if (value > 26) this.#addAlert('warn', `${room}: high temp ${value}°C`);
      if (value < 18) this.#addAlert('warn', `${room}: low temp ${value}°C`);
    }, 50, this);

    this.bus.subscribe('sensor:reading', checkTemp, this);

    // ── Mode side-effects ──────────────────────────────────────────────────
    this.fsm.stateChanged.connect((next) => {
      switch (next.id) {
        case 'away':
          [this.living, this.kitchen, this.bedroom].forEach(r => r.light.setBrightness(0));
          this.#addAlert('info', 'Away mode: all lights off');
          break;
        case 'night':
          this.living.light.setBrightness(10);
          this.kitchen.light.setBrightness(0);
          this.#addAlert('info', 'Night mode: dim lights');
          break;
        case 'alarm':
          [this.living, this.kitchen, this.bedroom].forEach(r => r.light.setBrightness(100));
          this.#addAlert('error', '🚨 ALARM TRIGGERED — all lights on');
          break;
      }
    }, this);
  }

  get mode(): string { return this.fsm.currentStateId ?? 'unknown'; }

  #addAlert(severity: Alert['severity'], message: string): void {
    this.alerts.append({ at: Date.now(), severity, message });
    this.log[severity](message);
  }
}
