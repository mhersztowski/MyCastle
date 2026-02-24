/**
 * Arduino code generators for Serial communication blocks.
 * Ported from ardublockly/blockly/generators/arduino/serial.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerSerialGenerators(generator: ArduinoGenerator): void {
  /**
   * Set the serial com speed.
   * Arduino code: setup { Serial.begin(X); }
   */
  generator.forBlock['serial_setup'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const serialId = block.getFieldValue('SERIAL_ID');
    const serialSpeed = block.getFieldValue('SPEED');
    const serialSetupCode = serialId + '.begin(' + serialSpeed + ');';
    gen.addSetup('serial_' + serialId, serialSetupCode, true);
    return '';
  };

  /**
   * Write to the serial com.
   * Arduino code: loop { Serial.print(X); }
   */
  generator.forBlock['serial_print'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const serialId = block.getFieldValue('SERIAL_ID');
    const content =
      gen.valueToCode(block, 'CONTENT', Order.ATOMIC) || '0';
    const newLine = block.getFieldValue('NEW_LINE') === 'TRUE';

    const serialPins =
      gen.boardManager.selected.serialPins[serialId] ?? [];
    for (let i = 0; i < serialPins.length; i++) {
      gen.reservePin(
        block,
        serialPins[i][1],
        PinType.SERIAL,
        'SERIAL ' + serialPins[i][0],
      );
    }

    if (newLine) {
      return serialId + '.println(' + content + ');\n';
    } else {
      return serialId + '.print(' + content + ');\n';
    }
  };
}
