/**
 * Arduino code generators for Stepper library blocks.
 * Ported from ardublockly/blockly/generators/arduino/stepper.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerStepperGenerators(generator: ArduinoGenerator): void {
  /**
   * Stepper configuration. Nothing added to loop().
   * Sets pins (X, Y), steps per revolution (Z), speed (A), and instance name (B).
   * Arduino code: #include <Stepper.h>
   *               Stepper B(Z, X, Y);
   *               setup() { B.setSpeed(A); }
   */
  generator.forBlock['stepper_config'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const stepperName = block.getFieldValue('STEPPER_NAME');
    const numberOfPins = block.getFieldValue('STEPPER_NUMBER_OF_PINS');
    const stepperSteps =
      gen.valueToCode(block, 'STEPPER_STEPS', Order.ATOMIC) || '360';
    const stepperSpeed =
      gen.valueToCode(block, 'STEPPER_SPEED', Order.ATOMIC) || '90';
    const pins: string[] = [
      block.getFieldValue('STEPPER_PIN1'),
      block.getFieldValue('STEPPER_PIN2'),
    ];
    if (numberOfPins === 'FOUR') {
      pins.push(block.getFieldValue('STEPPER_PIN3'));
      pins.push(block.getFieldValue('STEPPER_PIN4'));
    }

    let pinArray = 'int ' + stepperName + '[' + pins.length + '] = {';
    let globalCode =
      'Stepper stepper_' + stepperName + '(' + stepperSteps + ', ';
    for (let i = 0; i < pins.length; i++) {
      gen.reservePin(block, pins[i], PinType.STEPPER, 'Stepper');
      pinArray += pins[i] + ', ';
      globalCode += pins[i] + ', ';
    }
    pinArray = pinArray.slice(0, -2) + '};';
    globalCode = globalCode.slice(0, -2) + ');';

    // stepper is a variable containing the used pins
    gen.addVariable(stepperName, pinArray, true);
    const instanceName = 'stepper_' + stepperName;

    gen.addInclude('stepper', '#include <Stepper.h>');
    gen.addDeclaration(instanceName, globalCode);

    const setupCode = instanceName + '.setSpeed(' + stepperSpeed + ');';
    gen.addSetup(instanceName, setupCode, true);

    return '';
  };

  /**
   * Move the stepper instance (X) a number of steps (Y).
   * Requires stepper_config block.
   * Arduino code: loop { X.step(Y); }
   */
  generator.forBlock['stepper_step'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const stepperInstanceName =
      'stepper_' + block.getFieldValue('STEPPER_NAME');
    const stepperSteps =
      gen.valueToCode(block, 'STEPPER_STEPS', Order.ATOMIC) || '0';
    return stepperInstanceName + '.step(' + stepperSteps + ');\n';
  };
}
