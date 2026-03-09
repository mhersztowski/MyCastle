/**
 * Arduino code generators for Digital and Analogue input/output blocks.
 * Ported from ardublockly/blockly/generators/arduino/io.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerIoGenerators(generator: ArduinoGenerator): void {
  /**
   * Set pin (X) to a state (Y).
   * Arduino code: setup { pinMode(X, OUTPUT); }
   *               loop  { digitalWrite(X, Y); }
   */
  generator.forBlock['io_digitalwrite'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pin = block.getFieldValue('PIN');
    const stateOutput =
      gen.valueToCode(block, 'STATE', Order.ATOMIC) || 'LOW';

    gen.reservePin(block, pin, PinType.OUTPUT, 'Digital Write');

    const pinSetupCode = 'pinMode(' + pin + ', OUTPUT);';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'digitalWrite(' + pin + ', ' + stateOutput + ');\n';
    return code;
  };

  /**
   * Read a digital pin (X).
   * Arduino code: setup { pinMode(X, INPUT); }
   *               loop  { digitalRead(X)     }
   */
  generator.forBlock['io_digitalread'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    gen.reservePin(block, pin, PinType.INPUT, 'Digital Read');

    const pinSetupCode = 'pinMode(' + pin + ', INPUT);';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'digitalRead(' + pin + ')';
    return [code, Order.ATOMIC];
  };

  /**
   * Set the state (Y) of a built-in LED (X).
   * Arduino code: setup { pinMode(X, OUTPUT); }
   *               loop  { digitalWrite(X, Y); }
   */
  generator.forBlock['io_builtin_led'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pin = block.getFieldValue('BUILT_IN_LED');
    const stateOutput =
      gen.valueToCode(block, 'STATE', Order.ATOMIC) || 'LOW';

    gen.reservePin(block, pin, PinType.OUTPUT, 'Set LED');

    const pinSetupCode = 'pinMode(' + pin + ', OUTPUT);';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'digitalWrite(' + pin + ', ' + stateOutput + ');\n';
    return code;
  };

  /**
   * Set the state (Y) of an analogue output (X).
   * Arduino code: setup { pinMode(X, OUTPUT); }
   *               loop  { analogWrite(X, Y);  }
   */
  generator.forBlock['io_analogwrite'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pin = block.getFieldValue('PIN');
    const stateOutput =
      gen.valueToCode(block, 'NUM', Order.ATOMIC) || '0';

    gen.reservePin(block, pin, PinType.OUTPUT, 'Analogue Write');

    const pinSetupCode = 'pinMode(' + pin + ', OUTPUT);';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    // Warn if the input value is out of range
    const numValue = Number(stateOutput);
    if (!isNaN(numValue) && (numValue < 0 || numValue > 255)) {
      block.setWarningText(
        'The analogue value set must be between 0 and 255',
        'pwm_value',
      );
    } else {
      block.setWarningText(null, 'pwm_value');
    }

    const code = 'analogWrite(' + pin + ', ' + stateOutput + ');\n';
    return code;
  };

  /**
   * Read an analogue pin value (X).
   * Arduino code: setup { pinMode(X, INPUT); }
   *               loop  { analogRead(X)      }
   */
  generator.forBlock['io_analogread'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PIN');
    gen.reservePin(block, pin, PinType.INPUT, 'Analogue Read');

    const pinSetupCode = 'pinMode(' + pin + ', INPUT);';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'analogRead(' + pin + ')';
    return [code, Order.ATOMIC];
  };

  /**
   * Define a digital pin state (HIGH/LOW).
   * Arduino code: loop { HIGH / LOW }
   */
  generator.forBlock['io_highlow'] = function (
    block: Blockly.Block,
    _gen: ArduinoGenerator,
  ): [string, Order] {
    const code = block.getFieldValue('STATE');
    return [code, Order.ATOMIC];
  };

  /**
   * Read a pulse on a pin.
   * Arduino code: setup { pinMode(X, INPUT); }
   *               loop  { pulseIn(X, type)   }
   */
  generator.forBlock['io_pulsein'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PULSEPIN');
    const type = gen.valueToCode(block, 'PULSETYPE', Order.ATOMIC);

    gen.reservePin(block, pin, PinType.INPUT, 'Pulse Pin');

    const pinSetupCode = 'pinMode(' + pin + ', INPUT);\n';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'pulseIn(' + pin + ', ' + type + ')';
    return [code, Order.ATOMIC];
  };

  /**
   * Read a pulse on a pin with timeout.
   * Arduino code: setup { pinMode(X, INPUT); }
   *               loop  { pulseIn(X, type, timeout) }
   */
  generator.forBlock['io_pulsetimeout'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const pin = block.getFieldValue('PULSEPIN');
    const type = gen.valueToCode(block, 'PULSETYPE', Order.ATOMIC);
    const timeout = gen.valueToCode(block, 'TIMEOUT', Order.ATOMIC);

    gen.reservePin(block, pin, PinType.INPUT, 'Pulse Pin');

    const pinSetupCode = 'pinMode(' + pin + ', INPUT);\n';
    gen.addSetup('io_' + pin, pinSetupCode, false);

    const code = 'pulseIn(' + pin + ', ' + type + ', ' + timeout + ')';
    return [code, Order.ATOMIC];
  };
}
