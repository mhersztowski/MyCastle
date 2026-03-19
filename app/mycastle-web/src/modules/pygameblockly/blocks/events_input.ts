import * as Blockly from 'blockly';

const HUE = '#D4A020';

const KEY_OPTIONS: [string, string][] = [
  ['Space', 'SPACE'],
  ['Enter', 'RETURN'],
  ['Escape', 'ESCAPE'],
  ['Up', 'UP'],
  ['Down', 'DOWN'],
  ['Left', 'LEFT'],
  ['Right', 'RIGHT'],
  ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'],
  ['F', 'f'], ['G', 'g'], ['H', 'h'], ['I', 'i'], ['J', 'j'],
  ['K', 'k'], ['L', 'l'], ['M', 'm'], ['N', 'n'], ['O', 'o'],
  ['P', 'p'], ['Q', 'q'], ['R', 'r'], ['S', 's'], ['T', 't'],
  ['U', 'u'], ['V', 'v'], ['W', 'w'], ['X', 'x'], ['Y', 'y'], ['Z', 'z'],
  ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'],
  ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
  ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'],
  ['Tab', 'TAB'], ['Backspace', 'BACKSPACE'], ['Delete', 'DELETE'],
  ['Left Shift', 'LSHIFT'], ['Right Shift', 'RSHIFT'],
  ['Left Ctrl', 'LCTRL'], ['Right Ctrl', 'RCTRL'],
];

export function registerEventsInputBlocks(): void {
  Blockly.Blocks['pg_key_pressed'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('key')
        .appendField(new Blockly.FieldDropdown(KEY_OPTIONS), 'KEY')
        .appendField('pressed?');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True while the key is held down');
    },
  };

  Blockly.Blocks['pg_mouse_pos'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('mouse')
        .appendField(
          new Blockly.FieldDropdown([['X', 'x'], ['Y', 'y']]),
          'AXIS',
        );
      this.setOutput(true, 'Number');
      this.setTooltip('Current mouse cursor position');
    },
  };

  Blockly.Blocks['pg_mouse_button'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('mouse button')
        .appendField(
          new Blockly.FieldDropdown([
            ['left', 'left'],
            ['middle', 'middle'],
            ['right', 'right'],
          ]),
          'BUTTON',
        )
        .appendField('pressed?');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True while the mouse button is held down');
    },
  };
}
