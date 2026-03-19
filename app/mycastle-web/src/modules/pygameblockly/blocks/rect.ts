import * as Blockly from 'blockly';

const HUE = '#7B68EE'; // medium slate blue

export function registerRectBlocks(): void {
  /** Value block: creates a pygame.Rect */
  Blockly.Blocks['pg_make_rect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('X').setCheck('Number').appendField('Rect  x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendValueInput('W').setCheck('Number').appendField('w');
      this.appendValueInput('H').setCheck('Number').appendField('h');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Create a pygame.Rect(x, y, w, h)');
    },
  };

  /** Statement: move rect in place */
  Blockly.Blocks['pg_rect_move_ip'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT').appendField('move rect');
      this.appendValueInput('DX').setCheck('Number').appendField('dx');
      this.appendValueInput('DY').setCheck('Number').appendField('dy');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Move a rect by (dx, dy) in place');
    },
  };

  /** Statement: clamp rect inside screen bounds */
  Blockly.Blocks['pg_rect_clamp_ip'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT').appendField('clamp rect');
      this.appendDummyInput().appendField('inside screen');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Keep a rect inside the screen boundaries');
    },
  };

  /** Value: get rect attribute */
  Blockly.Blocks['pg_rect_attr'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT').appendField('rect');
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([
          ['x', 'x'], ['y', 'y'],
          ['width', 'width'], ['height', 'height'],
          ['center x', 'centerx'], ['center y', 'centery'],
          ['left', 'left'], ['right', 'right'],
          ['top', 'top'], ['bottom', 'bottom'],
        ]),
        'ATTR',
      );
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip('Get a property of a rect (x, y, width, height, centerx, ...)');
    },
  };

  /** Statement: set rect attribute */
  Blockly.Blocks['pg_rect_set_attr'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT').appendField('set rect');
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown([
          ['x', 'x'], ['y', 'y'],
          ['width', 'width'], ['height', 'height'],
          ['centerx', 'centerx'], ['centery', 'centery'],
        ]),
        'ATTR',
      );
      this.appendValueInput('VALUE').setCheck('Number').appendField('=');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Set a property of a rect');
    },
  };

  /** Value: collision check between two rects */
  Blockly.Blocks['pg_rects_collide'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT1').appendField('rect');
      this.appendValueInput('RECT2').appendField('collides with');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setTooltip('True if two rects overlap (rect1.colliderect(rect2))');
    },
  };

  /** Value: point inside rect */
  Blockly.Blocks['pg_point_in_rect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('RECT').appendField('point');
      this.appendValueInput('X').setCheck('Number').appendField('x');
      this.appendValueInput('Y').setCheck('Number').appendField('y');
      this.appendDummyInput().appendField('in rect');
      this.setInputsInline(true);
      this.setOutput(true, 'Boolean');
      this.setTooltip('True if point (x, y) is inside the rect');
    },
  };

  /** Statement: draw filled rect using rect object */
  Blockly.Blocks['pg_draw_rect_obj'] = {
    init(this: Blockly.Block) {
      this.setColour('#5BA58C');
      this.appendValueInput('COLOR').appendField('draw rect (obj)  color');
      this.appendValueInput('RECT').appendField('rect');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Draw a filled rect from a pygame.Rect object');
    },
  };
}
