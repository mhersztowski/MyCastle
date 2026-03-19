import * as Blockly from 'blockly';

const HUE = '#5BA58C';

export function registerDrawAdvBlocks(): void {
  Blockly.Blocks['pg_draw_ellipse'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw ellipse  color');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('W').setCheck('Number').appendField('w');
      this.appendValueInput('H').setCheck('Number').appendField('h');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a filled ellipse inside (x, y, w, h) bounding box');
    },
  };

  Blockly.Blocks['pg_draw_rect_outline'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw rect outline  color');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('W').setCheck('Number').appendField('w');
      this.appendValueInput('H').setCheck('Number').appendField('h');
      this.appendValueInput('BORDER').setCheck('Number').appendField('border');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw an unfilled rectangle border');
    },
  };

  Blockly.Blocks['pg_draw_circle_outline'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw circle outline  color');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('R').setCheck('Number').appendField('radius');
      this.appendValueInput('WIDTH').setCheck('Number').appendField('width');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw an unfilled circle outline');
    },
  };

  Blockly.Blocks['pg_draw_polygon'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('COLOR').appendField('draw polygon  color');
      this.appendValueInput('POINTS').appendField('points list');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a filled polygon. Points is a list like [(x1,y1),(x2,y2),...]');
    },
  };

  Blockly.Blocks['pg_make_point_list'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('X1').setCheck('Number').appendField('points  x1');
      this.appendValueInput('Y1').setCheck('Number').appendField('y1');
      this.appendValueInput('X2').setCheck('Number').appendField('x2');
      this.appendValueInput('Y2').setCheck('Number').appendField('y2');
      this.appendValueInput('X3').setCheck('Number').appendField('x3');
      this.appendValueInput('Y3').setCheck('Number').appendField('y3');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Create a 3-point list for use with pg_draw_polygon');
    },
  };
}
