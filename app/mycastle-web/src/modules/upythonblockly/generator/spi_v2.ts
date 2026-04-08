import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVar(block: Blockly.Block): string {
  return (block.getField('VAR') as Blockly.FieldVariable)?.getText() || 'spi';
}

export function registerSpiV2Generators(gen: UPythonGenerator): void {
  gen.forBlock['upy_spi2_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_spi', 'from hardware import SPI');
    g.addImport('hardware_pin', 'from hardware import Pin');
    const varName = getVar(block);
    g.variables_.add(varName);
    const id = block.getFieldValue('ID');
    const baud = block.getFieldValue('BAUD');
    const sck = block.getFieldValue('SCK');
    const miso = block.getFieldValue('MISO');
    const mosi = block.getFieldValue('MOSI');
    const firstbit = block.getFieldValue('FIRSTBIT');
    const mode = parseInt(block.getFieldValue('MODE'));
    const polarity = (mode >> 1) & 1;
    const phase = mode & 1;
    return (
      `${varName} = SPI(${id}, ${baud}, sck=Pin(${sck}), miso=Pin(${miso}), mosi=Pin(${mosi}), ` +
      `firstbit=SPI.${firstbit}, polarity=${polarity}, phase=${phase})\n`
    );
  };

  gen.forBlock['upy_spi2_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    return `${varName}.deinit()\n`;
  };

  gen.forBlock['upy_spi2_read_val'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    const n = g.valueToCode(block, 'NBYTES', Order.NONE) || '0';
    return [`${varName}.read(${n})`, Order.ATOMIC];
  };

  gen.forBlock['upy_spi2_readinto'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    return `${varName}.readinto(${buf})\n`;
  };

  gen.forBlock['upy_spi2_write'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    return `${varName}.write(${buf})\n`;
  };

  gen.forBlock['upy_spi2_write_readinto'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const wbuf = g.valueToCode(block, 'WBUF', Order.NONE) || '_';
    const rbuf = g.valueToCode(block, 'RBUF', Order.NONE) || '_';
    return `${varName}.write_readinto(${wbuf}, ${rbuf})\n`;
  };
}
