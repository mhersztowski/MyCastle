import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

/** Add machine.UART import and lazy-init the UART object with default baud. */
function ensureUart(g: UPythonGenerator, id: string): void {
  g.addImport('machine.UART', 'from machine import UART');
  g.addInit(`uart_${id}`, `_uart${id} = UART(${id}, baudrate=115200)`);
}

/** Convert parity field value ('None', '0', '1') to Python representation. */
function parityPy(parity: string): string {
  return parity === 'None' ? 'None' : parity;
}

export function registerUartGenerators(gen: UPythonGenerator): void {
  // ── Advanced blocks (UIFlow2-style) ──────────────────────────────────────

  gen.forBlock['upy_uart_init_full'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const baud = block.getFieldValue('BAUD');
    const bits = block.getFieldValue('BITS');
    const parity = parityPy(block.getFieldValue('PARITY'));
    const stop = block.getFieldValue('STOP');
    const tx = block.getFieldValue('TX');
    const rx = block.getFieldValue('RX');
    g.addImport('machine.UART', 'from machine import UART');
    g.addInit(
      `uart_${id}`,
      `_uart${id} = UART(${id}, baudrate=${baud}, bits=${bits}, parity=${parity}, stop=${stop}, tx=${tx}, rx=${rx})`,
      true,
    );
    return '';
  };

  gen.forBlock['upy_uart_setup'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const baud = block.getFieldValue('BAUD');
    const bits = block.getFieldValue('BITS');
    const parity = parityPy(block.getFieldValue('PARITY'));
    const stop = block.getFieldValue('STOP');
    const tx = block.getFieldValue('TX');
    const rx = block.getFieldValue('RX');
    ensureUart(g, id);
    return `_uart${id}.init(baudrate=${baud}, bits=${bits}, parity=${parity}, stop=${stop}, tx=${tx}, rx=${rx})\n`;
  };

  gen.forBlock['upy_uart_deinit'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return `_uart${id}.deinit()\n`;
  };

  gen.forBlock['upy_uart_any'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return [`_uart${id}.any()`, Order.ATOMIC];
  };

  gen.forBlock['upy_uart_read_all'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return [`_uart${id}.read()`, Order.ATOMIC];
  };

  gen.forBlock['upy_uart_read_bytes'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    const n = g.valueToCode(block, 'NBYTES', Order.NONE) || '1';
    ensureUart(g, id);
    return [`_uart${id}.read(${n})`, Order.ATOMIC];
  };

  gen.forBlock['upy_uart_read_raw'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return [`_uart${id}.read(1)[0]`, Order.ATOMIC];
  };

  gen.forBlock['upy_uart_txdone'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return [`_uart${id}.txdone()`, Order.ATOMIC];
  };

  gen.forBlock['upy_uart_readinto'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || 'buf';
    ensureUart(g, id);
    return `_uart${id}.readinto(${buf})\n`;
  };

  gen.forBlock['upy_uart_write_str'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    ensureUart(g, id);
    return `_uart${id}.write(${text})\n`;
  };

  gen.forBlock['upy_uart_write_line'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    ensureUart(g, id);
    return `_uart${id}.write(${text}+'\\r\\n')\n`;
  };

  gen.forBlock['upy_uart_write_var'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const val = g.valueToCode(block, 'VAL', Order.NONE) || 'None';
    ensureUart(g, id);
    return `_uart${id}.write(${val})\n`;
  };

  gen.forBlock['upy_uart_write_bytes_var'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const id = block.getFieldValue('ID');
    const val = g.valueToCode(block, 'VAL', Order.NONE) || '[]';
    ensureUart(g, id);
    return `_uart${id}.write(bytes(${val}))\n`;
  };

  gen.forBlock['upy_uart_write_raw'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const val = g.valueToCode(block, 'VAL', Order.NONE) || '0';
    ensureUart(g, id);
    return `_uart${id}.write(bytes([${val}]))\n`;
  };

  gen.forBlock['upy_uart_sendbreak'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return `_uart${id}.sendbreak()\n`;
  };

  gen.forBlock['upy_uart_flush'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return `_uart${id}.flush()\n`;
  };

  // ── Legacy blocks (kept for backward compatibility) ───────────────────────

  gen.forBlock['upy_uart_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const baud = block.getFieldValue('BAUD');
    g.addImport('machine.UART', 'from machine import UART');
    g.addInit(`uart_${id}`, `_uart${id} = UART(${id}, baudrate=${baud})`, true);
    return '';
  };

  gen.forBlock['upy_uart_write'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const id = block.getFieldValue('ID');
    const data = g.valueToCode(block, 'DATA', Order.NONE) || "''";
    ensureUart(g, id);
    return `_uart${id}.write(str(${data}))\n`;
  };

  gen.forBlock['upy_uart_readline'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const id = block.getFieldValue('ID');
    ensureUart(g, id);
    return [`_uart${id}.readline()`, Order.ATOMIC];
  };

  gen.forBlock['upy_print'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const text = g.valueToCode(block, 'TEXT', Order.NONE) || "''";
    return `print(${text})\n`;
  };
}
