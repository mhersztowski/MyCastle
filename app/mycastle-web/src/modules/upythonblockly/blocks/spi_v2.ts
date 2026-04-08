import * as Blockly from 'blockly';

const HUE = '#cc6600';

const SPI_IDS: [string, string][] = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']];

const FIRSTBIT_OPTIONS: [string, string][] = [['MSB', 'MSB'], ['LSB', 'LSB']];

const SPI_MODE_OPTIONS: [string, string][] = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']];

export function registerSpiV2Blocks(): void {
  /** Init SPI [VAR] id [ID] baudrate/SCK/MISO/MOSI/firstbit/mode */
  Blockly.Blocks['upy_spi2_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init')
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('id')
        .appendField(new Blockly.FieldDropdown(SPI_IDS), 'ID');
      this.appendDummyInput()
        .appendField('baudrate')
        .appendField(new Blockly.FieldNumber(500000, 1), 'BAUD');
      this.appendDummyInput()
        .appendField('SCK')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'SCK')
        .appendField('MISO')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'MISO')
        .appendField('MOSI')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'MOSI');
      this.appendDummyInput()
        .appendField('firstbit')
        .appendField(new Blockly.FieldDropdown(FIRSTBIT_OPTIONS), 'FIRSTBIT')
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(SPI_MODE_OPTIONS), 'MODE');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('spi = SPI(id, baud, sck=Pin(n), miso=Pin(n), mosi=Pin(n), firstbit=SPI.MSB, polarity=0, phase=0)');
    },
  };

  /** [VAR] deinit */
  Blockly.Blocks['upy_spi2_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('spi.deinit()');
    },
  };

  /** [VAR] read nbytes [N] (return bytes) — value block */
  Blockly.Blocks['upy_spi2_read_val'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('read nbytes');
      this.appendValueInput('NBYTES').setCheck('Number');
      this.appendDummyInput().appendField('(return bytes)');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('spi.read(nbytes) → bytes');
    },
  };

  /** [VAR] read into buf [BUF] — statement block */
  Blockly.Blocks['upy_spi2_readinto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('read into buf');
      this.appendValueInput('BUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('spi.readinto(buf)');
    },
  };

  /** [VAR] write buf [BUF] — statement block */
  Blockly.Blocks['upy_spi2_write'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('write buf');
      this.appendValueInput('BUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('spi.write(buf)');
    },
  };

  /** [VAR] write buf [WBUF] read buf [RBUF] — statement block */
  Blockly.Blocks['upy_spi2_write_readinto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('spi'), 'VAR')
        .appendField('write buf');
      this.appendValueInput('WBUF');
      this.appendDummyInput().appendField('read buf');
      this.appendValueInput('RBUF');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('spi.write_readinto(write_buf, read_buf)');
    },
  };
}
