import * as Blockly from 'blockly';

const HUE = '#8833cc';

const I2S_IDS: [string, string][] = [['0', '0'], ['1', '1']];

const MODE_OPTIONS: [string, string][] = [['TX', 'TX'], ['RX', 'RX']];

const BITS_OPTIONS: [string, string][] = [['8', '8'], ['16', '16'], ['32', '32']];

const FORMAT_OPTIONS: [string, string][] = [['MONO', 'MONO'], ['STEREO', 'STEREO']];

const RATE_OPTIONS: [string, string][] = [
  ['8kHz', '8000'],
  ['16kHz', '16000'],
  ['22.05kHz', '22050'],
  ['44.1kHz', '44100'],
  ['48kHz', '48000'],
  ['96kHz', '96000'],
];

export function registerI2sBlocks(): void {
  /** Init i2s [VAR] id [ID] SCK/WS/SD/mode/bits/format/rate/ibuf */
  Blockly.Blocks['upy_i2s_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init')
        .appendField(new Blockly.FieldVariable('i2s'), 'VAR')
        .appendField('id')
        .appendField(new Blockly.FieldDropdown(I2S_IDS), 'ID');
      this.appendDummyInput()
        .appendField('SCK')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'SCK')
        .appendField('WS')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'WS')
        .appendField('SD')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'SD');
      this.appendDummyInput()
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE')
        .appendField('bits')
        .appendField(new Blockly.FieldDropdown(BITS_OPTIONS), 'BITS')
        .appendField('format')
        .appendField(new Blockly.FieldDropdown(FORMAT_OPTIONS), 'FORMAT');
      this.appendDummyInput()
        .appendField('rate')
        .appendField(new Blockly.FieldDropdown(RATE_OPTIONS), 'RATE')
        .appendField('ibuf')
        .appendField(new Blockly.FieldNumber(20000, 1), 'IBUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('i2s = I2S(id, sck=Pin(n), ws=Pin(n), sd=Pin(n), mode=I2S.TX, bits=16, format=I2S.MONO, rate=44100, ibuf=20000)');
    },
  };

  /** [VAR] deinit */
  Blockly.Blocks['upy_i2s_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2s'), 'VAR')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('i2s.deinit()');
    },
  };

  /** [VAR] read into buf [BUF] (return length) — value block */
  Blockly.Blocks['upy_i2s_readinto_val'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2s'), 'VAR')
        .appendField('read into buf');
      this.appendValueInput('BUF');
      this.appendDummyInput().appendField('(return length)');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('i2s.readinto(buf) → number of bytes read');
    },
  };

  /** [VAR] read into buf [BUF] — statement block */
  Blockly.Blocks['upy_i2s_readinto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2s'), 'VAR')
        .appendField('read into buf');
      this.appendValueInput('BUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2s.readinto(buf)');
    },
  };

  /** [VAR] write buf [BUF] — statement block */
  Blockly.Blocks['upy_i2s_write'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('i2s'), 'VAR')
        .appendField('write buf');
      this.appendValueInput('BUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('i2s.write(buf)');
    },
  };
}
