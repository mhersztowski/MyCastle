import * as Blockly from 'blockly';

const HUE = '#5BA58C';

export function registerDrawBlocks(): void {
  Blockly.Blocks['pg_fill_bg'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('fill background');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Fill the entire screen with a color');
    },
  };

  Blockly.Blocks['pg_draw_rect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw rect  color');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('W').setCheck('Number').appendField('w');
      this.appendValueInput('H').setCheck('Number').appendField('h');
      this.appendValueInput('RADIUS').setCheck('Number').appendField('radius');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a filled rectangle (optional rounded corners)');
    },
  };

  Blockly.Blocks['pg_draw_circle'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw circle  color');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('R').setCheck('Number').appendField('radius');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a filled circle');
    },
  };

  Blockly.Blocks['pg_draw_line'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw line  color');
      this.appendValueInput('X1').setCheck('Number').appendField('x1');
      this.appendValueInput('Y1').setCheck('Number').appendField('y1');
      this.appendValueInput('X2').setCheck('Number').appendField('x2');
      this.appendValueInput('Y2').setCheck('Number').appendField('y2');
      this.appendValueInput('WIDTH').setCheck('Number').appendField('width');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a line between two points');
    },
  };

  Blockly.Blocks['pg_draw_text'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('draw text');
      this.appendValueInput('SIZE').setCheck('Number').appendField('size');
      this.appendValueInput('COLOR').appendField('color');
      this.appendValueInput('X').setCheck('Number').appendField('at x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw text on the screen using a system font');
    },
  };
}
