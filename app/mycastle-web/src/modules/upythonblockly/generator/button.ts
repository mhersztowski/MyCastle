import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

const STATE_METHOD: Record<string, string> = {
  IS_PRESSED: 'isPressed',
  IS_RELEASED: 'isReleased',
  WAS_CLICKED: 'wasClicked',
  WAS_HOLD: 'wasHold',
  WAS_DOUBLE_CLICK: 'wasDoubleClick',
};

const EVENT_CAMEL: Record<string, string> = {
  WAS_CLICKED: 'wasClicked',
  WAS_HOLD: 'wasHold',
  WAS_DOUBLE_CLICK: 'wasDoubleClick',
  WAS_RELEASED: 'wasReleased',
};

function getVarName(block: Blockly.Block, field: string): string {
  return (block.getField(field) as Blockly.FieldVariable)?.getText() || field.toLowerCase();
}

export function registerButtonGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_m5_begin'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_minis', 'from hardware import Minis');
    return 'Minis.begin()\n';
  };

  gen.forBlock['upy_m5_update'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_minis', 'from hardware import Minis');
    return 'Minis.update()\n';
  };

  gen.forBlock['upy_m5_btn_state'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    g.addImport('hardware_minis', 'from hardware import Minis');
    const btn = block.getFieldValue('BTN') as string; // e.g. 'BtnA'
    const method = STATE_METHOD[block.getFieldValue('STATE')] ?? 'isPressed';
    return [`Minis.${btn}.${method}()`, Order.ATOMIC];
  };

  gen.forBlock['upy_m5_btn_event'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_minis', 'from hardware import Minis');
    const btn = block.getFieldValue('BTN') as string; // e.g. 'BtnA'
    const event = block.getFieldValue('EVENT') as string; // e.g. 'WAS_CLICKED'
    const body = g.statementToCode(block, 'DO');

    // e.g. 'btnA_wasClicked_event'
    const btnLower = btn.charAt(0).toLowerCase() + btn.slice(1);
    const cbName = `${btnLower}_${EVENT_CAMEL[event] ?? event}_event`;

    g.addCallback(cbName, 'state', body);
    g.setup_stmts_[`_m5_btn_cb_${btn}_${event}`] =
      g.INDENT + `Minis.${btn}.setCallback(type=Minis.${btn}.CB_TYPE.${event}, cb=${cbName})\n`;

    return '';
  };

  gen.forBlock['upy_pin_btn_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_button', 'from hardware import Button');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const pin = g.valueToCode(block, 'PIN', Order.NONE) || '0';
    const activeLow = block.getFieldValue('ACTIVE_LOW');
    const pullup = block.getFieldValue('PULLUP');
    return `${varName} = Button(${pin}, active_low=${activeLow}, pullup_active=${pullup})\n`;
  };

  gen.forBlock['upy_pin_btn_tick'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    return `${varName}.tick(None)\n`;
  };

  gen.forBlock['upy_pin_btn_state'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): [string, Order] {
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const method = STATE_METHOD[block.getFieldValue('STATE')] ?? 'isPressed';
    return [`${varName}.${method}()`, Order.ATOMIC];
  };

  gen.forBlock['upy_pin_btn_event'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_button', 'from hardware import Button');
    const varName = getVarName(block, 'VAR');
    g.variables_.add(varName);
    const event = block.getFieldValue('EVENT') as string; // e.g. 'WAS_CLICKED'
    const body = g.statementToCode(block, 'DO');

    // e.g. 'btn1_wasClicked_event'
    const cbName = `${varName}_${EVENT_CAMEL[event] ?? event}_event`;

    g.addCallback(cbName, 'state', body);
    g.setup_stmts_[`_pin_btn_cb_${varName}_${event}`] =
      g.INDENT + `${varName}.setCallback(type=${varName}.CB_TYPE.${event}, cb=${cbName})\n`;

    return '';
  };
}
