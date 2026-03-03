import * as Blockly from 'blockly';

const HUE = 230;

export function registerTypeConvBlocks(): void {
  /** Convert a value to integer */
  Blockly.Blocks['upy_to_int'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('convert to int');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Convert value to integer: int(value)');
    },
  };

  /** Convert a value to float */
  Blockly.Blocks['upy_to_float'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('convert to float');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Convert value to float: float(value)');
    },
  };

  /** Sum all elements of a list */
  Blockly.Blocks['upy_list_sum'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('LIST').appendField('sum of list');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Return the sum of all elements in a list: sum(list)');
    },
  };
}
