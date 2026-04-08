import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVar(block: Blockly.Block): string {
  return (block.getField('VAR') as Blockly.FieldVariable)?.getText() || 'can';
}

export function registerCanGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_can_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_can', 'from hardware import CAN');
    const varName = getVar(block);
    g.variables_.add(varName);
    const id = block.getFieldValue('ID');
    const mode = block.getFieldValue('MODE');
    const tx = block.getFieldValue('TX');
    const rx = block.getFieldValue('RX');
    const baud = block.getFieldValue('BAUD');
    return `${varName} = CAN(id=${id}, mode=CAN.${mode}, port=(${tx}, ${rx}), baudrate=${baud})\n`;
  };

  gen.forBlock['upy_can_init_adv'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_can', 'from hardware import CAN');
    const varName = getVar(block);
    g.variables_.add(varName);
    const id = block.getFieldValue('ID');
    const mode = block.getFieldValue('MODE');
    const tx = block.getFieldValue('TX');
    const rx = block.getFieldValue('RX');
    const pre = block.getFieldValue('PRESCALER');
    const sjw = block.getFieldValue('SJW');
    const bs1 = block.getFieldValue('BS1');
    const bs2 = block.getFieldValue('BS2');
    const triple = block.getFieldValue('TRIPLE');
    return (
      `${varName} = CAN(id=${id}, mode=CAN.${mode}, port=(${tx}, ${rx}), ` +
      `prescaler=${pre}, sjw=${sjw}, bs1=${bs1}, bs2=${bs2}, triple_sampling=${triple})\n`
    );
  };

  gen.forBlock['upy_can_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    return `${varName}.deinit()\n`;
  };

  gen.forBlock['upy_can_state'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    return [`${varName}.state()`, Order.ATOMIC];
  };

  gen.forBlock['upy_can_info'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    return [`${varName}.info()`, Order.ATOMIC];
  };

  gen.forBlock['upy_can_any'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    return [`${varName}.any(0)`, Order.ATOMIC];
  };

  gen.forBlock['upy_can_recv_val'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const varName = getVar(block);
    g.variables_.add(varName);
    const timeout = g.valueToCode(block, 'TIMEOUT', Order.NONE) || '5000';
    return [`${varName}.recv(0, timeout=${timeout})`, Order.ATOMIC];
  };

  gen.forBlock['upy_can_recv'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || '_';
    const timeout = g.valueToCode(block, 'TIMEOUT', Order.NONE) || '5000';
    return `${varName}.recv(0, ${buf}, timeout=${timeout})\n`;
  };

  gen.forBlock['upy_can_send'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    const data = g.valueToCode(block, 'DATA', Order.NONE) || "b''";
    const id = g.valueToCode(block, 'ID', Order.NONE) || '0';
    const timeout = g.valueToCode(block, 'TIMEOUT', Order.NONE) || '0';
    const rtr = block.getFieldValue('RTR');
    const extframe = block.getFieldValue('EXTFRAME');
    return `${varName}.send(${data}, ${id}, timeout=${timeout}, rtr=${rtr}, extframe=${extframe})\n`;
  };

  gen.forBlock['upy_can_restart'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const varName = getVar(block);
    g.variables_.add(varName);
    return `${varName}.restart()\n`;
  };
}
