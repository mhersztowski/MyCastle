import * as Blockly from 'blockly';

const HUE = '#8E6BBF';

export function registerImageBlocks(): void {
  /** Value: load image file → Surface */
  Blockly.Blocks['pg_load_image'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('PATH').setCheck('String').appendField('load image');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Load an image file and return a Surface. Store in a variable inside pg_setup.');
    },
  };

  /** Statement: blit surface at (x, y) */
  Blockly.Blocks['pg_blit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('draw image');
      this.appendValueInput('X').setCheck('Number').appendField('at x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw (blit) a surface/image at position (x, y)');
    },
  };

  /** Statement: blit surface using a rect */
  Blockly.Blocks['pg_blit_rect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('draw image');
      this.appendValueInput('RECT').appendField('at rect');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw (blit) a surface/image at the position of a Rect');
    },
  };

  /** Value: scale image → new Surface */
  Blockly.Blocks['pg_scale_image'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('scale image');
      this.appendValueInput('W').setCheck('Number').appendField('w');
      this.appendValueInput('H').setCheck('Number').appendField('h');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Scale a surface to (w, h) pixels. Returns new surface.');
    },
  };

  /** Value: rotate image → new Surface */
  Blockly.Blocks['pg_rotate_image'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('rotate image');
      this.appendValueInput('ANGLE').setCheck('Number').appendField('angle°');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Rotate a surface by angle degrees (counter-clockwise). Returns new surface.');
    },
  };

  /** Value: flip image → new Surface */
  Blockly.Blocks['pg_flip_image'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('flip image');
      this.appendDummyInput()
        .appendField('horizontal')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'FLIP_X')
        .appendField('vertical')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'FLIP_Y');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Flip image horizontally and/or vertically. Returns new surface.');
    },
  };

  /** Value: get rect from surface at position */
  Blockly.Blocks['pg_image_rect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SURFACE').appendField('image rect');
      this.appendValueInput('X').setCheck('Number').appendField('at x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Get the bounding Rect of a surface, placed at (x, y)');
    },
  };
}
