/**
 * MicroPython board profile definitions.
 * Boards: ESP32 generic, ESP32-S3 generic, ESP8266/Wemos D1, Raspberry Pi Pico (RP2040),
 * M5Stack Core (ESP32), M5Stack Atom (ESP32).
 */

/** A pin entry: [displayName, value]. */
export type PinPair = [string, string];

/** Full uPython board profile. */
export interface UPythonBoardProfile {
  name: string;
  description: string;
  /** Used to identify the board in the upload dialog (for info only). */
  chipName: string;
  digitalPins: PinPair[];
  analogPins: PinPair[];
  pwmPins: PinPair[];
  uartIds: PinPair[];
  i2cIds: PinPair[];
  builtinLed: PinPair[];
  /** ESP-only boards support WiFi / network module. */
  supportsWifi: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pins(pairs: [string | number, string | number][]): PinPair[] {
  return pairs.map(([d, v]) => [String(d), String(v)]);
}

function gpRange(start: number, end: number): PinPair[] {
  const result: PinPair[] = [];
  for (let i = start; i <= end; i++) {
    result.push([`GP${i}`, String(i)]);
  }
  return result;
}

function numRange(start: number, end: number): PinPair[] {
  const result: PinPair[] = [];
  for (let i = start; i <= end; i++) {
    result.push([String(i), String(i)]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Board definitions
// ---------------------------------------------------------------------------

export const boardProfiles: Record<string, UPythonBoardProfile> = {};

/** ESP32 Generic (DevKit C, WROOM, etc.) */
boardProfiles.esp32_generic = {
  name: 'ESP32 Generic',
  description: 'Generic ESP32 board (DevKit, WROOM, etc.)',
  chipName: 'ESP32',
  digitalPins: [
    ...numRange(0, 5),
    ...numRange(12, 19),
    ...numRange(21, 23),
    ...numRange(25, 27),
    ...numRange(32, 33),
    ['34', '34'], ['35', '35'], ['36', '36'], ['39', '39'],
  ],
  analogPins: [
    ...numRange(32, 39).filter(([, v]) => !['37', '38'].includes(v)),
  ],
  pwmPins: [
    ...numRange(0, 5),
    ...numRange(12, 19),
    ...numRange(21, 23),
    ...numRange(25, 27),
    ...numRange(32, 33),
  ],
  uartIds: pins([[0, 0], [1, 1], [2, 2]]),
  i2cIds: pins([[0, 0], [1, 1]]),
  builtinLed: pins([['LED (GPIO2)', '2']]),
  supportsWifi: true,
};

/**
 * ESP32-S3 Generic (DevKitC, WROOM, etc.)
 * GPIOs 0–21 and 26–48 exist (22–25 don't exist on ESP32-S3).
 * ADC1: GPIO 1–10 (works with WiFi). ADC2: GPIO 11–20 (restricted when WiFi active).
 * GPIO 43/44 are USB-JTAG UART0 on many dev boards.
 */
boardProfiles.esp32s3_generic = {
  name: 'ESP32-S3 Generic',
  description: 'Generic ESP32-S3 board (DevKitC, WROOM-1, etc.)',
  chipName: 'ESP32-S3',
  digitalPins: [
    ...numRange(0, 21),
    ...numRange(26, 48),
  ],
  analogPins: [
    // ADC1 (safe with WiFi): GPIO 1–10
    ...numRange(1, 10),
    // ADC2 (avoid with WiFi): GPIO 11–20
    ...numRange(11, 20),
  ],
  pwmPins: [
    // All output-capable GPIOs (input-only GPIO 0 excluded from PWM output)
    ...numRange(1, 21),
    ...numRange(26, 45),
  ],
  uartIds: pins([[0, 0], [1, 1], [2, 2]]),
  i2cIds: pins([[0, 0], [1, 1]]),
  builtinLed: pins([['LED (GPIO2)', '2']]),
  supportsWifi: true,
};

/** ESP8266 / Wemos D1 Mini */
boardProfiles.esp8266_wemos_d1 = {
  name: 'Wemos D1 Mini',
  description: 'ESP8266-based Wemos D1 Mini / NodeMCU',
  chipName: 'ESP8266',
  digitalPins: pins([
    ['D0 (GPIO16)', '16'], ['D1 (GPIO5)', '5'], ['D2 (GPIO4)', '4'],
    ['D3 (GPIO0)', '0'], ['D4 (GPIO2)', '2'], ['D5 (GPIO14)', '14'],
    ['D6 (GPIO12)', '12'], ['D7 (GPIO13)', '13'], ['D8 (GPIO15)', '15'],
  ]),
  analogPins: pins([['A0', '0']]),
  pwmPins: pins([
    ['D1 (GPIO5)', '5'], ['D2 (GPIO4)', '4'], ['D3 (GPIO0)', '0'],
    ['D4 (GPIO2)', '2'], ['D5 (GPIO14)', '14'],
    ['D6 (GPIO12)', '12'], ['D7 (GPIO13)', '13'], ['D8 (GPIO15)', '15'],
  ]),
  uartIds: pins([[0, 0], [1, 1]]),
  i2cIds: pins([[0, 0]]),
  builtinLed: pins([['Built-in LED (GPIO2)', '2']]),
  supportsWifi: true,
};

/** Raspberry Pi Pico (RP2040) */
boardProfiles.rp2040_pico = {
  name: 'Raspberry Pi Pico',
  description: 'RP2040-based Raspberry Pi Pico / Pico W',
  chipName: 'RP2040',
  digitalPins: gpRange(0, 28),
  analogPins: [
    ['GP26 (ADC0)', '26'], ['GP27 (ADC1)', '27'], ['GP28 (ADC2)', '28'],
  ],
  pwmPins: gpRange(0, 28),
  uartIds: pins([[0, 0], [1, 1]]),
  i2cIds: pins([[0, 0], [1, 1]]),
  builtinLed: pins([['LED (GP25)', '25']]),
  supportsWifi: false,
};

/** M5Stack Core (ESP32-based) */
boardProfiles.m5stack_core = {
  name: 'M5Stack Core',
  description: 'M5Stack Core (ESP32) — includes onboard buttons, LCD, speaker',
  chipName: 'ESP32',
  digitalPins: [
    ...numRange(0, 5),
    ...numRange(12, 19),
    ...numRange(21, 23),
    ...numRange(25, 27),
    ...numRange(32, 39),
  ],
  analogPins: [...numRange(32, 39).filter(([, v]) => !['37', '38'].includes(v))],
  pwmPins: [...numRange(0, 5), ...numRange(12, 19), ...numRange(21, 23), ...numRange(25, 27), ...numRange(32, 33)],
  uartIds: pins([[0, 0], [1, 1], [2, 2]]),
  i2cIds: pins([[0, 0], [1, 1]]),
  builtinLed: pins([
    ['Button A (GPIO39)', '39'],
    ['Button B (GPIO38)', '38'],
    ['Button C (GPIO37)', '37'],
  ]),
  supportsWifi: true,
};

/** M5Stack Atom (ESP32-based) */
boardProfiles.m5stack_atom = {
  name: 'M5Stack Atom',
  description: 'M5Stack Atom Lite / Matrix (ESP32-PICO)',
  chipName: 'ESP32',
  digitalPins: [
    ...numRange(0, 5),
    ...numRange(12, 19),
    ...numRange(21, 23),
    ...numRange(25, 27),
    ...numRange(32, 39),
  ],
  analogPins: [...numRange(32, 39).filter(([, v]) => !['37', '38'].includes(v))],
  pwmPins: [...numRange(0, 5), ...numRange(12, 19), ...numRange(21, 23), ...numRange(25, 27), ...numRange(32, 33)],
  uartIds: pins([[0, 0], [1, 1]]),
  i2cIds: pins([[0, 0]]),
  builtinLed: pins([['Neopixel (GPIO27)', '27'], ['Button (GPIO39)', '39']]),
  supportsWifi: true,
};

/** Map SoC name (from ModuleDef) to uPython board profile key */
export const socToUPythonBoardKey: Record<string, string> = {
  Esp32: 'esp32_generic',
  Esp32S3: 'esp32s3_generic',
  Esp32S3Pico: 'esp32s3_generic',
  Esp8266: 'esp8266_wemos_d1',
  RP2040: 'rp2040_pico',
  M5Stack: 'm5stack_core',
};
