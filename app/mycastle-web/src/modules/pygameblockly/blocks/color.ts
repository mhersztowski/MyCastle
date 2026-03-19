import * as Blockly from 'blockly';

const HUE = '#B05A7A';

export function registerColorBlocks(): void {
  Blockly.Blocks['pg_color_rgb'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('R').setCheck('Number').appendField('RGB  R');
      this.appendValueInput('G').setCheck('Number').appendField('G');
      this.appendValueInput('B').setCheck('Number').appendField('B');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Create a color from R, G, B values (0–255)');
    },
  };

  Blockly.Blocks['pg_color_named'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('color')
        .appendField(
          new Blockly.FieldDropdown([
            ['white', 'white'],
            ['black', 'black'],
            ['red', 'red'],
            ['green', 'green'],
            ['blue', 'blue'],
            ['yellow', 'yellow'],
            ['orange', 'orange'],
            ['purple', 'purple'],
            ['cyan', 'cyan'],
            ['pink', 'pink'],
            ['gray', 'gray'],
            ['light gray', 'lightgray'],
            ['dark gray', 'darkgray'],
          ]),
          'COLOR',
        );
      this.setOutput(true);
      this.setTooltip('Named color');
    },
  };
}
