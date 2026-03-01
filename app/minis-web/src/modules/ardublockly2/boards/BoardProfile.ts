/**
 * Board profile interface and built-in board definitions.
 * Ported from the original Ardublockly boards.js (Closure-based) to typed TypeScript.
 */

/** A pin entry: [displayName, value]. */
export type PinPair = [string, string];

/** Named serial/SPI/I2C pin mapping: bus name -> pin pairs. */
export type BusPinMap = Record<string, PinPair[]>;

/** Flash configuration for a board — null means flash not supported. */
export interface FlashConfig {
  /** Output file pattern, e.g. '{sketch}.ino.merged.bin'. {sketch} is replaced with sketch name. */
  filePattern: string;
  /** Flash offset in bytes. */
  offset: number;
}

/** Full board profile describing all pin capabilities and peripherals. */
export interface BoardProfile {
  name: string;
  description: string;
  compilerFlag: string;
  flashConfig: FlashConfig | null;
  analogPins: PinPair[];
  digitalPins: PinPair[];
  pwmPins: PinPair[];
  serial: PinPair[];
  serialPins: BusPinMap;
  serialSpeed: PinPair[];
  spi: PinPair[];
  spiPins: BusPinMap;
  spiClockDivide: PinPair[];
  i2c: PinPair[];
  i2cPins: BusPinMap;
  i2cSpeed: PinPair[];
  builtinLed: PinPair[];
  interrupt: PinPair[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate digital IO pin pairs from pinStart to pinEnd (inclusive). */
function generateDigitalIo(pinStart: number, pinEnd: number): PinPair[] {
  const pins: PinPair[] = [];
  for (let i = pinStart; i <= pinEnd; i++) {
    pins.push([i.toString(), i.toString()]);
  }
  return pins;
}

/** Generate analogue IO pin pairs (A0..An) from pinStart to pinEnd (inclusive). */
function generateAnalogIo(pinStart: number, pinEnd: number): PinPair[] {
  const pins: PinPair[] = [];
  for (let i = pinStart; i <= pinEnd; i++) {
    pins.push([`A${i}`, `A${i}`]);
  }
  return pins;
}

// ---------------------------------------------------------------------------
// Common data shared across boards
// ---------------------------------------------------------------------------

const SERIAL_SPEEDS: PinPair[] = [
  ['300', '300'], ['600', '600'], ['1200', '1200'],
  ['2400', '2400'], ['4800', '4800'], ['9600', '9600'],
  ['14400', '14400'], ['19200', '19200'], ['28800', '28800'],
  ['31250', '31250'], ['38400', '38400'], ['57600', '57600'],
  ['115200', '115200'],
];

const SPI_CLOCK_DIVIDES: PinPair[] = [
  ['2 (8MHz)', 'SPI_CLOCK_DIV2'],
  ['4 (4MHz)', 'SPI_CLOCK_DIV4'],
  ['8 (2MHz)', 'SPI_CLOCK_DIV8'],
  ['16 (1MHz)', 'SPI_CLOCK_DIV16'],
  ['32 (500KHz)', 'SPI_CLOCK_DIV32'],
  ['64 (250KHz)', 'SPI_CLOCK_DIV64'],
  ['128 (125KHz)', 'SPI_CLOCK_DIV128'],
];

const I2C_SPEEDS: PinPair[] = [
  ['100kHz', '100000L'],
  ['400kHz', '400000L'],
];

// ---------------------------------------------------------------------------
// Board definitions
// ---------------------------------------------------------------------------

export const boardProfiles: Record<string, BoardProfile> = {};

/** Arduino Uno */
boardProfiles.uno = {
  name: 'Arduino Uno',
  description: 'Arduino Uno standard compatible board',
  compilerFlag: 'arduino:avr:uno',
  flashConfig: null,
  analogPins: generateAnalogIo(0, 5),
  digitalPins: generateDigitalIo(0, 13).concat(generateAnalogIo(0, 5)),
  pwmPins: [['3', '3'], ['5', '5'], ['6', '6'], ['9', '9'], ['10', '10'], ['11', '11']],
  serial: [['serial', 'Serial']],
  serialPins: { Serial: [['RX', '0'], ['TX', '1']] },
  serialSpeed: SERIAL_SPEEDS,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', '11'], ['MISO', '12'], ['SCK', '13']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', 'A4'], ['SCL', 'A5']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: [['BUILTIN_1', '13']],
  interrupt: [['interrupt0', '2'], ['interrupt1', '3']],
};

/** Arduino Nano 328 (ATmega328p) */
boardProfiles.nano_328 = {
  name: 'Arduino Nano 328',
  description: 'Arduino Nano with ATmega328 board',
  compilerFlag: 'arduino:avr:nano:cpu=atmega328',
  flashConfig: null,
  analogPins: generateAnalogIo(0, 7),
  digitalPins: generateDigitalIo(0, 13).concat(generateAnalogIo(0, 7)),
  pwmPins: boardProfiles.uno.pwmPins,
  serial: boardProfiles.uno.serial,
  serialPins: boardProfiles.uno.serialPins,
  serialSpeed: boardProfiles.uno.serialSpeed,
  spi: boardProfiles.uno.spi,
  spiPins: boardProfiles.uno.spiPins,
  spiClockDivide: boardProfiles.uno.spiClockDivide,
  i2c: boardProfiles.uno.i2c,
  i2cPins: boardProfiles.uno.i2cPins,
  i2cSpeed: boardProfiles.uno.i2cSpeed,
  builtinLed: boardProfiles.uno.builtinLed,
  interrupt: boardProfiles.uno.interrupt,
};

/** Arduino Mega */
boardProfiles.mega = {
  name: 'Arduino Mega',
  description: 'Arduino Mega-compatible board',
  compilerFlag: 'arduino:avr:mega',
  flashConfig: null,
  analogPins: generateAnalogIo(0, 15),
  digitalPins: generateDigitalIo(0, 53),
  pwmPins: generateDigitalIo(2, 13).concat(generateDigitalIo(44, 46)),
  serial: [
    ['serial', 'Serial'], ['serial_1', 'Serial1'],
    ['serial_2', 'Serial2'], ['serial_3', 'Serial3'],
  ],
  serialPins: {
    Serial: [['TX', '0'], ['RX', '1']],
    Serial1: [['TX', '18'], ['RX', '19']],
    Serial2: [['TX', '16'], ['RX', '17']],
    Serial3: [['TX', '14'], ['RX', '15']],
  },
  serialSpeed: SERIAL_SPEEDS,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', '51'], ['MISO', '50'], ['SCK', '52']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', '20'], ['SCL', '21']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: boardProfiles.uno.builtinLed,
  interrupt: [
    ['interrupt0', '2'], ['interrupt1', '3'], ['interrupt2', '21'],
    ['interrupt3', '20'], ['interrupt4', '19'], ['interrupt5', '18'],
  ],
};

/** Arduino Leonardo */
boardProfiles.leonardo = {
  name: 'Arduino Leonardo',
  description: 'Arduino Leonardo-compatible board',
  compilerFlag: 'arduino:avr:leonardo',
  flashConfig: null,
  analogPins: generateAnalogIo(0, 5).concat(
    [['A6', '4'], ['A7', '6'], ['A8', '8'], ['A9', '9'], ['A10', '10'], ['A11', '12']],
  ),
  digitalPins: generateDigitalIo(0, 13).concat(generateAnalogIo(0, 5)),
  pwmPins: boardProfiles.uno.pwmPins.concat([['13', '13']]),
  serial: boardProfiles.uno.serial,
  serialPins: boardProfiles.uno.serialPins,
  serialSpeed: boardProfiles.uno.serialSpeed,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', 'ICSP-4'], ['MISO', 'ICSP-1'], ['SCK', 'ICSP-3']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', '2'], ['SCL', '3']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: boardProfiles.uno.builtinLed,
  interrupt: [
    ['interrupt0', '3'], ['interrupt1', '2'], ['interrupt2', '0'],
    ['interrupt3', '1'], ['interrupt4', '17'],
  ],
};

/** ESP8266 Adafruit Huzzah */
boardProfiles.esp8266_huzzah = {
  name: 'Adafruit Feather HUZZAH',
  description: 'Adafruit HUZZAH ESP8266 compatible board',
  compilerFlag: 'esp8266:esp8266:generic',
  flashConfig: { filePattern: '{sketch}.ino.bin', offset: 0x0000 },
  analogPins: [['A0', 'A0']],
  digitalPins: [
    ['0', '0'], ['2', '2'], ['4', '4'], ['5', '5'], ['12', '12'],
    ['13', '13'], ['14', '14'], ['15', '15'], ['16', '16'],
  ],
  pwmPins: [['2', '2']],
  serial: [['serial', 'Serial']],
  serialPins: { Serial: [['RX', 'RX'], ['TX', 'TX']] },
  serialSpeed: SERIAL_SPEEDS,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', '13'], ['MISO', '12'], ['SCK', '14']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', '4'], ['SCL', '5']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: [['BUILTIN_1', '0']],
  interrupt: [['interrupt0', '2'], ['interrupt1', '3']],
};

/** ESP8266 Wemos D1 R2 */
boardProfiles.esp8266_wemos_d1 = {
  name: 'Wemos D1',
  description: 'Wemos D1 R2 compatible board',
  compilerFlag: 'esp8266:esp8266:generic',
  flashConfig: { filePattern: '{sketch}.ino.bin', offset: 0x0000 },
  analogPins: [['A0', 'A0']],
  digitalPins: [
    ['D0', 'D0'], ['D1', 'D1'], ['D2', 'D2'], ['D3', 'D3'],
    ['D4', 'D4'], ['D5', 'D5'], ['D6', 'D6'], ['D7', 'D7'], ['D8', 'D8'],
  ],
  pwmPins: [
    ['D1', 'D1'], ['D2', 'D2'], ['D3', 'D3'], ['D4', 'D4'],
    ['D5', 'D5'], ['D6', 'D6'], ['D7', 'D7'], ['D8', 'D8'],
  ],
  serial: [['serial', 'Serial']],
  serialPins: { Serial: [['RX', 'RX'], ['TX', 'TX']] },
  serialSpeed: SERIAL_SPEEDS,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', 'D7'], ['MISO', 'D6'], ['SCK', 'D5']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', 'D2'], ['SCL', 'D1']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: [['BUILTIN_1', 'D4']],
  interrupt: [
    ['D0', 'D0'], ['D1', 'D1'], ['D2', 'D2'], ['D3', 'D3'],
    ['D4', 'D4'], ['D5', 'D5'], ['D6', 'D6'], ['D7', 'D7'], ['D8', 'D8'],
  ],
};

/** ESP32 DevKit C */
boardProfiles.esp32_devkitc = {
  name: 'ESP32 DevKit C',
  description: 'Espressif ESP32 DevKit C board',
  compilerFlag: 'esp32:esp32:esp32',
  flashConfig: { filePattern: '{sketch}.ino.merged.bin', offset: 0x0000 },
  analogPins: generateAnalogIo(0, 19).concat([
    ['A6', '34'], ['A7', '35'], ['A10', '4'], ['A11', '0'],
    ['A12', '2'], ['A13', '15'], ['A14', '13'], ['A15', '12'],
    ['A16', '14'], ['A17', '27'], ['A18', '25'], ['A19', '26'],
  ]),
  digitalPins: [
    ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'],
    ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'],
    ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
    ['21', '21'], ['22', '22'], ['23', '23'],
    ['25', '25'], ['26', '26'], ['27', '27'],
    ['32', '32'], ['33', '33'], ['34', '34'], ['35', '35'],
  ],
  pwmPins: [
    ['2', '2'], ['4', '4'], ['5', '5'],
    ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'],
    ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
    ['21', '21'], ['22', '22'], ['23', '23'],
    ['25', '25'], ['26', '26'], ['27', '27'],
    ['32', '32'], ['33', '33'],
  ],
  serial: [['serial', 'Serial'], ['serial1', 'Serial1'], ['serial2', 'Serial2']],
  serialPins: {
    Serial: [['RX', '3'], ['TX', '1']],
    Serial1: [['RX', '9'], ['TX', '10']],
    Serial2: [['RX', '16'], ['TX', '17']],
  },
  serialSpeed: SERIAL_SPEEDS,
  spi: [['SPI', 'SPI']],
  spiPins: { SPI: [['MOSI', '23'], ['MISO', '19'], ['SCK', '18']] },
  spiClockDivide: SPI_CLOCK_DIVIDES,
  i2c: [['I2C', 'Wire']],
  i2cPins: { Wire: [['SDA', '21'], ['SCL', '22']] },
  i2cSpeed: I2C_SPEEDS,
  builtinLed: [['BUILTIN_1', '2']],
  interrupt: [
    ['0', '0'], ['2', '2'], ['4', '4'], ['5', '5'],
    ['12', '12'], ['13', '13'], ['14', '14'], ['15', '15'],
    ['16', '16'], ['17', '17'], ['18', '18'], ['19', '19'],
    ['21', '21'], ['22', '22'], ['23', '23'],
    ['25', '25'], ['26', '26'], ['27', '27'],
    ['32', '32'], ['33', '33'], ['34', '34'], ['35', '35'],
  ],
};

/** Map SoC name (from ModuleDef) to board profile key */
export const socToBoardKey: Record<string, string> = {
  Esp32: 'esp32_devkitc',
  Esp8266: 'esp8266_wemos_d1',
  ATmega328: 'uno',
  ATmega2560: 'mega',
  ATmega32U4: 'leonardo',
};
