import * as Blockly from 'blockly';
import type { UPythonBoardManager } from '../boards/BoardManager';

const HUE = 200;

const ATTEN_OPTIONS: Blockly.MenuGenerator = [
  ['0DB (0~1V)', 'ATTN_0DB'],
  ['2.5DB (0~1.34V)', 'ATTN_2_5DB'],
  ['6DB (0~2V)', 'ATTN_6DB'],
  ['11DB (0~3.6V)', 'ATTN_11DB'],
];

const WIDTH_OPTIONS: Blockly.MenuGenerator = [
  ['9bit (0~511)', 'WIDTH_9BIT'],
  ['10bit (0~1023)', 'WIDTH_10BIT'],
  ['11bit (0~2047)', 'WIDTH_11BIT'],
  ['12bit (0~4095)', 'WIDTH_12BIT'],
];

export function registerAdcBlocks(boardManager: UPythonBoardManager): void {
  /** Initialize an ADC pin with a chosen attenuation (voltage range) */
  Blockly.Blocks['upy_adc_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN')
        .appendField('attenuation')
        .appendField(new Blockly.FieldDropdown(ATTEN_OPTIONS), 'ATTEN');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Initialize ADC with selected attenuation (voltage input range). ' +
        'Must be called before using other ADC blocks for this pin.',
      );
    },
  };

  /** Read raw ADC value (0–4095 for 12-bit, depends on width setting) */
  Blockly.Blocks['upy_adc_read'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN');
      this.setOutput(true, 'Number');
      this.setTooltip('Read raw ADC value (0–4095 for 12-bit default). Result depends on width setting.');
    },
  };

  /** Read ADC value normalised to 16-bit unsigned (0–65535) */
  Blockly.Blocks['upy_adc_read_u16'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN')
        .appendField('u16');
      this.setOutput(true, 'Number');
      this.setTooltip('Read ADC value normalised to 0–65535 (16-bit unsigned).');
    },
  };

  /** Read ADC value in microvolts */
  Blockly.Blocks['upy_adc_read_uv'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('read ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN')
        .appendField('microvolts');
      this.setOutput(true, 'Number');
      this.setTooltip('Read ADC value in microvolts (µV).');
    },
  };

  /** Set ADC bit-width (resolution) */
  Blockly.Blocks['upy_adc_width'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Set ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN')
        .appendField('width')
        .appendField(new Blockly.FieldDropdown(WIDTH_OPTIONS), 'WIDTH');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set ADC resolution (bit width). 12-bit = 0–4095 range.');
    },
  };

  /** Set ADC attenuation (input voltage range) after initialisation */
  Blockly.Blocks['upy_adc_atten'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Set ADC pin')
        .appendField(new Blockly.FieldDropdown(() => boardManager.selected.analogPins), 'PIN')
        .appendField('atten')
        .appendField(new Blockly.FieldDropdown(ATTEN_OPTIONS), 'ATTEN');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Change ADC attenuation (voltage input range) at runtime.');
    },
  };
}
