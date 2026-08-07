/** Definicje układów używane w testach schematu. */

import type { ComponentDefinition } from '../../schematic/hcomp';

export const DEFINITIONS: Record<string, ComponentDefinition> = {
    'esp32-s3-devkitc-1': {
        hcomp: '0.1', component: 'esp32-s3-devkitc-1', name: 'ESP32-S3-DevKitC-1',
        pins: [
            { name: '3V3', kind: 'power_out' },
            { name: 'GND', kind: 'ground' },
            { name: 'IO8', kind: 'bidirectional', gpio: 8 },
            { name: 'IO9', kind: 'bidirectional', gpio: 9 },
            { name: 'IO17', kind: 'output', gpio: 17, optional: true },
            { name: 'IO48', kind: 'output', gpio: 48, optional: true },
            { name: 'IO21', kind: 'bidirectional', gpio: 21, optional: true },
        ],
    },
    bmp280: {
        hcomp: '0.1', component: 'bmp280', name: 'BMP280',
        pins: [
            { name: 'VCC', kind: 'power_in' },
            { name: 'GND', kind: 'ground' },
            { name: 'SDA', kind: 'bidirectional', bus: 'i2c', role: 'sda' },
            { name: 'SCL', kind: 'input', bus: 'i2c', role: 'scl' },
            { name: 'SDO', kind: 'input', optional: true },
        ],
    },
    ssd1306: {
        hcomp: '0.1', component: 'ssd1306', name: 'SSD1306',
        pins: [
            { name: 'VCC', kind: 'power_in' },
            { name: 'GND', kind: 'ground' },
            { name: 'SDA', kind: 'bidirectional', bus: 'i2c', role: 'sda' },
            { name: 'SCL', kind: 'input', bus: 'i2c', role: 'scl' },
        ],
    },
    resistor: {
        hcomp: '0.1', component: 'resistor', name: 'Rezystor',
        pins: [
            { name: 'A', kind: 'passive' },
            { name: 'B', kind: 'passive' },
        ],
    },
};
