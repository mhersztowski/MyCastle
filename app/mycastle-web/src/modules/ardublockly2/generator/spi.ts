/**
 * Arduino code generators for SPI library blocks.
 * Ported from ardublockly/blockly/generators/arduino/spi.js
 */
import * as Blockly from 'blockly';
import { Order } from './Order';
import { PinType } from './PinTypes';
import type { ArduinoGenerator } from './ArduinoGenerator';

export function registerSpiGenerators(generator: ArduinoGenerator): void {
  /**
   * SPI configuration block. Generates code for setup() only.
   * Arduino code: #include <SPI.h>
   *               setup() { SPI.setBitOrder(X);
   *                         SPI.setDataMode(Y);
   *                         SPI.setClockDivider(Z);
   *                         SPI.begin(); }
   */
  generator.forBlock['spi_setup'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const spiId = block.getFieldValue('SPI_ID');
    const spiShift = block.getFieldValue('SPI_SHIFT_ORDER');
    const spiClockDivide = block.getFieldValue('SPI_CLOCK_DIVIDE');
    const spiMode = block.getFieldValue('SPI_MODE');

    gen.addInclude('spi', '#include <SPI.h>');
    gen.addSetup(
      'spi_order',
      spiId + '.setBitOrder(' + spiShift + ');',
      true,
    );
    gen.addSetup(
      'spi_mode',
      spiId + '.setDataMode(' + spiMode + ');',
      true,
    );
    gen.addSetup(
      'spi_div',
      spiId + '.setClockDivider(' + spiClockDivide + ');',
      true,
    );
    gen.addSetup('spi_begin', spiId + '.begin();', true);

    return '';
  };

  /**
   * SPI transfer block.
   * SPI bus can have several slaves, selected using a digital output as SS pin.
   * Arduino code: #include <SPI.h>
   *               setup { pinMode(X, OUTPUT); }
   *               loop  { digitalWrite(X, HIGH);
   *                       SPI.transfer(0);
   *                       digitalWrite(X, LOW); }
   */
  generator.forBlock['spi_transfer'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): string {
    const spiId = block.getFieldValue('SPI_ID');
    const spiSs = block.getFieldValue('SPI_SS');
    const spiData =
      gen.valueToCode(block, 'SPI_DATA', Order.ATOMIC) || '0';

    gen.addInclude('spi', '#include <SPI.h>');
    gen.addSetup('spi_begin', spiId + '.begin();', false);

    // Reserve SPI pins MOSI, MISO, and SCK
    const spiPins = gen.boardManager.selected.spiPins[spiId] ?? [];
    for (let i = 0; i < spiPins.length; i++) {
      gen.reservePin(
        block,
        spiPins[i][1],
        PinType.SPI,
        'SPI ' + spiPins[i][0],
      );
    }

    // Configure the Slave Select as a normal output if a pin is used
    if (spiSs !== 'none') {
      gen.reservePin(block, spiSs, PinType.OUTPUT, 'SPI Slave pin');
      const setupCode = 'pinMode(' + spiSs + ', OUTPUT);';
      gen.addSetup('io_' + spiSs, setupCode, false);
    }

    // Add the code, but only use a SS pin if one is selected
    const codeLines: string[] = [];
    if (spiSs !== 'none') {
      codeLines.push('digitalWrite(' + spiSs + ', HIGH);');
    }
    codeLines.push(spiId + '.transfer(' + spiData + ');');
    if (spiSs !== 'none') {
      codeLines.push('digitalWrite(' + spiSs + ', LOW);');
    }
    return codeLines.join('\n') + '\n';
  };

  /**
   * SPI transfer block with a return value.
   * Same setup as spi_transfer but returns the transferred data.
   */
  generator.forBlock['spi_transfer_return'] = function (
    block: Blockly.Block,
    gen: ArduinoGenerator,
  ): [string, Order] {
    const spiId = block.getFieldValue('SPI_ID');
    const spiSs = block.getFieldValue('SPI_SS');
    const spiData =
      gen.valueToCode(block, 'SPI_DATA', Order.ATOMIC) || '0';

    // Invoke spi_transfer to generate all setup code (return value discarded)
    const spiTransferGen = gen.forBlock['spi_transfer'];
    if (spiTransferGen) {
      spiTransferGen.call(gen, block, gen);
    }

    let code: string;
    if (spiSs === 'none') {
      code = spiId + '.transfer(' + spiData + ')';
    } else {
      const funcBody = [
        'int ' + gen.FUNCTION_NAME_PLACEHOLDER_ + '() {',
        '  int spiReturn = 0;',
        '  digitalWrite(' + spiSs + ', HIGH);',
        '  spiReturn = ' + spiId + '.transfer(' + spiData + ');',
        '  digitalWrite(' + spiSs + ', LOW);',
        '  return spiReturn;',
        '}',
      ];
      const functionName = gen.addFunction(
        'spiReturnSlave' + spiSs,
        funcBody.join('\n'),
      );
      code = functionName + '()';
    }
    return [code, Order.UNARY_POSTFIX];
  };
}
