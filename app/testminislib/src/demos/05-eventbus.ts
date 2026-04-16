import { MEventBus, MObject } from '@mhersztowski/minislib';
import { section, sub, ok, log, signal, cyan } from '../print.js';

interface SensorReading { deviceId: string; value: number; unit: string; }
interface AlertEvent   { severity: 'info' | 'warn' | 'error'; message: string; }

export function demoEventBus(): void {
  section('📡', 'MEVENTBUS — decoupled pub/sub');

  sub('Basic publish / subscribe');
  {
    const bus = new MEventBus();
    const readings: SensorReading[] = [];

    bus.subscribe<SensorReading>('sensor:reading', (r) => {
      readings.push(r);
      signal('bus', 'sensor:reading', r.deviceId, `${r.value}${r.unit}`);
    });

    bus.publish<SensorReading>('sensor:reading', { deviceId: 'thermo-01', value: 22.5, unit: '°C' });
    bus.publish<SensorReading>('sensor:reading', { deviceId: 'humid-01',  value: 65,   unit: '%'  });

    log('readings received', readings.length);
    ok('Two readings received from different devices');
    bus.destroy();
  }

  sub('Multiple subscribers for same topic');
  {
    const bus = new MEventBus();
    const logA: string[] = [];
    const logB: string[] = [];

    bus.subscribe<AlertEvent>('alert', (a) => logA.push(`A:${a.severity}`));
    bus.subscribe<AlertEvent>('alert', (a) => logB.push(`B:${a.severity}`));

    bus.publish<AlertEvent>('alert', { severity: 'warn',  message: 'Battery low' });
    bus.publish<AlertEvent>('alert', { severity: 'error', message: 'Sensor offline' });

    ok(`Subscriber A: ${cyan(logA.join(', '))}`);
    ok(`Subscriber B: ${cyan(logB.join(', '))}`);
    bus.destroy();
  }

  sub('subscribeAll — wildcard listener (logger / middleware)');
  {
    const bus = new MEventBus();
    const allEvents: string[] = [];

    bus.subscribeAll((topic, _payload) => {
      allEvents.push(topic);
      signal('bus', 'subscribeAll', topic);
    });

    bus.publish('sensor:reading', {});
    bus.publish('device:online',  {});
    bus.publish('command:sent',   {});

    ok(`Wildcard captured ${cyan(String(allEvents.length))} topics: ${cyan(allEvents.join(', '))}`);
    bus.destroy();
  }

  sub('Auto-unsubscribe via context (MObject lifetime)');
  {
    const bus = new MEventBus();
    const ctx  = new MObject();
    const received: number[] = [];

    bus.subscribe<number>('tick', (n) => received.push(n), ctx);

    bus.publish('tick', 1);
    bus.publish('tick', 2);
    ctx.destroy(); // auto-unsubscribes
    bus.publish('tick', 3); // not received

    ok(`Received before destroy: ${cyan(received.join(', '))}  (3 ignored)`);
    bus.destroy();
  }

  sub('Global singleton bus — cross-module communication');
  {
    const received: string[] = [];

    // "Module A" subscribes
    MEventBus.global().subscribe<string>('app:route', (r) => {
      received.push(r);
      signal('global', 'app:route', r);
    });

    // "Module B" publishes without knowing about Module A
    MEventBus.global().publish('app:route', '/dashboard');
    MEventBus.global().publish('app:route', '/settings');

    ok(`Global bus delivered: ${cyan(received.join(', '))}`);

    // cleanup for tests
    MEventBus.resetGlobal();
    ok('Global bus reset');
  }

  sub('clearTopic / activeTopics');
  {
    const bus = new MEventBus();
    bus.subscribe('iot:telemetry', () => {});
    bus.subscribe('iot:alerts',   () => {});
    bus.subscribe('ui:click',     () => {});

    log('activeTopics before clear', bus.activeTopics);
    bus.clearTopic('ui:click');
    log('activeTopics after clear',  bus.activeTopics);
    bus.destroy();
  }
}
