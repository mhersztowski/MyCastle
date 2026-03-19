import * as Blockly from 'blockly';

const HUE = '#3D7EBF';

export function registerGameMathBlocks(): void {
  Blockly.Blocks['pg_lerp'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('A').setCheck('Number').appendField('lerp  from');
      this.appendValueInput('B').setCheck('Number').appendField('to');
      this.appendValueInput('T').setCheck('Number').appendField('t');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Linear interpolation: a + (b - a) * t. t=0 → a, t=1 → b');
    },
  };

  Blockly.Blocks['pg_distance'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('X1').setCheck('Number').appendField('distance  x1');
      this.appendValueInput('Y1').setCheck('Number').appendField('y1');
      this.appendValueInput('X2').setCheck('Number').appendField('x2');
      this.appendValueInput('Y2').setCheck('Number').appendField('y2');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Euclidean distance between two points');
    },
  };

  Blockly.Blocks['pg_angle_to'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('X1').setCheck('Number').appendField('angle to  x1');
      this.appendValueInput('Y1').setCheck('Number').appendField('y1');
      this.appendValueInput('X2').setCheck('Number').appendField('x2');
      this.appendValueInput('Y2').setCheck('Number').appendField('y2');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Angle in degrees from point 1 to point 2 (0° = right, 90° = down)');
    },
  };

  Blockly.Blocks['pg_clamp'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAL').setCheck('Number').appendField('clamp');
      this.appendValueInput('MIN').setCheck('Number').appendField('min');
      this.appendValueInput('MAX').setCheck('Number').appendField('max');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Clamp a value between min and max');
    },
  };

  Blockly.Blocks['pg_sign'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAL').setCheck('Number').appendField('sign of');
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Returns -1, 0, or 1 based on the sign of the value');
    },
  };
}
