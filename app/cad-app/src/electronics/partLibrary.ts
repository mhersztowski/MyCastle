import type { PartDef, PartCategory } from './types';

export type { PartDef };

// ── Helper: generate side pins for DIP/SIP components ──────────────────────

function leftRightPins(
  width: number, height: number, leftLabels: string[], rightLabels: string[],
): PartDef['pins'] {
  const pins: PartDef['pins'] = [];
  // Right-side pins sit on the body's last column — derived from width so a
  // wider package still places them on its actual right edge.
  const rightX = width - 1;
  for (let i = 0; i < height; i++) {
    if (leftLabels[i] !== undefined)
      pins.push({ id: `L${i}`, x: 0, y: i, label: leftLabels[i] });
    if (rightLabels[i] !== undefined)
      pins.push({ id: `R${i}`, x: rightX, y: i, label: rightLabels[i] });
  }
  return pins;
}

// ── Part definitions ────────────────────────────────────────────────────────

const breadboard830: PartDef = {
  id: 'breadboard-830',
  name: 'Breadboard 830',
  category: 'board',
  description: '830-point solderless breadboard with power rails',
  width: 65,
  height: 17,
  bodyColor: '#f5f0e8',
  bodyShape: 'breadboard',
  label: 'BB-830',
  // Pins: power rail endpoints + corner references
  // Individual hole snap is handled by the grid; we only mark special points here.
  pins: [
    { id: 'vcc-top-l',  x: 1,  y: 0,  label: '+' },
    { id: 'gnd-top-l',  x: 1,  y: 1,  label: '−' },
    { id: 'vcc-top-r',  x: 63, y: 0,  label: '+' },
    { id: 'gnd-top-r',  x: 63, y: 1,  label: '−' },
    { id: 'vcc-bot-l',  x: 1,  y: 15, label: '+' },
    { id: 'gnd-bot-l',  x: 1,  y: 16, label: '−' },
    { id: 'vcc-bot-r',  x: 63, y: 15, label: '+' },
    { id: 'gnd-bot-r',  x: 63, y: 16, label: '−' },
  ],
};

const arduinoNano: PartDef = {
  id: 'arduino-nano',
  name: 'Arduino Nano',
  category: 'microcontroller',
  description: 'ATmega328P-based Arduino Nano development board',
  width: 4,
  height: 16,
  bodyColor: '#0d47a1',
  bodyShape: 'dip',
  label: 'Arduino\nNano',
  pins: leftRightPins(4, 15,
    ['TX1','RX0','RST','GND','D2','D3','D4','D5','D6','D7','D8','D9','D10','D11','D12'],
    ['D13','3V3','REF','A0','A1','A2','A3','A4','A5','A6','A7','5V','RST','GND','VIN'],
  ),
};

const esp32DevKit: PartDef = {
  id: 'esp32-devkit',
  name: 'ESP32 DevKit V1',
  category: 'microcontroller',
  description: 'ESP32 dual-core Wi-Fi/BT development board, 38-pin',
  width: 4,
  height: 20,
  bodyColor: '#1a237e',
  bodyShape: 'dip',
  label: 'ESP32',
  pins: leftRightPins(4, 19,
    ['3V3','EN','VP','VN','D34','D35','D32','D33','D25','D26','D27','D14','D12','D13','GND','D15','D2','D4','RX2'],
    ['GND','D23','D22','TX0','RX0','D21','D19','D18','D5','D17','D16','D4','D0','D2','D15','D8','D7','D6','D5'],
  ),
};

const esp8266Wemos: PartDef = {
  id: 'wemos-d1-mini',
  name: 'Wemos D1 Mini',
  category: 'microcontroller',
  description: 'ESP8266-based Wi-Fi development board',
  width: 4,
  height: 10,
  bodyColor: '#1565c0',
  bodyShape: 'dip',
  label: 'D1 Mini',
  pins: leftRightPins(4, 8,
    ['RST','A0','D0','D5','D6','D7','D8','3V3'],
    ['TX','RX','D1','D2','D3','D4','GND','5V'],
  ),
};

const resistor: PartDef = {
  id: 'resistor',
  name: 'Resistor',
  category: 'passive',
  description: 'Generic through-hole resistor (axial)',
  width: 5,
  height: 1,
  bodyColor: '#c8a46e',
  bodyShape: 'resistor',
  label: 'R',
  pins: [
    { id: 'p1', x: 0, y: 0, label: 'P1' },
    { id: 'p2', x: 4, y: 0, label: 'P2' },
  ],
};

const ledRed: PartDef = {
  id: 'led-red',
  name: 'LED Red',
  category: 'active',
  description: 'Red 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#e53935',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#ff1744',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const ledGreen: PartDef = {
  id: 'led-green',
  name: 'LED Green',
  category: 'active',
  description: 'Green 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#43a047',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#00e676',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const ledBlue: PartDef = {
  id: 'led-blue',
  name: 'LED Blue',
  category: 'active',
  description: 'Blue 5mm through-hole LED',
  width: 3,
  height: 1,
  bodyColor: '#1e88e5',
  bodyShape: 'led',
  label: 'LED',
  indicatorColor: '#448aff',
  pins: [
    { id: 'cathode', x: 0, y: 0, label: '−' },
    { id: 'anode',   x: 2, y: 0, label: '+' },
  ],
};

const pushButton: PartDef = {
  id: 'push-button',
  name: 'Push Button',
  category: 'active',
  description: '6mm tactile push button, 4-pin',
  width: 3,
  height: 3,
  bodyColor: '#455a64',
  bodyShape: 'button',
  label: 'BTN',
  pins: [
    { id: 'a1', x: 0, y: 0, label: 'A1' },
    { id: 'a2', x: 2, y: 0, label: 'A2' },
    { id: 'b1', x: 0, y: 2, label: 'B1' },
    { id: 'b2', x: 2, y: 2, label: 'B2' },
  ],
};

const capacitorCeramic: PartDef = {
  id: 'capacitor-ceramic',
  name: 'Capacitor (Ceramic)',
  category: 'passive',
  description: 'Ceramic disc capacitor',
  width: 3,
  height: 1,
  bodyColor: '#f9a825',
  bodyShape: 'capacitor',
  label: 'C',
  pins: [
    { id: 'p1', x: 0, y: 0, label: '1' },
    { id: 'p2', x: 2, y: 0, label: '2' },
  ],
};

const npnTransistor: PartDef = {
  id: 'npn-transistor',
  name: 'NPN Transistor',
  category: 'active',
  description: 'Generic NPN BJT (TO-92), e.g. 2N2222, BC547',
  width: 3,
  height: 2,
  bodyColor: '#37474f',
  bodyShape: 'transistor',
  label: 'NPN',
  pins: [
    { id: 'emitter',   x: 0, y: 1, label: 'E' },
    { id: 'base',      x: 1, y: 1, label: 'B' },
    { id: 'collector', x: 2, y: 1, label: 'C' },
  ],
};

const dht22: PartDef = {
  id: 'dht22',
  name: 'DHT22 Sensor',
  category: 'sensor',
  description: 'DHT22 temperature & humidity sensor',
  width: 4,
  height: 5,
  bodyColor: '#37474f',
  bodyShape: 'ic',
  label: 'DHT22',
  pins: [
    { id: 'vcc',  x: 0, y: 1, label: 'VCC' },
    { id: 'data', x: 0, y: 2, label: 'DATA' },
    { id: 'nc',   x: 0, y: 3, label: 'NC' },
    { id: 'gnd',  x: 0, y: 4, label: 'GND' },
  ],
};

const potentiometer: PartDef = {
  id: 'potentiometer',
  name: 'Potentiometer',
  category: 'passive',
  description: 'Single-turn through-hole potentiometer',
  width: 5,
  height: 3,
  bodyColor: '#546e7a',
  bodyShape: 'ic',
  label: 'POT',
  pins: [
    { id: 'p1',   x: 1, y: 2, label: 'P1' },
    { id: 'wiper', x: 2, y: 2, label: 'W' },
    { id: 'p2',   x: 3, y: 2, label: 'P2' },
  ],
};

const oledI2c: PartDef = {
  id: 'oled-i2c',
  name: 'OLED 0.96" I2C',
  category: 'display',
  description: '0.96" OLED display module, I2C, 128×64',
  width: 6,
  height: 8,
  bodyColor: '#1a1a2e',
  bodyShape: 'ic',
  label: 'OLED\n0.96"',
  pins: [
    { id: 'gnd',  x: 0, y: 6, label: 'GND' },
    { id: 'vcc',  x: 1, y: 6, label: 'VCC' },
    { id: 'scl',  x: 2, y: 6, label: 'SCL' },
    { id: 'sda',  x: 3, y: 6, label: 'SDA' },
  ],
};


const esp32s3Pico: PartDef = {
  id: 'esp32-s3-pico',
  name: 'ESP32 S3 Pico',
  category: 'microcontroller',
  description: 'ESP32 dual-core Wi-Fi/BT development board, 38-pin',
  width: 7,
  height: 20,
  bodyColor: '#1a237e',
  bodyShape: 'dip',
  label: 'ESP32S3Pico',
  pins: leftRightPins(7, 20,
    ['GP11','GP12','GND','GP13','GP14','GP15','GP16','GND','GP17','GP18','GP33','GP34','GND','GP35','GP36','GP37','GP38','GND','GP39', 'GP40'],
    ['VBUS','VSYS','GND','3V3_EN','3V3(OUT)','GP10','GP9','GND','GP8','GP7','RUN','GP6','GND','GP5','GP4','GP2','GP1','GND','GP41', 'GP42'],
  ),
};


// ── Registry ────────────────────────────────────────────────────────────────

export const PART_LIBRARY: PartDef[] = [
  breadboard830,
  arduinoNano,
  esp32DevKit,
  esp8266Wemos,
  resistor,
  ledRed,
  ledGreen,
  ledBlue,
  pushButton,
  capacitorCeramic,
  npnTransistor,
  dht22,
  potentiometer,
  oledI2c,
  esp32s3Pico,
];

export function getPartDef(id: string): PartDef | undefined {
  return PART_LIBRARY.find(p => p.id === id);
}

export const CATEGORY_ORDER: PartCategory[] = [
  'board', 'microcontroller', 'sensor', 'display', 'active', 'passive', 'power',
];

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  board: 'Boards',
  microcontroller: 'Microcontrollers',
  sensor: 'Sensors',
  display: 'Displays',
  active: 'Active',
  passive: 'Passive',
  power: 'Power',
};
