import * as Blockly from 'blockly';

const HUE = '#4a7c59';

export function registerJsonBlocks(): void {
  /** Serialize object to JSON string */
  Blockly.Blocks['upy_json_dumps'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('OBJ').appendField('dumps');
      this.appendDummyInput().appendField('to json');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Serialize object to JSON string: json.dumps(obj)');
    },
  };

  /** Parse JSON string to object */
  Blockly.Blocks['upy_json_loads'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('loads json');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Parse JSON string to object: json.loads(text)');
    },
  };
}
