import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerSdcardGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_sdcard_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_sdcard', 'from hardware import sdcard');
    const slot = block.getFieldValue('SLOT');
    const sck = block.getFieldValue('SCK');
    const miso = block.getFieldValue('MISO');
    const mosi = block.getFieldValue('MOSI');
    const cs = block.getFieldValue('CS');
    const freq = block.getFieldValue('FREQ');
    return `sdcard.SDCard(slot=${slot}, width=1, sck=${sck}, miso=${miso}, mosi=${mosi}, cs=${cs}, freq=${freq})\n`;
  };

  gen.forBlock['upy_sdcard_getcwd'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('import_os', 'import os');
    return ['os.getcwd()', Order.ATOMIC];
  };

  gen.forBlock['upy_sdcard_listdir'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return [`os.listdir('/sd/' + ${path})`, Order.ATOMIC];
  };

  gen.forBlock['upy_sdcard_isfile'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return [`os.stat('/sd/' + ${path})[0] == 0x8000`, Order.NONE];
  };

  gen.forBlock['upy_sdcard_isdir'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return [`os.stat('/sd/' + ${path})[0] == 0x4000`, Order.NONE];
  };

  gen.forBlock['upy_sdcard_exists'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('import_os', 'import os');
    const name = g.valueToCode(block, 'NAME', Order.NONE) || "''";
    const dir = g.valueToCode(block, 'DIR', Order.NONE) || "''";
    return [`${name} in os.listdir('/sd/' + ${dir})`, Order.NONE];
  };

  gen.forBlock['upy_sdcard_chdir'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return `os.chdir(${path})\n`;
  };

  gen.forBlock['upy_sdcard_mkdir'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return `os.mkdir(${path})\n`;
  };

  gen.forBlock['upy_sdcard_remove'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return `os.remove(${path})\n`;
  };

  gen.forBlock['upy_sdcard_rmdir'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('import_os', 'import os');
    const path = g.valueToCode(block, 'PATH', Order.NONE) || "''";
    return `os.rmdir(${path})\n`;
  };

  gen.forBlock['upy_sdcard_rename'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('import_os', 'import os');
    const src = g.valueToCode(block, 'SRC', Order.NONE) || "''";
    const dst = g.valueToCode(block, 'DST', Order.NONE) || "''";
    return `os.rename(${src}, ${dst})\n`;
  };
}
