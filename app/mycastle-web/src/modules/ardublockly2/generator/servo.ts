/**
 * Arduino code generators for Servo library blocks.
 * Ported from ardublockly/blockly/generators/arduino/servo.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerServoGenerators(generator: ArduinoGenerator): void {
  /**
   * Set an angle (Y) value to a servo pin (X).
   * Arduino code: #include <Servo.h>
   *               Servo myServoX;
   *               setup { myServoX.attach(X); }
   *               loop  { myServoX.write(Y);  }
   */
  generator.forBlock['servo_write'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const pinKey = block.getFieldValue('SERVO_PIN');
    const servoAngle =
      gen.valueToCode(block, 'SERVO_ANGLE', Order.ATOMIC) || '90';
    const servoName = 'myServo' + pinKey;

    gen.reservePin(block, pinKey, PinType.SERVO, 'Servo Write');

    gen.addInclude('servo', '#include <Servo.h>');
    gen.addDeclaration('servo_' + pinKey, 'Servo ' + servoName + ';');

    const setupCode = servoName + '.attach(' + pinKey + ');';
    gen.addSetup('servo_' + pinKey, setupCode, true);

    return servoName + '.write(' + servoAngle + ');\n';
  };

  /**
   * Read an angle value from a servo pin (X).
   * Arduino code: #include <Servo.h>
   *               Servo myServoX;
   *               setup { myServoX.attach(X); }
   *               loop  { myServoX.read();    }
   */
  generator.forBlock['servo_read'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const pinKey = block.getFieldValue('SERVO_PIN');
    const servoName = 'myServo' + pinKey;

    gen.reservePin(block, pinKey, PinType.SERVO, 'Servo Read');

    gen.addInclude('servo', '#include <Servo.h>');
    gen.addDeclaration('servo_' + pinKey, 'Servo ' + servoName + ';');

    const setupCode = servoName + '.attach(' + pinKey + ');';
    gen.addSetup('servo_' + pinKey, setupCode, true);

    return [servoName + '.read()', Order.ATOMIC];
  };
}
