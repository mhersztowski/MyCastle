/**
 * Arduino code generators for tone/audio blocks.
 * Ported from ardublockly/blockly/generators/arduino/tone.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerAudioGenerators(generator: ArduinoGenerator): void {
  /**
   * Turn tone on for a given pin (X) at a frequency.
   * Arduino code: setup { pinMode(X, OUTPUT); }
   *               loop  { tone(X, frequency); }
   */
  generator.forBlock['io_tone'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pin = block.getFieldValue('TONEPIN');
    const freq = gen.valueToCode(block, 'FREQUENCY', Order.ATOMIC);

    gen.reservePin(block, pin, PinType.OUTPUT, 'Tone Pin');

    const pinSetupCode = 'pinMode(' + pin + ', OUTPUT);\n';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    return 'tone(' + pin + ',' + freq + ');\n';
  };

  /**
   * Turn tone off for a given pin (X).
   * Arduino code: setup { pinMode(X, OUTPUT); }
   *               loop  { noTone(X);          }
   */
  generator.forBlock['io_notone'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pin = block.getFieldValue('TONEPIN');

    gen.reservePin(block, pin, PinType.OUTPUT, 'Tone Pin');

    const pinSetupCode = 'pinMode(' + pin + ', OUTPUT);\n';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    return 'noTone(' + pin + ');\n';
  };
}
