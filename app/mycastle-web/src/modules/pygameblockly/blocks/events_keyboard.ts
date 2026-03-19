import * as Blockly from 'blockly';

const HUE_HAT = '#E05C6B';
const HUE_EV = '#C0392B';

const KEY_OPTIONS: [string, string][] = [
  ['Space', 'SPACE'], ['Enter', 'RETURN'], ['Escape', 'ESCAPE'],
  ['Up', 'UP'], ['Down', 'DOWN'], ['Left', 'LEFT'], ['Right', 'RIGHT'],
  ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'], ['F', 'f'],
  ['G', 'g'], ['H', 'h'], ['I', 'i'], ['J', 'j'], ['K', 'k'], ['L', 'l'],
  ['M', 'm'], ['N', 'n'], ['O', 'o'], ['P', 'p'], ['Q', 'q'], ['R', 'r'],
  ['S', 's'], ['T', 't'], ['U', 'u'], ['V', 'v'], ['W', 'w'], ['X', 'x'],
  ['Y', 'y'], ['Z', 'z'],
  ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'],
  ['5', '5'], ['6', '6'], ['7', '7'], ['8', '8'], ['9', '9'],
  ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'], ['F5', 'F5'],
  ['Tab', 'TAB'], ['Backspace', 'BACKSPACE'], ['Delete', 'DELETE'],
  ['Left Shift', 'LSHIFT'], ['Right Shift', 'RSHIFT'],
  ['Left Ctrl', 'LCTRL'], ['Right Ctrl', 'RCTRL'],
  ['Left Alt', 'LALT'], ['Right Alt', 'RALT'],
];

export function registerEventsKeyboardBlocks(): void {
  /** Hat block — code placed inside for _event in pygame.event.get() */
  Blockly.Blocks['pg_on_events'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_HAT);
      this.appendDummyInput().appendField('⚡ on events');
      this.appendStatementInput('DO');
      this.setTooltip('Code here runs for each pygame event. Use event blocks inside.');
    },
  };

  // ---- event type checks ----
  Blockly.Blocks['pg_ev_is_keydown'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('key pressed? (event)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when any key is pressed down this frame');
    },
  };

  Blockly.Blocks['pg_ev_is_keyup'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('key released? (event)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when any key is released this frame');
    },
  };

  Blockly.Blocks['pg_ev_key_is'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput()
        .appendField('event key ==')
        .appendField(new Blockly.FieldDropdown(KEY_OPTIONS), 'KEY');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when the event key matches. Use inside pg_ev_is_keydown/keyup.');
    },
  };

  Blockly.Blocks['pg_ev_is_mousedown'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('mouse button pressed? (event)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when a mouse button is pressed this frame');
    },
  };

  Blockly.Blocks['pg_ev_is_mouseup'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('mouse button released? (event)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when a mouse button is released this frame');
    },
  };

  Blockly.Blocks['pg_ev_mousebutton_is'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput()
        .appendField('event mouse button ==')
        .appendField(
          new Blockly.FieldDropdown([['left', '1'], ['middle', '2'], ['right', '3']]),
          'BUTTON',
        );
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when the mouse event button matches');
    },
  };

  Blockly.Blocks['pg_ev_mouse_x'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('event mouse X');
      this.setOutput(true, 'Number');
      this.setTooltip('X position of mouse click/release event');
    },
  };

  Blockly.Blocks['pg_ev_mouse_y'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('event mouse Y');
      this.setOutput(true, 'Number');
      this.setTooltip('Y position of mouse click/release event');
    },
  };

  Blockly.Blocks['pg_ev_is_text_input'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('text typed? (event)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('True when the user typed a character');
    },
  };

  Blockly.Blocks['pg_ev_text'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_EV);
      this.appendDummyInput().appendField('typed text (event)');
      this.setOutput(true, 'String');
      this.setTooltip('The character(s) typed in this event. Use inside pg_ev_is_text_input.');
    },
  };
}
