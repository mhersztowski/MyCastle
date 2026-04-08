import * as Blockly from 'blockly';

const HUE = '#2277aa';

const SLOT_OPTIONS: [string, string][] = [
  ['SPI3_HOST', '2'],
  ['SPI2_HOST', '1'],
  ['SPI1_HOST', '0'],
];

export function registerSdcardBlocks(): void {
  /** Init SDCard — mounts card to /sd */
  Blockly.Blocks['upy_sdcard_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Init SDCard with');
      this.appendDummyInput()
        .appendField('slot')
        .appendField(new Blockly.FieldDropdown(SLOT_OPTIONS), 'SLOT')
        .appendField('SCK')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'SCK')
        .appendField('MISO')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'MISO')
        .appendField('MOSI')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'MOSI')
        .appendField('CS')
        .appendField(new Blockly.FieldNumber(-1, -1, 48), 'CS');
      this.appendDummyInput()
        .appendField('freq')
        .appendField(new Blockly.FieldNumber(1000000, 1), 'FREQ');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Mount SD card: sdcard.SDCard(slot=n, ...) → /sd/');
    },
  };

  /** SDCard get current dir → os.getcwd() */
  Blockly.Blocks['upy_sdcard_getcwd'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard get current dir');
      this.setOutput(true, null);
      this.setTooltip('os.getcwd()');
    },
  };

  /** SDCard listdir [PATH] → os.listdir(path) */
  Blockly.Blocks['upy_sdcard_listdir'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard listdir');
      this.appendValueInput('PATH').setCheck('String');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip("os.listdir('/sd/' + path)");
    },
  };

  /** is file [PATH] → os.stat(path)[0] == 0x8000 */
  Blockly.Blocks['upy_sdcard_isfile'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('is file');
      this.appendValueInput('PATH').setCheck('String');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip("os.stat('/sd/' + path)[0] == 0x8000");
    },
  };

  /** is directory [PATH] → os.stat(path)[0] == 0x4000 */
  Blockly.Blocks['upy_sdcard_isdir'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('is directory');
      this.appendValueInput('PATH').setCheck('String');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip("os.stat('/sd/' + path)[0] == 0x4000");
    },
  };

  /** [NAME] is exist in [DIR] → name in os.listdir(dir) */
  Blockly.Blocks['upy_sdcard_exists'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('NAME').setCheck('String');
      this.appendDummyInput().appendField('is exist in');
      this.appendValueInput('DIR').setCheck('String');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip("name in os.listdir('/sd/' + dir)");
    },
  };

  /** SDCard change current dir [PATH] → os.chdir(path) */
  Blockly.Blocks['upy_sdcard_chdir'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard change current dir');
      this.appendValueInput('PATH').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('os.chdir(path)');
    },
  };

  /** SDCard mkdir [PATH] → os.mkdir(path) */
  Blockly.Blocks['upy_sdcard_mkdir'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard mkdir');
      this.appendValueInput('PATH').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('os.mkdir(path)');
    },
  };

  /** SDCard remove [PATH] → os.remove(path) */
  Blockly.Blocks['upy_sdcard_remove'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard remove');
      this.appendValueInput('PATH').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('os.remove(path)');
    },
  };

  /** SDCard rmdir [PATH] → os.rmdir(path) */
  Blockly.Blocks['upy_sdcard_rmdir'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard rmdir');
      this.appendValueInput('PATH').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('os.rmdir(path)');
    },
  };

  /** SDCard rename [SRC] to [DST] → os.rename(src, dst) */
  Blockly.Blocks['upy_sdcard_rename'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('SDCard rename');
      this.appendValueInput('SRC').setCheck('String');
      this.appendDummyInput().appendField('to');
      this.appendValueInput('DST').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('os.rename(src, dst)');
    },
  };
}
