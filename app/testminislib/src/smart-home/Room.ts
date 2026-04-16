import { MObject, MEventBus } from '@mhersztowski/minislib';
import { Sensor } from './devices/Sensor.js';
import { Light  } from './devices/Light.js';

const rnd = (min: number, max: number, base: number) =>
  base + (Math.random() - 0.5) * (max - min);

export class Room extends MObject {
  readonly temp:  Sensor;
  readonly humid: Sensor;
  readonly light: Light;

  constructor(
    name: string,
    bus: MEventBus,
    parent?: MObject,
  ) {
    super(parent, name);

    this.temp  = new Sensor(name + ':temp',  '°C', () => rnd(18, 28, 22), 300, this);
    this.humid = new Sensor(name + ':humid', '%',  () => rnd(40, 80, 55), 400, this);
    this.light = new Light(name + ':light', this);

    // Forward sensor readings to the event bus
    this.temp.reading.connect((r) =>
      bus.publish('sensor:reading', { room: name, type: 'temp',  ...r }),
    );
    this.humid.reading.connect((r) =>
      bus.publish('sensor:reading', { room: name, type: 'humid', ...r }),
    );
    this.light.changed.connect((brightness, on) =>
      bus.publish('light:changed', { room: name, brightness, on }),
    );
  }
}
