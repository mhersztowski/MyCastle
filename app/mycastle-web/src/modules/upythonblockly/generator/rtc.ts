import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

function getVar(block: Blockly.Block): string {
  return (block.getField('VAR') as Blockly.FieldVariable)?.getText() || 'rtc';
}

export function registerRtcGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_rtc_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_rtc', 'from hardware import RTC');
    const v = getVar(block);
    g.variables_.add(v);
    return `${v} = RTC()\n`;
  };

  gen.forBlock['upy_rtc_get_utc'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const v = getVar(block);
    g.variables_.add(v);
    return [`${v}.datetime()`, Order.ATOMIC];
  };

  gen.forBlock['upy_rtc_get_local'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const v = getVar(block);
    g.variables_.add(v);
    return [`${v}.local_datetime()`, Order.ATOMIC];
  };

  gen.forBlock['upy_rtc_get_tz'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const v = getVar(block);
    g.variables_.add(v);
    return [`${v}.timezone()`, Order.ATOMIC];
  };

  gen.forBlock['upy_rtc_tuple_get'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    const tuple = g.valueToCode(block, 'TUPLE', Order.ATOMIC) || 'None';
    const idx = block.getFieldValue('IDX');
    return [`(${tuple})[${idx}]`, Order.ATOMIC];
  };

  gen.forBlock['upy_rtc_set_utc'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const v = getVar(block);
    g.variables_.add(v);
    const year = block.getFieldValue('YEAR');
    const month = block.getFieldValue('MONTH');
    const mday = block.getFieldValue('MDAY');
    const hour = block.getFieldValue('HOUR');
    const minute = block.getFieldValue('MINUTE');
    const second = block.getFieldValue('SECOND');
    const usecond = block.getFieldValue('USECOND');
    return `${v}.init((${year}, ${month}, ${mday}, ${hour}, ${minute}, ${second}, ${usecond}, 0))\n`;
  };

  gen.forBlock['upy_rtc_set_tz_drop'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const v = getVar(block);
    g.variables_.add(v);
    const tz = block.getFieldValue('TZ');
    return `${v}.timezone('${tz}')\n`;
  };

  gen.forBlock['upy_rtc_set_tz_val'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    const v = getVar(block);
    g.variables_.add(v);
    const tz = g.valueToCode(block, 'TZ', Order.NONE) || "'GMT0'";
    return `${v}.timezone(${tz})\n`;
  };
}
