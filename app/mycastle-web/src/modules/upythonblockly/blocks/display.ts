import * as Blockly from 'blockly';

const HUE = '#336699';

const PANEL_OPTIONS: [string, string][] = [
  ['ILI9342 (320×240)', 'ILI9342'],
  ['ILI9341 (320×240)', 'ILI9341'],
  ['ST7789 (240×240)', 'ST7789_240'],
  ['ST7789 (135×240)', 'ST7789_135'],
  ['GC9A01 (240×240)', 'GC9A01'],
];

const SPI_HOST_OPTIONS: [string, string][] = [
  ['SPI0', '0'], ['SPI1', '1'], ['SPI2', '2'], ['SPI3', '3'],
];

const SPI_FREQ_OPTIONS: [string, string][] = [
  ['10MHz', '10'], ['20MHz', '20'], ['40MHz', '40'], ['80MHz', '80'],
];

const SPI_MODE_OPTIONS: [string, string][] = [
  ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'],
];

const BL_FREQ_OPTIONS: [string, string][] = [
  ['1KHz', '1'], ['5KHz', '5'], ['10KHz', '10'],
];

const BL_CH_OPTIONS: [string, string][] = [
  ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3'],
];

const BOOL_OPTIONS: [string, string][] = [['True', 'True'], ['False', 'False']];

export function registerDisplayBlocks(): void {
  Blockly.Blocks['upy_display_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('User Display config')
        .appendField(new Blockly.FieldVariable('display'), 'VAR');
      this.appendDummyInput()
        .appendField('type')
        .appendField(new Blockly.FieldDropdown(PANEL_OPTIONS), 'PANEL');
      this.appendDummyInput()
        .appendField('resolution  width')
        .appendField(new Blockly.FieldNumber(320, 1, 4096), 'W')
        .appendField('height')
        .appendField(new Blockly.FieldNumber(240, 1, 4096), 'H')
        .appendField('offset x')
        .appendField(new Blockly.FieldNumber(0, 0, 4096), 'OX')
        .appendField('offset y')
        .appendField(new Blockly.FieldNumber(0, 0, 4096), 'OY');
      this.appendDummyInput()
        .appendField('color  invert')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'INVERT')
        .appendField('RGB order')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'RGB');
      this.appendDummyInput()
        .appendField('SPI Bus  host ID')
        .appendField(new Blockly.FieldDropdown(SPI_HOST_OPTIONS), 'SPI_HOST')
        .appendField('SPI freq')
        .appendField(new Blockly.FieldDropdown(SPI_FREQ_OPTIONS), 'SPI_FREQ')
        .appendField('SPI mode')
        .appendField(new Blockly.FieldDropdown(SPI_MODE_OPTIONS), 'SPI_MODE');
      this.appendDummyInput()
        .appendField('pin config  sclk')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_SCLK')
        .appendField('mosi')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_MOSI')
        .appendField('miso')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_MISO')
        .appendField('dc')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_DC')
        .appendField('cs')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_CS')
        .appendField('rst')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_RST')
        .appendField('busy')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_BUSY');
      this.appendDummyInput()
        .appendField('backlight  pin')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'PIN_BL')
        .appendField('invert')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'BL_INVERT')
        .appendField('PWM freq')
        .appendField(new Blockly.FieldDropdown(BL_FREQ_OPTIONS), 'BL_FREQ')
        .appendField('PWM channel')
        .appendField(new Blockly.FieldDropdown(BL_CH_OPTIONS), 'BL_CHN');
      this.appendDummyInput().appendField('Create');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Initialize display: display = UserDisplay(panel=..., w=..., h=..., ...)');
    },
  };
}
