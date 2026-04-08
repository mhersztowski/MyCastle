import * as Blockly from 'blockly';

const HUE_M5 = '#e05050';
const HUE_PIN = '#e07530';

const STATE_OPTIONS: Array<[string, string]> = [
  ['is pressed', 'IS_PRESSED'],
  ['is released', 'IS_RELEASED'],
  ['was clicked', 'WAS_CLICKED'],
  ['was hold', 'WAS_HOLD'],
  ['was double click', 'WAS_DOUBLE_CLICK'],
];

const EVENT_OPTIONS: Array<[string, string]> = [
  ['was clicked', 'WAS_CLICKED'],
  ['was hold', 'WAS_HOLD'],
  ['was double click', 'WAS_DOUBLE_CLICK'],
  ['was released', 'WAS_RELEASED'],
];

const M5_BTN_OPTIONS: Array<[string, string]> = [
  ['BtnA', 'BtnA'],
  ['BtnB', 'BtnB'],
];

export function registerButtonBlocks(): void {
  /** Minis.begin() — place inside setup hat block */
  Blockly.Blocks['upy_m5_begin'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_M5);
      this.appendDummyInput().appendField('Minis begin');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Initialize Minis hardware (buttons): Minis.begin()');
    },
  };

  /** Minis.update() — place inside loop hat block */
  Blockly.Blocks['upy_m5_update'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_M5);
      this.appendDummyInput().appendField('Minis update');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Update Minis button state (call in loop): Minis.update()');
    },
  };

  /** Read built-in Minis button state */
  Blockly.Blocks['upy_m5_btn_state'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_M5);
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(M5_BTN_OPTIONS), 'BTN')
        .appendField(new Blockly.FieldDropdown(STATE_OPTIONS), 'STATE');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip('Read Minis built-in button state');
    },
  };

  /** Event hat block for built-in Minis button */
  Blockly.Blocks['upy_m5_btn_event'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_M5);
      this.appendDummyInput()
        .appendField('when')
        .appendField(new Blockly.FieldDropdown(M5_BTN_OPTIONS), 'BTN')
        .appendField(new Blockly.FieldDropdown(EVENT_OPTIONS), 'EVENT');
      this.appendStatementInput('DO');
      this.setTooltip('Register a callback for a Minis built-in button event');
    },
  };

  /** Initialize a GPIO-based Button */
  Blockly.Blocks['upy_pin_btn_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_PIN);
      this.appendDummyInput()
        .appendField('init button')
        .appendField(new Blockly.FieldVariable('Btn1'), 'VAR')
        .appendField('pin');
      this.appendValueInput('PIN');
      this.appendDummyInput()
        .appendField('active low')
        .appendField(
          new Blockly.FieldDropdown([
            ['true', 'True'],
            ['false', 'False'],
          ]),
          'ACTIVE_LOW',
        )
        .appendField('pullup')
        .appendField(
          new Blockly.FieldDropdown([
            ['false', 'False'],
            ['true', 'True'],
          ]),
          'PULLUP',
        );
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Create a GPIO button: Btn = Button(pin, active_low, pullup_active)');
    },
  };

  /** Call button.tick() — must be in loop */
  Blockly.Blocks['upy_pin_btn_tick'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_PIN);
      this.appendDummyInput()
        .appendField('tick')
        .appendField(new Blockly.FieldVariable('Btn1'), 'VAR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Update button state (call in loop): Btn.tick(None)');
    },
  };

  /** Read GPIO button state */
  Blockly.Blocks['upy_pin_btn_state'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_PIN);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('Btn1'), 'VAR')
        .appendField(new Blockly.FieldDropdown(STATE_OPTIONS), 'STATE');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip('Read GPIO button state');
    },
  };

  /** Event hat block for GPIO button */
  Blockly.Blocks['upy_pin_btn_event'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_PIN);
      this.appendDummyInput()
        .appendField('when')
        .appendField(new Blockly.FieldVariable('Btn1'), 'VAR')
        .appendField(new Blockly.FieldDropdown(EVENT_OPTIONS), 'EVENT');
      this.appendStatementInput('DO');
      this.setTooltip('Register a callback for a GPIO button event');
    },
  };
}
